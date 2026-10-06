// NEOSCOOL Tutor Match : fermé par défaut, fiche tuteur, validation et
// vérification, recherche sans coordonnées, demande → acceptation → confirmation
// (coordonnées échangées par étapes), messages, séances, isolation, enseignant
// de l'établissement, blocage, signalement, suggestions (règle, refus du parent,
// établissement qui se retire), fermeture sans perte d'historique.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];

const PROFILE = (extra = {}) =>
  JSON.stringify({
    headline: "Professeur de mathématiques, collège et lycée",
    bio: "Dix ans d'expérience, méthode progressive.",
    subjects: ["Mathématiques", "Physique"],
    levels: ["3e", "Seconde"],
    country: "CI",
    city: "Abidjan",
    zones: ["Cocody", "Riviera"],
    modes: ["home", "online"],
    languages: ["fr"],
    rate_amount: "5000",
    rate_unit: "hour",
    qualifications: "Licence de mathématiques",
    accept_terms: true,
    ...extra,
  });

async function openModule(q) {
  await switchTo(q, USERS.superadmin);
  await q("select platform_set_feature_rule('tutor_match', 'global', '', true, 'Pilote Tutor Match', null)");
}

/** Tuteur indépendant (nouveau compte), fiche approuvée et vérifiée. */
async function verifiedTutor(q, phone = "+225 05 06 07 08 09") {
  await switchTo(q, null);
  const user = randomUUID();
  await q("insert into auth.users (id, email) values ($1, $2)", [user, `tuteur.${user.slice(0, 8)}@exemple.ci`]);
  await q("update profiles set first_name = 'Yao', last_name = 'Kouadio', phone = $2 where id = $1", [user, phone]);
  await switchTo(q, user);
  await q("select tutor_save_profile($1)", [PROFILE()]);
  await switchTo(q, USERS.superadmin);
  await q("select platform_review_tutor($1, 'approve', null)", [user]);
  await q("select platform_review_tutor($1, 'verify', 'Pièce d''identité et licence vérifiées')", [user]);
  return user;
}

