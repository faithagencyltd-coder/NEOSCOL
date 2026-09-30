// Module 4 — statistiques consolidées : chiffres agrégés par espace du groupe,
// réservés à la direction de l'établissement principal.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const GROUP = "10000000-0000-4000-a000-0000000000b4";
const ADMIN = USERS.otherOrgAdmin;

describe("Statistiques consolidées du groupe", () => {
  test("une ligne par espace (groupe compris), agrégats seulement, accès direction uniquement", async () => {
    await as(null, async (q) => {
      await switchTo(q, null);
      await q("insert into organizations (id, name, code, slug, type) values ($1, 'Groupe Stats', 'GRPSTA', 'grpsta-test', 'school_group')", [GROUP]);
      const [m] = await q("insert into memberships (organization_id, user_id, status, joined_at) values ($1, $2, 'active', now()) returning id", [GROUP, ADMIN]);
      await q("insert into membership_roles (organization_id, membership_id, role_id) select $1, $2, id from roles where organization_id = $1 and key = 'org_admin'", [GROUP, m.id]);
      await switchTo(q, ADMIN);
      await q("select set_subscription_components($1, array['school', 'training'])", [GROUP]);
      const [{ id: school }] = await q("select create_component_space($1, 'school', 'École Stats') id", [GROUP]);
      await q("select create_component_space($1, 'training', 'Centre Stats')", [GROUP]);

      const [{ s }] = await q("select group_consolidated_stats($1) s", [GROUP]);
      assert.equal(s.length, 3, "groupe + 2 espaces");
      const row = s.find((r) => r.organization_id === school);
      assert.equal(row.name, "École Stats");
      for (const key of ["students", "staff", "teachers", "classes", "invoiced", "paid", "balance", "overdue"]) {
        assert.equal(typeof row[key], "number", key);
      }
      assert.ok(!("first_name" in row) && !("email" in row), "aucune donnée nominative");

      for (const user of [USERS.teacher, USERS.admin, USERS.parent]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select group_consolidated_stats($1)", [GROUP])), /direction/);
      }
    });
  });
});
