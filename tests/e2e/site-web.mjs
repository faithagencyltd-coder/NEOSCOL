// SITE WEB OFFICIEL : accueil FR/EN, sections animées, pays (systèmes vérifiés
// seulement), formulaire de démonstration enregistré, console Super Admin
// (réseaux, WhatsApp, pays, vidéos, témoignages, sections, demandes), mobile,
// mouvement réduit.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-site-web";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
async function visitor(viewport = { width: 1440, height: 900 }, extra = {}) {
  const context = await browser.newContext({ viewport, locale: "fr-FR", ...extra });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[visiteur] pageerror: ${e.message}`));
  return page;
}
async function login(identifier) {
  const page = await visitor();
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement/);
  return page;
}
async function fillDialog(page, values) {
  const dialog = page.getByRole("dialog");
  for (const [label, value] of Object.entries(values)) {
    const field = dialog.getByLabel(label, { exact: false }).first();
    const kind = await field.evaluate((el) => el.tagName.toLowerCase() + (el.getAttribute("type") ?? ""));
    if (kind === "select") await field.selectOption(value);
    else if (kind === "inputcheckbox") await (value ? field.check() : field.uncheck());
    else await field.fill(String(value));
  }
  return dialog;
}
/**
 * Le contenu public est mis en cache et rafraîchi à chaque enregistrement dans
 * la console. Les remises à zéro de ce test passent directement par la base :
 * un enregistrement (sans modification) des réglages rafraîchit le cache.
 */
async function refreshSiteCache() {
  const page = await login("superadmin@demo.neoscol.app");
  await page.goto(`${base}/plateforme/site-web`);
  await page.getByRole("button", { name: "Modifier", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.context().close();
}
const run = String(Date.now()).slice(-5);
const NAME = `Directrice Test ${run}`;

try {
  await db.query("update platform_site_settings set whatsapp = null, whatsapp_label = null, whatsapp_message = null, whatsapp_position = 'right', home_sections = '{}' where id = 1");
  await refreshSiteCache();
  console.log("\n=== 1. Visiteur : accueil ===");
  const v = await visitor();
  const res = await v.goto(`${base}/`);
  check(res?.status() === 200 && !v.url().includes("/connexion"), "accueil public (sans connexion)");
  check(await v.getByRole("heading", { level: 1 }).innerText().then((t) => t.includes("Un seul écosystème")), "hero : « Votre établissement. Un seul écosystème. »");
  for (const [label, name] of [["Découvrir NeoScool", "Découvrir NeoScool"], ["Voir le logiciel", "Voir le logiciel"], ["Demander une démonstration", "Demander une démonstration"]]) {
    check(await v.getByRole("link", { name, exact: true }).first().isVisible(), `bouton : ${label}`);
  }
  for (const id of ["connected-hub", "school-flow", "data-journey", "badge-scene", "offline-scene", "country-showcase", "national-note", "pricing-cards", "final-cta"]) {
    await v.getByTestId(id).scrollIntoViewIfNeeded();
    check(await v.getByTestId(id).isVisible(), `section : ${id}`);
  }
  check(await v.getByTestId("video-soon").isVisible(), "vidéo : annoncée « en préparation » (aucune vidéo inventée)");
  check(!(await v.getByTestId("testimonials").count()), "aucun témoignage inventé");
  const note = await v.getByTestId("national-note").innerText();
  check(note.includes("ne remplace pas"), "pays : NeoScool ne remplace pas les systèmes nationaux");
  const body = await v.locator("body").innerText();
  check(!/remplace (EducMaster|le système national)/i.test(body), "aucune affirmation de remplacement");
  check(!(await v.getByTestId("whatsapp-button").count()), "WhatsApp masqué tant qu'aucun numéro n'est configuré");
  const flags = await v.getByTestId("country-showcase").getByRole("button").allInnerTexts();
  check(["Bénin", "Côte d'Ivoire", "Burkina Faso", "Togo", "Niger", "Gabon"].every((c) => flags.some((f) => f.includes(c))), "6 pays configurés affichés");
  await v.getByTestId("country-showcase").getByRole("button", { name: "Gabon" }).click();
  check((await v.getByTestId("country-showcase").innerText()).includes("XAF"), "pays : devise réelle affichée (Gabon, XAF)");
  const plans = await v.getByTestId("pricing-cards").innerText();
  const plan = await q1("select name, monthly_price from subscription_plans where is_active order by sort_order limit 1");
  check(plans.includes(plan.name), "tarifs lus en base");
  await v.screenshot({ path: `${out}/01-accueil.png` });

  console.log("\n=== 2. Langue anglaise ===");
  await v.getByTestId("lang-switch").getByRole("link", { name: "EN" }).click();
  await v.waitForURL(/\/en$/);
  check((await v.getByRole("heading", { level: 1 }).innerText()).includes("One ecosystem"), "version anglaise");
  check((await v.getByTestId("national-note").innerText()).includes("does not replace"), "EN : ne remplace pas les systèmes nationaux");
  await v.getByTestId("lang-switch").getByRole("link", { name: "FR" }).click();
  await v.waitForURL((u) => u.pathname === "/");
  check(true, "retour en français");

  console.log("\n=== 3. Secteurs, pays, tarifs ===");
  for (const [path, text] of [["/secteurs/scolaire", "Scolaire"], ["/secteurs/universite", "Université"], ["/secteurs/formation", "Formation professionnelle"], ["/en/sectors/university", "Universities"], ["/pays", "Pays pris en charge"], ["/en/pricing", "Plans suited"]]) {
    const r = await v.goto(`${base}${path}`);
    check(r?.status() === 200 && (await v.getByRole("heading", { level: 1 }).first().innerText()).includes(text), `page ${path}`);
  }

  console.log("\n=== 4. Demande de démonstration ===");
  await v.goto(`${base}/contact?demande=demo`);
  const form = v.getByTestId("contact-form");
  await form.getByRole("button", { name: "Envoyer" }).click();
  await form.getByText("Indiquez votre nom.").waitFor({ timeout: 10000 });
  check(true, "champs obligatoires contrôlés");
  await form.getByLabel("Nom et prénom *").fill(NAME);
  await form.getByLabel("E-mail *").fill(`directrice${run}@ecole-test.bj`);
  await form.getByLabel("Établissement", { exact: true }).fill("Collège Les Palmiers");
  await form.getByLabel("Type d'établissement").selectOption("school");
  await form.getByLabel("Pays", { exact: true }).fill("Bénin");
  await form.getByRole("button", { name: "Envoyer" }).click();
  await v.getByTestId("lead-sent").waitFor({ timeout: 15000 });
  const lead = await q1("select kind, status, organization_type from site_leads where full_name = $1", [NAME]);
  check(lead?.kind === "demo" && lead.status === "new" && lead.organization_type === "school", "demande enregistrée (démonstration, nouvelle)");

  console.log("\n=== 5. Super Admin : console du site ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme`);
  await sa.getByRole("link", { name: "Site web", exact: true }).click();
  await sa.waitForURL(/\/plateforme\/site-web/);
  check(await sa.getByTestId("lead-list").getByText(NAME).isVisible(), "demande visible dans la console");
  await sa.getByRole("button", { name: `Suivre la demande de ${NAME}` }).click();
  let dialog = await fillDialog(sa, { État: "done", "Note interne": "Démonstration planifiée" });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "detached" });
  check((await q1("select status from site_leads where full_name = $1", [NAME])).status === "done", "demande suivie (traitée)");

  await sa.getByRole("button", { name: "Ajouter un réseau" }).click();
  dialog = await fillDialog(sa, { Réseau: "linkedin", "Nom affiché": "LinkedIn", "Adresse (https://…)": `https://www.linkedin.com/company/neoscool-${run}` });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await sa.getByTestId("social-list").getByText(`neoscool-${run}`).waitFor({ timeout: 15000 });
  check(true, "réseau social ajouté");

  await db.query("update platform_site_settings set whatsapp = '2290190000000' where id = 1");
  await sa.getByRole("button", { name: "Modifier", exact: true }).click();
  dialog = await fillDialog(sa, { "Texte du bouton": "Parler à NeoScool", "Position du bouton": "left", "Message prérempli": "Bonjour, je veux une démo.", "Accueil : Multi-établissements": false });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "detached" });
  check(true, "réglages : WhatsApp à gauche, section masquée");

  await sa.getByRole("button", { name: "Modifier Bénin" }).click();
  dialog = await fillDialog(sa, {
    "Contexte éducatif (français)": "Enseignement maternel, primaire et secondaire, public et privé.",
    "Systèmes institutionnels": `Système vérifié ${run} | Système national de gestion | vérifié\nSystème non vérifié ${run} | À confirmer | non`,
  });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.waitFor({ state: "detached" });

  await sa.getByRole("button", { name: "Ajouter un témoignage" }).click();
  dialog = await fillDialog(sa, { "Nom de la personne": "Personne Réelle", "Témoignage (ses propres mots)": "Un témoignage d'essai assez long.", "Publié sur le site": true });
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await dialog.getByText(/accord confirmé/).waitFor({ timeout: 10000 });
  check(true, "témoignage refusé sans accord de la personne");
  await dialog.getByRole("button", { name: "Annuler" }).click();
  await sa.screenshot({ path: `${out}/02-console-site-web.png`, fullPage: true });

  console.log("\n=== 6. Le site reflète la console ===");
  const v2 = await visitor();
  await v2.goto(`${base}/`);
  const wa = v2.getByTestId("whatsapp-button");
  check(await wa.isVisible(), "bouton WhatsApp affiché");
  check((await wa.getAttribute("href")) === `https://wa.me/2290190000000?text=${encodeURIComponent("Bonjour, je veux une démo.")}`, "lien WhatsApp avec le message réglé");
  check(await wa.evaluate((el) => el.className.includes("left-5")), "bouton WhatsApp à gauche");
  check((await v2.getByTestId("social-links").locator(`a[href$="neoscool-${run}"]`).count()) === 1, "pied de page : réseau affiché");
  check(!(await v2.getByTestId("multi-org").count()), "section masquée par le Super Admin");
  await v2.getByTestId("country-showcase").getByRole("button", { name: "Bénin" }).click();
  const benin = await v2.getByTestId("country-showcase").innerText();
  check(benin.includes(`Système vérifié ${run}`) && !benin.includes(`Système non vérifié ${run}`), "seuls les systèmes vérifiés sont publiés");
  check(benin.includes("ne les remplace pas"), "système présenté en complément");

  console.log("\n=== 7. Mobile et mouvement réduit ===");
  const m = await visitor({ width: 390, height: 844 }, { reducedMotion: "reduce", isMobile: true, hasTouch: true });
  await m.goto(`${base}/`);
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 1, `mobile : pas de défilement horizontal (${overflow}px)`);
  await m.getByRole("button", { name: "Menu" }).click();
  check(await m.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Université" }).isVisible(), "menu mobile");
  await m.getByRole("button", { name: "Fermer" }).click();
  const hidden = await m.evaluate(() => [...document.querySelectorAll(".site-reveal")].filter((el) => getComputedStyle(el).opacity !== "1").length);
  check(hidden === 0, "mouvement réduit : tout le contenu visible d'emblée");
  check(await m.getByTestId("whatsapp-button").isVisible(), "mobile : WhatsApp accessible");
  await m.screenshot({ path: `${out}/03-mobile.png`, fullPage: false });

  const admin = await login("admin@demo.neoscol.app");
  const r = await admin.goto(`${base}/plateforme/site-web`);
  check(r?.status() === 404, "établissement : console du site introuvable");
  await admin.goto(`${base}/`);
  check(await admin.getByRole("link", { name: "Accéder au logiciel" }).first().isVisible(), "utilisateur connecté : accès direct au logiciel");
} catch (e) {
  problems.push(`exception: ${e.message}`);
  console.log("EXCEPTION", e);
} finally {
  await db.query("update platform_site_settings set whatsapp = null, whatsapp_label = null, whatsapp_message = null, whatsapp_position = 'right', home_sections = '{}' where id = 1").catch(() => null);
  await db.query("update site_social_links set is_active = false where url like $1", [`%neoscool-${run}`]).catch(() => null);
  await db.query("update site_country_profiles set institutional_systems = '[]', education_context = null where country_code = 'BJ'").catch(() => null);
  await refreshSiteCache().catch(() => null);
  await db.end();
  await browser.close();
  writeFileSync(`${out}/problems.json`, JSON.stringify(problems, null, 2));
  if (problems.length) {
    console.log(`\nPROBLÈMES (${problems.length}):`);
    for (const p of problems) console.log("-", p);
    process.exit(1);
  }
  console.log("\nTout est OK.");
}
