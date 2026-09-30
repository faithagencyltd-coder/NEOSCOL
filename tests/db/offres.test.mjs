// Offres (Super Admin) : essai modifiable, codes promo, offres automatiques,
// tarif négocié — calculés en base, une utilisation par établissement, droits.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const promo = (q, code, type, value, opts = {}) =>
  q("select public.platform_save_promo(null, $1, $2, null, $3, $4, $5, $6, null, $7, $8, $9, true) id", [
    code, opts.name ?? `Offre ${code}`, type, value, opts.plans ?? null, opts.intervals ?? null, opts.ends ?? null, opts.max ?? null, opts.auto ?? false,
  ]).then((r) => r[0].id);
async function realTrial(q) {
  await switchTo(q, null);
  await q("update subscriptions set is_demo = false, status = 'TRIALING', trial_start = now(), trial_end = now() + interval '14 days' where organization_id = $1", [ORG_DEMO]);
}

describe("Offres commerciales", () => {
  test("Super Admin seulement ; essai 0–90 jours ; code valide", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(promo(q, "RENTREE", "percent", 20)), /Réservé|plateforme|insufficient/i);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(promo(q, "x", "percent", 20)), /Code invalide/);
      assert.match(await rejects(promo(q, "TROPFORT", "percent", 95)), /check/i);
      const [{ id: plan }] = await q("select id from subscription_plans where code = 'MODULE_SCOLAIRE'");
      assert.match(await rejects(q("select platform_update_plan_trial($1, 120)", [plan])), /0 à 90/);
      await q("select platform_update_plan_trial($1, 30)", [plan]);
      assert.equal((await q("select trial_days from subscription_plans where id = $1", [plan]))[0].trial_days, 30);
    });
  });

  test("code promo -20 % appliqué une seule fois par établissement ; aperçu sans écriture", async () => {
    await as(null, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.superadmin);
      await promo(q, "RENTREE2026", "percent", 20, { plans: ["MODULE_SCOLAIRE"] });
      await switchTo(q, USERS.admin);
      const [{ p }] = await q("select billing_preview_promo($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'rentree2026') p", [ORG_DEMO]);
      assert.deepEqual([p.ok, p.base, p.discount, p.amount], [true, 15000, 3000, 12000]);
      assert.equal((await q("select count(*)::int n from promo_redemptions"))[0].n, 0, "aperçu : aucune écriture");
      assert.match(await rejects(q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'simulation', 'test', 'FAUX')", [ORG_DEMO])), /invalide/);
      const [{ c }] = await q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'simulation', 'test', 'RENTREE2026') c", [ORG_DEMO]);
      assert.equal(c.amount, 12000);
      await switchTo(q, null);
      const [inv] = await q("select amount, promo_code, promo_discount from subscription_invoices where id = $1", [c.invoice_id]);
      assert.deepEqual([inv.amount, inv.promo_code, inv.promo_discount], [12000, "RENTREE2026", 3000]);
      // Nouvel essai de paiement : même facture réutilisée, réduction non cumulée.
      await switchTo(q, USERS.admin);
      const [{ c: again }] = await q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'simulation', 'test', 'RENTREE2026') c", [ORG_DEMO]);
      assert.equal(again.amount, 12000);
      const [{ p: used }] = await q("select billing_preview_promo($1, 'MODULE_SCOLAIRE', 'YEARLY', 'RENTREE2026') p", [ORG_DEMO]);
      assert.equal(used.ok, false, "déjà utilisé par cet établissement");
    });
  });

  test("offre automatique limitée dans le temps et tarif négocié prioritaire", async () => {
    await as(null, async (q) => {
      await realTrial(q);
      await switchTo(q, USERS.superadmin);
      await promo(q, "SEPTEMBRE", "amount", 5000, { auto: true, ends: new Date(Date.now() + 86400000).toISOString() });
      await promo(q, "EXPIREE", "amount", 9000, { auto: true, ends: new Date(Date.now() - 3600000).toISOString() }).catch(() => null);
      assert.equal((await q("select count(*)::int n from active_offers()"))[0].n, 1, "seule l'offre en cours est affichée");
      await q("select platform_set_negotiated_price($1, 'MODULE_SCOLAIRE', 10000, 100000, 'Groupe scolaire partenaire', null, true)", [ORG_DEMO]);
      await switchTo(q, USERS.admin);
      const [{ p }] = await q("select billing_preview_promo($1, 'MODULE_SCOLAIRE', 'MONTHLY') p", [ORG_DEMO]);
      assert.deepEqual([p.negotiated, p.base, p.discount, p.amount, p.auto], [true, 10000, 5000, 5000, true]);
      const [{ c }] = await q("select billing_start_checkout_offer($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'simulation', 'test') c", [ORG_DEMO]);
      assert.equal(c.amount, 5000);
      await switchTo(q, null);
      assert.equal((await q("select negotiated from subscription_invoices where id = $1", [c.invoice_id]))[0].negotiated, true);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select count(*)::int n from negotiated_prices"))[0].n, 0, "tarif négocié invisible des autres établissements");
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_negotiated_price($1, 'MODULE_SCOLAIRE', null, null, null, null, false)", [ORG_DEMO]);
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from negotiated_prices where organization_id = $1", [ORG_DEMO]))[0].n, 1, "historique conservé");
    });
  });
});
