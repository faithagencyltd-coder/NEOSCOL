// SITE ET MARQUE (Super Admin) : coordonnées, questions fréquentes, conditions
// générales, couleur (contraste contrôlé) et logo, visibles sur les pages publiques.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-site-marque";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));

/** PNG carré uni 64×64 (généré, sans dépendance). */
function png(r, g, b) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(64, 0);
  ihdr.writeUInt32BE(64, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: 64 }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: 64 }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|plateforme|abonnement/);
  return page;
}
const run = String(Date.now()).slice(-5);
const QUESTION = `Proposez-vous une formation ${run} ?`;

try {
  console.log("\n=== 1. Coordonnées et questions ===");
  const sa = await login("superadmin@demo.neoscol.app");
  await sa.goto(`${base}/plateforme`);
  await sa.getByRole("link", { name: "Site et marque" }).click();
  await sa.waitForURL(/\/plateforme\/site/);
  const contacts = sa.getByTestId("contacts-form");
  await contacts.getByLabel("WhatsApp").fill("+229 01 90 00 00 00");
  await contacts.getByLabel("E-mail de contact").fill("contact@neoscool.com");
  await contacts.getByLabel("Horaires du support").fill("Du lundi au vendredi, 8 h – 18 h");
  await contacts.getByRole("button", { name: "Enregistrer les coordonnées" }).click();
  await sa.getByText("Coordonnées enregistrées.").first().waitFor({ timeout: 15000 });
  check(true, "coordonnées enregistrées");

  const faq = sa.getByTestId("faq-form");
  await faq.getByRole("button", { name: "Ajouter une question" }).click();
  const count = await faq.locator("fieldset").count();
  await faq.getByLabel(`Question ${count}`, { exact: true }).fill(QUESTION);
  await faq.getByLabel(`Réponse ${count}`, { exact: true }).fill("Oui, une prise en main est proposée à chaque établissement.");
  await faq.getByRole("button", { name: `Monter la question ${count}` }).click();
  await faq.getByRole("button", { name: "Publier les questions" }).click();
  await sa.getByText(/question\(s\) publiée\(s\)/).first().waitFor({ timeout: 15000 });
  check(true, "questions fréquentes publiées (ajout + ordre)");

  const legal = sa.getByTestId("legal-form");
  await legal.getByLabel("Conditions générales d'utilisation").fill(`## Objet ${run}\nLes présentes conditions encadrent l'utilisation du service.`);
  await legal.getByRole("button", { name: "Publier les textes" }).click();
  await sa.getByText("Textes publiés.").first().waitFor({ timeout: 15000 });
  check(true, "conditions générales publiées");

  console.log("\n=== 2. Couleur et logo ===");
  const color = sa.getByTestId("color-form");
  await color.getByLabel("Couleur principale (boutons, liens, onglets actifs)").fill("#ffd700");
  check(await color.getByRole("button", { name: "Appliquer la couleur" }).isDisabled(), "couleur trop claire : bouton désactivé");
  check((await color.getByTestId("color-preview").innerText()).includes("trop clair"), "contraste affiché");
  await color.getByLabel("Couleur principale (boutons, liens, onglets actifs)").fill("#0b6e4f");
  await color.getByRole("button", { name: "Appliquer la couleur" }).click();
  await sa.getByText("Couleur enregistrée.").first().waitFor({ timeout: 15000 });
  const logoPath = `${out}/logo.png`;
  writeFileSync(logoPath, png(11, 110, 79));
  const logoForm = sa.getByTestId("logo-form");
  await logoForm.getByLabel("Nouveau logo").setInputFiles(logoPath);
  await logoForm.getByRole("button", { name: "Mettre en ligne le logo" }).click();
  await sa.getByText("Nouveau logo en ligne.").first().waitFor({ timeout: 15000 });
  const row = (await db.query("select primary_color, logo_path from platform_site_settings where id = 1")).rows[0];
  check(row.primary_color === "#0b6e4f" && /^logo\/.+\.png$/.test(row.logo_path), "couleur et logo enregistrés");
  const fake = `${out}/faux.png`;
  writeFileSync(fake, "<svg onload=alert(1)>");
  await logoForm.getByLabel("Nouveau logo").setInputFiles(fake);
  await logoForm.getByRole("button", { name: "Mettre en ligne le logo" }).click();
  await sa.getByText("Format non accepté").first().waitFor({ timeout: 15000 });
  check(true, "faux fichier image refusé (contenu vérifié)");
  await sa.screenshot({ path: `${out}/01-console-site.png`, fullPage: true });

  console.log("\n=== 3. Pages publiques ===");
  const visitor = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" })).newPage();
  await visitor.goto(`${base}/aide`);
  check(await visitor.getByTestId("site-contacts").first().getByText("+2290190000000").isVisible(), "aide : WhatsApp affiché");
  check((await visitor.getByRole("link", { name: "+2290190000000" }).first().getAttribute("href")) === "https://wa.me/2290190000000", "lien WhatsApp");
  const summaries = await visitor.getByTestId("faq-list").locator("summary").allInnerTexts();
  check(summaries.indexOf(QUESTION) === summaries.length - 2, "aide : nouvelle question publiée à la place choisie");
  const primary = await visitor.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  check(primary === "#0b6e4f", `couleur principale appliquée (${primary})`);
  const logoVar = await visitor.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-logo"));
  check(logoVar.includes("platform-assets/logo/"), "logo personnalisé appliqué");
  await visitor.screenshot({ path: `${out}/02-aide.png`, fullPage: true });
  await visitor.goto(`${base}/conditions`);
  check(await visitor.getByRole("heading", { name: `Objet ${run}` }).isVisible(), "conditions : intertitre publié");
  await visitor.goto(`${base}/confidentialite`);
  check((await visitor.getByTestId("legal-text").innerText()).includes("sera publié prochainement"), "confidentialité vide : aucun texte inventé");
  await visitor.goto(`${base}/tarifs`);
  check(await visitor.getByText(QUESTION).isVisible(), "tarifs : questions du Super Admin");
  await visitor.goto(`${base}/connexion`);
  check(await visitor.getByRole("link", { name: "Aide et contact" }).isVisible(), "connexion : lien Aide et contact");

  console.log("\n=== 4. Retour aux réglages d'origine ===");
  await sa.getByTestId("color-form").getByRole("button", { name: "Couleur d'origine" }).click();
  await sa.getByText("Couleur d'origine rétablie.").first().waitFor({ timeout: 15000 });
  await sa.getByTestId("logo-form").getByRole("button", { name: "Logo d'origine" }).click();
  await sa.getByText("Logo d'origine rétabli.").first().waitFor({ timeout: 15000 });
  await visitor.goto(`${base}/aide`);
  const restored = await visitor.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim());
  check(restored === "#1d63ed", `couleur d'origine rétablie (${restored})`);

  const admin = await login("admin@demo.neoscol.app");
  const res = await admin.goto(`${base}/plateforme/site`);
  check(res?.status() === 404, "établissement : réglages introuvables");
} catch (e) {
  problems.push(`exception: ${e.message}`);
  console.log("EXCEPTION", e);
} finally {
  await db.query("update platform_site_settings set contact_email = null, contact_phone = null, whatsapp = null, address = null, support_hours = null, faq = '[]', terms = null, privacy = null, primary_color = null, logo_path = null where id = 1").catch(() => null);
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
