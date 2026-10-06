// Analytics (console Super Admin) : bandeau de consentement, pages vues, clics,
// durée, conversion réelle (demande de démonstration), visiteurs en ce moment,
// carte, comportement, appareils, établissements (usage des modules),
// exports Excel / PDF, réglages, accès refusé hors plateforme, DNT respecté.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-analytics";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}

await q("update analytics_settings set enabled = true, consent_required = true, track_clicks = true, track_duration = true, track_app_usage = true where id = 1");
const before = Number((await q("select count(*) n from analytics_sessions"))[0].n);

console.log("\n=== 1. Visiteur : consentement, navigation, clic, conversion ===");
const ctx = await browser.newContext({ userAgent: ANDROID, viewport: { width: 412, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { "x-vercel-ip-country": "CI", "x-vercel-ip-city": "Abidjan" } });
const visitor = await ctx.newPage();
visitor.on("pageerror", (e) => problems.push(`[visiteur] ${e.message}`));
await visitor.goto(`${base}/`);
await visitor.getByTestId("consent-banner").waitFor({ timeout: 15000 });
check(true, "bandeau de consentement affiché");
await visitor.getByTestId("consent-banner").getByRole("button", { name: "Accepter" }).click();
check((await visitor.getByTestId("consent-banner").count()) === 0, "choix enregistré, bandeau masqué");
check((await ctx.cookies()).every((c) => !/visit|track|_ga|ns_/i.test(c.name)), "aucun cookie de mesure");
await visitor.goto(`${base}/tarifs`);
await visitor.waitForTimeout(1200);
await visitor.goto(`${base}/contact?demande=demo`);
const form = visitor.locator("form").filter({ has: visitor.locator('input[name="kind"]') });
await form.waitFor({ timeout: 15000 });
await visitor.getByLabel(/Nom/i).first().fill("Visiteur Analytics");
await visitor.getByLabel(/E-mail/i).first().fill(`analytics.${Date.now()}@exemple.ci`);
const phone = visitor.getByLabel(/Téléphone/i).first();
if (await phone.count()) await phone.fill("+225 07 00 00 00 00");
const org = visitor.getByLabel(/Établissement/i).first();
if (await org.count()) await org.fill("Lycée Test Analytics");
const country = visitor.getByLabel(/^Pays/i).first();
if ((await country.count()) && (await country.evaluate((el) => el.tagName)) === "SELECT") await country.selectOption("CI").catch(() => undefined);
await form.getByRole("button").last().click();
await visitor.getByTestId("lead-sent").waitFor({ timeout: 20000 }).catch(() => problems.push("formulaire de démonstration non envoyé"));
await visitor.waitForTimeout(4000);
await visitor.goto(`${base}/`);
await visitor.waitForTimeout(3500);

const sessions = await q("select * from analytics_sessions where started_at > now() - interval '5 minutes' and os = 'android' order by started_at desc limit 1");
const s = sessions[0];
check(Boolean(s), "session enregistrée");
check(s?.country === "CI" && s?.city === "Abidjan" && s?.device === "mobile" && s?.browser === "chrome", "pays, ville, appareil, navigateur");
check(s?.consented === true, "consentement pris en compte (identifiant durable)");
const events = s ? await q("select type, path, label, duration_ms from analytics_events where session_id = $1 order by id", [s.id]) : [];
check(events.filter((e) => e.type === "pageview").length >= 3, "pages vues enregistrées");
check(events.some((e) => e.type === "leave" && e.duration_ms > 0), "temps passé sur la page");
check(events.some((e) => e.type === "click"), "clics enregistrés");
check(events.some((e) => e.type === "conversion" && e.label === "demo_request"), "conversion « demande de démonstration »");
check(!JSON.stringify(events).includes("Visiteur Analytics") && !JSON.stringify(events).includes("@exemple.ci"), "aucune saisie de formulaire enregistrée");

console.log("\n=== 2. « Ne pas me suivre » ===");
const dntCtx = await browser.newContext({ extraHTTPHeaders: { DNT: "1" } });
const dnt = await dntCtx.newPage();
await dnt.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }));
const n0 = Number((await q("select count(*) n from analytics_sessions"))[0].n);
await dnt.goto(`${base}/tarifs`);
await dnt.waitForTimeout(3500);
check(Number((await q("select count(*) n from analytics_sessions"))[0].n) === n0, "aucune session pour DNT");
check((await dnt.getByTestId("consent-banner").count()) === 0, "pas de bandeau pour DNT");

