// Communication de la plateforme : annonces ciblées (module, direction),
// masquables, notification unique ; envois groupés aux directions.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const save = (q, fields) =>
  q("select platform_save_announcement($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) r", [
    fields.id ?? null, fields.title ?? "Nouveauté", fields.body ?? "Le module X est disponible.", fields.tone ?? "info",
    fields.modules ?? [], fields.audience ?? "staff", fields.link ?? null, fields.linkLabel ?? null,
    fields.starts ?? null, fields.ends ?? null, fields.active ?? true, fields.dismissible ?? true, fields.notify ?? false,
  ]).then((r) => r[0].r);
const visible = (q) => q("select * from current_platform_announcements($1)", [ORG_DEMO]);

describe("Annonces de la plateforme", () => {
  test("Super Admin seulement ; lien et libellé ensemble", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(save(q, {})), /Réservé|plateforme/i);
      assert.equal((await q("select count(*)::int n from platform_announcements"))[0].n, 0, "table invisible des établissements");
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(save(q, { link: "/abonnement" })), /lien et son libellé/);
      assert.match(await rejects(save(q, { link: "javascript:alert(1)", linkLabel: "Voir" })), /check/i);
    });
  });

  test("ciblage par module et par public ; période ; masquage ; notification une seule fois", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.superadmin);
      const all = await save(q, { title: "Pour tous", notify: true });
      assert.ok(all.notified > 0);
      await save(q, { title: "Direction scolaire", modules: ["school"], audience: "direction", tone: "warning" });
      await save(q, { title: "Formation seulement", modules: ["training"] });
      await save(q, { title: "Plus tard", starts: new Date(Date.now() + 86400000).toISOString() });
      await save(q, { title: "Désactivée", active: false });
      const again = await save(q, { id: all.id, title: "Pour tous", notify: true });
      assert.equal(again.notified, 0, "aucune notification en double");

      await switchTo(q, USERS.admin);
      const adminSees = (await visible(q)).map((a) => a.title);
      assert.deepEqual(adminSees.sort(), ["Direction scolaire", "Pour tous"]);
      assert.equal((await q("select count(*)::int n from notifications where type = 'platform' and user_id = $1", [USERS.admin]))[0].n, 1);

      await switchTo(q, USERS.teacher);
      assert.deepEqual((await visible(q)).map((a) => a.title), ["Pour tous"], "l'enseignant ne voit pas l'annonce de direction");
      await q("select dismiss_platform_announcement($1)", [all.id]);
      assert.equal((await visible(q)).length, 0, "masquée pour lui");
      await switchTo(q, USERS.admin);
      assert.equal((await visible(q)).length, 2, "toujours visible pour les autres");
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await visible(q)).length, 0, "non-membre : rien");
    });
  });
});

describe("Envois groupés aux directions", () => {
  test("aperçu, notifications aux seules directions, e-mails renvoyés au serveur, historique", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_campaign_preview('{}', '{}', true)")), /Réservé|plateforme/i);
      await switchTo(q, USERS.superadmin);
      const [{ p: none }] = await q("select platform_campaign_preview('{school}', '{}', false) p");
      const [{ p }] = await q("select platform_campaign_preview('{school}', '{}', true) p");
      assert.ok(p.recipients >= 1 && p.recipients >= none.recipients);
      assert.match(await rejects(q("select platform_start_campaign('Objet', 'Message assez long', '{higher}', '{EXPIRED}', '{in_app}', false)")), /Aucun destinataire/);
      const [{ c }] = await q("select platform_start_campaign('Rentrée 2026', 'Bonjour, voici les nouveautés de la rentrée.', '{school}', '{}', '{in_app,email}', true) c");
      assert.equal(c.recipients, p.recipients);
      assert.equal(c.in_app, p.recipients);
      assert.ok(c.emails.length >= 1 && c.emails.every((e) => e.email.includes("@")));
      await switchTo(q, null);
      const notified = await q("select distinct user_id from notifications where data ->> 'campaign_id' = $1", [c.id]);
      assert.ok(notified.some((n) => n.user_id === USERS.admin));
      assert.ok(!notified.some((n) => n.user_id === USERS.teacher), "enseignant non visé");
      await switchTo(q, USERS.superadmin);
      await q("select platform_finish_campaign($1, 0, 0, $2)", [c.id, c.emails.length]);
      const [row] = await q("select status, email_not_configured from platform_campaigns where id = $1", [c.id]);
      assert.deepEqual([row.status, row.email_not_configured], ["done", c.emails.length]);
      assert.match(await rejects(q("select platform_finish_campaign($1, 1, 0, 0)", [c.id])), /déjà terminé/);
    });
  });
});
