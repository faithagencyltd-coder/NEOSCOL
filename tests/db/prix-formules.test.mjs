// Prix des formules modifiables par le Super Admin : validé, historisé, audité,
// jamais rétroactif (les abonnés gardent le prix de leur souscription).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Prix des formules (Super Admin)", () => {
  test("réservé au Super Admin, calcul annuel, historique, abonnés existants inchangés", async () => {
    await as(null, async (q) => {
      const [plan] = await q("select id, monthly_price, annual_price from subscription_plans where code = 'MODULE_SCOLAIRE'");
      const [before] = await q("select monthly_price, annual_price from subscriptions where organization_id = $1", [ORG_DEMO]);
      for (const user of [USERS.admin, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select public.platform_update_plan_prices($1, 18000, 30, 'Hausse')", [plan.id])), /Réservé/);
      }
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select public.platform_update_plan_prices($1, 18000, 30, '')", [plan.id])), /motif/);
      assert.match(await rejects(q("select public.platform_update_plan_prices($1, 18000, 80, 'Hausse')", [plan.id])), /Remise annuelle invalide/);
      const [{ r }] = await q("select public.platform_update_plan_prices($1, 18000, 30, 'Nouvelle grille 2027') as r", [plan.id]);
      assert.deepEqual(r, { monthly_price: 18000, annual_price: 151200 });
      const [after2] = await q("select monthly_price, annual_price, annual_list_price from subscription_plans where id = $1", [plan.id]);
      assert.deepEqual(after2, { monthly_price: 18000, annual_price: 151200, annual_list_price: 216000 });
      const [h] = await q("select old_monthly_price, monthly_price, reason from subscription_plan_price_history where plan_id = $1 order by id desc limit 1", [plan.id]);
      assert.deepEqual(h, { old_monthly_price: plan.monthly_price, monthly_price: 18000, reason: "Nouvelle grille 2027" });
      await switchTo(q, null);
      const [sub] = await q("select monthly_price, annual_price from subscriptions where organization_id = $1", [ORG_DEMO]);
      assert.deepEqual(sub, before, "abonnement existant : prix de sa souscription conservé");
      assert.equal((await q("select count(*)::int n from audit_logs where action = 'platform.plan_prices'"))[0].n >= 1, true);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select count(*)::int n from subscription_plan_price_history"))[0].n, 0, "historique réservé à la plateforme");
    });
  });
});
