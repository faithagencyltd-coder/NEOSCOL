// Voice Check-in, de bout en bout : la direction configure les messages vocaux
// (variables vérifiées, écoute) ; la tablette annonce l'arrivée, le doublon, le
// refus (sans nom), le scan hors ligne ; voix coupable sur la tablette ;
// anonymat ; désactivation par pays ; droits. La synthèse vocale du navigateur
// est interceptée pour vérifier le texte exact prononcé. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-voice-checkin";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
async function login(identifier, viewport = { width: 1280, height: 860 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  // Synthèse vocale interceptée : on enregistre le texte prononcé.
  await context.addInitScript(() => {
    window.__spoken = [];
    const synth = { speak: (u) => window.__spoken.push({ text: u.text, lang: u.lang, rate: u.rate, volume: u.volume }), cancel: () => {}, getVoices: () => [] };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (t) {
      this.text = t;
    };
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|pointage|plateforme/);
  return { page, context };
}
const spoken = (page) => page.evaluate(() => window.__spoken);
const lastSpoken = async (page, count) => {
  await page.waitForFunction((n) => window.__spoken.length > n, count, { timeout: 15000 }).catch(() => {});
  const all = await spoken(page);
  return all.length > count ? all.at(-1) : null;
};

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const ciSettings = (await q1("select settings from countries where code = 'CI'")).settings;
const staffOf = async (email) =>
  q1("select s.id, s.first_name, b.token from staff_members s join auth.users u on u.id = s.user_id join staff_badges b on b.staff_id = s.id and b.status = 'active' where u.email = $1", [email]);
const director = await staffOf("direction@demo.neoscol.app");
const secretary = await staffOf("secretariat@demo.neoscol.app");
const orgName = (await q1("select name from organizations where id = $1", [DEMO])).name;
const startedAt = new Date();
const reset = async () => {
  await db.query("delete from voice_checkin_settings where organization_id = $1", [DEMO]);
  // Scans de ce test (badges inconnus, doublons…) retirés : ils pollueraient « Derniers scans » des autres suites.
  await db.query("update badge_scans set lesson_unlock_id = null where organization_id = $1 and scanned_at >= $2", [DEMO, startedAt]);
  await db.query("delete from badge_scans where organization_id = $1 and scanned_at >= $2", [DEMO, startedAt]);
  await db.query("update countries set settings = $1 where code = 'CI'", [ciSettings]);
  await db.query("delete from staff_attendance where staff_id = any($1) and work_date = (now() at time zone 'Africa/Abidjan')::date", [[director.id, secretary.id]]);
};
await reset();

try {
  console.log("\n=== 1. Direction : réglages des messages vocaux ===");
  const { page: admin } = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/parametres/messages-vocaux`);
  let t = await text(admin);
  check(t.includes("Messages vocaux à l'arrivée") && t.includes("{prenom}"), "page de réglages : événements et variables");
  await admin.getByLabel("Activer les messages vocaux à l'arrivée").check();
  await admin.getByRole("textbox", { name: "Arrivée à l'heure (personnel)" }).fill("Bonjour {prenom}, {motdepasse}");
  await admin.getByRole("button", { name: "Enregistrer les messages vocaux" }).click();
  check(await admin.getByText(/Variable inconnue : \{motdepasse\}/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "variable inconnue refusée par la base");
  await admin.getByRole("textbox", { name: "Arrivée à l'heure (personnel)" }).fill("Bonjour {prenom}, bienvenue au {etablissement}.");
  await admin.getByRole("button", { name: "Écouter : Arrivée à l'heure (personnel)" }).click();
  const preview = (await spoken(admin)).at(-1);
  check(preview?.text === `Bonjour Awa, bienvenue au ${orgName}.` && preview.lang === "fr-FR", "écoute : message rendu avec un exemple, voix française");
  await admin.getByRole("button", { name: "Enregistrer les messages vocaux" }).click();
  await admin.getByText("Messages vocaux enregistrés.").first().waitFor();
  const saved = await q1("select enabled, messages from voice_checkin_settings where organization_id = $1", [DEMO]);
  check(saved?.enabled && saved.messages.arrival === "Bonjour {prenom}, bienvenue au {etablissement}." && !saved.messages.departure, "réglages enregistrés (messages vides = défaut)");
  await shot(admin, "01-reglages");

  console.log("\n=== 2. Tablette : annonces vocales ===");
  const { page: kiosk, context: kctx } = await login("pointage@demo.neoscol.app", { width: 1180, height: 820 });
  await kiosk.waitForURL("**/pointage");
  const scan = async (code) => {
    const n = (await spoken(kiosk)).length;
    await kiosk.getByLabel("Code du badge").fill(code);
    await kiosk.keyboard.press("Enter");
    return lastSpoken(kiosk, n);
  };
  let said = await scan(`NEOSCOL-BADGE:${director.token}`);
  check(said?.text === `Bonjour ${director.first_name}, bienvenue au ${orgName}.`, `arrivée annoncée : « ${said?.text} »`);
  check(Number(said?.rate) === 1 && Number(said?.volume) === 1, "débit et volume de l'établissement appliqués");
  // La tablette ignore la même lecture pendant 4 s (anti-rebond caméra) : seconde présentation du badge ensuite.
  await kiosk.waitForTimeout(4500);
  said = await scan(`NEOSCOL-BADGE:${director.token}`);
  check(said?.text === "Badge déjà scanné.", "doublon annoncé");
  said = await scan("NEOSCOL-BADGE:INCONNU");
  check(said?.text === "Badge refusé. Adressez-vous à l'accueil.", "refus annoncé, sans aucun nom");
  await shot(kiosk, "02-tablette");
  await kiosk.getByRole("button", { name: "Voix activée" }).click();
  said = await scan("NEOSCOL-BADGE:INCONNU2");
  check(said === null, "voix coupée sur la tablette : silence");
  await kiosk.getByRole("button", { name: "Voix coupée" }).click();
  await kctx.setOffline(true);
  said = await scan(`NEOSCOL-BADGE:${secretary.token}`);
  check(said?.text === "Scan enregistré. Il sera transmis au retour du réseau.", "scan hors ligne annoncé");
  await kctx.setOffline(false);
  await kiosk.getByText("Pointage saisi hors ligne : enregistré.").first().waitFor({ timeout: 20000 }).catch(() => {});

  console.log("\n=== 3. Anonymat et langue ===");
  await db.query("update voice_checkin_settings set announce_names = false, language = 'en', messages = '{}' where organization_id = $1", [DEMO]);
  await db.query("delete from staff_attendance where staff_id = $1 and work_date = (now() at time zone 'Africa/Abidjan')::date", [secretary.id]);
  await db.query("delete from badge_scans where staff_id = $1 and scanned_at > now() - interval '5 minutes'", [secretary.id]);
  await kiosk.reload();
  said = await scan(`NEOSCOL-BADGE:${secretary.token}`);
  check(said?.lang === "en-GB" && /^Good morning, arrival recorded at \d{2}:\d{2}\.$/.test(said.text) && !said.text.includes(secretary.first_name), `anglais sans nom : « ${said?.text} »`);

  console.log("\n=== 4. Désactivation par pays (Super Admin) ===");
  await db.query("update countries set settings = settings || '{\"voice_checkin_enabled\": false}' where code = 'CI'");
  await kiosk.reload();
  check((await kiosk.getByRole("button", { name: /Voix (activée|coupée)/ }).count()) === 0, "pays désactivé : plus de voix sur la tablette");
  said = await scan("NEOSCOL-BADGE:INCONNU3");
  check(said === null, "pays désactivé : aucun message prononcé");
  await admin.reload();
  check((await text(admin)).includes("Indisponible dans votre pays"), "réglages conservés, indisponibilité expliquée");

  console.log("\n=== 5. Droits ===");
  const { page: teacher } = await login("enseignant@demo.neoscol.app");
  check((await teacher.goto(`${base}/parametres/messages-vocaux`)).status() === 404, "enseignant : réglages inaccessibles");
  const audit = await q1("select count(*)::int as n from audit_logs where organization_id = $1 and action = 'settings.voice_checkin'", [DEMO]);
  check(audit.n >= 1, "modification des messages tracée (avant / après)");
} finally {
  await reset();
}
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nVOICE CHECK-IN E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
