// P7g — Assistant IA : clé Claude comme intégration chiffrée de la plateforme,
// quota mensuel par établissement (défaut + dérogation), journal de consommation
// sans contenu, droits.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Assistant IA", () => {
  test("clé Claude : intégration de la plateforme, clé jamais lisible par le navigateur", async () => {
    await as(USERS.superadmin, async (q) => {
      const [row] = await q("select provider, enabled from platform_integrations where provider = 'anthropic'");
      assert.deepEqual(row, { provider: "anthropic", enabled: false });
      assert.match(await rejects(q("select secret_ciphertext from platform_integrations where provider = 'anthropic'")), /permission denied/);
    });
  });

  test("quota : défaut, dérogation, consommation comptée (Claude seulement), journal sans contenu", async () => {
    await as(USERS.admin, async (q) => {
      const [{ r: start }] = await q("select assistant_quota($1) as r", [ORG_DEMO]);
      assert.equal(start.limit, 300);
      await q("select record_assistant_usage($1, 'claude', array['impayes', 'statistiques'], 1200, 300)", [ORG_DEMO]);
      await q("select record_assistant_usage($1, 'local', array['rechercher'], 0, 0)", [ORG_DEMO]);
      const [{ r }] = await q("select assistant_quota($1) as r", [ORG_DEMO]);
      assert.equal(r.used, start.used + 1, "seules les réponses de Claude comptent dans le quota");
      const cols = await q("select column_name from information_schema.columns where table_name = 'assistant_usage'");
      assert.ok(!cols.some((c) => /question|content|answer|text/.test(c.column_name)), "aucun contenu de question conservé");

      // Autre établissement / enseignant sans l'assistant : refusé.
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select assistant_quota($1)", [ORG_DEMO])), /Permission refusée/);
      assert.match(await rejects(q("select record_assistant_usage($1, 'claude', '{}', 0, 0)", [ORG_DEMO])), /Permission refusée/);
      assert.equal((await q("select id from assistant_usage where organization_id = $1", [ORG_DEMO])).length, 0, "consommation d'un autre établissement invisible");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_set_ai_quota(null, 10)")), /Réservé|plateforme/);

      await switchTo(q, USERS.superadmin);
      await q("select platform_set_ai_quota(null, 50)");
      await q("select platform_set_ai_quota($1, 1)", [ORG_DEMO]);
      const usage = await q("select * from platform_ai_usage() where organization_id = any($1)", [[ORG_DEMO, ORG_DEMOF]]);
      const demo = usage.find((u) => u.organization_id === ORG_DEMO);
      const other = usage.find((u) => u.organization_id === ORG_DEMOF);
      assert.deepEqual([demo.ai_limit, demo.override, other.ai_limit, other.override], [1, 1, 50, null]);
      assert.ok(demo.used >= 1 && Number(demo.input_tokens) >= 1200);
      assert.match(await rejects(q("select platform_set_ai_quota(null, null)")), /obligatoire/);
      await switchTo(q, USERS.admin);
      const [{ r: capped }] = await q("select assistant_quota($1) as r", [ORG_DEMO]);
      assert.ok(capped.used >= capped.limit, "quota atteint : l'assistant passera en réponse locale");
    });
  });
});
