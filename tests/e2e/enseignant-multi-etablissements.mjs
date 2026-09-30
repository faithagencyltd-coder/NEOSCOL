// ENSEIGNANT MULTI-ÉTABLISSEMENTS + PORTAIL APPRENANT — parcours de bout en bout
// (navigateur + base) : compte unique → invitation acceptée → règle Super Admin
// → paiement (simulé, vérifié côté serveur) → accès activé → suspension /
// rétablissement ; puis portail élève (établissement, parcours scolaire).
//
// Prérequis : application démarrée avec PAYMENT_PROVIDER=simulation, base migrée + seed.
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/enseignant-multi-etablissements.mjs
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-enseignant-multi";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const text = async (page) => (await page.locator("body").innerText()).replace(/[  ]/g, " ");
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
async function login(identifier, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
const toast = async (page, re) => page.getByText(re).first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);

const TEACHER_EMAIL = "enseignant@demo.neoscol.app";
const teacherId = (await q1("select id from profiles where email = $1", [TEACHER_EMAIL])).id;
const orgB = await q1("select id, name from organizations where code = 'DEMOF'");
const orgA = await q1("select id, name from organizations where code = 'DEMO'");
const accountsBefore = Number((await q1("select count(*) as n from auth.users")).n);
// Fiche du même enseignant créée par le centre de formation (B).
const staff = await q1(
  "insert into staff_members (organization_id, first_name, last_name, email, is_teacher) values ($1, 'Koffi', 'Mensah', $2, true) returning id",
  [orgB.id, TEACHER_EMAIL],
);

