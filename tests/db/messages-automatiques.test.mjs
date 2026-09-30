// Messages automatiques (Super Admin) : texte personnalisé avec variables,
// désactivation, retour au texte d'origine ; logique d'abonnement inchangée.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

async function trialEndingIn3Days(q) {
  await switchTo(q, null);
  await q("update subscriptions set is_demo = false, status = 'TRIALING', trial_start = now() - interval '10 days', trial_end = now() + interval '2 days 23 hours' where organization_id = $1", [ORG_DEMO]);
}
const lastTrialNotice = (q) =>
  q("select title, body from notifications where organization_id = $1 and type = 'billing' and data ->> 'key' like 'trial:3:%' order by created_at desc limit 1", [ORG_DEMO]).then((r) => r[0]);

describe("Messages automatiques", () => {
  test("Super Admin seulement ; titre et texte ensemble", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_save_message_template('trial_reminder', 'T', 'B', true)")), /Réservé|plateforme/i);
      assert.equal((await q("select count(*)::int n from platform_message_templates"))[0].n, 0, "invisible des établissements");
      await switchTo(q, USERS.superadmin);
      assert.ok((await q("select count(*)::int n from platform_message_templates"))[0].n >= 13);
      assert.match(await rejects(q("select platform_save_message_template('trial_reminder', 'Titre seul', '', true)")), /check/i);
      assert.match(await rejects(q("select platform_save_message_template('inconnu', 'Titre', 'Texte', true)")), /introuvable/);
    });
  });

  test("sans personnalisation : texte d'origine inchangé", async () => {
    await as(null, async (q) => {
      await trialEndingIn3Days(q);
      await q("select billing_process_lifecycle()");
      const n = await lastTrialNotice(q);
      assert.equal(n.title, "Essai gratuit : plus que 3 jour(s)");
      assert.match(n.body, /^Votre essai gratuit se termine le \d\d\/\d\d\/\d{4}\./);
    });
  });

  test("texte personnalisé avec variables, puis désactivation", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_message_template('trial_reminder', '{etablissement} : J-{jours}', 'Votre formule {formule} se termine le {date_fin}. {inconnue}', true)");
      await trialEndingIn3Days(q);
      await q("select billing_process_lifecycle()");
      const n = await lastTrialNotice(q);
      const [{ name }] = await q("select name from organizations where id = $1", [ORG_DEMO]);
      assert.equal(n.title, `${name} : J-3`);
      assert.match(n.body, /^Votre formule .+ se termine le \d\d\/\d\d\/\d{4}\. \{inconnue\}$/);
      const [{ s }] = await q("select status s from subscriptions where organization_id = $1", [ORG_DEMO]);
      assert.equal(s, "TRIALING", "logique d'abonnement inchangée");
    });
    await as(null, async (q) => {
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_message_template('trial_reminder', null, null, false)");
      await trialEndingIn3Days(q);
      await q("select billing_process_lifecycle()");
      assert.equal(await lastTrialNotice(q), undefined, "message désactivé : rien n'est envoyé");
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_message_template('trial_reminder', null, null, true)");
      const [t] = await q("select title, enabled from platform_message_templates where code = 'trial_reminder'");
      assert.deepEqual([t.title, t.enabled], [null, true], "retour au texte d'origine");
      const [{ n }] = await q("select count(*)::int n from audit_logs where action = 'platform.message_template_saved'");
      assert.ok(n >= 2, "modifications journalisées");
    });
  });
});
