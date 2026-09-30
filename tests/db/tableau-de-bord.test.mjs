// Tableau de bord configurable : préférence par utilisateur et par
// établissement, clés contrôlées, établissement non membre refusé, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Tableau de bord configurable", () => {
  test("blocs masqués enregistrés, nettoyés, isolés", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      const [{ h }] = await q("select save_dashboard_preferences($1, array['finance', 'inconnu', 'finance', 'alerts']) h", [ORG_DEMO]);
      assert.deepEqual(h, ["alerts", "finance"]);
      assert.deepEqual((await q("select hidden from dashboard_preferences"))[0].hidden, ["alerts", "finance"]);
      await q("select save_dashboard_preferences($1, '{}')", [ORG_DEMO]);
      assert.deepEqual((await q("select hidden from dashboard_preferences"))[0].hidden, []);
      await q("select save_dashboard_preferences($1, array['stats'])", [ORG_DEMO]);

      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select save_dashboard_preferences($1, '{}')", [ORG_DEMO])), /non accessible/);
      assert.equal((await q("select count(*)::int n from dashboard_preferences"))[0].n, 0, "préférences d'autrui invisibles");
      assert.match(await rejects(q("insert into dashboard_preferences (user_id, organization_id) values ($1, $2)", [USERS.otherOrgAdmin, ORG_DEMO])), /permission denied/);
    });
  });
});
