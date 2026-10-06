// Écosystème public : modules fermés par défaut puis ouverts (plateforme, pays,
// établissement, date de fin), fiche Discover (publication, modération,
// vérification distincte du paiement), Leads (formulaire public, origine,
// notifications, isolation), campagnes (modération), Opportunities
// (catégories, candidature, CV, confidentialité des coordonnées, signalement),
// offres de visibilité (inactives par défaut, paiement confirmé), publicité
// externe (validation de l'établissement avant tout lancement, source des résultats).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];
/** Visiteur sans compte (rôle anon), comme une page publique. */
const anon = async (q) => {
  await q("set local role anon");
  await q(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
};
const enabled = async (q, key, org) => (await one(q, "select app.module_enabled($1, $2) e", [key, org])).e;

/** Ouvre les modules publics pour l'établissement de démonstration (non démo pour la visibilité publique). */
async function openModules(q, keys = ["discover", "leads", "promotion", "opportunities", "external_ads"]) {
  await switchTo(q, USERS.superadmin);
  for (const k of keys) await q("select platform_set_feature_rule($1, 'organization', $2, true, 'Pilote', null::timestamptz)", [k, ORG_DEMO]);
  await switchTo(q, null);
  await q("update organizations set is_demo = false where id = $1", [ORG_DEMO]);
}

describe("Modules publics", () => {
  test("fermés par défaut ; ouverts par établissement, par pays, jusqu'à une date ; anciens modules inchangés", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      await q("delete from platform_feature_rules where feature_key = any (app.public_module_keys())");
      await switchTo(q, USERS.superadmin);
      assert.equal(await enabled(q, "discover", ORG_DEMO), false, "fermé par défaut");
      assert.equal(await enabled(q, "assistant", ORG_DEMO), true, "les fonctionnalités existantes restent ouvertes par défaut");
      await q("select platform_set_feature_rule('discover', 'organization', $1, true, 'Pilote', null::timestamptz)", [ORG_DEMO]);
      assert.equal(await enabled(q, "discover", ORG_DEMO), true, "pilote établissement");
      assert.equal(await enabled(q, "discover", ORG_DEMOF), false, "les autres restent fermés");
      await q("select platform_set_feature_rule('discover', 'country', 'CI', true, 'Ouverture Côte d''Ivoire', now() + interval '10 days')");
      assert.equal(await enabled(q, "discover", ORG_DEMOF), true, "ouvert pour le pays (essai de 10 jours)");
      assert.match(await rejects(q("select platform_set_feature_rule('discover', 'global', null, true, 'x x x', now() - interval '1 day')")), /futur/);
      await switchTo(q, null);
      await q("update platform_feature_rules set until = now() - interval '1 minute' where feature_key = 'discover' and scope = 'country'");
      await switchTo(q, USERS.superadmin);
      assert.equal(await enabled(q, "discover", ORG_DEMOF), false, "fin de l'essai : refermé automatiquement");
      assert.equal((await one(q, "select app.module_enabled_in_country('opportunities', 'CI') e")).e, false);
    });
  });
});

