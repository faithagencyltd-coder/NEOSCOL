// Vérifie que le catalogue TypeScript (src/config/permissions.ts) et la table
// `permissions` restent synchronisés.
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool } from "./helpers.mjs";

after(() => pool.end());

test("catalogue des permissions synchronisé (TypeScript ↔ base)", async () => {
  const source = readFileSync(new URL("../../src/config/permissions.ts", import.meta.url), "utf8");
  const block = source.slice(source.indexOf("PERMISSIONS = ["), source.indexOf("] as const"));
  const fromCode = [...block.matchAll(/"([a-z_.]+)"/g)].map((m) => m[1]).sort();
  const fromDb = await as(null, async (q) => (await q("select code from permissions order by code")).map((r) => r.code));
  assert.deepEqual(fromCode, fromDb);
});
