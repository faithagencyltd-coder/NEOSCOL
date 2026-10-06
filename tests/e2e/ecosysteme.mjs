// Écosystème public : modules fermés par défaut, fiche Discover, demande
// d'information (origine), campagne modérée + Media Kit, vérification par pièces,
// offre d'emploi modérée, compte particulier + candidature avec CV, suivi,
// mise en avant payante (offre inactive par défaut, paiement confirmé avec
// référence), publicité externe (aucun lancement sans validation de l'école),
// signalement, plan du site.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-ecosysteme";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const DEMO = "10000000-0000-4000-a000-000000000001";
const MODULES = ["discover", "leads", "promotion", "media_kit", "opportunities", "external_ads"];
const stamp = Date.now();

async function newPage(label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${label}] ${e.message}`));
  return page;
}
async function login(identifier) {
  const page = await newPage(identifier);
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 20000 });

/** Supprime uniquement les données créées par ce test (établissement de démonstration). */
async function cleanup() {
  await q("delete from content_reports where details is null and target_id in (select id from opportunities where title like 'Professeur de mathématiques %')");
  await q("delete from opportunities where organization_id = $1 and title like 'Professeur de mathématiques %'", [DEMO]);
  await q("delete from auth.users where email like 'candidat.%@exemple.ci'");
  await q("delete from org_leads where organization_id = $1 and full_name like 'Parent Test %'", [DEMO]);
  await q("delete from ad_requests where organization_id = $1 and objective like '50 demandes pour la rentrée %'", [DEMO]);
  await q("delete from promo_campaigns where organization_id = $1 and title like 'Portes ouvertes %'", [DEMO]);
  await q("delete from visibility_orders where organization_id = $1 and offer_id in (select id from visibility_offers where code like 'E2E-%')", [DEMO]);
  await q("delete from visibility_offers where code like 'E2E-%'");
  await q("delete from org_verification_requests where organization_id = $1", [DEMO]);
  await q("delete from verification_requirements where label like 'Autorisation d''ouverture %'");
  await q("delete from org_public_profiles where organization_id = $1", [DEMO]);
  await q("delete from file_objects where organization_id = $1 and category in ('public', 'verification')", [DEMO]);
}

// Les établissements de démonstration n'apparaissent jamais dans l'annuaire public :
// le test rend l'établissement DEMO « réel » le temps du parcours, puis le rétablit.
// (Une exécution interrompue se reconnaît à ses règles « Pilote E2E ».)
if ((await q("select 1 from platform_feature_rules where reason = 'Pilote E2E'")).length) await q("update organizations set is_demo = true where id = $1", [DEMO]);
// État propre : aucune règle de module public, aucune fiche ni offre de test.
await q("delete from platform_feature_rules where feature_key = any($1)", [MODULES]);
await cleanup();
await q("update ad_platforms set enabled = false");
await q("update ecosystem_settings set campaigns_require_review = true, opportunities_require_review = true, profiles_require_review = false where id = 1");

const admin = await login("admin@demo.neoscol.app");
const sa = await login("superadmin@demo.neoscol.app");
const anon = await newPage("anonyme");

console.log("\n=== 1. Modules fermés par défaut ===");
await admin.goto(`${base}/visibilite`);
check(await admin.getByText(/n'est pas encore ouvert pour votre établissement/).isVisible(), "Discover fermé par défaut côté école");
check((await admin.getByRole("link", { name: "Fiche publique" }).count()) === 0, "entrée « Fiche publique » absente du menu");
await anon.goto(`${base}/decouvrir`);
check(await anon.getByTestId("discover-empty").isVisible(), "annuaire vide tant que rien n'est publié");

console.log("\n=== 2. Ouverture pilote (Super Admin) ===");
for (const key of MODULES) {
  await q("insert into platform_feature_rules (feature_key, scope, scope_value, enabled, reason) values ($1, 'organization', $2, true, 'Pilote E2E')", [key, DEMO]);
}
await q("insert into platform_feature_rules (feature_key, scope, scope_value, enabled, reason) values ('opportunities', 'country', 'CI', true, 'Pilote E2E')");
await admin.goto(`${base}/visibilite`);
check(await admin.getByTestId("profile-form").isVisible(), "éditeur de fiche ouvert pour l'établissement pilote");
check((await admin.getByRole("link", { name: "Fiche publique" }).count()) > 0, "entrée « Visibilité » dans le menu");

console.log("\n=== 3. Fiche publique + image ===");
check(await admin.getByTestId("demo-notice").isVisible(), "établissement de démonstration : jamais dans l'annuaire (message affiché)");
await q("update organizations set is_demo = false where id = $1", [DEMO]);
await admin.goto(`${base}/visibilite?onglet=images`);
await admin.getByTestId("media-upload").locator("input[type=file]").setInputFiles("public/icons/maskable-512.png");
await admin.getByRole("button", { name: "Ajouter l'image" }).click();
await toast(admin, "Image ajoutée à la bibliothèque.");
await admin.goto(`${base}/visibilite`);
const form = admin.getByTestId("profile-form");
await form.getByLabel(/Adresse de la fiche/).fill(`groupe-scolaire-demo-${stamp}`);
await form.getByLabel("Phrase d'accroche").fill("Une école exigeante et bienveillante au cœur d'Abidjan");
await form.getByLabel(/^Présentation \(30/).fill("Groupe scolaire de la maternelle au lycée, encadrement personnalisé, activités sportives et culturelles.");
await form.getByLabel(/^Formations/).fill("Maternelle — petite, moyenne et grande section\nPrimaire\nCollège\nLycée — séries A, C et D");
await form.getByLabel("Ville").fill("Abidjan");
await form.getByLabel("Téléphone de l'établissement").fill("+225 27 22 00 00 00");
await form.getByLabel("Couverture").first().check();
await form.getByLabel("Publier la fiche dans NeoScool Discover").check();
await form.getByRole("button", { name: "Enregistrer" }).click();
await toast(admin, /Fiche enregistrée et publiée/);
await admin.reload();
check(await admin.getByTestId("profile-status").getByText("Publiée").isVisible(), "fiche publiée (validation préalable désactivée)");
check(await admin.getByTestId("profile-status").getByText("Profil non vérifié").isVisible(), "pas de badge vérifié sans contrôle");
const slug = `groupe-scolaire-demo-${stamp}`;

console.log("\n=== 4. Visiteur : annuaire, fiche, demande d'information ===");
await anon.goto(`${base}/decouvrir?q=bienveillante`);
check(await anon.getByTestId("discover-results").getByText("Groupe Scolaire Démo NeoScool").isVisible(), "établissement trouvé dans Discover");
await anon.getByTestId("discover-results").getByRole("link").first().click();
await anon.waitForURL(new RegExp(`/decouvrir/${slug}`));
check(await anon.getByTestId("profile-name").isVisible(), "fiche publique affichée");
const ld = await anon.locator('script[type="application/ld+json"]').first().textContent();
check(ld?.includes('"EducationalOrganization"'), "données structurées EducationalOrganization");
const cover = await anon.request.get(`${base}${await anon.locator("section img").first().getAttribute("src")}`);
check(cover.status() === 200 && cover.headers()["content-type"].startsWith("image/"), "image de couverture servie publiquement");
const leadName = `Parent Test ${stamp}`;
const lf = anon.getByTestId("public-lead-form");
await lf.getByLabel(/Nom et prénom/).fill(leadName);
await lf.getByLabel("Téléphone").fill("+225 07 07 07 07 07");
await lf.getByLabel("Formation concernée").selectOption("Collège");
await lf.getByLabel("Message").fill("Bonjour, quelles sont les conditions d'inscription en 6e ?");
await lf.getByRole("button", { name: "Envoyer ma demande" }).click();
await anon.getByTestId("lead-sent").waitFor({ timeout: 20000 });
check(true, "demande d'information envoyée sans compte");
await anon.screenshot({ path: `${out}/01-fiche-publique.png`, fullPage: true });

console.log("\n=== 5. École : demandes reçues ===");
await admin.goto(`${base}/visibilite/demandes`);
const leadRow = admin.getByTestId("leads-list").getByRole("link").filter({ hasText: leadName });
check(await leadRow.getByText(/NeoScool Discover/).isVisible(), "origine de la demande conservée (Discover)");
await leadRow.click();
const detail = admin.getByTestId("lead-detail");
await detail.getByLabel("Statut").selectOption("contacted");
await detail.getByLabel("Type d'action").selectOption("call");
await detail.getByLabel("Note").fill("Rappelé : visite prévue samedi.");
await detail.getByRole("button", { name: "Enregistrer le suivi" }).click();
await toast(admin, "Suivi enregistré.");
await admin.reload();
check(await admin.getByTestId("lead-detail").getByText("Rappelé : visite prévue samedi.").isVisible(), "suivi (appel, statut) enregistré");
await admin.screenshot({ path: `${out}/02-demandes.png`, fullPage: true });

console.log("\n=== 6. Campagne : modération et Media Kit ===");
await admin.goto(`${base}/visibilite/campagnes?nouvelle=1`);
const cf = admin.getByTestId("campaign-form");
const campaignTitle = `Portes ouvertes ${stamp}`;
await cf.getByLabel(/^Titre/).fill(campaignTitle);
await cf.getByLabel("Objectif").selectOption("event");
await cf.getByLabel("Message").fill("Venez découvrir nos locaux et rencontrer l'équipe pédagogique.");
await cf.getByLabel(/Contact affiché/).fill("+225 27 22 00 00 00");
await cf.getByRole("button", { name: "Publier" }).click();
await toast(admin, /en attente de validation/);
const [campaign] = await q("select id, status from promo_campaigns where title = $1", [campaignTitle]);
check(campaign?.status === "pending_review", "campagne en attente de validation NeoScool");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=moderation`);
const block = sa.getByTestId("moderation").locator("div").filter({ hasText: campaignTitle }).last();
await block.getByRole("button", { name: "Approuver" }).click();
await toast(sa, "Contenu approuvé et publié.");
await anon.goto(`${base}/decouvrir/${slug}/campagnes/${campaign.id}?source=qr`);
check(await anon.getByTestId("campaign-title").isVisible(), "campagne publiée visible");
const kit = await admin.request.get(`${base}/visibilite/campagnes/${campaign.id}/kit?format=story`);
const svg = await kit.text();
check(kit.status() === 200 && svg.includes("Portes ouvertes") && svg.includes(String(stamp)) && svg.includes("<path"), "Media Kit : visuel SVG avec QR code");
check((await anon.request.get(`${base}/visibilite/campagnes/${campaign.id}/kit?format=story`, { maxRedirects: 0 })).status() !== 200, "Media Kit inaccessible sans session");
await admin.goto(`${base}/visibilite/campagnes?campagne=${campaign.id}`);
check(await admin.getByTestId("media-kit").isVisible(), "Media Kit proposé dans la campagne");
await admin.screenshot({ path: `${out}/03-campagne.png`, fullPage: true });