describe("Discover, vérification, Leads", () => {
  test("fiche publiée visible publiquement ; modération ; vérification ≠ paiement ; demandes avec origine et isolation", async () => {
    await as(USERS.admin, async (q) => {
      await openModules(q);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select save_public_profile($1, '{\"description\":\"court\"}', true)", [ORG_DEMO])), /30 caractères/);
      const slug = (await one(q, "select save_public_profile($1, $2, true) s", [ORG_DEMO, JSON.stringify({ slug: "Groupe Scolaire Démo", tagline: "Excellence et bienveillance", description: "Établissement d'enseignement général de la maternelle au lycée, à Abidjan.", city: "Abidjan", programs: [{ name: "Série C" }, { name: "Série D" }] })])).s;
      assert.equal(slug, "groupe-scolaire-demo");
      await anon(q);
      const found = await q("select * from discover_search('', 'CI', null, null, 'Série C', null, 10, 0)");
      assert.ok(found.some((r) => r.slug === slug), "visible dans la recherche publique");
      const prof = (await one(q, "select discover_profile($1) p", [slug])).p;
      assert.equal(prof.verified, false, "non vérifié par défaut");
      assert.ok(!("students" in prof) && !JSON.stringify(prof).includes("matricule"), "aucune donnée interne");

      // Demande publique : origine, notification des responsables des inscriptions.
      await q("select submit_org_lead($1, 'Mme Koné', '+225 07 00 00 00', null, 'Série C', 'enrollment', 'Inscription en 2nde', 'facebook', null)", [slug]);
      assert.match(await rejects(q("select submit_org_lead($1, 'X', null, null, null, null, null, 'qr', null)", [slug])), /téléphone ou un e-mail/);
      await switchTo(q, USERS.admin);
      const lead = await one(q, "select id, source, status from org_leads where organization_id = $1 order by created_at desc limit 1", [ORG_DEMO]);
      assert.deepEqual([lead.source, lead.status], ["facebook", "new"]);
      assert.ok((await one(q, "select count(*)::int n from notifications where user_id = $1 and type = 'lead'", [USERS.admin])).n >= 1, "responsable prévenu");
      await q("select update_org_lead($1, 'contacted', true, 'call', 'Rappelée, visite samedi')", [lead.id]);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from org_leads where id = $1", [lead.id])).length, 0, "enseignant sans droit : invisible");
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from org_leads where id = $1", [lead.id])).length, 0, "autre établissement : invisible");

      // Vérification : pièces exigées, décision de la plateforme ; un paiement ne donne jamais le statut.
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_verification_requirement(null, 'CI', null, 'Autorisation d''ouverture', null, true, true)");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select submit_verification_request($1, '[]', null)", [ORG_DEMO])), /pièces obligatoires/);
      await switchTo(q, null);
      const req = (await one(q, "select id from verification_requirements where label = 'Autorisation d''ouverture'")).id;
      const file = (await one(q, "insert into file_objects (organization_id, bucket, path, owner_type, file_name, mime_type, size_bytes, content) values ($1, 'database', $2, 'organization', 'autorisation.pdf', 'application/pdf', 4, '\\x25504446'::bytea) returning id", [ORG_DEMO, `${ORG_DEMO}/organization/verif`])).id;
      await switchTo(q, USERS.admin);
      await q("select submit_verification_request($1, $2, 'Ci-joint notre autorisation')", [ORG_DEMO, JSON.stringify([{ requirement_id: req, file_id: file }])]);
      await switchTo(q, USERS.superadmin);
      await q("select platform_decide_verification($1, 'verified', null)", [ORG_DEMO]);
      await anon(q);
      assert.equal((await one(q, "select discover_profile($1) p", [slug])).p.verified, true, "badge « vérifié » après décision");

      // Modération : suspendue → plus visible.
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_moderate('profile', $1, 'suspend', '')", [ORG_DEMO])), /motif/);
      await q("select platform_moderate('profile', $1, 'suspend', 'Contenu à corriger')", [ORG_DEMO]);
      await anon(q);
      assert.equal((await one(q, "select discover_profile($1) p", [slug])).p, null, "fiche suspendue : invisible");
    });
  });

  test("campagne : modération exigée, publication sur la fiche ; rien sans le module", async () => {
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select save_promo_campaign($1, null, '{\"title\":\"Portes ouvertes\",\"objective\":\"event\"}', true)", [ORG_DEMOF])), /Droit|pas encore ouvert/);
      await openModules(q);
      await switchTo(q, USERS.admin);
      await q("select save_public_profile($1, $2, true)", [ORG_DEMO, JSON.stringify({ description: "Établissement d'enseignement général de la maternelle au lycée, à Abidjan." })]);
      const id = (await one(q, "select save_promo_campaign($1, null, $2, true) id", [ORG_DEMO, JSON.stringify({ title: "Journée portes ouvertes", objective: "event", description: "Samedi 9 h – 13 h", starts_on: null })])).id;
      assert.equal((await one(q, "select status from promo_campaigns where id = $1", [id])).status, "pending_review", "modération exigée par défaut");
      const slug = (await one(q, "select slug from org_public_profiles where organization_id = $1", [ORG_DEMO])).slug;
      await anon(q);
      assert.equal((await one(q, "select discover_profile($1) p", [slug])).p.campaigns.length, 0, "non publiée avant validation");
      await switchTo(q, USERS.superadmin);
      await q("select platform_moderate('campaign', $1, 'approve', null)", [id]);
      await anon(q);
      assert.equal((await one(q, "select discover_profile($1) p", [slug])).p.campaigns[0].title, "Journée portes ouvertes");
    });
  });
});

