// Notifications push : abonnement d'appareil (compte connecté, intégration
// active), mise en file automatique, un seul envoi par notification, isolation,
// réservation par le serveur uniquement.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const KEY = "B" + "a".repeat(86);
const sub = (n) => [`https://push.example.test/endpoint-${n}`, "B" + "k".repeat(86), "a".repeat(22)];

async function enablePush(q) {
  await switchTo(q, null);
  await q("update platform_integrations set enabled = true, config = jsonb_build_object('public_key', $1::text, 'subject', 'mailto:test@example.test'), secret_ciphertext = 'v1:x:y:z' where provider = 'web_push'", [KEY]);
}

describe("Notifications push", () => {
  test("abonnement refusé tant que la plateforme n'a pas activé le push", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.parent);
      assert.equal((await q("select push_public_key() k"))[0].k, null);
      assert.match(await rejects(q("select register_push_subscription($1, $2, $3)", sub(1))), /pas activées/);
    });
  });

  test("appareil abonné : chaque notification part aussi en push, une seule fois ; isolation", async () => {
    await as(null, async (q) => {
      await enablePush(q);
      await switchTo(q, USERS.parent);
      assert.equal((await q("select push_public_key() k"))[0].k, KEY);
      await q("select register_push_subscription($1, $2, $3, 'Test')", sub(1));
      await q("select register_push_subscription($1, $2, $3, 'Test')", sub(1)); // idempotent
      assert.equal((await q("select count(*)::int n from push_subscriptions"))[0].n, 1);
      assert.match(await rejects(q("select register_push_subscription('http://insecure', $1, $2)", sub(1).slice(1))), /check/);

      await switchTo(q, null);
      const [{ id }] = await q("select app.notify($1, $2, 'payment.received', 'Paiement', 'Reçu', '/portail') id", [ORG_DEMO, USERS.parent]);
      // Préférence « push » en plus : toujours un seul envoi.
      await q("insert into notification_preferences (user_id, organization_id, notification_type, channels) values ($1, $2, 'grades.published', '{in_app,push}') on conflict do nothing", [USERS.parent, ORG_DEMO]);
      const [{ id: id2 }] = await q("select app.notify($1, $2, 'grades.published', 'Notes', null, '/portail') id", [ORG_DEMO, USERS.parent]);
      const rows = await q("select notification_id, status from notification_deliveries where channel = 'push' and notification_id = any ($1)", [[id, id2]]);
      assert.equal(rows.length, 2);
      assert.ok(rows.every((r) => r.status === "pending"));
      // Utilisateur sans appareil : aucun envoi push.
      const [{ id: id3 }] = await q("select app.notify($1, $2, 'payment.received', 'Paiement', null, '/') id", [ORG_DEMO, USERS.teacher]);
      assert.equal((await q("select count(*)::int n from notification_deliveries where notification_id = $1", [id3]))[0].n, 0);

      // Isolation : un autre compte ne voit ni ne retire l'appareil.
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select count(*)::int n from push_subscriptions"))[0].n, 0);
      await q("delete from push_subscriptions");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from push_subscriptions where user_id = $1", [USERS.parent]))[0].n, 1);

      // Réservation : serveur uniquement ; un envoi réservé n'est pas repris aussitôt.
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select * from claim_push_deliveries(10)")), /permission denied/);
      await q("reset role");
      await q("set local role service_role");
      const claimed = await q("select * from claim_push_deliveries(10)");
      assert.ok(claimed.some((c) => c.title === "Paiement" && c.user_id === USERS.parent && c.link === "/portail"));
      assert.equal((await q("select * from claim_push_deliveries(10)")).filter((c) => [id, id2].includes(c.delivery_id)).length, 0);
    });
  });
});
