// Parent avec des enfants dans deux établissements Neoscool : un seul compte,
// chaque établissement ne montre que ses propres enfants (portail par établissement).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Parent multi-établissements", () => {
  test("même compte : enfants de A dans A, enfant de B dans B, jamais mélangés", async () => {
    await as(null, async (q) => {
      const [{ id: studentB }] = await q("select id from students where organization_id = $1 and status = 'active' and archived_at is null order by last_name limit 1", [ORG_DEMOF]);
      const [{ id: guardianB }] = await q(
        "insert into guardians (organization_id, user_id, first_name, last_name, phone) values ($1, $2, 'Parent', 'Démo', '+22500000000') returning id",
        [ORG_DEMOF, USERS.parent],
      );
      await q("insert into student_guardians (organization_id, student_id, guardian_id, relationship, portal_access) values ($1, $2, $3, 'father', true)", [ORG_DEMOF, studentB, guardianB]);
      const [{ id: m }] = await q("insert into memberships (organization_id, user_id, status) values ($1, $2, 'active') returning id", [ORG_DEMOF, USERS.parent]);
      const [{ id: role }] = await q("select id from roles where organization_id = $1 and key = 'parent'", [ORG_DEMOF]);
      await q("insert into membership_roles (organization_id, membership_id, role_id) values ($1, $2, $3)", [ORG_DEMOF, m, role]);

      await switchTo(q, USERS.parent);
      const inA = await q("select id from portal_students($1)", [ORG_DEMO]);
      const inB = await q("select id from portal_students($1)", [ORG_DEMOF]);
      assert.ok(inA.length >= 1, "enfant(s) de l'établissement A");
      assert.deepEqual(inB.map((s) => s.id), [studentB], "seul l'enfant de B dans l'établissement B");
      assert.ok(!inA.some((s) => s.id === studentB), "l'enfant de B n'apparaît pas dans A");
      const orgs = (await q("select app.member_org_ids() as ids"))[0].ids;
      assert.ok(orgs.includes(ORG_DEMO) && orgs.includes(ORG_DEMOF), "un seul compte, deux établissements");
      assert.ok((await q("select public.my_permissions($1) as p", [ORG_DEMOF]))[0].p.includes("portal.parent"));
    });
  });
});