describe("Opportunities", () => {
  test("recrutement par l'établissement, candidature avec CV, coordonnées protégées, signalement", async () => {
    await as(USERS.admin, async (q) => {
      await openModules(q);
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_ecosystem_settings(true, false, false)");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select save_opportunity(null, $1, true)", [JSON.stringify({ category: "emploi_enseignant", title: "Professeur de maths", description: "Poste à pourvoir à la rentrée, lycée.", country: "CI" })])), /réservée aux établissements/);
      const id = (await one(q, "select save_opportunity(null, $1, true) id", [JSON.stringify({ category: "emploi_enseignant", organization_id: ORG_DEMO, title: "Professeur de mathématiques", description: "Poste à pourvoir à la rentrée en classes de 2nde et 1re.", city: "Abidjan" })])).id;
      await anon(q);
      const list = await q("select * from opportunities_search('mathématiques', null, null, 'CI', null, 10, 0)");
      assert.ok(list.some((o) => o.id === id && o.author.kind === "organization"));
      assert.ok(!JSON.stringify(list).includes("@"), "aucune adresse e-mail publiée");
      assert.match(await rejects(q("select apply_opportunity($1, 'Je suis intéressé par ce poste.', null)", [id])), /Connectez-vous|permission/);

      // Candidat : compte public, CV, candidature unique.
      await switchTo(q, USERS.parent);
      await q("select register_public_account('teacher', 'CI', 'Abidjan')");
      const cv = (await one(q, "select upload_opportunity_file('cv.pdf', 'application/pdf', '\\x255044462d'::bytea) id")).id;
      const app = (await one(q, "select apply_opportunity($1, 'Professeur certifié, 5 ans d''expérience.', $2) id", [id, cv])).id;
      assert.match(await rejects(q("select apply_opportunity($1, 'Deuxième candidature identique', null)", [id])), /déjà répondu/);
      assert.match(await rejects(q("select content from opportunity_files where id = $1", [cv])), /permission denied/, "contenu du CV jamais lisible directement");
      await switchTo(q, USERS.admin);
      assert.equal((await q("select * from opportunity_file_download($1)", [cv])).length, 1, "le recruteur télécharge le CV joint");
      await q("select update_application_status($1, 'interview', 'Entretien mardi 10 h')", [app]);
      await q("select add_application_message($1, 'Merci de vous présenter avec vos diplômes.')", [app]);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select * from opportunity_file_download($1)", [cv])), /introuvable/, "un tiers ne peut pas lire le CV");
      await switchTo(q, USERS.parent);
      const space = (await one(q, "select my_opportunity_space() s")).s;
      assert.equal(space.applications[0].status, "interview");
      assert.equal(space.applications[0].unread, true, "candidat prévenu dans son espace");
      await q("select submit_content_report('opportunity', $1, 'misleading', 'Test de signalement')", [id]);
      await switchTo(q, USERS.superadmin);
      const rep = (await one(q, "select id from content_reports where target_id = $1", [id])).id;
      await q("select platform_resolve_report($1, 'dismissed', 'Annonce conforme')", [rep]);
    });
  });

  test("demande de répétiteur par un particulier : pays fermé refusé ; adresse révélée seulement après acceptation", async () => {
    await as(USERS.parent, async (q) => {
      const data = JSON.stringify({ category: "recherche_repetiteur", title: "Répétiteur de physique en 3e", description: "Deux séances par semaine à Cocody, à partir d'octobre.", country: "CI", city: "Abidjan" });
      await switchTo(q, null);
      await q("delete from platform_feature_rules where feature_key = 'opportunities' and scope in ('global', 'country')");
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select save_opportunity(null, $1, true)", [data])), /pas encore ouvert dans ce pays/);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_feature_rule('opportunities', 'country', 'CI', true, 'Ouverture CI', null::timestamptz)");
      await q("select platform_save_ecosystem_settings(true, false, false)");
      await switchTo(q, USERS.parent);
      const id = (await one(q, "select save_opportunity(null, $1, true) id", [data])).id;
      await switchTo(q, USERS.teacher);
      const appId = (await one(q, "select apply_opportunity($1, 'Professeur de physique, disponible le soir.', null) id", [id])).id;
      let space = (await one(q, "select my_opportunity_space() s")).s;
      assert.equal(space.applications[0].author_email, null, "adresse de l'auteur masquée");
      assert.equal(space.applications[0].author.kind, "individual");
      await switchTo(q, USERS.parent);
      await q("select update_application_status($1, 'accepted', null)", [appId]);
      await switchTo(q, USERS.teacher);
      space = (await one(q, "select my_opportunity_space() s")).s;
      assert.ok(space.applications[0].author_email, "adresse révélée après acceptation");
    });
  });
});