console.log("\n=== 3. Usage des établissements ===");
const admin = await login("admin@demo.neoscol.app");
await admin.goto(`${base}/eleves`);
await admin.waitForTimeout(2000);
const usage = await q("select sum(views)::int v from analytics_app_usage where module = 'eleves' and day = current_date");
check((usage[0]?.v ?? 0) >= 1, "consultation du module « Élèves » comptée");
const denied = await admin.request.get(`${base}/plateforme/analytics`, { maxRedirects: 0 });
check(denied.status() !== 200 || !(await denied.text()).includes("analytics-overview"), "Analytics inaccessible à un établissement");
check((await admin.request.get(`${base}/plateforme/analytics/export?format=xlsx`)).status() === 404, "export refusé à un établissement");

console.log("\n=== 4. Console Analytics ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/analytics?periode=7j`);
check(await sa.getByRole("link", { name: "Analytics" }).first().isVisible(), "rubrique Analytics dans la console");
const realtime = Number((await sa.getByTestId("realtime").locator("span").nth(1).textContent())?.replace(/\D/g, "") || 0);
check(realtime >= 1, "visiteurs en ce moment");
check(await sa.getByTestId("kpi-visitors").isVisible(), "indicateurs de la période");
check((await sa.locator("svg polyline").count()) >= 3, "graphique journalier");
await sa.screenshot({ path: `${out}/01-vue.png`, fullPage: true });
await sa.goto(`${base}/plateforme/analytics?periode=7j&onglet=geographie`);
check((await sa.locator('[data-testid="world-map"] path[data-country="CI"]').getAttribute("fill"))?.startsWith("rgba"), "carte : Côte d'Ivoire colorée");
check(await sa.getByText("Abidjan (CI)").isVisible(), "ville affichée");
await sa.screenshot({ path: `${out}/02-geo.png`, fullPage: true });
await sa.goto(`${base}/plateforme/analytics?periode=7j&onglet=comportement`);
check(await sa.getByTestId("analytics-behavior").getByText("/tarifs").first().isVisible(), "pages consultées");
check(await sa.getByTestId("routes").isVisible(), "parcours des visiteurs");
await sa.screenshot({ path: `${out}/03-comportement.png`, fullPage: true });
await sa.goto(`${base}/plateforme/analytics?periode=7j&onglet=appareils&appareil=mobile`);
check(await sa.getByTestId("analytics-devices").getByText("Android", { exact: true }).isVisible(), "systèmes (filtre appareil)");
await sa.goto(`${base}/plateforme/analytics?periode=7j&onglet=conversion`);
check(await sa.getByTestId("analytics-conversion").getByText("Demandes de démonstration").first().isVisible(), "conversions");
await sa.screenshot({ path: `${out}/04-conversion.png`, fullPage: true });
await sa.goto(`${base}/plateforme/analytics?periode=7j&onglet=etablissements`);
check(await sa.getByTestId("analytics-organizations").isVisible(), "surveillance des établissements");
await sa.screenshot({ path: `${out}/05-etablissements.png`, fullPage: true });

console.log("\n=== 5. Exports ===");
const xlsx = await sa.request.get(`${base}/plateforme/analytics/export?periode=7j&format=xlsx`);
check(xlsx.status() === 200 && xlsx.headers()["content-type"].includes("spreadsheetml") && (await xlsx.body()).subarray(0, 2).toString() === "PK", "export Excel");
const pdf = await sa.request.get(`${base}/plateforme/analytics/export?periode=7j&format=pdf`);
check(pdf.status() === 200 && (await pdf.body()).subarray(0, 4).toString() === "%PDF", "export PDF");

console.log("\n=== 6. Réglages ===");
await sa.goto(`${base}/plateforme/analytics?onglet=reglages`);
const st = sa.getByTestId("analytics-settings");
await st.getByLabel(/Enregistrer les clics/).uncheck();
await st.getByRole("button", { name: "Enregistrer" }).click();
await sa.getByText("Réglages Analytics enregistrés.").first().waitFor({ timeout: 15000 });
check((await q("select track_clicks from analytics_settings where id = 1"))[0].track_clicks === false, "réglage enregistré en base");
check((await q("select count(*)::int n from audit_logs where action = 'platform.analytics_settings' and created_at > now() - interval '2 minutes'"))[0].n >= 1, "modification journalisée");
await q("update analytics_settings set track_clicks = true where id = 1");

check(Number((await q("select count(*) n from analytics_sessions"))[0].n) > before, "données réelles uniquement (sessions créées par le test)");
await q("delete from site_leads where full_name = 'Visiteur Analytics'");
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
