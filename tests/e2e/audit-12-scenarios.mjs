// AUDIT DE CONFORMITÉ — les 12 scénarios E2E de bout en bout (navigateur + base).
//
// Prérequis : application démarrée (BASE_URL) sur une base fraîchement
// migrée + seed (DATABASE_URL), mode démo actif. Exemple :
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@localhost/neoscol_e2e \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/audit-12-scenarios.mjs
// Les captures sont écrites dans RESULTS_DIR (défaut : test-results/e2e).
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";
const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e";
mkdirSync(`${out}/shots`, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/neoscol_e2e" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const ok = (m) => console.log("OK", m);
const check = (c, l) => (c ? ok(l) : (console.log("KO", l), problems.push(l)));
const shot = async (page, name) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (w[0] > w[1] + 1) problems.push(`${name} : défilement horizontal (${w[0]} > ${w[1]})`);
  await page.screenshot({ path: `${out}/shots/${name}.png`, fullPage: true });
};
const seen = (loc) => loc.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "fr-FR" };
const isPdf = async (page, href) => {
  const r = await page.request.get(base + href);
  return r.status() === 200 && (await r.body()).subarray(0, 5).toString() === "%PDF-";
};
async function staffLogin(identifier, password = "NeoScol-Demo-2026!", viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|pointage|plateforme/);
  return page;
}
const scenarios = {};
const scenario = (n, label, pass) => { scenarios[n] = { label, pass: Boolean(pass) }; check(pass, `SCÉNARIO ${n} — ${label}`); };
writeFileSync(`${out}/j.png`, Buffer.from("89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D4944415478DA63F8FFFF3F0005FE02FEA7D6A5CB0000000049454E44AE426082", "hex"));