describe("Visibilité payante et publicité externe", () => {
  test("offre inactive par défaut ; commande en attente jusqu'au paiement confirmé ; mise en avant sans vérification", async () => {
    await as(USERS.superadmin, async (q) => {
      await openModules(q);
      await switchTo(q, USERS.admin);
      await q("select save_public_profile($1, $2, true)", [ORG_DEMO, JSON.stringify({ description: "Établissement d'enseignement général de la maternelle au lycée, à Abidjan." })]);
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_visibility_offer(null, 'UNE30', 'Fiche à la une 30 jours', 'featured_profile', null, 15000, 'XOF', 30, null, null, false)");
      const offer = (await one(q, "select id from visibility_offers where code = 'UNE30'")).id;
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select create_visibility_order($1, 'profile', $2)", [offer, ORG_DEMO])), /indisponible/, "inactive tant que la plateforme ne l'active pas");
      await switchTo(q, USERS.superadmin);
      await q("select platform_save_visibility_offer($1, 'UNE30', 'Fiche à la une 30 jours', 'featured_profile', null, 15000, 'XOF', 30, null, null, true)", [offer]);
      await switchTo(q, USERS.admin);
      const order = (await one(q, "select create_visibility_order($1, 'profile', $2) id", [offer, ORG_DEMO])).id;
      assert.equal((await one(q, "select featured_until from org_public_profiles where organization_id = $1", [ORG_DEMO])).featured_until, null, "rien avant le paiement");
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_confirm_visibility_order($1, 'paid', '')", [order])), /référence/);
      await q("select platform_confirm_visibility_order($1, 'paid', 'OM-123456')", [order]);
      const p = await one(q, "select featured_until > now() + interval '29 days' as ok, verification_status from org_public_profiles where organization_id = $1", [ORG_DEMO]);
      assert.equal(p.ok, true);
      assert.notEqual(p.verification_status, "verified", "payer ne donne jamais le statut vérifié");
      await switchTo(q, null);
      const rev = await q("select * from app.revenue_entries(false) where source = 'Visibilité' and reference like 'VIS-%'");
      assert.ok(rev.some((r) => r.amount === 15000), "recette NeoScool enregistrée");
    });
  });

  test("publicité externe : plateforme autorisée requise, validation de l'école avant lancement, source des résultats", async () => {
    await as(USERS.admin, async (q) => {
      await openModules(q);
      await switchTo(q, USERS.admin);
      const data = JSON.stringify({ mode: "assisted", platform: "meta", objective: "Inscriptions 2nde", budget_amount: 50000, budget_currency: "XOF" });
      assert.match(await rejects(q("select save_ad_request($1, null, $2, true)", [ORG_DEMO, data])), /pas autorisée/);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_ad_platform('meta', true, null)");
      await switchTo(q, USERS.admin);
      const id = (await one(q, "select save_ad_request($1, null, $2, true) id", [ORG_DEMO, data])).id;
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_update_ad_request($1, 'running', null, null, null)", [id])), /valider le plan/);
      await q("select platform_update_ad_request($1, 'awaiting_school', 'Ciblage Abidjan, 14 jours', null, null)", [id]);
      await switchTo(q, USERS.admin);
      await q("select school_ad_request_action($1, $2, 'validate', null, null)", [ORG_DEMO, id]);
      await switchTo(q, USERS.superadmin);
      await q("select platform_update_ad_request($1, 'running', null, null, null)", [id]);
      assert.match(await rejects(q("select platform_update_ad_request($1, 'completed', null, '{\"clicks\": 120}', '')", [id])), /source/);
      await q("select platform_update_ad_request($1, 'completed', null, '{\"clicks\": 120}', 'Rapport Meta du 30/10')", [id]);
      const r = await one(q, "select status, results_source from ad_requests where id = $1", [id]);
      assert.deepEqual([r.status, r.results_source], ["completed", "Rapport Meta du 30/10"]);
      await switchTo(q, null);
      const rev = await q("select count(*)::int n from app.revenue_entries(false) where label ilike '%meta%'");
      assert.equal(rev[0].n, 0, "le budget publicitaire n'est jamais compté comme recette NeoScool");
    });
  });
});

