// Cartes élève / apprenant / étudiant : numéro selon le module, validité seule
// modifiable, design par établissement (droits, validation, audit), isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const ORG_DEMOU = "10000000-0000-4000-a000-000000000003";
const activeStudent = async (q, org) =>
  (await q("select id from students where organization_id = $1 and status = 'active' and archived_at is null order by last_name limit 1", [org]))[0].id;

describe("Cartes", () => {
  test("numéro de la nouvelle carte selon le module : ELV (scolaire), APP (formation), ETU (université)", async () => {
    await as(null, async (q) => {
      for (const [org, prefix] of [[ORG_DEMO, "ELV-DEMO-"], [ORG_DEMOF, "APP-DEMOF-"], [ORG_DEMOU, "ETU-DEMOU-"]]) {
        const student = await activeStudent(q, org);
        const [{ id }] = await q("select public.issue_student_badge($1) as id", [student]);
        const [badge] = await q("select number, token from student_badges where id = $1", [id]);
        assert.ok(badge.number.startsWith(prefix), `${badge.number} commence par ${prefix}`);
        assert.equal(badge.token.length, 32, "jeton QR inchangé (32 caractères)");
      }
    });
  });

  test("validité : seul champ modifiable, jamais passée, jamais avant l'émission ; le reste reste figé", async () => {
    await as(USERS.admin, async (q) => {
      const student = await activeStudent(q, ORG_DEMO);
      const [{ id }] = await q("select public.issue_student_badge($1) as id", [student]);
      await q("update student_badges set valid_until = '2027-07-31' where id = $1", [id]);
      assert.equal((await q("select valid_until::text as v from student_badges where id = $1", [id]))[0].v, "2027-07-31");
      await q("update student_badges set valid_until = null where id = $1", [id]);
      assert.match(await rejects(q("update student_badges set valid_until = '2001-01-01' where id = $1", [id])), /précéder la date d'émission/);
      assert.match(await rejects(q("update student_badges set number = 'X' where id = $1", [id])), /ne peut pas être modifié/);
      assert.match(await rejects(q("update student_badges set token = 'X' where id = $1", [id])), /ne peut pas être modifié/);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("update student_badges set valid_until = '2027-06-30' where id = $1 returning id", [id])).length, 0, "enseignant : aucune modification (RLS)");
    });
  });

  test("design : paramètres requis, modèle et couleurs vérifiés, textes bornés, audité, isolé", async () => {
    await as(USERS.admin, async (q) => {
      const design = { template: "emeraude", primary: "#064E3B", slogan: "Bâtir vos rêves, façonner l'avenir.", show_barcode: false, phone: "" };
      const [{ d }] = await q("select save_card_design($1, $2::jsonb) as d", [ORG_DEMO, JSON.stringify(design)]);
      assert.deepEqual(d, { template: "emeraude", primary: "#064e3b", slogan: "Bâtir vos rêves, façonner l'avenir.", show_barcode: false }, "couleur normalisée, texte vide non conservé");
      const [{ s }] = await q("select settings->'card_design' as s from organizations where id = $1", [ORG_DEMO]);
      assert.equal(s.template, "emeraude");
      assert.match(await rejects(q("select save_card_design($1, '{\"template\":\"inconnu\"}'::jsonb)", [ORG_DEMO])), /Modèle de carte inconnu/);
      assert.match(await rejects(q("select save_card_design($1, '{\"primary\":\"rouge\"}'::jsonb)", [ORG_DEMO])), /Couleur invalide/);
      assert.match(await rejects(q("select save_card_design($1, $2::jsonb)", [ORG_DEMO, JSON.stringify({ slogan: "x".repeat(121) })])), /Texte trop long/);
      assert.match(await rejects(q("select save_card_design($1, '{\"script\":\"x\"}'::jsonb)", [ORG_DEMO])), /Champ inconnu/);
      assert.match(await rejects(q("select save_card_design($1, '{\"show_photo\":\"oui\"}'::jsonb)", [ORG_DEMO])), /Option invalide/);
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'settings.card_design' and organization_id = $1", [ORG_DEMO]))[0].n, 1);
      for (const user of [USERS.teacher, USERS.secretary, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select save_card_design($1, '{}'::jsonb)", [ORG_DEMO])), /Droit « Paramètres » requis/);
      }
    });
  });
});
