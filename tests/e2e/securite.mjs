// P4 — Sécurité de bout en bout : verrouillage après échecs, double
// authentification (activation avec un vrai code TOTP, connexion en deux
// étapes, mot de passe seul inutilisable), appareils connectés, centre de
// sécurité. Rejouable (état remis à zéro au début).
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-securite";
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
const PASSWORD = "NeoScol-Demo-2026!";

/** Code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres) à partir de la clé base32. */
function totp(secret, offset = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, "0");
}

async function fillLogin(page, identifier, password) {
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

const USER = "secretariat@demo.neoscol.app";
// État initial : aucun facteur, aucune tentative, réglages par défaut.
await db.query("delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)", [USER]);
await db.query("delete from auth_login_attempts");
await db.query("update platform_security_settings set lockout_threshold = 5, lockout_minutes = 15, captcha_after_failures = 3, mfa_required_sensitive = false");

console.log("\n=== 1. Verrouillage après 5 échecs ===");
{
  const page = await (await browser.newContext({ locale: "fr-FR" })).newPage();
  for (let i = 0; i < 5; i++) {
    await fillLogin(page, USER, "mauvais-mot-de-passe");
    await page.getByText("Identifiant ou mot de passe incorrect.").first().waitFor();
  }
  await fillLogin(page, USER, PASSWORD);
  await page.getByText(/Compte temporairement verrouillé/).first().waitFor();
  check(page.url().includes("/connexion"), "6e tentative avec le BON mot de passe : refusée (compte verrouillé)");
  check(/réessayez dans \d+ minutes?/.test(await text(page)), "délai affiché en minutes");
  await shot(page, "01-compte-verrouille");
  const [{ n }] = (await db.query("select count(*)::int n from auth_login_attempts where kind = 'failure'")).rows;
  check(n >= 5, "tentatives journalisées (identifiant haché)");
  check((await db.query("select count(*)::int n from auth_login_attempts where identifier_hash like '%secretariat%'")).rows[0].n === 0, "aucun identifiant en clair");
}

console.log("\n=== 2. Centre de sécurité : déverrouillage ===");
const saCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
const sa = await saCtx.newPage();
sa.on("pageerror", (e) => problems.push(`[superadmin] ${e.message}`));
await fillLogin(sa, "superadmin@demo.neoscol.app", PASSWORD);
await sa.waitForURL(/plateforme|tableau-de-bord/);
await sa.goto(`${base}/plateforme/securite`);
let t = await text(sa);
check(t.includes("Centre de sécurité") && t.includes("Comptes verrouillés") && t.includes("Rôles sensibles"), "centre de sécurité affiché");
await shot(sa, "02-centre-securite");
await sa.getByRole("button", { name: "Déverrouiller" }).first().click();
await sa.getByRole("dialog").getByRole("button", { name: "Déverrouiller" }).click();
await sa.getByRole("dialog").waitFor({ state: "detached" });
check((await db.query("select count(*)::int n from auth_login_attempts where kind = 'unlock'")).rows[0].n === 1, "compte déverrouillé (tracé)");

console.log("\n=== 3. Activation de la double authentification ===");
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", userAgent: "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130 Safari/537.36" });
const page = await ctx.newPage();
page.on("pageerror", (e) => problems.push(`[secretariat] ${e.message}`));
await fillLogin(page, USER, PASSWORD);
await page.waitForURL(/tableau-de-bord/);
await page.goto(`${base}/mon-compte`);
await page.getByRole("link", { name: /Double authentification et appareils/ }).click();
await page.waitForURL(/\/securite/);
await page.getByRole("button", { name: /Activer la double authentification/ }).click();
const secret = (await page.locator("code").first().innerText()).trim();
check(/^[A-Z2-7]{16,}$/.test(secret), "QR code et clé de configuration affichés");
await shot(page, "03-activation-qr");
await page.getByLabel("Code à 6 chiffres").fill("000000");
await page.getByRole("button", { name: "Confirmer et activer" }).click();
check(await page.getByText(/Code incorrect/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "code faux refusé à l'activation");
await page.getByLabel("Code à 6 chiffres").fill(totp(secret));
await page.getByRole("button", { name: "Confirmer et activer" }).click();
await page.getByText("Double authentification activée", { exact: true }).first().waitFor();
check((await db.query("select count(*)::int n from auth.mfa_factors f join auth.users u on u.id = f.user_id where u.email = $1 and f.status = 'verified'", [USER])).rows[0].n === 1, "base : facteur TOTP vérifié");
await shot(page, "04-mfa-active");

console.log("\n=== 4. Connexion en deux étapes ; mot de passe seul inutilisable ===");
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "fr-FR", isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1" });
const phone = await ctx2.newPage();
phone.on("pageerror", (e) => problems.push(`[mobile] ${e.message}`));
await fillLogin(phone, USER, PASSWORD);
await phone.waitForURL(/connexion\/verification/);
check(true, "mot de passe correct → étape « code » exigée");
await shot(phone, "05-verification-mobile");
const direct = await phone.goto(`${base}/eleves`);
check(phone.url().includes("/connexion/verification") || direct.status() === 404, "accès direct à une page sans code : renvoyé vers la vérification");
await phone.goto(`${base}/connexion/verification`);
await phone.getByLabel("Code à 6 chiffres").fill("123456");
await phone.getByRole("button", { name: /Vérifier/ }).click();
check(await phone.getByText(/Code incorrect/).first().waitFor({ timeout: 10000 }).then(() => true).catch(() => false), "code faux refusé");
await phone.getByLabel("Code à 6 chiffres").fill(totp(secret));
await phone.getByRole("button", { name: /Vérifier/ }).click();
await phone.waitForURL(/tableau-de-bord/);
check(true, "bon code → accès");

console.log("\n=== 5. Appareils connectés : déconnexion d'un appareil ===");
await page.goto(`${base}/securite`);
t = await text(page);
check(t.includes("Cet appareil") && t.includes("iPhone / iPad"), "liste des appareils (dont le téléphone)");
await shot(page, "06-appareils");
await page.getByRole("button", { name: "Déconnecter", exact: true }).first().click();
await page.getByRole("dialog").getByRole("button", { name: "Déconnecter" }).click();
await page.getByRole("dialog").waitFor({ state: "detached" });
check((await db.query("select count(*)::int n from auth.sessions s join auth.users u on u.id = s.user_id where u.email = $1", [USER])).rows[0].n === 1, "session du téléphone fermée en base");

console.log("\n=== 6. Désactivation (code exigé) ===");
await page.getByLabel(/Code actuel/).fill(totp(secret));
await page.getByRole("button", { name: "Désactiver la double authentification" }).click();
await page.getByRole("button", { name: /Activer la double authentification/ }).waitFor();
check((await db.query("select count(*)::int n from auth.mfa_factors f join auth.users u on u.id = f.user_id where u.email = $1", [USER])).rows[0].n === 0, "double authentification désactivée");
const audit = (await db.query("select action from audit_logs where action in ('auth.mfa_enabled', 'auth.login_mfa', 'auth.mfa_disabled', 'auth.session_revoked')")).rows.map((r) => r.action);
check(["auth.mfa_enabled", "auth.login_mfa", "auth.mfa_disabled", "auth.session_revoked"].every((a) => audit.includes(a)), "journal d'audit : activation, connexion par code, désactivation, appareil fermé");

console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nSÉCURITÉ E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