describe("Comptes particuliers : confirmation de l'adresse", () => {
  test("en attente : ni candidature ni publication ; confirmé par le lien (usage unique)", async () => {
    await as(USERS.admin, async (q) => {
      await openModules(q);
      await switchTo(q, USERS.superadmin);
      await q("select platform_set_feature_rule('opportunities', 'country', 'CI', true, 'Ouverture CI', null::timestamptz)");
      await q("select platform_save_ecosystem_settings(true, false, false)");
      await switchTo(q, USERS.admin);
      const id = (await one(q, "select save_opportunity(null, $1, true) id", [JSON.stringify({ category: "emploi_enseignant", organization_id: ORG_DEMO, title: "Professeur d'anglais", description: "Poste à pourvoir à la rentrée en collège, 18 h par semaine.", city: "Abidjan" })])).id;
      await switchTo(q, USERS.parent);
      await q("select register_public_account('teacher', 'CI', 'Abidjan')");
      await switchTo(q, null);
      await q("update public_accounts set email_verification = 'pending' where user_id = $1", [USERS.parent]);
      const hash = "a".repeat(64);
      await q("insert into public_account_email_tokens (user_id, token_hash, expires_at) values ($1, $2, now() + interval '2 days')", [USERS.parent, hash]);
      await switchTo(q, USERS.parent);
      assert.equal((await one(q, "select my_public_account_email_state() s")).s, "pending");
      assert.match(await rejects(q("select apply_opportunity($1, 'Professeure d''anglais, 4 ans d''expérience.', null)", [id])), /Confirmez d'abord votre adresse/);
      assert.match(
        await rejects(q("select save_opportunity(null, $1, true)", [JSON.stringify({ category: "cours_particuliers", title: "Cours d'anglais à domicile", description: "Professeure propose des cours d'anglais tous niveaux, le soir.", country: "CI" })])),
        /Confirmez d'abord votre adresse/,
      );
      assert.match(await rejects(q("select verify_public_account_email($1)", [hash])), /permission denied/, "réservé au serveur");
      await switchTo(q, null);
      assert.equal((await one(q, "select verify_public_account_email($1) r", [hash])).r.ok, true);
      assert.equal((await one(q, "select verify_public_account_email($1) r", [hash])).r.ok, false, "lien à usage unique");
      await switchTo(q, USERS.parent);
      assert.equal((await one(q, "select my_public_account_email_state() s")).s, "verified");
      assert.ok((await one(q, "select apply_opportunity($1, 'Professeure d''anglais, 4 ans d''expérience.', null) id", [id])).id, "candidature possible une fois confirmé");
    });
  });
});