console.log("\n=== 7. Vérification par pièces ===");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=verification`);
await sa.getByRole("button", { name: "Ajouter une pièce" }).click();
let dlg = sa.getByRole("dialog");
await dlg.getByLabel("Libellé").fill(`Autorisation d'ouverture ${stamp}`);
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await toast(sa, "Pièce de vérification enregistrée.");
await admin.goto(`${base}/visibilite?onglet=verification`);
const vf = admin.getByTestId("verification-form");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
for (const input of await vf.locator("input[type=file]").all()) await input.setInputFiles({ name: "autorisation.pdf", mimeType: "application/pdf", buffer: pdf });
await vf.getByRole("button", { name: "Envoyer la demande" }).click();
await toast(admin, "Demande de vérification envoyée à NeoScool.");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=verification`);
const piece = sa.getByTestId("verification-console").getByRole("link", { name: new RegExp(`Autorisation d'ouverture ${stamp}`) }).first();
const pieceRes = await sa.request.get(`${base}${await piece.getAttribute("href")}`);
check(pieceRes.status() === 200 && pieceRes.headers()["content-type"] === "application/pdf", "pièce lisible par la plateforme");
check((await admin.request.get(`${base}${await piece.getAttribute("href")}`)).status() === 404, "pièce non lisible par un autre compte via la console");
await sa.getByRole("button", { name: "Accorder le badge" }).first().click();
await toast(sa, "Décision de vérification enregistrée.");
await anon.goto(`${base}/decouvrir/${slug}`);
check(await anon.getByTestId("verified-badge").isVisible(), "badge « Profil vérifié » affiché après contrôle");

