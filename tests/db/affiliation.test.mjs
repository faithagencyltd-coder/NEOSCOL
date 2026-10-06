// NEOSCOOL Affiliates : désactivé par défaut, adhésion et approbation, attribution
// à l'inscription (lien vérifié en base, code, auto-parrainage, école existante),
// commission calculée sur un paiement réel, doublons, remboursement, versement
// avec référence, isolation, désactivation sans perte d'historique.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

/** Nouvel établissement « inscrit en ligne » (compte responsable + école), comme le fait le serveur. */
async function newSchool(q, name, phone = "+225 01 23 45 67") {
  await switchTo(q, null);
  const user = randomUUID();
  await q("insert into auth.users (id, email) values ($1, $2)", [user, `resp.${user.slice(0, 8)}@exemple.ci`]);
  const r = (await one(q, "select signup_create_organization($1, $2, 'AFF', 'university', 'Abidjan', 'CI', $3, $4, 'UNIVERSITE', 'MONTHLY') r", [user, name, phone, `resp.${user.slice(0, 8)}@exemple.ci`])).r;
  return { user, org: r.organization_id };
}

async function pay(q, org, ref) {
  await switchTo(q, USERS.superadmin);
  const { id } = await one(q, "select platform_issue_invoice($1, 'UNIVERSITE', 'MONTHLY') id", [org]);
  const amount = (await one(q, "select amount from subscription_invoices where id = $1", [id])).amount;
  await q("select platform_record_manual_payment($1, $2, $3, 'virement')", [id, ref, amount]);
  return amount;
}

async function enableProgram(q, extra = {}) {
  await switchTo(q, USERS.superadmin);
  await q("select platform_save_affiliate_settings($1)", [JSON.stringify({ enabled: true, reward_type: "percent", reward_value: 20, reward_event: "first_payment", hold_days: 30, ...extra })]);
}

async function approvedAffiliate(q, user = USERS.teacher, phone = "+225 07 11 22 33 44") {
  await switchTo(q, user);
  await q("select affiliate_apply('teacher', $1, 'CI', 'Abidjan', 'Je connais des écoles', 'mobile_money', '+225 07 11 22 33 44', true)", [phone]);
  const a = await one(q, "select id, code, status from affiliates where user_id = $1", [user]);
  await switchTo(q, USERS.superadmin);
  await q("select platform_review_affiliate($1, 'approve', null)", [a.id]);
  return a;
}

