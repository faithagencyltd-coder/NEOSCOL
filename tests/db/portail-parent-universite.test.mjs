// Portail parent universitaire : désactivé par défaut, activable par
// l'université ; tant qu'il est désactivé, un parent ne voit aucune donnée
// d'étudiant (contrôle en base). Informations visibles choisies par l'université.
// Écoles et centres de formation : inchangés.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const ORG_DEMOU = "10000000-0000-4000-a000-000000000003";
const UNI_ADMIN = "00000000-0000-4000-a000-000000000012";
const UNI_PARENT = "00000000-0000-4000-a000-000000000020";
const TRAINING_PARENT = "00000000-0000-4000-a000-000000000019";
const setFeature = (q, on) => q("select set_university_config($1, $2)", [ORG_DEMOU, { features: { parent_portal: on } }]);
const visibleStudents = async (q) => (await q("select first_name, last_name from students order by last_name")).map((s) => `${s.first_name} ${s.last_name}`);

describe("Portail parent — université", () => {
  test("réglages par défaut : portail parent désactivé, toutes les informations proposées", async () => {
    await as(UNI_ADMIN, async (q) => {
      const [{ c }] = await q("select app.org_university($1) as c", [ORG_DEMOU]);
      assert.equal((await q("select (app.default_university_settings() #>> '{features,parent_portal}')::boolean as v"))[0].v, false, "désactivé par défaut");
      assert.deepEqual(Object.keys(c.parent_portal_sections).sort(), ["attendance", "documents", "finances", "grades", "results", "timetable"]);
    });
  });

  test("activé : le parent voit son enfant (et lui seul) ; désactivé : plus rien", async () => {
    await as(UNI_PARENT, async (q) => {
      assert.deepEqual(await visibleStudents(q), ["Kouamé KONAN"], "portail activé (démo) : son enfant uniquement");
      await switchTo(q, UNI_ADMIN);
      await setFeature(q, false);
      await switchTo(q, UNI_PARENT);
      assert.deepEqual(await visibleStudents(q), [], "portail désactivé : aucune donnée d'étudiant");
      assert.equal((await q("select count(*)::int n from invoices"))[0].n, 0, "ni factures");
      await switchTo(q, UNI_ADMIN);
      await setFeature(q, true);
      await switchTo(q, UNI_PARENT);
      assert.deepEqual(await visibleStudents(q), ["Kouamé KONAN"], "réactivé : accès rétabli, rien n'a été supprimé");
    });
  });

  test("informations visibles : booléens connus seulement, réservé à l'administration", async () => {
    await as(UNI_ADMIN, async (q) => {
      await q("select set_university_config($1, $2)", [ORG_DEMOU, { parent_portal_sections: { grades: false, finances: false } }]);
      const [{ c }] = await q("select app.org_university($1) as c", [ORG_DEMOU]);
      assert.deepEqual([c.parent_portal_sections.grades, c.parent_portal_sections.finances, c.parent_portal_sections.results], [false, false, true]);
      assert.match(await rejects(q("select set_university_config($1, $2)", [ORG_DEMOU, { parent_portal_sections: { salaries: true } }])), /inconnue/);
      assert.match(await rejects(q("select set_university_config($1, $2)", [ORG_DEMOU, { parent_portal_sections: { grades: "oui" } }])), /inconnue/);
      await switchTo(q, UNI_PARENT);
      assert.match(await rejects(setFeature(q, true)), /Permission/);
    });
  });

  test("écoles et centres de formation : portail parent inchangé", async () => {
    await as(USERS.parent, async (q) => {
      assert.ok((await visibleStudents(q)).length >= 2, "parent du module scolaire : ses enfants");
    });
    await as(TRAINING_PARENT, async (q) => {
      assert.deepEqual(await visibleStudents(q), ["Aminata COULIBALY"], "parent du centre de formation : son enfant");
    });
  });
});