console.log("\n=== 8. Offre d'emploi de l'établissement ===");
await admin.goto(`${base}/visibilite/opportunites/nouvelle`);
const of = admin.getByTestId("opportunity-form");
const jobTitle = `Professeur de mathématiques ${stamp}`;
await of.getByLabel(/Catégorie/).selectOption({ index: 1 });
await of.getByLabel(/^Titre/).fill(jobTitle);
await of.getByLabel(/^Description/).fill("Nous recherchons un professeur de mathématiques pour les classes de collège, rentrée d'octobre.");
await of.getByLabel("Ville").fill("Abidjan");
await of.getByLabel("Contrat").fill("CDI");
await of.getByRole("button", { name: "Publier" }).click();
await admin.waitForURL(/\/visibilite\/opportunites\/[0-9a-f-]{36}$/, { timeout: 20000 });
const jobId = admin.url().split("/").pop();
check(await admin.getByText("En attente de validation").first().isVisible(), "offre en attente de validation");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=moderation`);
await sa.getByTestId("moderation").locator("div").filter({ hasText: jobTitle }).last().getByRole("button", { name: "Approuver" }).click();
await toast(sa, "Contenu approuvé et publié.");
await anon.goto(`${base}/opportunites`);
check(await anon.getByTestId("opportunities-results").getByText(jobTitle).isVisible(), "offre listée dans Opportunities");
await anon.goto(`${base}/opportunites/${jobId}`);
check((await anon.locator('script[type="application/ld+json"]').first().textContent())?.includes('"JobPosting"'), "données structurées JobPosting");

console.log("\n=== 9. Compte particulier et candidature avec CV ===");
await anon.getByRole("link", { name: "Créer un compte" }).click();
await anon.waitForURL(/\/espace\/inscription/);
const sf = anon.getByTestId("public-signup");
const email = `candidat.${stamp}@exemple.ci`;
await sf.getByLabel("Prénom").fill("Awa");
await sf.getByLabel("Nom", { exact: true }).fill("Koné");
await sf.getByLabel("E-mail").fill(email);
await sf.getByLabel("Vous êtes").selectOption("teacher");
await sf.getByLabel("Pays").selectOption("CI");
await sf.getByLabel("Ville").fill("Abidjan");
await sf.getByLabel("Mot de passe", { exact: true }).fill("Candidat-2026-ok");
await sf.getByLabel("Confirmation").fill("Candidat-2026-ok");
await sf.getByRole("button", { name: "Créer mon compte" }).click();
await anon.waitForURL(new RegExp(`/opportunites/${jobId}`), { timeout: 30000 });
const af = anon.getByTestId("apply-form");
await af.getByLabel("Message").fill("Titulaire d'une licence de mathématiques, 5 ans d'expérience en collège.");
await af.locator("input[type=file]").setInputFiles({ name: "cv-awa.pdf", mimeType: "application/pdf", buffer: pdf });
await af.getByRole("button", { name: "Envoyer" }).click();
await anon.getByText("Vous avez déjà répondu.").waitFor({ timeout: 20000 });
check(true, "candidature envoyée avec CV");
await anon.goto(`${base}/espace`);
check(await anon.getByTestId("my-applications").getByText(jobTitle).isVisible(), "candidature suivie dans Mon espace");

console.log("\n=== 10. École : candidature, CV, statut ===");
await admin.goto(`${base}/visibilite/opportunites/${jobId}`);
await admin.getByTestId("received-applications").getByRole("link").first().click();
await admin.getByTestId("application-thread").waitFor();
const cvHref = await admin.getByTestId("cv-download").getAttribute("href");
const cv = await admin.request.get(`${base}${cvHref}`);
check(cv.status() === 200 && cv.headers()["content-type"] === "application/pdf", "CV téléchargeable par l'établissement");
const other = await login("enseignant@demo.neoscol.app");
check((await other.request.get(`${base}${cvHref}`)).status() === 404, "CV inaccessible à un autre compte");
await admin.getByTestId("status-form").getByLabel("Statut").selectOption("interview");
await admin.getByTestId("status-form").getByLabel("Note").fill("Entretien mardi 10 h");
await admin.getByRole("button", { name: "Mettre à jour le statut" }).click();
await toast(admin, "Statut mis à jour.");
await anon.goto(`${base}/espace`);
check(await anon.getByTestId("my-applications").getByText("Entretien").isVisible(), "le candidat voit le nouveau statut");
await anon.screenshot({ path: `${out}/04-mon-espace.png`, fullPage: true });

console.log("\n=== 11. Mise en avant payante ===");
await admin.goto(`${base}/visibilite?onglet=mise-en-avant`);
check(await admin.getByTestId("no-offers").isVisible(), "aucune offre tant que le Super Admin n'en active pas");
await q("insert into visibility_offers (code, label, kind, price, currency, duration_days, active) values ('E2E-UNE', 'À la une 30 jours', 'featured_profile', 15000, 'XOF', 30, true)");
await admin.reload();
await admin.getByRole("button", { name: /Commander/ }).click();
await toast(admin, /Commande enregistrée/);
await sa.goto(`${base}/plateforme/ecosysteme?onglet=visibilite`);
await sa.getByRole("button", { name: "Confirmer le paiement" }).first().click();
dlg = sa.getByRole("dialog");
await dlg.getByLabel(/Référence/).fill(`OM-${stamp}`);
await dlg.getByRole("button", { name: "Confirmer" }).click();
await toast(sa, /Paiement confirmé/);
await anon.goto(`${base}/decouvrir`);
check(await anon.getByTestId("discover-results").getByText("À la une").first().isVisible(), "fiche « À la une » après paiement confirmé");
const [verif] = await q("select verification_status from org_public_profiles where organization_id = $1", [DEMO]);
check(verif.verification_status === "verified", "le statut vérifié dépend des pièces, pas du paiement");

console.log("\n=== 12. Publicité externe ===");
await admin.goto(`${base}/visibilite/publicite`);
check(await admin.getByText("Aucune plateforme publicitaire n'est encore autorisée par NeoScool.").isVisible(), "aucune plateforme autorisée par défaut");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=publicite`);
await sa.getByTestId("ads-console").locator("div").filter({ hasText: /^Meta/ }).getByRole("button", { name: "Autoriser" }).click();
await toast(sa, "Plateforme publicitaire mise à jour.");
await admin.reload();
const adf = admin.getByTestId("ad-request-form");
await adf.getByLabel(/^Objectif/).fill(`50 demandes pour la rentrée ${stamp}`);
await adf.getByLabel(/Budget publicitaire prévu/).fill("100000");
await adf.getByRole("button", { name: "Envoyer à NeoScool" }).click();
await toast(admin, "Demande enregistrée.");
const [ad] = await q("select id from ad_requests where objective = $1", [`50 demandes pour la rentrée ${stamp}`]);
let launchError = null;
try {
  await q("select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'superadmin@demo.neoscol.app'), 'role', 'authenticated')::text, false)");
  await q("set role authenticated");
  await q("select platform_update_ad_request($1, 'running', null, null, null)", [ad.id]);
} catch (e) {
  launchError = e.message;
} finally {
  await q("reset role");
}
check(/valider le plan/.test(launchError ?? ""), "lancement refusé tant que l'école n'a pas validé le plan");
await sa.goto(`${base}/plateforme/ecosysteme?onglet=publicite`);
await sa.getByTestId("ads-console").locator("div.grid").filter({ hasText: `50 demandes pour la rentrée ${stamp}` }).getByRole("button", { name: "Mettre à jour" }).click();
dlg = sa.getByRole("dialog");
await dlg.getByLabel("Nouveau statut").selectOption("awaiting_school");
await dlg.getByLabel(/Message à l'établissement/).fill("Plan : 3 semaines, ciblage Abidjan, parents 30-50 ans.");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await toast(sa, "Demande mise à jour.");
await admin.reload();
await admin.getByRole("button", { name: "Valider le plan" }).click();
await toast(admin, /Plan validé/);
const [adAfter] = await q("select status, school_validated_at from ad_requests where id = $1", [ad.id]);
check(adAfter.status === "validated" && adAfter.school_validated_at, "plan validé par l'établissement");
await admin.screenshot({ path: `${out}/05-publicite.png`, fullPage: true });

console.log("\n=== 13. Signalement ===");
await anon.goto(`${base}/opportunites/${jobId}`);
await anon.getByTestId("report-button").click();
dlg = anon.getByRole("dialog");
await dlg.getByLabel("Motif").selectOption("misleading");
await dlg.getByRole("button", { name: "Envoyer le signalement" }).click();
await toast(anon, /Signalement transmis/);
await sa.goto(`${base}/plateforme/ecosysteme?onglet=moderation`);
check(await sa.getByText("Informations trompeuses").first().isVisible(), "signalement visible par la modération");
await sa.getByRole("button", { name: "Classer sans suite" }).first().click();
await toast(sa, "Signalement traité.");
await sa.goto(`${base}/plateforme/ecosysteme`);
check(await sa.getByTestId("ecosystem-overview").isVisible(), "vue d'ensemble de l'écosystème");
await sa.screenshot({ path: `${out}/06-console.png`, fullPage: true });

console.log("\n=== 14. Plan du site ===");
const sitemap = await (await anon.request.get(`${base}/sitemap.xml`)).text();
check(sitemap.includes(`/decouvrir/${slug}`) && sitemap.includes(`/opportunites/${jobId}`), "fiche et offre dans le plan du site");

// Remise à l'état par défaut : modules fermés, établissement de démonstration.
await q("update organizations set is_demo = true where id = $1", [DEMO]);
await q("delete from platform_feature_rules where feature_key = any($1) and reason = 'Pilote E2E'", [MODULES]);
await q("update ad_platforms set enabled = false");
await cleanup();
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