describe("Affiliation", () => {
  test("désactivé par défaut ; fonctions serveur et console protégées", async () => {
    await as(USERS.teacher, async (q) => {
      const s = await one(q, "select enabled, require_approval from affiliate_settings where id = 1");
      assert.equal(s.enabled, false, "programme désactivé par défaut");
      assert.match(await rejects(q("select affiliate_apply('teacher', '+22507000000', 'CI', '', '', 'mobile_money', '0700', true)")), /n'accepte pas/);
      assert.match(await rejects(q("select platform_save_affiliate_settings('{\"enabled\": true}'::jsonb)")), /Réservé à l'administration/);
      assert.match(await rejects(q("select affiliate_record_click('NEO-X-1234', null, '/', null)")), /permission denied/, "clic : serveur uniquement");
      assert.match(await rejects(q("select affiliate_attribute_signup($1, $2, null, 'NEO-X', '', null)", [ORG_DEMO, USERS.teacher])), /permission denied/, "attribution : serveur uniquement");
      assert.match(await rejects(q("insert into affiliate_commissions (affiliate_id) values (gen_random_uuid())")), /permission denied/, "aucune écriture directe");
    });
  });

  test("adhésion, approbation, lien, attribution à l'inscription, protections", async () => {
    await as(USERS.superadmin, async (q) => {
      await enableProgram(q);
      const a = await approvedAffiliate(q);
      assert.match(a.code, /^NEO-[A-Z0-9]+-\d{4}$/);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select id from affiliates")).length, 0, "un établissement ne voit pas les affiliés");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select affiliate_apply('teacher', '+22507000000', 'CI', '', '', 'mobile_money', '0700', true)")), /déjà/, "une seule adhésion");

      // Lien : clic enregistré en base, puis inscription d'une nouvelle école.
      await switchTo(q, null);
      const click = (await one(q, "select affiliate_record_click($1, $2, '/tarifs', null) r", [a.code, "a".repeat(64)])).r;
      assert.ok(click.click, "clic enregistré pour un affilié approuvé");
      assert.equal((await one(q, "select affiliate_record_click('NEO-INCONNU-0000', null, '/', null) r")).r, null, "code inconnu : rien");
      const s1 = await newSchool(q, "Université Affiliée Test");
      const r1 = (await one(q, "select affiliate_attribute_signup($1, $2, $3, '', '+225 01 23 45 67', null) r", [s1.org, s1.user, click.click])).r;
      assert.equal(r1.attributed, true);
      assert.equal(r1.source, "link");
      const again = (await one(q, "select affiliate_attribute_signup($1, $2, null, $3, '', null) r", [s1.org, s1.user, a.code])).r;
      assert.equal(again.reason, "already", "une école n'est attribuée qu'une fois");
      assert.equal((await one(q, "select affiliate_attribute_signup($1, $2, null, $3, '', null) r", [ORG_DEMO, USERS.admin, a.code])).r.attributed, false, "école existante : jamais attribuée");

      // Lien inventé (identifiant de clic modifié dans le navigateur) : ignoré.
      const s2 = await newSchool(q, "Institut Sans Lien", "+225 05 55 55 55");
      assert.equal((await one(q, "select affiliate_attribute_signup($1, $2, $3, '', '', null) r", [s2.org, s2.user, randomUUID()])).r.attributed, false);
      assert.equal((await one(q, "select affiliate_attribute_signup($1, $2, null, 'NEO-FAUX-9999', '', null) r", [s2.org, s2.user])).r.reason, "invalid_code");

      // Auto-parrainage : même téléphone que l'affilié → refusé.
      const s3 = await newSchool(q, "École du Parrain", "+225 07 11 22 33 44");
      const r3 = (await one(q, "select affiliate_attribute_signup($1, $2, null, $3, '+225 07 11 22 33 44', null) r", [s3.org, s3.user, a.code])).r;
      assert.equal(r3.attributed, false);
      assert.ok(r3.flags.includes("self_referral"));
    });
  });

  test("commission sur paiement réel, doublons, validation, versement avec référence", async () => {
    await as(USERS.superadmin, async (q) => {
      await enableProgram(q);
      const a = await approvedAffiliate(q);
      const s = await newSchool(q, "Université Commission Test");
      await q("select affiliate_attribute_signup($1, $2, null, $3, '', null)", [s.org, s.user, a.code]);
      assert.equal((await q("select id from affiliate_commissions where organization_id = $1", [s.org])).length, 0, "inscription seule : aucune commission");

      const amount = await pay(q, s.org, `VIR-AFF-${randomUUID().slice(0, 8)}`);
      const c = await one(q, "select id, amount, status, mode from affiliate_commissions where organization_id = $1", [s.org]);
      assert.equal(c.amount, Math.round(amount * 0.2), "20 % du paiement confirmé");
      assert.equal(c.status, "pending");
      assert.equal(c.mode, "live");
      await pay(q, s.org, `VIR-AFF-${randomUUID().slice(0, 8)}`);
      assert.equal((await q("select id from affiliate_commissions where organization_id = $1", [s.org])).length, 1, "règle « premier paiement » : pas de seconde commission");

      // École sans attribution : aucune commission.
      const other = await newSchool(q, "Université Hors Programme", "+225 09 99 99 99");
      await pay(q, other.org, `VIR-AFF-${randomUUID().slice(0, 8)}`);
      assert.equal((await q("select id from affiliate_commissions where organization_id = $1", [other.org])).length, 0);

      // Isolation : l'affilié voit ses commissions, un autre compte non.
      await switchTo(q, USERS.teacher);
      const space = (await one(q, "select my_affiliate_space() s")).s;
      assert.equal(space.commissions.length, 1);
      assert.equal(space.totals.estimated, c.amount);
      await switchTo(q, USERS.teacher2);
      assert.equal((await q("select id from affiliate_commissions")).length, 0, "un autre compte ne voit rien");
      assert.equal((await one(q, "select my_affiliate_space() s")).s, null);

      // Validation : délai de 30 jours → « validée », pas encore payable.
      await switchTo(q, USERS.superadmin);
      await q("select platform_review_commission($1, 'validate', null)", [c.id]);
      assert.equal((await one(q, "select status from affiliate_commissions where id = $1", [c.id])).status, "validated");
      assert.match(await rejects(q("select platform_record_affiliate_payout($1, $2, 'mobile_money', 'MM-123456', current_date, null)", [a.id, [c.id]])), /payables/, "non payable : pas de versement");
      await q("select platform_save_affiliate_settings('{\"hold_days\": 0}'::jsonb)");
      await q("select affiliate_promote_payable()");
      assert.equal((await one(q, "select status from affiliate_commissions where id = $1", [c.id])).status, "payable");
      assert.match(await rejects(q("select platform_record_affiliate_payout($1, $2, 'mobile_money', '', current_date, null)", [a.id, [c.id]])), /référence/, "référence obligatoire");
      const payout = (await one(q, "select platform_record_affiliate_payout($1, $2, 'mobile_money', 'MM-REF-778899', current_date, 'Orange Money') id", [a.id, [c.id]])).id;
      const paid = await one(q, "select status, payout_id from affiliate_commissions where id = $1", [c.id]);
      assert.equal(paid.status, "paid");
      assert.equal(paid.payout_id, payout);
      assert.match(await rejects(q("select platform_review_commission($1, 'reject', 'erreur')", [c.id])), /ne peut plus/, "commission payée figée");
      await switchTo(q, USERS.teacher);
      assert.equal((await one(q, "select my_affiliate_space() s")).s.totals.paid, c.amount, "versement visible par l'affilié");
      await switchTo(q, USERS.superadmin);
      const journal = await q("select action from audit_logs where action like 'platform.affiliate%' order by created_at desc limit 20");
      assert.ok(journal.some((j) => j.action === "platform.affiliate_payout"), "versement journalisé");
    });
  });

  test("remboursement, contestation, correction d'attribution, désactivation sans perte", async () => {
    await as(USERS.superadmin, async (q) => {
      await enableProgram(q, { hold_days: 0 });
      const a = await approvedAffiliate(q);
      const s = await newSchool(q, "Université Remboursée Test");
      await q("select affiliate_attribute_signup($1, $2, null, $3, '', null)", [s.org, s.user, a.code]);
      await pay(q, s.org, `VIR-AFF-${randomUUID().slice(0, 8)}`);
      const c = await one(q, "select id, transaction_id from affiliate_commissions where organization_id = $1", [s.org]);
      await switchTo(q, null);
      await q("update payment_transactions set status = 'REFUNDED' where id = $1", [c.transaction_id]);
      const cancelled = await one(q, "select status, reason from affiliate_commissions where id = $1", [c.id]);
      assert.equal(cancelled.status, "cancelled");
      assert.match(cancelled.reason, /remboursé/);

      // Contestation par l'affilié, traitée par la plateforme.
      const s2 = await newSchool(q, "Université Contestée Test", "+225 04 44 44 44");
      await q("select affiliate_attribute_signup($1, $2, null, $3, '', null)", [s2.org, s2.user, a.code]);
      await pay(q, s2.org, `VIR-AFF-${randomUUID().slice(0, 8)}`);
      const c2 = await one(q, "select id from affiliate_commissions where organization_id = $1", [s2.org]);
      await q("select platform_review_commission($1, 'reject', 'Inscription suspecte')", [c2.id]);
      await switchTo(q, USERS.teacher);
      await q("select affiliate_dispute($1, 'Cette école existe bien, voici le contact du directeur.')", [c2.id]);
      await switchTo(q, USERS.teacher2);
      assert.match(await rejects(q("select affiliate_dispute($1, 'je conteste aussi')", [c2.id])), /introuvable/, "on ne conteste que ses commissions");
      await switchTo(q, USERS.superadmin);
      assert.equal((await one(q, "select disputed from affiliate_commissions where id = $1", [c2.id])).disputed, true);
      await q("select platform_review_commission($1, 'resolve_dispute', 'Vérifié : refus maintenu')", [c2.id]);

      // Correction d'attribution : motif obligatoire, historique conservé.
      assert.match(await rejects(q("select platform_correct_attribution($1, null, '')", [s2.org])), /motif/);
      await q("select platform_correct_attribution($1, null, 'Attribution contestée par l''école')", [s2.org]);
      const t = await one(q, "select status, correction_reason from affiliate_attributions where organization_id = $1", [s2.org]);
      assert.equal(t.status, "rejected");

      // Désactivation : plus de nouvelles attributions ni commissions ; historique conservé.
      await q("select platform_save_affiliate_settings('{\"enabled\": false}'::jsonb)");
      await switchTo(q, null);
      const s3 = await newSchool(q, "Université Après Arrêt", "+225 03 33 33 33");
      assert.equal((await one(q, "select affiliate_attribute_signup($1, $2, null, $3, '', null) r", [s3.org, s3.user, a.code])).r.reason, "disabled");
      assert.equal((await one(q, "select affiliate_record_click($1, null, '/', null) r", [a.code])).r, null, "lien inactif");
      assert.ok((await q("select id from affiliate_commissions where affiliate_id = $1", [a.id])).length >= 2, "historique conservé");
      await switchTo(q, USERS.teacher);
      assert.ok((await one(q, "select my_affiliate_space() s")).s.commissions.length >= 2, "l'affilié garde l'accès à son historique");
    });
  });
});