console.log("\n=== 1. Établissement B : « Créer le compte » d'un enseignant qui a déjà un compte ===");
{
  const page = await login("formation@demo.neoscol.app");
  await page.goto(`${base}/personnel/${staff.id}`);
  await page.getByRole("button", { name: "Créer le compte de connexion" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Créer le compte" }).click();
  await page.getByRole("dialog").getByText(/aucun nouveau compte n'est créé/).waitFor({ timeout: 15000 });
  const t = await page.getByRole("dialog").innerText();
  check(t.includes("aucun nouveau compte n'est créé"), "message : compte existant réutilisé, invitation envoyée");
  check(!t.includes("Mot de passe provisoire"), "aucun mot de passe généré");
  await shot(page, "01-invitation-envoyee");
  check(Number((await q1("select count(*) as n from auth.users")).n) === accountsBefore, "aucun second compte créé");
  const m = await q1("select status from memberships where user_id = $1 and organization_id = $2", [teacherId, orgB.id]);
  check(m?.status === "invited", "adhésion B en attente d'acceptation");
  await page.getByRole("dialog").getByRole("button", { name: "Terminé" }).click();
  await page.reload();
  check((await text(page)).includes("en attente d'acceptation"), "fiche : invitation en attente affichée");
  await page.context().close();
}

console.log("\n=== 2. L'enseignant accepte avec son compte actuel ===");
let teacher = await login(TEACHER_EMAIL);
{
  check((await text(teacher)).includes("invitation(s) d'un autre établissement"), "bandeau d'invitation");
  await teacher.goto(`${base}/mes-etablissements`);
  check((await text(teacher)).includes("Invitations à accepter") && (await text(teacher)).includes(orgB.name), "invitation listée");
  await shot(teacher, "02-invitation-a-accepter");
  await teacher.getByRole("button", { name: "Accepter", exact: true }).click();
  await teacher.getByRole("dialog").getByRole("button", { name: "Accepter l'invitation" }).click();
  check(await toast(teacher, /Invitation acceptée/), "invitation acceptée");
  await teacher.reload();
  const cards = await teacher.getByTestId("establishment-card").count();
  check(cards === 2, `deux établissements sur le même compte (${cards})`);
  const t = await text(teacher);
  check(t.includes("établissement principal") && t.includes("établissement supplémentaire"), "principal / supplémentaire distingués");
  check(t.includes("Accès inclus"), "règle inactive : accès inclus");
  await shot(teacher, "03-deux-etablissements");
  await teacher.getByTestId("establishment-card").filter({ hasText: orgB.name }).getByRole("button", { name: /Ouvrir/ }).click();
  await teacher.waitForURL(/tableau-de-bord/, { timeout: 30000 });
  check((await text(teacher)).includes(orgB.name), "bascule vers B avec le même compte");
  const perms = await q1(
    "select array_agg(rp.permission_code) as p from memberships m join membership_roles mr on mr.membership_id = m.id join role_permissions rp on rp.role_id = mr.role_id where m.user_id = $1 and m.organization_id = $2",
    [teacherId, orgB.id],
  );
  check(!perms.p.includes("users.manage") && !perms.p.includes("finance.manage"), "droits de B = rôle enseignant de B uniquement");
}

console.log("\n=== 3. Super Admin : règle, prix, durée ===");
const admin = await login("superadmin@demo.neoscol.app");
{
  await admin.goto(`${base}/plateforme/enseignants`);
  let t = await text(admin);
  check(t.includes("Enseignants concernés (1)") && t.includes(orgB.name), "enseignant concerné listé (règle inactive)");
  await admin.getByLabel("Prix").fill("5000");
  await admin.getByLabel("Durée / périodicité").selectOption("1");
  await admin.getByLabel("Délai de grâce (jours)").fill("0");
  await admin.getByRole("checkbox").check();
  await admin.getByRole("button", { name: "Enregistrer la règle" }).click();
  check(await toast(admin, /Règle active/), "règle activée");
  const s = await q1("select enabled, price, period_months from platform_teacher_access_settings");
  check(s.enabled && s.price === 5000 && s.period_months === 1, "réglage enregistré en base (5 000 / 1 mois)");
  await admin.reload();
  t = await text(admin);
  check(t.includes("Paiement requis"), "statut de l'enseignant : paiement requis");
  await shot(admin, "04-super-admin-regle");
}

console.log("\n=== 4. Accès à B bloqué jusqu'au paiement, A intact ===");
{
  await teacher.goto(`${base}/tableau-de-bord`);
  let t = await text(teacher);
  check(t.includes(orgA.name) && t.includes("en attente d'abonnement supplémentaire"), "B inaccessible : retour sur A + bandeau");
  await teacher.goto(`${base}/mes-etablissements`);
  const cardB = teacher.getByTestId("establishment-card").filter({ hasText: orgB.name });
  t = await cardB.innerText();
  check(t.includes("Paiement requis") && !t.includes("Ouvrir"), "carte B : paiement requis, pas d'ouverture");
  await shot(teacher, "05-paiement-requis");
  await cardB.getByRole("button", { name: /Payer l'abonnement/ }).click();
  await teacher.getByRole("dialog").getByRole("button", { name: "Continuer vers le paiement" }).click();
  await teacher.waitForURL(/mes-etablissements\/paiement-simule/, { timeout: 30000 });
  check((await text(teacher)).replace(/\s/g, "").includes("5000FCFA"), "montant fixé par le Super Admin (5 000 F CFA)");
  await shot(teacher, "06-paiement-simule");
  await teacher.getByRole("button", { name: "Simuler un paiement réussi" }).click();
  await teacher.waitForURL(/mes-etablissements\/retour/, { timeout: 30000 });
  check((await text(teacher)).includes("Paiement confirmé"), "retour : paiement confirmé (vérifié côté serveur)");
  await shot(teacher, "07-paiement-confirme");
  const a = await q1("select status, period_end > current_date as future from teacher_extra_accesses where user_id = $1 and organization_id = $2", [teacherId, orgB.id]);
  check(a?.status === "active" && a.future, "accès B activé en base pour la période payée");
  await teacher.goto(`${base}/mes-etablissements`);
  t = await teacher.getByTestId("establishment-card").filter({ hasText: orgB.name }).innerText();
  // B redevient accessible (bouton « Ouvrir », ou déjà l'établissement actif si c'était le dernier choisi).
  check(t.includes("Abonnement actif") && (t.includes("Ouvrir") || t.includes("Établissement actif")), "carte B : abonnement actif, accès rouvert");
  check((await text(teacher)).includes(orgB.name) && !(await text(teacher)).includes("en attente d'abonnement supplémentaire"), "bandeau d'attente retiré");
  check((await text(teacher)).includes("Mes paiements d'accès"), "historique des paiements");
}

console.log("\n=== 5. Super Admin : paiements, suspension, rétablissement ===");
{
  await admin.reload();
  let t = await text(admin);
  check(t.includes("Abonnement actif") && t.includes("Payé"), "Super Admin : statut actif + paiement visible");
  await admin.getByRole("button", { name: "Suspendre" }).click();
  await admin.getByRole("dialog").getByLabel(/Motif/).fill("Paiement contesté");
  await admin.getByRole("dialog").getByRole("button", { name: "Suspendre" }).click();
  check(await toast(admin, /Accès suspendu/), "accès suspendu");
  await teacher.goto(`${base}/mes-etablissements`);
  t = await teacher.getByTestId("establishment-card").filter({ hasText: orgB.name }).innerText();
  check(t.includes("Suspendu par Neoscool") && t.includes("Paiement contesté"), "enseignant : suspendu avec motif");
  const p = await q1("select is_active from profiles where id = $1", [teacherId]);
  const ms = await q1("select count(*)::int as n from memberships where user_id = $1 and status = 'active'", [teacherId]);
  check(p.is_active && ms.n === 2, "compte principal et adhésions conservés");
  await shot(teacher, "08-suspendu");
  await admin.reload();
  await admin.getByRole("button", { name: "Rétablir" }).click();
  await admin.getByRole("dialog").getByLabel(/Motif/).fill("Paiement vérifié");
  await admin.getByRole("dialog").getByRole("button", { name: "Rétablir" }).click();
  check(await toast(admin, /Accès rétabli/), "accès rétabli");
  await teacher.reload();
  check((await teacher.getByTestId("establishment-card").filter({ hasText: orgB.name }).innerText()).includes("Abonnement actif"), "enseignant : accès de nouveau actif");
  await shot(admin, "09-super-admin-liste");
  // Remise à l'état initial de la règle (les autres parcours de démonstration ne sont pas concernés).
  await admin.getByRole("checkbox").uncheck();
  await admin.getByRole("button", { name: "Enregistrer la règle" }).click();
  check(await toast(admin, /Règle désactivée/), "règle désactivée : accès libre");
}

console.log("\n=== 6. Mobile ===");
{
  const m = await login(TEACHER_EMAIL, { width: 390, height: 844 });
  await m.goto(`${base}/mes-etablissements`);
  await shot(m, "10-mobile-mes-etablissements");
  await m.context().close();
}

console.log("\n=== 7. Portail apprenant : établissement, classe, parcours ===");
{
  const s = await login("eleve@demo.neoscol.app", { width: 390, height: 844 });
  await s.goto(`${base}/portail/plus`);
  let t = await text(s);
  check(t.includes("Mon établissement") && t.includes(orgA.name), "portail : fiche de l'établissement");
  check(t.includes("Mon parcours scolaire"), "portail : lien vers le parcours scolaire");
  check(t.includes("Nationalité") || t.includes("Lieu de naissance"), "portail : profil détaillé");
  await shot(s, "11-portail-plus");
  await s.goto(`${base}/portail/parcours`);
  t = await text(s);
  check(t.includes("Parcours dans l'établissement") && /20\d\d-20\d\d/.test(t), "portail : historique des années");
  await shot(s, "12-portail-parcours");
  for (const path of ["notes", "presences", "emploi-du-temps", "finances", "documents", "annonces"]) {
    const r = await s.goto(`${base}/portail/${path}`);
    check(r.status() === 200, `portail : /portail/${path} accessible`);
  }
  await s.context().close();
}

await teacher.context().close();
await admin.context().close();
console.log(problems.length ? `\nPROBLÈMES (${problems.length}):\n- ${problems.join("\n- ")}` : "\nENSEIGNANT MULTI-ÉTABLISSEMENTS + PORTAIL : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
