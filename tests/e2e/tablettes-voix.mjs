// Tablettes de pointage — voix, de bout en bout : la direction choisit une voix
// de femme ou d'homme et sa hauteur (écoute des voix de l'appareil) ; la
// tablette l'applique, puis peut choisir sa propre voix (mémorisée sur
// l'appareil). La synthèse vocale est remplacée par des voix connues pour
// vérifier la voix réellement utilisée. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-tablettes-voix";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];

// Voix fictives de l'appareil : 2 femmes, 1 homme en français, 1 voix anglaise.
const VOICES = [
  { name: "Amélie", lang: "fr-FR" },
  { name: "Thomas", lang: "fr-FR" },
  { name: "Google français", lang: "fr-FR" },
  { name: "Audrey", lang: "fr-FR" },
  { name: "Daniel", lang: "en-GB" },
];
async function login(identifier, viewport = { width: 1280, height: 860 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  await context.addInitScript((voices) => {
    window.__spoken = [];
    const synth = {
      speak: (u) => window.__spoken.push({ text: u.text, voice: u.voice?.name ?? null, pitch: u.pitch, lang: u.lang }),
      cancel: () => {},
      getVoices: () => voices,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    window.SpeechSynthesisUtterance = function (t) {
      this.text = t;
    };
  }, VOICES);
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|pointage|plateforme/);
  return { page, context };
}
const lastSpoken = async (page, count) => {
  await page.waitForFunction((n) => window.__spoken.length > n, count, { timeout: 15000 }).catch(() => {});
  const all = await page.evaluate(() => window.__spoken);
  return all.length > count ? all.at(-1) : null;
};

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const staffOf = async (email) =>
  q1("select s.id, b.token from staff_members s join auth.users u on u.id = s.user_id join staff_badges b on b.staff_id = s.id and b.status = 'active' where u.email = $1", [email]);
const director = await staffOf("direction@demo.neoscol.app");
const secretary = await staffOf("secretariat@demo.neoscol.app");
const startedAt = new Date();
const reset = async () => {
  await db.query("delete from voice_checkin_settings where organization_id = $1", [DEMO]);
  await db.query("update badge_scans set lesson_unlock_id = null where organization_id = $1 and scanned_at >= $2", [DEMO, startedAt]);
  await db.query("delete from badge_scans where organization_id = $1 and scanned_at >= $2", [DEMO, startedAt]);
  await db.query("delete from staff_attendance where staff_id = any($1) and work_date >= (now() at time zone 'Africa/Abidjan')::date - 1", [[director.id, secretary.id]]);
};
await reset();

try {
  // 1. Direction : voix de femme, hauteur 1,2.
  const { page: admin, context: actx } = await login("admin@demo.neoscol.app");
  await admin.goto(`${base}/parametres/messages-vocaux`);
  const voicesList = admin.getByTestId("device-voices");
  await voicesList.waitFor();
  const listed = await voicesList.innerText();
  check(listed.includes("Voix disponibles sur cet appareil (4)"), "réglages : les 4 voix françaises de l'appareil sont listées");
  check(listed.includes("Amélie") && listed.includes("Femme") && listed.includes("Thomas") && listed.includes("Homme"), "réglages : type de chaque voix indiqué (femme, homme)");
  check(!listed.includes("Daniel"), "réglages : les voix d'une autre langue sont écartées");
  let n = await admin.evaluate(() => window.__spoken.length);
  await admin.getByRole("button", { name: "Écouter la voix Thomas" }).click();
  check((await lastSpoken(admin, n))?.voice === "Thomas", "réglages : écoute d'une voix précise");
  await admin.getByLabel("Activer les messages vocaux à l'arrivée").check();
  await admin.getByLabel("Type de voix").selectOption("male");
  await admin.getByLabel(/Hauteur/).fill("1.2");
  n = await admin.evaluate(() => window.__spoken.length);
  await admin.getByRole("button", { name: /Écouter : Arrivée à l'heure \(personnel\)/ }).click();
  const heard = await lastSpoken(admin, n);
  check(heard?.voice === "Thomas" && Number(heard?.pitch) === 1.2, `réglages : l'écoute applique la voix d'homme et la hauteur (${heard?.voice}, ${heard?.pitch})`);
  await admin.getByLabel("Type de voix").selectOption("female");
  await admin.getByRole("button", { name: "Enregistrer les messages vocaux" }).click();
  await admin.getByText("Messages vocaux enregistrés.").first().waitFor({ timeout: 15000 }).catch(() => {});
  const saved = await q1("select enabled, voice_gender, pitch from voice_checkin_settings where organization_id = $1", [DEMO]);
  check(saved?.enabled && saved.voice_gender === "female" && Number(saved.pitch) === 1.2, "réglages : voix de femme et hauteur enregistrées");
  check((await q1("select count(*)::int as n from audit_logs where organization_id = $1 and summary = 'Voix de la tablette modifiée' and created_at >= $2", [DEMO, startedAt])).n === 1, "réglages : changement de voix tracé dans le journal d'audit");
  await admin.screenshot({ path: `${out}/reglages-voix.png`, fullPage: true });

  // 2. Tablette : la voix de femme de l'établissement, puis une voix propre à la tablette.
  const { page: kiosk, context: kctx } = await login("pointage@demo.neoscol.app", { width: 1180, height: 820 });
  await kiosk.waitForURL("**/pointage");
  const scan = async (token) => {
    const count = await kiosk.evaluate(() => window.__spoken.length);
    await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${token}`);
    await kiosk.keyboard.press("Enter");
    return lastSpoken(kiosk, count);
  };
  check((await kiosk.getByRole("button", { name: /Voix : Femme/ }).count()) === 1, "tablette : bouton « Voix : Femme » (réglage de l'établissement)");
  let said = await scan(director.token);
  check(said?.voice === "Amélie" && Number(said?.pitch) === 1.2, `tablette : voix de femme et hauteur appliquées (${said?.voice}, ${said?.pitch})`);
  await kiosk.getByRole("button", { name: /Voix : Femme/ }).click();
  const picker = kiosk.getByTestId("kiosk-voice-picker");
  await picker.waitFor();
  n = await kiosk.evaluate(() => window.__spoken.length);
  await kiosk.getByLabel("Voix de cette tablette").selectOption("Thomas");
  check((await lastSpoken(kiosk, n))?.voice === "Thomas", "tablette : le choix s'entend aussitôt");
  await kiosk.screenshot({ path: `${out}/tablette-choix-voix.png` });
  check((await kiosk.evaluate(() => window.localStorage.getItem("neoscol:kiosque:voix"))) === "Thomas", "tablette : choix mémorisé sur l'appareil");
  await kiosk.waitForTimeout(4500);
  said = await scan(secretary.token);
  check(said?.voice === "Thomas", `tablette : les scans suivants utilisent la voix de la tablette (${said?.voice})`);
  await kiosk.reload();
  check((await kiosk.getByRole("button", { name: /Voix : Thomas/ }).count()) === 1, "tablette : choix conservé après rechargement");
  await kiosk.getByRole("button", { name: /Voix : Thomas/ }).click();
  await kiosk.getByLabel("Voix de cette tablette").selectOption("");
  check((await kiosk.getByRole("button", { name: /Voix : Femme/ }).count()) === 1, "tablette : retour au réglage de l'établissement");
  await kctx.close();
  await actx.close();
} catch (e) {
  problems.push(`Exception : ${e.message}`);
} finally {
  await reset();
  await db.end();
  await browser.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
