// P3 — Intégrations de la plateforme : clé chiffrée jamais lisible par le
// navigateur, écritures réservées au Super Admin, quotas par établissement,
// journal des envois isolé par établissement.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const CIPHER = "v1:aXY=:dGFn:ZGF0YQ==";

describe("Intégrations de la plateforme", () => {
  test("Super Admin : enregistre, active, teste ; la clé chiffrée n'est jamais lisible (même par lui)", async () => {
    await as(USERS.superadmin, async (q) => {
      assert.match(await rejects(q("select platform_update_integration('brevo_email', true, '{\"sender_email\":\"x@y.z\"}')")), /clé secrète avant/);
      assert.match(await rejects(q("select platform_update_integration('brevo_email', false, '{}', 'clé-en-clair', '••1234')")), /chiffrée par le serveur/);
      await q("select platform_update_integration('brevo_email', true, '{\"sender_email\":\"x@y.z\"}', $1, '••1234')", [CIPHER]);
      const [row] = await q("select enabled, config, secret_hint from platform_integrations where provider = 'brevo_email'");
      assert.deepEqual(row, { enabled: true, config: { sender_email: "x@y.z" }, secret_hint: "••1234" });
      assert.match(await rejects(q("select secret_ciphertext from platform_integrations")), /permission denied/);
      assert.match(await rejects(q("select * from platform_integrations")), /permission denied/);
      // Sans nouvelle clé : la clé enregistrée est conservée.
      await q("select platform_update_integration('brevo_email', false, '{\"sender_email\":\"x@y.z\"}')");
      await q("select platform_record_integration_test('brevo_email', true, 'ok')");
      await switchTo(q, null);
      const [kept] = await q("select enabled, secret_ciphertext, last_test_ok from platform_integrations where provider = 'brevo_email'");
      assert.deepEqual(kept, { enabled: false, secret_ciphertext: CIPHER, last_test_ok: true });
      const audit = await q("select action, summary, metadata::text m from audit_logs where action like 'platform.integration%' order by created_at");
      assert.ok(audit.length >= 3);
      assert.ok(audit.every((a) => !a.m.includes(CIPHER) && !a.summary.includes(CIPHER)), "ni clé ni chiffré dans le journal");
      // Suppression de la clé : désactivée, clé effacée.
      await switchTo(q, USERS.superadmin);
      await q("select platform_update_integration('brevo_email', true, '{\"sender_email\":\"x@y.z\"}', null, null, true)");
      await switchTo(q, null);
      const [cleared] = await q("select enabled, secret_ciphertext, secret_hint from platform_integrations where provider = 'brevo_email'");
      assert.deepEqual(cleared, { enabled: false, secret_ciphertext: null, secret_hint: null });
    });
  });

  test("établissements et anonymes : aucun accès aux intégrations ni aux fonctions de la plateforme", async () => {
    await as(USERS.admin, async (q) => {
      assert.equal((await q("select count(*)::int n from platform_integrations")).length, 1);
      assert.equal((await q("select count(*)::int n from platform_integrations"))[0].n, 0, "RLS : aucune ligne");
      assert.match(await rejects(q("select secret_ciphertext from platform_integrations")), /permission denied/);
      assert.match(await rejects(q("select platform_update_integration('brevo_email', false, '{}')")), /Réservé/);
      assert.match(await rejects(q("select platform_set_messaging_quota($1, 1, 1, 1)", [ORG_DEMO])), /Réservé/);
      assert.match(await rejects(q("select platform_messaging_usage()")), /Réservé/);
      assert.match(await rejects(q("select messaging_quota_state($1, 'email')", [ORG_DEMO])), /permission denied/);
      assert.match(await rejects(q("insert into message_deliveries (channel, recipient_masked, status) values ('email', 'x', 'sent')")), /permission denied/);
    });
    await as("anon", async (q) => {
      assert.match(await rejects(q("select provider from platform_integrations")), /permission denied/);
      assert.match(await rejects(q("select platform_record_integration_test('turnstile', true, 'x')")), /permission denied/);
    });
  });

  test("quotas : valeur par défaut, dérogation par établissement, comptage mensuel des envois réussis", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_update_messaging_settings(100, 2, 50)");
      await q("select platform_set_messaging_quota($1, null, 5, null)", [ORG_DEMO]);
      await switchTo(q, null);
      const state = async (org, channel) => (await q("select messaging_quota_state($1, $2) s", [org, channel]))[0].s;
      assert.deepEqual(await state(ORG_DEMO, "sms"), { used: 0, limit: 5 });
      assert.deepEqual(await state(ORG_DEMOF, "sms"), { used: 0, limit: 2 });
      assert.deepEqual(await state(ORG_DEMO, "email"), { used: 0, limit: 100 });
      await q(
        `insert into message_deliveries (organization_id, channel, recipient_masked, status) values
          ($1, 'sms', '+229•••00', 'sent'), ($1, 'sms', '+229•••01', 'sent'), ($1, 'sms', '+229•••02', 'failed'),
          ($2, 'sms', '+229•••03', 'sent')`,
        [ORG_DEMO, ORG_DEMOF],
      );
      await q("insert into message_deliveries (organization_id, channel, recipient_masked, status, created_at) values ($1, 'sms', 'x', 'sent', now() - interval '40 days')", [ORG_DEMO]);
      assert.deepEqual(await state(ORG_DEMO, "sms"), { used: 2, limit: 5 }, "échecs et mois précédents non comptés");
      assert.deepEqual(await state(ORG_DEMOF, "sms"), { used: 1, limit: 2 });
      await switchTo(q, USERS.superadmin);
      const usage = await q("select * from platform_messaging_usage() where organization_id = $1", [ORG_DEMO]);
      assert.deepEqual([usage[0].sms_used, usage[0].sms_limit, usage[0].custom], [2, 5, true]);
      assert.match(await rejects(q("select platform_set_messaging_quota($1, -1, null, null)", [ORG_DEMO])), /invalide/);
    });
  });

  test("journal des envois : chaque établissement ne voit que les siens ; enseignant : rien", async () => {
    await as(null, async (q) => {
      await q(
        "insert into message_deliveries (organization_id, channel, recipient_masked, status) values ($1, 'email', 'a•••@x.bj', 'sent'), ($2, 'email', 'b•••@y.bj', 'sent'), (null, 'email', 'c•••@z.bj', 'sent')",
        [ORG_DEMO, ORG_DEMOF],
      );
      await switchTo(q, USERS.admin);
      const mine = await q("select organization_id from message_deliveries");
      assert.ok(mine.length >= 1 && mine.every((d) => d.organization_id === ORG_DEMO));
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select count(*)::int n from message_deliveries"))[0].n, 0);
      await switchTo(q, USERS.superadmin);
      assert.ok((await q("select count(*)::int n from message_deliveries"))[0].n >= 3);
    });
  });

  test("modèles WhatsApp : Super Admin uniquement, nom au format Meta", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_upsert_whatsapp_template('rappel_paiement', 'fr', 'Rappel', 2, true)");
      await q("select platform_upsert_whatsapp_template('ancien_modele', 'fr', 'Désactivé', 0, false)");
      assert.match(await rejects(q("select platform_upsert_whatsapp_template('Rappel Paiement!', 'fr', '', 0, true)")), /check|violates/);
      assert.equal((await q("select variables_count from whatsapp_templates where name = 'rappel_paiement'"))[0].variables_count, 2);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_upsert_whatsapp_template('x', 'fr', '', 0, true)")), /Réservé/);
      // Établissements : seuls les modèles actifs sont lisibles (choix d'un modèle approuvé, aucun secret).
      assert.deepEqual((await q("select name from whatsapp_templates order by name")).map((r) => r.name), ["rappel_paiement"]);
    });
  });
});
