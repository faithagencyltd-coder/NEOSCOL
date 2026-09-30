// MODULE 3 — UNIVERSITÉ / ENSEIGNEMENT SUPÉRIEUR : parcours navigateur complet.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/universite.mjs
//
// Parcours obligatoires :
//  - ÉTUDIANT : création → inscription administrative (filière, niveau, année) → inscription
//    pédagogique (UE du semestre) → cours → badge → QR → scan → présence → évaluation → note
//    → crédits → résultat ;
//  - ENSEIGNANT : ses enseignements, son badge (ENSEIGNANT PRÉSENT), saisie des notes et du rattrapage ;
//  - FINANCE : frais universitaires → facture en tranches → paiement → reçu → reliquat ;
//  - ACADÉMIQUE : notes → moyenne → crédits → rattrapage → délibération → résultat → relevé → diplôme ;
//  - SÉPARATION DES MODULES et SÉCURITÉ (permissions, multi-établissement, accès étudiant).
// Rejouable : chaque passage crée ses propres données (codes uniques).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-universite";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const shot = async (page, name) => {
  const [scroll, width] = await page.evaluate(() => [document.documentElement.scrollWidth, window.visualViewport.width]);
  if (scroll > width + 1) problems.push(`${name} : défilement horizontal (${scroll} > ${width})`);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
};
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
async function login(identifier, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] pageerror: ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|universite|pointage|portail/);
  return page;
}
const nav = async (page) => (await page.locator("nav").allInnerTexts()).join(" ");
const toast = (page, re) => page.getByText(re).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
const dialog = (page) => page.getByRole("dialog");
async function pdfOk(page, url) {
  const res = await page.request.get(url);
  return res.status() === 200 && (res.headers()["content-type"] ?? "").includes("pdf");
}
/** Ouvre une boîte de dialogue, remplit les champs (name → valeur ou {label}), valide. */
async function fillDialog(page, trigger, values, submit = "Enregistrer") {
  await trigger.click();
  const d = dialog(page);
  for (const [name, value] of Object.entries(values)) {
    const field = d.locator(`[name="${name}"]`);
    const tag = await field.evaluate((el) => el.tagName.toLowerCase());
    if (tag === "select") await field.selectOption(typeof value === "object" ? value : { value: String(value) });
    else if ((await field.getAttribute("type")) === "checkbox") await (value ? field.check() : field.uncheck());
    else await field.fill(String(value));
  }
  await d.getByRole("button", { name: submit, exact: true }).click();
}

const run = Date.now().toString(36).slice(-5).toUpperCase();
const ORG = await q1("select id, timezone from organizations where code = 'DEMOU'");
const local = await q1(
  "select to_char(now() at time zone $1, 'YYYY-MM-DD') d, extract(isodow from now() at time zone $1)::int wd, to_char((now() at time zone $1) - interval '3 minutes', 'HH24:MI') s, to_char(least((now() at time zone $1) + interval '80 minutes', (now() at time zone $1)::date + time '23:59'), 'HH24:MI') e",
  [ORG.timezone],
);
const S1 = await q1("select p.id from academic_periods p join academic_years y on y.id = p.academic_year_id where p.organization_id = $1 and y.is_current and p.sequence = 1", [ORG.id]);

const admin = await login("universite@demo.neoscol.app");

console.log("\n=== Menu universitaire et séparation des modules ===");
check(await admin.waitForURL(/\/universite/, { timeout: 20000 }).then(() => true, () => false), "administrateur : tableau de bord universitaire");
const menu = await nav(admin);
for (const item of ["Tableau de bord universitaire", "Facultés / Écoles", "Départements", "Filières", "UE / Matières", "Inscription administrative", "Résultats et crédits", "Délibérations", "Mémoires / thèses", "Soutenances", "Diplômes", "Paramètres universitaires"]) {
  check(menu.includes(item), `menu université : « ${item} »`);
}
for (const item of ["Bulletins", "Inscrire un apprenant", "Formations", "Séries", "Compétences"]) {
  check(!menu.includes(item), `menu université : pas de « ${item} » (Modules 1 et 2)`);
}
await shot(admin, "01-tableau-de-bord");

