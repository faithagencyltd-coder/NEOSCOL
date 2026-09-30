// Séparation des modules : noms de rôles propres au module, « Responsable
// formation » réservé au centre de formation, suivi du changement de type.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool } from "./helpers.mjs";

after(() => pool.end());

const ORG_DEMOU = "10000000-0000-4000-a000-000000000003";
const names = async (q, org) =>
  Object.fromEntries((await q("select key, name from roles where organization_id = $1 and key in ('teacher', 'student')", [org])).map((r) => [r.key, r.name]));

describe("Séparation des modules", () => {
  test("noms des rôles selon le module", async () => {
    await as(null, async (q) => {
      assert.deepEqual(await names(q, ORG_DEMO), { teacher: "Enseignant", student: "Élève" });
      assert.deepEqual(await names(q, ORG_DEMOF), { teacher: "Formateur", student: "Apprenant" });
      assert.deepEqual(await names(q, ORG_DEMOU), { teacher: "Enseignant", student: "Étudiant" });
    });
  });

  test("« Responsable formation » : créé seulement pour un centre de formation ; changement de type suivi", async () => {
    await as(null, async (q) => {
      const [{ id: school }] = await q("insert into organizations (name, code, slug, type) values ('École Test', 'ECTS1', 'ecole-test-sep', 'primary_school') returning id");
      await q("select app.provision_organization($1)", [school]);
      assert.equal((await q("select count(*)::int n from roles where organization_id = $1 and key = 'training_manager'", [school]))[0].n, 0);
      assert.deepEqual(await names(q, school), { teacher: "Enseignant", student: "Élève" });

      const [{ id: center }] = await q("insert into organizations (name, code, slug, type) values ('Centre Test', 'CFTS1', 'centre-test-sep', 'vocational_center') returning id");
      await q("select app.provision_organization($1)", [center]);
      assert.equal((await q("select count(*)::int n from roles where organization_id = $1 and key = 'training_manager'", [center]))[0].n, 1);
      assert.deepEqual(await names(q, center), { teacher: "Formateur", student: "Apprenant" });

      // L'école devient centre de formation : noms du module + rôle manquant créé (avec ses droits).
      await q("update organizations set type = 'vocational_center' where id = $1", [school]);
      assert.deepEqual(await names(q, school), { teacher: "Formateur", student: "Apprenant" });
      const [tm] = await q("select r.id, (select count(*)::int from role_permissions rp where rp.role_id = r.id) as perms from roles r where r.organization_id = $1 and r.key = 'training_manager'", [school]);
      assert.ok(tm && tm.perms > 0, "rôle Responsable formation créé avec ses droits");
    });
  });

  test("un nom personnalisé n'est jamais renommé", async () => {
    await as(null, async (q) => {
      await q("update roles set name = 'Professeur titulaire' where organization_id = $1 and key = 'teacher'", [ORG_DEMO]);
      await q("update organizations set type = 'university' where id = $1", [ORG_DEMO]);
      const n = await names(q, ORG_DEMO);
      assert.equal(n.teacher, "Professeur titulaire");
      assert.equal(n.student, "Étudiant");
    });
  });
});