console.log("\n=== SCÉNARIO 1 : établissement → utilisateur → connexion ===");
const sa = await staffLogin("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme`);
await sa.getByRole("button", { name: "Nouvel établissement" }).click();
let dlg = sa.getByRole("dialog");
await dlg.getByLabel("Nom de l'établissement").fill("Lycée Audit Conformité");
await dlg.getByLabel("Code (matricules)").fill("AUDIT");
await dlg.getByLabel("Ville").fill("Bouaké");
await dlg.getByLabel("Prénom").fill("Awa");
await dlg.getByLabel("Nom", { exact: true }).fill("TRAORÉ");
await dlg.getByLabel("E-mail de connexion").fill("admin@audit.neoscol.app");
await dlg.getByRole("button", { name: "Créer l'établissement" }).click();
const newPwd = await dlg.getByTestId("temporary-password").innerText();
await dlg.getByRole("button", { name: "Terminé" }).click();
const newOrg = (await db.query("select id from organizations where code='AUDIT'")).rows[0]?.id;
await shot(sa, "audit-01-plateforme");
const newAdmin = await staffLogin("admin@audit.neoscol.app", newPwd);
await newAdmin.goto(`${base}/tableau-de-bord`);
const orgName = await seen(newAdmin.getByText("Lycée Audit Conformité").first());
const newAdminStudents = (await newAdmin.goto(`${base}/eleves`)).status();
scenario(1, "établissement créé par le super administrateur, premier administrateur créé, connexion réussie", Boolean(newOrg) && orgName && newAdminStudents === 200);
await shot(newAdmin, "audit-01-nouvel-etablissement");

console.log("\n=== ADMINISTRATION ===");
const admin = await staffLogin("admin@demo.neoscol.app");
// 1. Créer un professeur
await admin.goto(`${base}/personnel`);
await admin.getByRole("button", { name: "Ajouter" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Nom *").fill("DIALLO");
await dlg.getByLabel("Prénom(s) *").fill("Fatoumata");
await dlg.getByLabel("Fonction").fill("Professeure d'anglais");
await dlg.getByLabel("E-mail").fill("fatoumata.diallo@demo.neoscol.app");
await dlg.getByText("Enseignant / formateur").click();
await dlg.getByRole("button", { name: "Créer la fiche" }).click();
await admin.waitForURL(/\/personnel\/[0-9a-f-]+\?cree=1/);
const staffId = admin.url().split("/personnel/")[1].split("?")[0];
const matricule = (await admin.getByText(/Matricule attribué : EMP-DEMO-\d{4}/).innerText()).match(/EMP-DEMO-\d{4}/)[0];
ok(`1. professeur créé (${matricule})`);
// 2. Badge QR
await admin.getByRole("button", { name: "Générer le badge" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Générer" }).click();
await admin.getByRole("link", { name: "Imprimer le badge" }).waitFor();
check(await isPdf(admin, await admin.getByRole("link", { name: "Imprimer le badge" }).getAttribute("href")), "2. badge QR généré, PDF imprimable");
await admin.getByRole("button", { name: "Créer le compte de connexion" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Créer le compte" }).click();
const teacherPwd = await admin.getByTestId("temporary-password").innerText();
await admin.getByRole("button", { name: "Terminé" }).click();
ok("   compte de connexion créé (mot de passe provisoire)");
await admin.reload();
await shot(admin, "final-01-fiche-professeur");
// 3. Classe + matière + enseignant
const klass = (await db.query("select id from classes where name='6e A'")).rows[0].id;
await admin.goto(`${base}/classes/${klass}`);
await admin.getByRole("button", { name: "Matière" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Matière").selectOption({ label: "Anglais" });
await dlg.getByLabel("Enseignant").selectOption({ label: "DIALLO Fatoumata" });
await dlg.getByLabel("Coefficient").fill("2");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const cs = (await db.query("select cs.id from class_subjects cs join subjects s on s.id=cs.subject_id where cs.class_id=$1 and s.code='ANG' and cs.teacher_id=$2", [klass, staffId])).rows[0]?.id;
check(Boolean(cs), "3. Anglais affecté à Fatoumata DIALLO en 6e A (coef. 2)");
// 4. Emploi du temps : créneau maintenant (les créneaux du jour de la 6e A sont libérés pour éviter un conflit)
const now = (await db.query(`select extract(isodow from now() at time zone 'Africa/Abidjan')::int wd,
  to_char(greatest((now() at time zone 'Africa/Abidjan')::time - interval '10 minutes', time '00:00'), 'HH24:MI') s,
  to_char(least((now() at time zone 'Africa/Abidjan')::time + interval '50 minutes', time '23:59'), 'HH24:MI') e,
  to_char((now() at time zone 'Africa/Abidjan')::date, 'YYYY-MM-DD') today`)).rows[0];
await db.query("delete from timetable_slots where weekday=$1 and class_id=$2", [now.wd, klass]);
await admin.goto(`${base}/emploi-du-temps?classe=${klass}`);
await admin.getByRole("button", { name: "Ajouter un créneau" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Matière").selectOption({ label: "Anglais — Fatoumata DIALLO" });
await dlg.getByLabel("Jour").selectOption(String(now.wd));
await dlg.getByLabel("Salle").selectOption({ label: "Salle 101" });
await dlg.getByLabel("Début").fill(now.s);
await dlg.getByLabel("Fin").fill(now.e);
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const slot = (await db.query("select id from timetable_slots where class_subject_id=$1 and weekday=$2", [cs, now.wd])).rows[0]?.id;
check(Boolean(slot), `4. créneau d'emploi du temps créé (${now.s}–${now.e})`);
await shot(admin, "final-02-emploi-du-temps");

console.log("\n=== PROFESSEUR ===");
const teacher = await staffLogin(matricule, teacherPwd, { width: 1280, height: 860 });
ok(`professeur connecté par matricule (${matricule})`);
await teacher.goto(`${base}/mes-cours`);
await teacher.getByRole("heading", { name: "Mes cours" }).waitFor();
check(await seen(teacher.getByText("Anglais").first()), "emploi du temps du professeur : cours d'anglais");
await teacher.goto(`${base}/mes-cours/${slot}?date=${now.today}`);
await teacher.getByRole("heading", { name: "Appel verrouillé" }).waitFor();
ok("appel impossible avant le scan du badge");
await shot(teacher, "final-03-appel-verrouille");
// 5. Scan
const token = (await db.query("select token from staff_badges where staff_id=$1 and status='active'", [staffId])).rows[0].token;
const kiosk = await staffLogin("pointage@demo.neoscol.app", "NeoScol-Demo-2026!", { width: 1180, height: 820 });
await kiosk.waitForURL("**/pointage");
await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${token}`);
await kiosk.keyboard.press("Enter");
await kiosk.getByText(/Appel disponible/).waitFor();
ok("5. badge scanné sur la tablette → cours déverrouillé");
await shot(kiosk, "final-04-scan");
// 6. Présences
await teacher.reload();
await teacher.getByRole("button", { name: /Valider l'appel/ }).waitFor();
const unlocked = (await db.query("select count(*)::int n from lesson_unlocks where timetable_slot_id=$1", [slot]).catch(() => ({ rows: [{ n: -1 }] }))).rows[0].n;
scenario(2, "professeur créé → badge QR → scan sur la tablette → pointage → cours déverrouillé", unlocked !== 0);
const rows = teacher.locator("fieldset");
const kofiRow = rows.filter({ hasText: "Kofi" });
await kofiRow.getByRole("button", { name: /^Absent —/ }).click();
await teacher.getByRole("button", { name: /Valider l'appel/ }).click();
await teacher.getByText(/Appel validé/).first().waitFor();
ok("6. appel saisi (Kofi absent) et validé");
const absent = (await db.query("select count(*)::int n from attendance_records ar join students s on s.id=ar.student_id where s.first_name='Kofi' and ar.status='absent' and ar.created_at > now() - interval '1 hour'")).rows[0].n;
scenario(3, "cours → appel validé (absence enregistrée)", absent >= 1);
// 7. Notes
await teacher.goto(`${base}/notes/${cs}`);
await teacher.getByRole("button", { name: "Nouvelle évaluation" }).click();
dlg = teacher.getByRole("dialog");
await dlg.getByLabel("Intitulé *").fill("Devoir d'anglais n°1");
await dlg.getByRole("button", { name: "Créer et saisir les notes" }).click();
await teacher.waitForURL(/evaluations/);
const inputs = teacher.locator("input[inputmode=decimal], input[type=number]");
const n = await inputs.count();
for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(11 + (i % 8)));
await teacher.getByRole("button", { name: /Enregistrer/ }).first().click();
await teacher.getByText(/enregistrée|enregistrées/).first().waitFor();
await teacher.getByRole("button", { name: "Valider les notes" }).click();
await teacher.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
await teacher.getByText("Notes validées et verrouillées").waitFor();
ok(`7. notes saisies (${n}) et validées`);
await teacher.getByRole("button", { name: "Publier les notes" }).click();
await teacher.getByRole("dialog").getByRole("button", { name: "Publier" }).click();
await teacher.getByText("Publiée", { exact: true }).waitFor();
ok("   notes publiées aux familles");
await shot(teacher, "final-05-notes");
// Aperçu du bulletin sans document officiel
await teacher.goto(`${base}/bulletins/apercu`);
await teacher.getByRole("heading", { name: /Aperçu/ }).first().waitFor();
check((await teacher.getByRole("link", { name: /PDF/ }).count()) === 0, "professeur : aperçu du bulletin sans bouton PDF");
const period = (await db.query("select id from academic_periods where name='1er trimestre' and organization_id='10000000-0000-4000-a000-000000000001'")).rows[0].id;
const teacherPdf = await teacher.request.get(`${base}/api/documents/bulletins?classe=${klass}&periode=${period}`);
check(teacherPdf.status() === 403, `professeur : génération de PDF refusée (${teacherPdf.status()})`);
check((await teacher.goto(`${base}/finances`)).status() === 404, "professeur : finances inaccessibles");
const anyCard = (await db.query("select id from report_cards limit 1")).rows[0]?.id;
const t1 = teacherPdf.status();
const t2 = anyCard ? (await teacher.request.get(`${base}/api/documents/bulletins/${anyCard}`)).status() : 403;
const kofiId = (await db.query("select id from students where first_name='Kofi' and last_name='BAMBA'")).rows[0].id;
const t3 = (await teacher.request.get(`${base}/api/documents/releves/${kofiId}`)).status();
const denied = (await db.query("select count(*)::int n from audit_logs where action='document.denied' and created_at > now() - interval '1 hour'")).rows[0].n;
scenario(5, `bulletin PDF par le professeur → refusé côté serveur (${t1}/${t2}/${t3}) et tracé`, t1 === 403 && t2 === 403 && t3 === 403 && denied >= 1);

console.log("\n=== ADMINISTRATION (suite) ===");
// 8. Configurer le bulletin
await admin.goto(`${base}/bulletins/configuration`);
await admin.getByRole("heading", { name: "Configuration du bulletin" }).waitFor();
await admin.getByRole("button", { name: "Enregistrer la configuration" }).click();
await admin.getByText(/Configuration enregistrée/).waitFor();
ok("8. bulletin configuré");
// 9. Bulletins : calcul, publication, PDF
await admin.goto(`${base}/bulletins?classe=${klass}`);
await admin.getByRole("button", { name: /Calculer|Recalculer/ }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Calculer" }).click();
await admin.waitForTimeout(1000);
await admin.getByRole("button", { name: /Publier/ }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Publier" }).click();
await admin.getByRole("link", { name: "Générer les bulletins de la classe" }).waitFor();
check(await isPdf(admin, await admin.getByRole("link", { name: "Générer les bulletins de la classe" }).getAttribute("href")), "9. bulletins de la classe (PDF)");
const cardHref = await admin.getByRole("link", { name: /Générer le bulletin PDF/ }).first().getAttribute("href");
check(await isPdf(admin, cardHref), "   bulletin individuel (PDF)");
await shot(admin, "final-06-bulletins");
const cards = (await db.query("select count(*)::int n, count(*) filter (where status='published')::int p, avg(average)::numeric(5,2) m from report_cards where class_id=$1", [klass])).rows[0];
scenario(4, `notes → moyennes → bulletins (${cards.n} bulletins, ${cards.p} publiés, moyenne ${cards.m})`, cards.n > 0 && cards.p === cards.n && cards.m !== null);
scenario(6, "bulletin PDF par l'administration → autorisé (classe + individuel)", await isPdf(admin, cardHref));
// 10. Dossier complet PDF
const kofi = (await db.query("select id from students where first_name='Kofi' and last_name='BAMBA'")).rows[0].id;
await admin.goto(`${base}/eleves/${kofi}?onglet=documents`);
const [popup] = await Promise.all([admin.waitForEvent("popup"), admin.getByRole("link", { name: "Certificat de scolarité" }).click()]);
await popup.close();
await admin.getByRole("button", { name: "Générer le dossier complet PDF" }).click();
const dossierHref = await admin.getByRole("dialog").getByRole("link", { name: "Générer le PDF" }).getAttribute("href");
const dossierRes = await admin.request.get(base + dossierHref);
const dossierBytes = await dossierRes.body();
const pages = (dossierBytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
scenario(10, `dossier complet PDF de l'élève (${pages} pages fusionnées)`, dossierRes.status() === 200 && dossierBytes.subarray(0, 5).toString() === "%PDF-" && pages >= 3);
await admin.keyboard.press("Escape");

console.log("\n=== PARENT (avant paiement) ===");
const parentCtx = await browser.newContext(mobile);
const parent = await parentCtx.newPage();
parent.on("pageerror", (e) => problems.push(`[parent] pageerror: ${e.message}`));
await parent.goto(`${base}/connexion`);
await parent.getByRole("button", { name: "Parent / Tuteur" }).click();
await parent.getByLabel("Numéro de téléphone").fill("+2250700000001");
await parent.getByLabel("Nom", { exact: true }).fill("BAMBA");
await parent.getByLabel("Prénom").fill("Adjoua");
await parent.getByRole("button", { name: "Recevoir un code par SMS" }).click();
// Saisie case par case : validation automatique au 6e chiffre.
await parent.getByLabel("Chiffre 1 sur 6").click();
await parent.keyboard.type("123456");
await parent.waitForURL(/\/portail$/);
ok("parent connecté (téléphone + nom + prénom + OTP)");
check((await parent.getByRole("radio").count()) === 2, "parent : ses 2 enfants");
if ((await parent.getByRole("radio", { name: /Kofi/ }).getAttribute("aria-checked")) !== "true") {
  await parent.getByRole("radio", { name: /Kofi/ }).click();
  await parent.getByRole("radio", { name: /Kofi/, checked: true }).waitFor();
}
check(await seen(parent.getByText("Accès partiellement restreint pour impayé")), "parent : restriction pour impayé affichée");
await parent.goto(`${base}/portail/annonces`);
const unpaidNotif = (await parent.getByText(/échéance|impayé|Facture/i).count()) > 0;
check(unpaidNotif, "parent : notifications d'impayé / facture");
await parent.goto(`${base}/portail/presences`);
check(await seen(parent.getByText("Anglais").first()), "parent : absence du cours d'anglais visible (présences jamais restreintes)");
await shot(parent, "final-07-parent-presences");
await parent.goto(`${base}/portail/notes`);
const gradesSuspended = await seen(parent.getByText("Notes : accès temporairement suspendu"));
check(gradesSuspended, "parent : notes suspendues (aucune suppression)");
scenario(7, "parent : impayé → notification → restriction (présences toujours visibles)", unpaidNotif && gradesSuspended);

console.log("\n=== ADMINISTRATION : paiement, dépense, cycle de vie ===");
const acc = await staffLogin("comptable@demo.neoscol.app");
const inv = (await db.query("select id from invoices where student_id=$1 and status='issued' order by issued_on limit 1", [kofi])).rows[0].id;
await acc.goto(`${base}/finances/factures/${inv}`);
await acc.getByRole("button", { name: "Enregistrer un paiement" }).click();
dlg = acc.getByRole("dialog");
await dlg.getByLabel("Montant *").fill("97000");
await dlg.getByLabel("Mode de paiement *").selectOption("mobile_money");
await dlg.getByLabel(/Référence/).fill("MM-FINAL-01");
await dlg.getByRole("button", { name: "Valider le paiement" }).click();
await dlg.getByRole("link", { name: "Imprimer le reçu" }).waitFor();
check(await isPdf(acc, await dlg.getByRole("link", { name: "Imprimer le reçu" }).getAttribute("href")), "11. paiement enregistré, reçu PDF");
await acc.goto(`${base}/finances?onglet=depenses`);
await acc.getByRole("button", { name: "Nouvelle dépense" }).click();
dlg = acc.getByRole("dialog");
await dlg.getByLabel("Libellé *").fill("Achat de craies et marqueurs");
await dlg.getByLabel("Montant *").fill("18500");
await dlg.getByLabel("Fournisseur").fill("Librairie Démo");
await dlg.locator("#e-file").setInputFiles(`${out}/j.png`);
await dlg.getByRole("button", { name: "Ajouter la dépense" }).click();
await dlg.waitFor({ state: "detached" });
await acc.getByText("Achat de craies et marqueurs").first().waitFor({ state: "attached" });
const exp = (await db.query("select receipt_file_id as file_id from expenses where label='Achat de craies et marqueurs'")).rows[0];
check(Boolean(exp?.file_id), "12. dépense enregistrée avec justificatif");
const expRow = (await db.query("select id, number from expenses where label='Achat de craies et marqueurs'")).rows[0];
await acc.getByRole("button", { name: `Modifier ${expRow.number}` }).click();
dlg = acc.getByRole("dialog");
await dlg.getByLabel("Montant *").fill("19750");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const expAfter = (await db.query("select amount from expenses where id=$1", [expRow.id])).rows[0];
const expAudit = (await db.query("select action from audit_logs where entity_id=$1 order by created_at", [expRow.id])).rows.map((r) => r.action);
scenario(9, `dépense : création → modification (${expAfter.amount}) → audit [${expAudit.join(", ")}]`, Number(expAfter.amount) === 19750 && expAudit.some((a) => /insert|create/.test(a)) && expAudit.some((a) => /update/.test(a)));
await shot(acc, "final-08-depenses");
// Retrait d'un élève + archivage d'un autre
const others = (await db.query("select id, first_name from students where organization_id='10000000-0000-4000-a000-000000000001' and first_name not in ('Kofi','Aya') and archived_at is null and status='active' order by matricule limit 2")).rows;
await admin.goto(`${base}/eleves/${others[0].id}`);
await admin.getByRole("button", { name: "Statut" }).click();
dlg = admin.getByRole("dialog");
await dlg.getByLabel("Nouveau statut").selectOption("withdrawn");
await dlg.getByLabel("Motif").fill("Déménagement de la famille");
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await dlg.waitFor({ state: "detached" });
const st = (await db.query("select status, status_reason from students where id=$1", [others[0].id])).rows[0];
check(st.status === "withdrawn" && st.status_reason === "Déménagement de la famille", `13. élève retiré avec motif (${others[0].first_name})`);
await admin.goto(`${base}/eleves/${others[1].id}`);
await admin.getByRole("button", { name: "Archiver" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Archiver" }).click();
await admin.getByText("Dossier archivé").waitFor();
ok(`    élève archivé (${others[1].first_name}), dossier conservé`);

console.log("\n=== PARENT (après paiement) ===");
await parent.goto(`${base}/portail`);
await parent.waitForLoadState("networkidle");
const unlockedNow = !(await parent.getByText("Accès partiellement restreint pour impayé").isVisible());
await parent.goto(`${base}/portail/notes`);
const gradeVisible = await seen(parent.getByText("Devoir d'anglais n°1"));
scenario(8, "paiement → déblocage immédiat (restriction levée, notes visibles)", unlockedNow && gradeVisible);
await shot(parent, "final-09-parent-notes");

console.log("\n=== ÉLÈVE ===");
const stuCtx = await browser.newContext(mobile);
const stu = await stuCtx.newPage();
stu.on("pageerror", (e) => problems.push(`[élève] pageerror: ${e.message}`));
await stu.goto(`${base}/connexion`);
await stu.getByRole("button", { name: "Élève / Apprenant" }).click();
await stu.getByLabel("Matricule").fill("DEMO-26-00001");
await stu.getByLabel("Date de naissance").fill("2014-03-12");
await stu.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
await stu.getByRole("button", { name: "Accéder à mon espace" }).click();
await stu.waitForURL(/\/portail$/);
ok("élève connecté (matricule + date de naissance + mot de passe)");
await stu.goto(`${base}/portail/emploi-du-temps`);
check(await seen(stu.getByText("Fatoumata DIALLO").first()), "élève : emploi du temps avec la nouvelle professeure");
await stu.goto(`${base}/portail/presences`);
check(await seen(stu.getByText("Anglais").first()), "élève : présences");
await stu.goto(`${base}/portail/notes`);
check(await seen(stu.getByText("Devoir d'anglais n°1")), "élève : notes");
await stu.goto(`${base}/portail/notes?onglet=bulletins`);
const bullHref = await stu.getByRole("link", { name: /Télécharger/ }).first().getAttribute("href");
check(await isPdf(stu, bullHref), "élève : bulletin publié téléchargeable");
await stu.goto(`${base}/portail/documents`);
check((await stu.getByRole("link", { name: "PDF" }).count()) > 0, "élève : documents autorisés");
await shot(stu, "final-10-eleve-documents");
check((await stu.goto(`${base}/eleves`)).status() === 404, "élève : administration inaccessible");

console.log("\n=== SCÉNARIO 11 : établissement A → accès à B refusé ===");
const other = await staffLogin("formation@demo.neoscol.app");
const r1 = (await other.goto(`${base}/eleves/${kofi}`)).status();
const r2 = (await other.request.get(`${base}/api/documents/certificats/${kofi}`)).status();
const r3 = (await other.request.get(`${base}/api/documents/dossiers/${kofi}`)).status();
const r4 = (await other.request.get(`${base}/api/documents/factures/${inv}`)).status();
const r5 = (await newAdmin.goto(`${base}/eleves/${kofi}`)).status();
const r6 = (await newAdmin.request.get(`${base}/api/rapports/finances`)).status();
const leak = (await newAdmin.goto(`${base}/eleves?q=BAMBA`)) && (await newAdmin.getByText("Kofi").count());
scenario(11, `établissement B → dossier, certificat, dossier PDF, facture de A refusés (${r1}/${r2}/${r3}/${r4}/${r5}) ; recherche vide`, [r1, r5].every((c) => c === 404) && [r2, r3, r4].every((c) => c === 403 || c === 404) && leak === 0 && r6 !== 500);

console.log("\n=== SCÉNARIO 12 : élève archivé → portail désactivé, historique conservé ===");
await admin.goto(`${base}/eleves/${kofi}`);
await admin.getByRole("button", { name: "Archiver" }).click();
await admin.getByRole("dialog").getByRole("button", { name: "Archiver" }).click();
await admin.getByText("Dossier archivé").waitFor();
await stu.goto(`${base}/portail`);
const stuBlocked = !stu.url().endsWith("/portail") || (await stu.getByText(/désactivé|indisponible|archivé|aucun élève/i).count()) > 0;
const stu2Ctx = await browser.newContext(mobile);
const stu2 = await stu2Ctx.newPage();
await stu2.goto(`${base}/connexion`);
await stu2.getByRole("button", { name: "Élève / Apprenant" }).click();
await stu2.getByLabel("Matricule").fill("DEMO-26-00001");
await stu2.getByLabel("Date de naissance").fill("2014-03-12");
await stu2.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
await stu2.getByRole("button", { name: "Accéder à mon espace" }).click();
await stu2.waitForTimeout(3000);
const loginRefused = !/\/portail$/.test(stu2.url());
await shot(stu2, "audit-12-eleve-archive");
await parent.goto(`${base}/portail`);
const parentChildren = await parent.getByRole("radio").count();
await admin.goto(`${base}/eleves/${kofi}?onglet=notes`);
const historyKept = await seen(admin.getByText("Devoir d'anglais n°1").first());
const paymentsKept = (await db.query("select count(*)::int n from payments where student_id=$1", [kofi])).rows[0].n;
scenario(12, `élève archivé : portail élève désactivé (${stuBlocked && loginRefused ? "oui" : "non"}), parent ne le voit plus (${parentChildren === 0 ? "sélecteur masqué : un seul enfant" : `${parentChildren} enfants`}), notes et ${paymentsKept} paiements conservés`, stuBlocked && loginRefused && parentChildren <= 1 && historyKept && paymentsKept > 0);

console.log("\n=== AUDIT ===");
await admin.goto(`${base}/audit?resultat=denied`);
check((await admin.locator("tbody tr").count()) >= 1, "journal d'audit : refus tracés (utilisateur, rôle, action, date, résultat)");
await shot(admin, "final-11-audit");
const audit = (await db.query("select count(*)::int n from audit_logs where action in ('staff_badges.insert','payments.insert','expenses.insert','students.update','settings.updated') or action like 'badge%'")).rows[0].n;
check(audit >= 4, `actions sensibles journalisées (${audit})`);

await browser.close();
await db.end();
console.log("\n=== SYNTHÈSE DES 12 SCÉNARIOS ===");
for (let i = 1; i <= 12; i++) console.log(`${String(i).padStart(2)}. ${scenarios[i] ? (scenarios[i].pass ? "✅" : "❌") : "—"} ${scenarios[i]?.label ?? "non exécuté"}`);
writeFileSync(`${out}/audit-scenarios.json`, JSON.stringify(scenarios, null, 2));
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nAUDIT E2E : TOUT EST OK");
process.exitCode = problems.length ? 1 : 0;