console.log("\n=== Structure : faculté → département → filière → promotion ===");
await admin.goto(`${base}/universite/structure?onglet=facultes`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouvelle faculté / école" }), { name: `Faculté des Sciences appliquées ${run}`, code: `FSA${run}` });
check(await toast(admin, /Faculté \/ école créé/), "faculté créée");
await admin.goto(`${base}/universite/structure?onglet=departements`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouveau département" }), { name: `Département Réseaux ${run}`, code: `DR${run}`, faculty_id: { label: `Faculté des Sciences appliquées ${run}` } });
check(await toast(admin, /Département créé/), "département créé (rattaché à la faculté)");
await admin.goto(`${base}/universite/structure?onglet=filieres`);
await fillDialog(
  admin,
  admin.getByRole("button", { name: "Nouvelle filière" }),
  {
    name: `Licence Réseaux ${run}`,
    code: `LR${run}`,
    degree_title: "Licence en Réseaux et Télécommunications",
    department_id: { label: `Département Réseaux ${run} (FSA${run})` },
    duration_years: 3,
    admission_conditions: "Baccalauréat C, D ou E",
  },
  "Créer la filière",
);
check(await toast(admin, /Filière créé/), "filière créée (département, diplôme préparé, durée, conditions d'admission)");
const program = await q1("select id, faculty_id, department_id from programs where code = $1", [`LR${run}`]);
check(Boolean(program?.faculty_id && program?.department_id), "filière : faculté déduite du département");
await admin.goto(`${base}/universite/filieres/${program.id}`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouvelle promotion" }), { name: `L1 Réseaux ${run}`, level_id: { label: "Licence 1" }, capacity: 40 });
check(await toast(admin, /Promotion créée/), "promotion créée (filière · niveau · année académique)");
const klass = await q1("select id, academic_year_id from classes where name = $1", [`L1 Réseaux ${run}`]);

console.log("\n=== Salle, UE, matière, enseignant ===");
await admin.goto(`${base}/universite/salles`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouvelle salle" }), { name: `Salle réseau ${run}`, room_type: "labo", capacity: 30, equipment: "Baies de brassage, 30 postes" });
check(await toast(admin, /Salle créé/), "salle créée (type, capacité, équipements)");
const room = await q1("select id from rooms where name = $1", [`Salle réseau ${run}`]);
await admin.goto(`${base}/universite/ue?filiere=${program.id}`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouvelle UE" }), {
  code: `UR${run}`,
  name: `Réseaux fondamentaux ${run}`,
  level_id: { label: "Licence 1" },
  semester_no: 1,
  credits: 6,
  coefficient: 2,
});
check(await toast(admin, /UE créé/), "UE créée (crédits, coefficient, semestre, niveau)");
await admin.reload();
await fillDialog(admin, admin.getByRole("button", { name: "Ajouter une matière" }), { code: `RX${run}`, name: `Protocoles TCP/IP ${run}`, credits: 6, coefficient: 1, hours_cm: 20, hours_td: 10, hours_tp: 12, type_cm: true, type_td: true, type_tp: true });
check(await toast(admin, /Matière ajoutée/), "matière ajoutée (volumes CM/TD/TP, types d'enseignement)");
await admin.reload();
await fillDialog(admin, admin.getByRole("button", { name: `Affecter Protocoles TCP/IP ${run}` }), {
  class_id: { label: `L1 Réseaux ${run}` },
  teacher_id: { label: "KOUAKOU Clément (Maître de conférences)" },
});
check(await toast(admin, /Matière affectée/), "matière affectée à la promotion et à l'enseignant");
const course = await q1("select cs.id, cs.subject_id, cs.teacher_id from class_subjects cs join subjects s on s.id = cs.subject_id where s.code = $1", [`RX${run}`]);
// Cours du jour (salle dédiée, sans chevauchement) et frais de la filière en 3 tranches.
await db.query(
  "insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, room_id, weekday, starts_at, ends_at, session_type) values ($1, $2, $3, $4, $5, $6, $7, $8, 'cm')",
  [ORG.id, klass.academic_year_id, klass.id, course.id, room.id, local.wd, local.s, local.e],
);
const feeType = await q1("select id from fee_types where organization_id = $1 and code = 'SCOL'", [ORG.id]);
await db.query(
  `insert into fee_rates (organization_id, academic_year_id, fee_type_id, program_id, amount, is_mandatory, installment_plan)
   values ($1, $2, $3, $4, 300000, true, jsonb_build_array(jsonb_build_object('label', '1re tranche', 'percent', 50, 'due_on', current_date + 10), jsonb_build_object('label', '2e tranche', 'percent', 30, 'due_on', current_date + 60), jsonb_build_object('label', '3e tranche', 'percent', 20, 'due_on', current_date + 120)))`,
  [ORG.id, klass.academic_year_id, feeType.id, program.id],
);

console.log("\n=== Parcours ÉTUDIANT : inscription administrative + pédagogique ===");
await admin.goto(`${base}/universite/inscription?promotion=${klass.id}`);
await admin.locator("#last_name").fill(`ETUD${run}`);
await admin.locator("#first_name").fill("Awa");
await admin.locator("#sex").selectOption("F");
await admin.locator("#birth_date").fill("2005-04-12");
await admin.locator("#nationality").fill("Ivoirienne");
check((await admin.locator("main").innerText()).replace(/\s/g, "").includes("300000"), "frais de la filière affichés avant validation");
await shot(admin, "02-inscription");
await admin.getByRole("button", { name: "Valider l'inscription" }).click();
check(await toast(admin, /Inscription validée : 1 UE inscrite/), "inscription validée : 1 UE inscrite automatiquement");
const student = await q1("select s.id, s.matricule, e.id as enrollment_id, e.program_id, e.level_id from students s join enrollments e on e.student_id = s.id where s.last_name = $1", [`ETUD${run}`]);
check(/^DEMOU-\d{2}-\d{5}$/.test(student?.matricule ?? ""), `matricule unique attribué (${student?.matricule})`);
check(student.program_id === program.id, "inscription administrative : filière, niveau et année de la promotion");
const reg = await q1("select count(*)::int n from course_registrations where enrollment_id = $1 and status = 'registered'", [student.enrollment_id]);
check(reg.n === 1, "inscription pédagogique séparée : UE du semestre inscrite");
const invoice = await q1("select i.id, i.total, (select count(*)::int from installments where invoice_id = i.id) n from invoices i where i.student_id = $1", [student.id]);
check(Number(invoice?.total) === 300000 && invoice.n === 3, "facture 300 000 en 3 tranches (échéancier)");
const invoiceHref = await admin.getByRole("link", { name: "Facture et échéancier" }).getAttribute("href");
check(await pdfOk(admin, `${base}${invoiceHref}`), "facture + échéancier PDF");

console.log("\n=== Dossier académique, badge ===");
await admin.goto(`${base}/eleves/${student.id}?onglet=pedagogique`);
check(await admin.getByText(`Réseaux fondamentaux ${run}`).first().isVisible(), "onglet Inscription pédagogique : UE listée");
await admin.goto(`${base}/eleves/${student.id}?onglet=universite`);
check(await admin.getByText(`Licence Réseaux ${run}`).first().isVisible(), "dossier académique permanent : filière de l'année");
await admin.goto(`${base}/eleves/${student.id}?onglet=badge`);
await admin.getByRole("button", { name: "Générer la carte" }).click();
check(await toast(admin, /Carte générée/), "carte étudiant générée");
await admin.reload();
const cardText = await admin.locator("main").innerText();
check(cardText.includes("CARTE ÉTUDIANT") && cardText.includes("Actif à la tablette") && /ETU-DEMOU-\d{2}-\d{5}/.test(cardText), "carte 3D étudiant et QR actif dans le dossier (onglet Badge & QR)");
check(await pdfOk(admin, `${base}/api/cartes/${student.id}/pdf`), "carte étudiant imprimable (PDF recto / verso)");
check(await pdfOk(admin, `${base}/api/documents/badges-apprenants/${student.id}`), "badge étudiant imprimable depuis la liste (PDF)");
const token = (await q1("select token from student_badges where student_id = $1 and status = 'active'", [student.id])).token;

console.log("\n=== Tablette « SCANNER VOTRE BADGE » ===");
const kiosk = await login("pointage.universite@demo.neoscol.app", { width: 1280, height: 800 });
await kiosk.waitForURL(/pointage/);
check(await kiosk.getByRole("heading", { name: "SCANNER VOTRE BADGE" }).isVisible(), "écran « SCANNER VOTRE BADGE »");
let lastScanAt = 0;
const scan = async (code) => {
  const wait = 4300 - (Date.now() - lastScanAt);
  if (wait > 0) await kiosk.waitForTimeout(wait);
  const panel = kiosk.locator("main [aria-live=assertive]");
  const before = Number(await panel.getAttribute("data-scan-count"));
  await kiosk.getByLabel("Code du badge").fill(code);
  await kiosk.getByRole("button", { name: "Valider" }).click();
  await kiosk.waitForFunction((n) => Number(document.querySelector("main [aria-live=assertive]")?.getAttribute("data-scan-count")) > n, before, { timeout: 15000 });
  lastScanAt = Date.now();
  await kiosk.waitForTimeout(300);
  return panel.innerText();
};
const ageScans = () => db.query("update badge_scans set scanned_at = scanned_at - interval '5 minutes' where organization_id = $1", [ORG.id]);
let text = await scan(`NEOSCOL-BADGE:${token}`);
check(/ÉTUDIANT/.test(text) && /ENTRÉE ENREGISTRÉE/i.test(text), "étudiant reconnu automatiquement : ÉTUDIANT — ENTRÉE");
check(/À L'HEURE/.test(text), "statut À L'HEURE");
check(text.includes(`Licence Réseaux ${run}`) && /Licence 1/.test(text) && text.includes(`Protocoles TCP/IP ${run}`), "contexte : filière, niveau, cours");
await shot(kiosk, "03-scan-etudiant");
text = await scan(token);
check(/Scan déjà enregistré/i.test(text), "anti double scan");
await ageScans();
text = await scan(token);
check(/SORTIE ANTICIPÉE/.test(text), "sortie avant la fin du cours : SORTIE ANTICIPÉE");
await ageScans();
const presence = await q1("select count(*)::int n from learner_attendance where student_id = $1", [student.id]);
check(presence.n >= 1, "présence enregistrée (entrée / sortie)");
const teacherToken = (await q1("select b.token from staff_badges b join staff_members s on s.id = b.staff_id where s.email = 'professeur@demo.neoscol.app' and b.status = 'active'"))?.token;
if (teacherToken) {
  await db.query("delete from staff_attendance where staff_id = (select id from staff_members where email = 'professeur@demo.neoscol.app') and work_date = (now() at time zone $1)::date", [ORG.timezone]);
  text = await scan(`NEOSCOL-BADGE:${teacherToken}`);
  check(/ENSEIGNANT/.test(text) && /ENSEIGNANT PRÉSENT/.test(text), "enseignant reconnu : ENSEIGNANT PRÉSENT");
  await shot(kiosk, "04-scan-enseignant");
  await ageScans();
} else {
  check(false, "badge de l'enseignant de démonstration introuvable");
}
text = await scan("NEOSCOL-BADGE:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
check(/QR invalide/i.test(text), "QR invalide refusé");
const otherToken = (await q1("select b.token from staff_badges b join organizations o on o.id = b.organization_id where o.code = 'DEMO' and b.status = 'active' limit 1")).token;
text = await scan(otherToken);
check(/autre établissement/i.test(text), "badge d'un autre établissement refusé");
// Badge perdu : remplacé, l'ancien ne scanne plus.
await admin.goto(`${base}/universite/badges?q=ETUD${run}`);
await admin.getByRole("button", { name: "Remplacer" }).click();
await dialog(admin).locator("[name=reason]").fill("Badge perdu");
await dialog(admin).getByRole("button", { name: "Désactiver et remplacer" }).click();
check(await toast(admin, /nouveau badge et nouveau QR générés/), "badge perdu : désactivé, nouveau QR (historique conservé)");
text = await scan(token);
check(/désactivé/i.test(text), "ancien badge refusé");
await admin.goto(`${base}/universite/presences`);
check(await admin.getByText(`ETUD${run} Awa`).first().isVisible(), "journal des présences : entrée / sortie de l'étudiant");
check(await admin.getByText("Sortie anticipée").first().isVisible(), "journal : sortie anticipée signalée");

console.log("\n=== Parcours ENSEIGNANT : ses enseignements, évaluations, notes ===");
const prof = await login("professeur@demo.neoscol.app");
await prof.goto(`${base}/universite/mes-enseignements`);
check(await prof.getByText(`Protocoles TCP/IP ${run}`).first().isVisible(), "portail enseignant : matière affectée visible");
check((await prof.goto(`${base}/universite/diplomes`))?.status() === 404, "enseignant : diplômes inaccessibles (404)");
check((await prof.goto(`${base}/universite/parametres`))?.status() === 404, "enseignant : paramètres inaccessibles (404)");
async function evaluate(title, kind, coefficient, score) {
  await prof.goto(`${base}/notes/${course.id}`);
  await fillDialog(prof, prof.getByRole("button", { name: "Nouvelle évaluation" }), { title, kind, coefficient }, "Créer et saisir les notes");
  await prof.waitForURL(/notes\/evaluations\//);
  await prof.getByLabel(`Note de Awa ETUD${run}`).fill(String(score));
  await prof.getByRole("button", { name: "Enregistrer les notes" }).click();
  return toast(prof, /note\(s\) enregistrée/);
}
check(await evaluate("Contrôle continu 1", "continuous", 1, 7), "contrôle continu saisi (7/20)");
check(await evaluate("Examen du semestre 1", "exam", 2, 8), "examen saisi (8/20)");

console.log("\n=== Parcours ACADÉMIQUE : moyenne → crédits → rattrapage → délibération ===");
const compute = async () => {
  await admin.goto(`${base}/universite/resultats?promotion=${klass.id}&semestre=${S1.id}`);
  await admin.getByRole("button", { name: "Calculer les résultats" }).click();
  await dialog(admin).getByRole("button", { name: "Calculer", exact: true }).click();
  return toast(admin, /Résultats calculés pour 1 étudiant/);
};
check(await compute(), "résultats calculés (moyennes matière, UE, semestre)");
let ue = await q1("select session1_average, average, credits_earned, status from ue_results where enrollment_id = $1", [student.enrollment_id]);
check(Number(ue.average) === 7.67 && ue.status === "failed" && Number(ue.credits_earned) === 0, "UE non validée : moyenne 7,67 (CC ×1, examen ×2), 0 crédit");
let sem = await q1("select validated, retake_needed from semester_results where enrollment_id = $1", [student.enrollment_id]);
check(!sem.validated && sem.retake_needed, "semestre non validé : autorisé(e) au rattrapage");
await admin.goto(`${base}/universite/resultats?promotion=${klass.id}&semestre=${S1.id}&onglet=rattrapage`);
check(await admin.getByText(`ETUD${run} Awa`).first().isVisible(), "onglet Rattrapage : UE à rattraper listée");
check(await evaluate("Rattrapage", "retake", 1, 14), "enseignant : note de rattrapage saisie (14/20)");
check(await compute(), "résultats recalculés après rattrapage");
ue = await q1("select session1_average, retake_average, average, credits_earned, status from ue_results where enrollment_id = $1", [student.enrollment_id]);
check(Number(ue.session1_average) === 7.67 && Number(ue.retake_average) === 14 && Number(ue.average) === 14, "note initiale conservée ; règle « meilleure note » : 14");
check(ue.status === "validated" && Number(ue.credits_earned) === 6, "UE validée : 6 crédits capitalisés");
await shot(admin, "05-resultats");

await admin.goto(`${base}/universite/deliberations`);
await fillDialog(
  admin,
  admin.getByRole("button", { name: "Nouvelle délibération" }),
  { title: `Jury rattrapage ${run}`, class_id: { label: `L1 Réseaux ${run}` }, academic_period_id: S1.id, session: "retake", president: "Pr Rachelle ADJOBI", members: "Dr Clément KOUAKOU\nM. Désiré N'DRI" },
);
check(await toast(admin, /Délibération ouverte/), "délibération ouverte (décisions proposées)");
const delib = await q1("select id from deliberations where title = $1", [`Jury rattrapage ${run}`]);
await admin.goto(`${base}/universite/deliberations/${delib.id}`);
await fillDialog(admin, admin.getByRole("button", { name: "Décider" }), { decision: { label: "Admis(e) par compensation" }, comment: "Premier choix du jury" }, "Enregistrer la décision");
check(await toast(admin, /Décision du jury enregistrée/), "décision du jury enregistrée");
await admin.reload();
await fillDialog(admin, admin.getByRole("button", { name: "Décider" }), { decision: { label: "Admis(e)" }, comment: "Rattrapage réussi" }, "Enregistrer la décision");
check(await toast(admin, /Décision du jury enregistrée/), "décision modifiée");
await admin.reload();
const versions = await q1("select count(*)::int n, count(*) filter (where is_current)::int c from deliberation_decisions where deliberation_id = $1 and student_id = $2", [delib.id, student.id]);
check(versions.n >= 3 && versions.c === 1, "historique des décisions : chaque version conservée, une seule courante");
check(await admin.getByRole("cell", { name: "Admis(e) par compensation" }).first().isVisible(), "historique affiché : décision précédente");
check(await pdfOk(admin, `${base}/api/documents/universite/pv/${delib.id}`), "procès-verbal provisoire (PDF)");
await admin.getByRole("button", { name: "Clôturer et publier" }).click();
await dialog(admin).getByRole("button", { name: "Clôturer", exact: true }).click();
check(await toast(admin, /Délibération close/), "délibération close : résultats publiés");
sem = await q1("select validated, decision, published_at is not null as published from semester_results where enrollment_id = $1", [student.enrollment_id]);
check(sem.published && sem.decision === "Admis(e)", "résultat publié avec la décision du jury");
check(await pdfOk(admin, `${base}/api/documents/universite/pv/${delib.id}`), "procès-verbal définitif numéroté (PDF)");
await shot(admin, "06-deliberation");

console.log("\n=== Relevé, stage, mémoire, soutenance, diplôme ===");
await admin.goto(`${base}/eleves/${student.id}?onglet=resultats`);
check(await admin.locator("main table").getByText(`Réseaux fondamentaux ${run}`).first().isVisible(), "dossier : résultats et crédits");
check(await pdfOk(admin, `${base}/api/documents/universite/releve/${student.id}?semestre=${S1.id}`), "relevé de notes LMD (PDF numéroté)");
for (const [type, label, motif] of [
  ["school_certificate", "certificat de scolarité", ""],
  ["enrollment_certificate", "attestation d'inscription", ""],
  ["success_certificate", "attestation de réussite", "&motif=Semestre%201%20valid%C3%A9"],
  ["internship_certificate", "attestation de stage", "&motif=Stage%20du%201er%20au%2030%20juin"],
]) {
  check(await pdfOk(admin, `${base}/api/documents/certificats/${student.id}?type=${type}${motif}`), `document : ${label}`);
}
check(await pdfOk(admin, `${base}/api/documents/cartes/${student.id}`), "document : carte étudiant");
const studentLabel = `ETUD${run} Awa — ${student.matricule}`;
await admin.goto(`${base}/universite/stages`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouveau stage" }), { student_id: { label: studentLabel }, company_name: `Orange CI ${run}`, tutor_name: "M. Yao", starts_on: local.d, ends_on: "2027-08-31", status: "ongoing" });
check(await toast(admin, /Stage enregistré/), "stage enregistré (structure, tuteur, dates)");
await admin.goto(`${base}/universite/memoires`);
await fillDialog(admin, admin.getByRole("button", { name: "Nouveau sujet" }), { student_id: { label: studentLabel }, title: `Sécurité des réseaux ${run}`, director_id: { label: "KOUAKOU Clément (Maître de conférences)" }, status: "approved" });
check(await toast(admin, /Sujet enregistré/), "mémoire : sujet et directeur");
await admin.goto(`${base}/universite/soutenances`);
await fillDialog(admin, admin.getByRole("button", { name: "Programmer" }), { student_id: { label: studentLabel }, title: `Soutenance ${run}`, date: "2027-06-15", time: "10:00", jury: "Pr Rachelle ADJOBI — Présidente\nDr Clément KOUAKOU — Directeur" });
check(await toast(admin, /Soutenance programmée/), "soutenance programmée (date, jury)");
await admin.goto(`${base}/universite/diplomes`);
await fillDialog(admin, admin.getByRole("button", { name: "Délivrer un diplôme" }), { student_id: { label: studentLabel }, title: "Licence en Réseaux et Télécommunications", program_id: { label: `Licence Réseaux ${run}` }, mention: "Bien" });
check(await toast(admin, /Diplôme délivré/), "diplôme délivré");
const diploma = await q1("select id, number from student_diplomas where student_id = $1", [student.id]);
check(/^DIP-DEMOU-\d{2}-\d{5}$/.test(diploma?.number ?? ""), `numéro de diplôme automatique (${diploma?.number})`);
check(await pdfOk(admin, `${base}/api/documents/universite/diplome/${diploma.id}`), "diplôme PDF (vérifiable par QR)");
await admin.reload();
await admin.getByRole("button", { name: "Révoquer" }).first().click();
await dialog(admin).locator("[name=reason]").fill("Erreur de saisie");
await dialog(admin).getByRole("button", { name: "Révoquer", exact: true }).click();
check(await toast(admin, /Diplôme révoqué/), "diplôme révoqué (historique conservé)");
const issued = await q1("select status from issued_documents where subject_type = 'diploma' and subject_id = $1", [diploma.id]);
check(issued?.status === "revoked", "diplôme révoqué : vérification en ligne « révoqué »");

console.log("\n=== Parcours FINANCE : paiement, reçu, reliquat ===");
await admin.goto(`${base}/finances/factures/${invoice.id}`);
await admin.getByRole("button", { name: "Enregistrer un paiement" }).click();
await dialog(admin).locator("#p-amount").fill("150000");
await dialog(admin).locator("#p-method").selectOption("mobile_money");
await dialog(admin).getByRole("button", { name: "Valider le paiement" }).click();
check(await toast(admin, /Paiement .* enregistré/), "paiement de la 1re tranche enregistré");
const pay = await q1("select p.id, b.balance from payments p join invoice_balances b on b.invoice_id = p.invoice_id where p.invoice_id = $1", [invoice.id]);
check(Number(pay.balance) === 150000, "reliquat : 150 000 restant");
check(await pdfOk(admin, `${base}/api/documents/recus/${pay.id}`), "reçu PDF");
await admin.goto(`${base}/universite/statistiques`);
check(await admin.locator("main").getByText("Reliquats", { exact: true }).isVisible(), "statistiques : reliquats universitaires");
check(await admin.locator("main").getByText("Taux de réussite", { exact: true }).isVisible(), "statistiques : taux de réussite");

console.log("\n=== Accès ÉTUDIANT (portail) ===");
const etu = await login("etudiant@demo.neoscol.app", { width: 390, height: 844 });
check(await etu.waitForURL(/\/portail/, { timeout: 20000 }).then(() => true, () => false), "étudiant : portail étudiant");
await etu.goto(`${base}/portail/resultats`);
check(await etu.getByText("Semestre 1 — 2026-2027").first().waitFor({ timeout: 15000 }).then(() => true, () => false), "portail : ses résultats publiés");
const etuPage = await etu.locator("main").innerText();
check(!etuPage.includes(`ETUD${run}`) && !etuPage.includes("CISSÉ"), "portail : aucune donnée d'un autre étudiant");
await shot(etu, "07-portail-resultats");
await etu.goto(`${base}/portail/parcours`);
check(await etu.getByText("Parcours universitaire", { exact: true }).waitFor({ timeout: 15000 }).then(() => true, () => false), "portail : parcours universitaire");
check((await etu.goto(`${base}/universite/deliberations`))?.status() === 404, "étudiant : délibérations inaccessibles");
check((await etu.request.get(`${base}/api/documents/universite/releve/${student.id}?semestre=${S1.id}`)).status() !== 200, "étudiant : relevé d'un autre étudiant refusé");

console.log("\n=== Sécurité : rôles et multi-établissement ===");
const registrar = await login("scolarite@demo.neoscol.app");
check((await registrar.goto(`${base}/universite/parametres`))?.status() === 404, "scolarité : paramètres inaccessibles");
check((await registrar.goto(`${base}/universite/diplomes`))?.status() === 200, "scolarité : diplômes accessibles");
const school = await login("admin@demo.neoscol.app");
const schoolMenu = await nav(school);
check(!schoolMenu.includes("Délibérations") && !schoolMenu.includes("UE / Matières"), "Module Scolaire : aucun menu universitaire");
check((await school.goto(`${base}/universite`))?.status() === 404, "Module Scolaire : /universite inaccessible (404)");
check((await school.request.get(`${base}/api/documents/universite/releve/${student.id}?semestre=${S1.id}`)).status() !== 200, "autre établissement : relevé refusé");
check((await school.request.get(`${base}/api/documents/universite/diplome/${diploma.id}`)).status() !== 200, "autre établissement : diplôme refusé");
const training = await login("formation@demo.neoscol.app");
check((await training.goto(`${base}/universite/ue`))?.status() === 404, "Module Formation : /universite inaccessible (404)");
check(!(await nav(training)).includes("Délibérations"), "Module Formation : aucun menu universitaire");
check((await admin.goto(`${base}/formation/formations`))?.status() === 404, "Université : module Formation inaccessible");
check((await admin.goto(`${base}/bulletins`))?.status() === 404 || !(await nav(admin)).includes("Bulletins"), "Université : bulletins scolaires absents");

console.log("\n=== Mobile ===");
const mobile = await login("universite@demo.neoscol.app", { width: 390, height: 844 });
for (const [path, name] of [
  ["/universite", "m-tableau-de-bord"],
  [`/universite/ue?filiere=${program.id}`, "m-ue"],
  [`/universite/resultats?promotion=${klass.id}`, "m-resultats"],
  [`/universite/deliberations/${delib.id}`, "m-deliberation"],
  [`/eleves/${student.id}?onglet=universite`, "m-dossier"],
]) {
  await mobile.goto(`${base}${path}`);
  await shot(mobile, name);
}

await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nTOUT EST OK");
process.exit(problems.length ? 1 : 0);