describe("Tutor Match", () => {
  test("fermé par défaut ; fonctions protégées ; aucune écriture directe", async () => {
    await as(USERS.parent, async (q) => {
      assert.equal((await one(q, "select tutor_match_open('CI') o")).o, false, "module fermé par défaut");
      assert.equal((await one(q, "select suggestions_enabled from tutor_settings where id = 1")).suggestions_enabled, false, "suggestions désactivées par défaut");
      assert.match(await rejects(q("select tutor_save_profile($1)", [PROFILE()])), /pas ouvert/);
      assert.equal((await q("select * from tutor_search('CI')")).length, 0);
      assert.match(await rejects(q("select platform_save_tutor_settings('{\"suggestions_enabled\": true}'::jsonb)")), /Réservé/);
      assert.match(await rejects(q("select tutor_generate_suggestions()")), /Réservé/);
      assert.match(await rejects(q("insert into tutor_requests (parent_id, tutor_id, level, subject, mode, message) values ($1, $1, 'x', 'x', 'home', 'xxxxxxxxxxxx')", [USERS.parent])), /permission denied/);
      const cols = (await q("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'tutor_requests'")).map((c) => c.column_name);
      assert.ok(!cols.some((c) => /student|grade|report/.test(c)), "une demande ne référence aucune donnée scolaire");
    });
  });

  test("fiche, validation, vérification, recherche sans coordonnées", async () => {
    await as(USERS.superadmin, async (q) => {
      await openModule(q);
      await switchTo(q, null);
      const user = randomUUID();
      await q("insert into auth.users (id, email) values ($1, $2)", [user, `tuteur.${user.slice(0, 8)}@exemple.ci`]);
      await switchTo(q, user);
      assert.match(await rejects(q("select tutor_save_profile($1)", [PROFILE({ accept_terms: false })])), /règles/);
      await q("select tutor_save_profile($1)", [PROFILE()]);
      const t = await one(q, "select status, kind, verification from tutor_profiles where user_id = $1", [user]);
      assert.deepEqual([t.status, t.kind, t.verification], ["pending", "independent", "unverified"]);

      await switchTo(q, USERS.parent);
      assert.equal((await q("select * from tutor_search('CI', 'math') where user_id = $1", [user])).length, 0, "fiche en attente : invisible");
      await switchTo(q, USERS.superadmin);
      await q("select platform_review_tutor($1, 'approve', null)", [user]);
      await switchTo(q, USERS.parent);
      assert.equal((await q("select * from tutor_search('CI', 'math') where user_id = $1", [user])).length, 0, "approuvée mais non vérifiée : invisible (vérification obligatoire)");
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_review_tutor($1, 'verify', '')", [user])), /vérifié/, "vérifier exige de dire ce qui a été contrôlé");
      await q("select platform_review_tutor($1, 'verify', 'Pièce d''identité et licence vérifiées')", [user]);

      await switchTo(q, USERS.parent);
      const found = await q("select * from tutor_search('CI', 'mathé', '3e', 'riviera', 'online') where user_id = $1", [user]);
      assert.equal(found.length, 1, "trouvé par matière, niveau, zone et mode");
      assert.ok(!("email" in found[0]) && !("phone" in found[0]), "aucune coordonnée dans la recherche");
      assert.match(found[0].name, /^\S+ [A-Z]\.$|^Utilisateur$/, "nom réduit (prénom + initiale)");
      assert.equal((await q("select * from tutor_search('CI', 'anglais') where user_id = $1", [user])).length, 0, "filtre matière");
      assert.equal((await q("select * from tutor_profiles")).length, 0, "une famille ne lit pas les fiches directement");

      // Qualifications modifiées après vérification : redeviennent « déclarées ».
      await switchTo(q, user);
      await q("select tutor_save_profile($1)", [PROFILE({ qualifications: "Master de mathématiques" })]);
      assert.equal((await one(q, "select verification from tutor_profiles where user_id = $1", [user])).verification, "unverified");
    });
  });

  test("demande, acceptation, confirmation : coordonnées par étapes, messages, séances, isolation", async () => {
    await as(USERS.superadmin, async (q) => {
      await openModule(q);
      const tutor = await verifiedTutor(q);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select tutor_request_create($1, 'Awa', '3e', 'Mathématiques', 'center', null, 'Bonjour, besoin d''aide en maths.')", [tutor])), /mode/, "mode non proposé refusé");
      const id = (await one(q, "select tutor_request_create($1, 'Awa', '3e', 'Mathématiques', 'online', 'mercredi', 'Bonjour, besoin d''aide en maths.') id", [tutor])).id;
      assert.match(await rejects(q("select tutor_request_create($1, 'Awa', '3e', 'Mathématiques', 'online', null, 'Encore une demande svp.')", [tutor])), /déjà en cours/);
      let mine = (await one(q, "select my_tutor_space() s")).s.as_parent.find((r) => r.id === id);
      assert.equal(mine.contact, null, "pas de coordonnées avant acceptation");
      assert.match(await rejects(q("select tutor_session_save($1, null, now(), 60, 'online', null)", [id])), /confirmées/, "séance seulement après confirmation");

      await switchTo(q, USERS.teacher2);
      assert.equal((await q("select id from tutor_requests where id = $1", [id])).length, 0, "un tiers ne voit pas la demande");
      assert.match(await rejects(q("select tutor_request_message($1, 'intrus')", [id])), /introuvable/);
      assert.match(await rejects(q("select tutor_request_respond($1, 'accept', null)", [id])), /introuvable/, "seul le tuteur répond");

      await switchTo(q, tutor);
      await q("select tutor_request_respond($1, 'accept', 'Avec plaisir.')", [id]);
      await q("select tutor_request_message($1, 'Quel chapitre pose problème ?')", [id]);
      let received = (await one(q, "select my_tutor_space() s")).s.as_tutor.find((r) => r.id === id);
      assert.equal(received.contact, null, "le tuteur n'a pas encore les coordonnées de la famille");
      assert.equal(received.child_label, "Awa");

      await switchTo(q, USERS.parent);
      mine = (await one(q, "select my_tutor_space() s")).s.as_parent.find((r) => r.id === id);
      assert.ok(mine.contact?.email, "coordonnées du tuteur visibles après acceptation");
      assert.equal(mine.messages.length, 1);
      await q("select tutor_request_parent_action($1, 'confirm')", [id]);
      await q("select tutor_session_save($1, null, now() + interval '2 days', 90, 'online', 'Fonctions affines')", [id]);

      await switchTo(q, tutor);
      received = (await one(q, "select my_tutor_space() s")).s.as_tutor.find((r) => r.id === id);
      assert.ok(received.contact, "coordonnées de la famille visibles après confirmation");
      assert.equal(received.sessions.length, 1);
      const s = received.sessions[0];
      await q("select tutor_session_save($1, $2, now(), 60, 'online', null, 'done')", [id, s.id]);
      assert.equal((await one(q, "select status from tutor_sessions where id = $1", [s.id])).status, "done");
    });
  });

  test("enseignant de l'établissement, blocage, signalement, suspension", async () => {
    await as(USERS.superadmin, async (q) => {
      await openModule(q);
      // L'enseignant de l'établissement de l'enfant : demande refusée (réglage par défaut).
      await switchTo(q, USERS.teacher);
      await q("select tutor_save_profile($1)", [PROFILE()]);
      assert.equal((await one(q, "select kind from tutor_profiles where user_id = $1", [USERS.teacher])).kind, "school_teacher");
      await switchTo(q, USERS.superadmin);
      await q("select platform_review_tutor($1, 'approve', null)", [USERS.teacher]);
      await q("select platform_review_tutor($1, 'verify', 'Diplôme vérifié')", [USERS.teacher]);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select tutor_request_create($1, null, '3e', 'Maths', 'online', null, 'Bonjour, des cours svp.')", [USERS.teacher])), /établissement de votre enfant/);

      const tutor = await verifiedTutor(q, "+225 01 99 88 77");
      await switchTo(q, USERS.parent);
      const id = (await one(q, "select tutor_request_create($1, null, '3e', 'Maths', 'online', null, 'Bonjour, des cours svp.') id", [tutor])).id;
      await q("select submit_content_report('tutor', $1, 'misleading', 'Diplôme douteux')", [tutor]);
      await q("select tutor_block($1, true)", [tutor]);
      assert.equal((await one(q, "select status from tutor_requests where id = $1", [id])).status, "cancelled", "blocage : demande annulée");
      assert.equal((await q("select * from tutor_search('CI', 'math') where user_id = $1", [tutor])).length, 0, "tuteur bloqué invisible");
      await switchTo(q, tutor);
      assert.match(await rejects(q("select tutor_request_message($1, 'Bonjour ?')", [id])), /terminée|bloqués/);
      await switchTo(q, USERS.superadmin);
      assert.equal((await q("select id from content_reports where target_type = 'tutor' and target_id = $1", [tutor])).length, 1, "signalement reçu par la plateforme");
      await q("select platform_review_tutor($1, 'suspend', 'Signalement confirmé')", [tutor]);
      await switchTo(q, USERS.parent);
      assert.equal((await q("select * from tutor_search('CI')")).filter((t) => t.user_id === tutor).length, 0);
    });
  });

  test("suggestions : règle sur bulletins publiés, refus du parent, établissement qui se retire, fermeture", async () => {
    await as(USERS.superadmin, async (q) => {
      await openModule(q);
      // Bulletin publié pour l'enfant du parent de démonstration (annulé à la fin du test).
      await switchTo(q, null);
      const child = await one(q, "select sg.student_id, s.first_name from student_guardians sg join guardians g on g.id = sg.guardian_id join students s on s.id = sg.student_id where g.user_id = $1 and s.status = 'active' limit 1", [USERS.parent]);
      const cls = await one(q, "select class_id, academic_year_id from enrollments where student_id = $1 and class_id is not null order by created_at desc limit 1", [child.student_id]);
      const period = await one(q, "select id from academic_periods where organization_id = $1 and academic_year_id = $2 order by sequence limit 1", [ORG_DEMO, cls.academic_year_id]);
      await q(
        `insert into report_cards (organization_id, student_id, class_id, academic_period_id, average, data, status, published_at)
         values ($1, $2, $3, $4, 8.5, $5, 'published', now())
         on conflict (student_id, class_id, academic_period_id) do update set data = excluded.data, status = 'published', published_at = now()`,
        [ORG_DEMO, child.student_id, cls.class_id, period.id, JSON.stringify({ subjects: [{ subject: "Mathématiques", average: 6.5 }, { subject: "Français", average: 14 }] })],
      );
      await switchTo(q, USERS.superadmin);
      assert.equal((await one(q, "select tutor_generate_suggestions() n")).n, 0, "désactivées : aucune suggestion");
      await q("select platform_save_tutor_settings('{\"suggestions_enabled\": true, \"suggestion_threshold\": 10, \"suggestion_periods\": 1}'::jsonb)");
      const n = (await one(q, "select tutor_generate_suggestions() n")).n;
      assert.ok(n >= 1, "suggestion générée");
      await switchTo(q, USERS.parent);
      const sugg = (await one(q, "select my_tutor_space() s")).s.suggestions;
      assert.ok(sugg.some((g) => g.subject === "Mathématiques"), "matière faible proposée");
      assert.ok(!sugg.some((g) => g.subject === "Français"), "matière correcte non proposée");
      const notif = await one(q, "select body from notifications where user_id = $1 and type = 'tutor_suggestion' order by created_at desc limit 1", [USERS.parent]);
      assert.match(notif.body, /Mathématiques/);
      assert.doesNotMatch(notif.body, /6[.,]5/, "aucune note dans la suggestion");
      await switchTo(q, USERS.superadmin);
      assert.equal((await one(q, "select tutor_generate_suggestions() n")).n, 0, "pas de répétition (délai)");

      // Refus du parent, puis établissement qui se retire.
      await switchTo(q, null);
      await q("delete from tutor_suggestions where user_id = $1", [USERS.parent]);
      await switchTo(q, USERS.parent);
      await q("select tutor_suggestion_preference(true)");
      await switchTo(q, USERS.superadmin);
      await q("select tutor_generate_suggestions()");
      await switchTo(q, USERS.parent);
      assert.equal((await one(q, "select my_tutor_space() s")).s.suggestions.length, 0, "parent qui refuse : aucune suggestion");
      await q("select tutor_suggestion_preference(false)");
      await switchTo(q, null);
      await q("update organizations set settings = jsonb_set(coalesce(settings, '{}'), '{features}', coalesce(settings -> 'features', '{}') || '{\"tutor_match\": false}') where id = $1", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      await q("select tutor_generate_suggestions()");
      await switchTo(q, USERS.parent);
      assert.equal((await one(q, "select my_tutor_space() s")).s.suggestions.length, 0, "établissement retiré : aucune suggestion");

      // Fermeture du module : plus de recherche ni de demande, historique conservé.
      const tutor = await verifiedTutor(q, "+225 02 22 22 22");
      await switchTo(q, USERS.parent);
      const id = (await one(q, "select tutor_request_create($1, null, '3e', 'Maths', 'online', null, 'Bonjour, des cours svp.') id", [tutor])).id;
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_feature_rule('tutor_match', 'global', '', null, 'Fin du pilote', null)");
      await switchTo(q, USERS.parent);
      assert.equal((await q("select * from tutor_search('CI')")).length, 0, "fermé : recherche vide");
      assert.match(await rejects(q("select tutor_request_create($1, null, '3e', 'Maths', 'home', null, 'Autre demande svp.')", [tutor])), /disponible/);
      assert.ok((await one(q, "select my_tutor_space() s")).s.as_parent.some((r) => r.id === id), "historique conservé");
    });
  });
});
