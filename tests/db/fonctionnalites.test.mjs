// Fonctionnalités par établissement : réglage de l'établissement et arrêt forcé
// par le Super Admin (prioritaire), clés contrôlées, droits, audit.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const enabled = (q, key) => q("select app.org_feature_enabled($1, $2) as e", [ORG_DEMO, key]).then((r) => r[0].e);

describe("Fonctionnalités par établissement", () => {
  test("établissement puis Super Admin : l'arrêt forcé prime ; clés et droits contrôlés", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      await q("select public.save_org_features($1, '{\"messaging\": false}'::jsonb)", [ORG_DEMO]);
      assert.equal(await enabled(q, "messaging"), false, "désactivée par l'établissement");
      await q("select public.save_org_features($1, '{\"messaging\": true}'::jsonb)", [ORG_DEMO]);
      assert.equal(await enabled(q, "messaging"), true);
      assert.match(await rejects(q("select public.save_org_features($1, '{\"inconnue\": true}'::jsonb)", [ORG_DEMO])), /inconnue/);
      assert.match(await rejects(q("select public.save_org_features($1, '{\"assistant\": \"oui\"}'::jsonb)", [ORG_DEMO])), /Valeur invalide/);
      for (const user of [USERS.teacher, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select public.save_org_features($1, '{}'::jsonb)", [ORG_DEMO])), /Paramètres/);
        assert.match(await rejects(q("select public.platform_set_org_features($1, '{}'::jsonb, 'x x x')", [ORG_DEMO])), /Réservé/);
      }
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select public.platform_set_org_features($1, '{\"assistant\": false}'::jsonb, '')", [ORG_DEMO])), /motif/);
      const [{ r }] = await q("select public.platform_set_org_features($1, '{\"assistant\": false, \"messaging\": true}'::jsonb, 'Hors contrat') as r", [ORG_DEMO]);
      assert.deepEqual(r, { assistant: false });
      await switchTo(q, USERS.admin);
      await q("select public.save_org_features($1, '{\"assistant\": true}'::jsonb)", [ORG_DEMO]);
      assert.equal(await enabled(q, "assistant"), false, "arrêt forcé par la plateforme : l'établissement ne peut pas réactiver");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from audit_logs where action = 'platform.org_features' and organization_id = $1", [ORG_DEMO]))[0].n, 1);
    });
  });
});
