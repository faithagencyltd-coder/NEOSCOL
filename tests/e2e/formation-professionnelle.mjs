// MODULE 2 — FORMATION PROFESSIONNELLE : parcours navigateur complet.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres \
//   CHROMIUM_PATH=/chemin/vers/chrome node tests/e2e/formation-professionnelle.mjs
//
// Parcours : formation → module → compétence → session → formateur → emploi du
// temps → inscription (échéancier + versement + reçu) → dossier apprenant
// (formation, assiduité, compétences, badge, stage, pièces, documents) → tablette
// (entrée, double scan, sortie, retard, formateur, badge désactivé, QR invalide,
// autre établissement) → centre AVEC classes (groupes) puis SANS → isolation.
// Rejouable : chaque passage crée ses propres données (codes uniques).
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-formation";
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
  await page.waitForURL(/tableau-de-bord|pointage/);
  return page;
}
const nav = async (page) => (await page.locator("nav").allInnerTexts()).join(" ");
const toast = (page, re) => page.getByText(re).first().waitFor({ timeout: 15000 }).then(() => true, () => false);
/** Remplit un champ d'une boîte de dialogue QuickFormDialog par son libellé. */
const dialog = (page) => page.getByRole("dialog");
async function pdfOk(page, url) {
  const res = await page.request.get(url);
  return res.status() === 200 && (res.headers()["content-type"] ?? "").includes("pdf");
}

const run = Date.now().toString(36).slice(-5).toUpperCase();
const ORG = (await q1("select id, timezone from organizations where code = 'DEMOF'"));
const local = await q1("select to_char(now() at time zone $1, 'YYYY-MM-DD') d, extract(isodow from now() at time zone $1)::int wd, to_char((now() at time zone $1) - interval '3 minutes', 'HH24:MI') s, to_char(least((now() at time zone $1) + interval '80 minutes', (now() at time zone $1)::date + time '23:59'), 'HH24:MI') e", [ORG.timezone]);
const initialTraining = (await q1("select settings->'training' t from organizations where code = 'DEMOF'")).t;

const admin = await login("formation@demo.neoscol.app");

console.log("\n=== Menu et tableau du jour ===");
const menu = await nav(admin);
for (const item of ["Aujourd'hui", "Formations", "Sessions et groupes", "Inscrire un apprenant", "Entrées et sorties", "Badges apprenants", "Statistiques"]) {
  check(menu.includes(item), `menu formation : « ${item} »`);
}
check(!menu.includes("Séries et filières"), "menu : pas d'entrée du Module Scolaire");
await admin.goto(`${base}/formation`);
check(await admin.getByRole("heading", { name: /Formation professionnelle — aujourd'hui/ }).isVisible(), "tableau du jour affiché");
check(await admin.getByText("Attendus").first().isVisible(), "indicateurs apprenants (attendus, présents, absents, retards, sorties)");
check(await admin.getByText("Formateurs du jour").isVisible(), "formateurs du jour");
await shot(admin, "01-aujourdhui");

console.log("\n=== Phase 2 — Formation créée librement ===");
await admin.goto(`${base}/formation/formations`);
await admin.getByRole("button", { name: "Nouvelle formation" }).click();
const d1 = dialog(admin);
await d1.locator("[name=name]").fill(`Soudure industrielle ${run}`);
await d1.locator("[name=code]").fill(`SOUD${run}`);
await d1.locator("[name=training_level]").fill("Niveau 3e");
await d1.locator("[name=duration_hours]").fill("300");
await d1.locator("[name=duration_label]").fill("4 mois");
await d1.locator("[name=tuition_amount]").fill("200000");
await d1.locator("[name=registration_fee]").fill("15000");
await d1.locator("[name=default_installments]").fill("2");
await d1.locator("[name=certificate_title]").fill("CQP Soudeur");
await d1.locator("[name=admission_conditions]").fill("Test pratique d'entrée");
await d1.locator("[name=syllabus]").fill("Soudure à l'arc ; MIG ; sécurité");
await d1.getByRole("button", { name: "Créer la formation" }).click();
await admin.waitForURL(/\/formation\/formations\/[0-9a-f-]{36}/);
check(/\/formation\/formations\/[0-9a-f-]{36}/.test(admin.url()), "fiche de la formation ouverte");
check(await admin.getByText("CQP Soudeur").isVisible(), "formation créée avec certificat, coût, conditions");
check(await admin.getByText(/200\s000/).first().isVisible(), "coût affiché");

await admin.getByRole("button", { name: "Ajouter" }).first().click();
await dialog(admin).locator("[name=name]").fill("Soudure à l'arc");
await dialog(admin).locator("[name=code]").fill(`ARC${run}`);
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Module ajouté/), "module (cours) ajouté");
await admin.getByRole("button", { name: "Ajouter" }).nth(1).click();
await dialog(admin).locator("[name=name]").fill("Réaliser une soudure à l'arc conforme");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Compétence ajoutée/), "compétence visée ajoutée");

console.log("\n=== Session, formateur, emploi du temps ===");
await admin.reload();
await admin.getByRole("button", { name: "Nouvelle session" }).click();
const d2 = dialog(admin);
await d2.locator("[name=name]").fill(`Soudure — Session ${run}`);
await d2.locator("[name=starts_on]").fill(local.d);
const end = new Date(`${local.d}T00:00:00Z`);
end.setUTCDate(end.getUTCDate() + 90);
await d2.locator("[name=ends_on]").fill(end.toISOString().slice(0, 10));
await d2.locator("[name=capacity]").fill("12");
await d2.getByRole("button", { name: "Créer la session" }).click();
await admin.waitForURL(/\/formation\/sessions\/[0-9a-f-]{36}/);
const sessionId = admin.url().split("/").pop().split("?")[0];
check(await admin.getByText(/Session créée/).isVisible(), "session créée (dates, capacité)");
check(await admin.getByText(/Désactivés pour ce centre/).isVisible(), "centre SANS classes : la session fonctionne sans groupe");
await admin.getByRole("button", { name: "Affecter" }).click();
await dialog(admin).locator("[name=subject_id]").selectOption({ label: "Soudure à l'arc" });
await dialog(admin).locator("[name=teacher_id]").selectOption({ label: "AKA Koffi" });
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Module et formateur enregistrés/), "module affecté au formateur");
// Le formateur ne doit pas avoir d'autre cours au même moment : on libère le créneau du jour.
await db.query("delete from timetable_slots where weekday = $1 and teacher_id = (select id from staff_members where email = 'formateur@demo.neoscol.app')", [local.wd]);
await admin.goto(`${base}/emploi-du-temps?classe=${sessionId}`);
check(await admin.getByRole("tab", { name: "Par salle" }).or(admin.getByRole("link", { name: "Par salle" })).first().isVisible(), "emploi du temps : vue par salle");
await admin.getByRole("button", { name: "Ajouter un créneau" }).click();
const d3 = dialog(admin);
await d3.locator("[name=class_subject_id]").selectOption({ index: 0 });
await d3.locator("[name=weekday]").selectOption(String(local.wd));
await d3.locator("[name=room_id]").selectOption({ label: "Atelier électricité" });
await d3.locator("[name=starts_at]").fill(local.s);
await d3.locator("[name=ends_at]").fill(local.e);
await d3.getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Créneau ajouté/), "créneau du jour ajouté (session, module, formateur, salle, horaire)");

console.log("\n=== Phase 4/10 — Inscription et paiements ===");
await admin.goto(`${base}/formation/inscription?session=${sessionId}`);
await admin.locator("#last_name").fill(`TESTE${run}`);
await admin.locator("#first_name").fill("Mariam");
await admin.locator("#sex").selectOption("F");
await admin.locator("#phone").fill("+225 07 12 34 56 78");
await admin.locator("#education_level").fill("BEPC");
await admin.locator("#contact_last_name").fill(`TESTE${run}`);
await admin.locator("#contact_first_name").fill("Seydou");
await admin.locator("#contact_phone").fill("+225 07 98 76 54 32");
check((await admin.getByTestId("enroll-total").innerText()).replace(/\s/g, "").includes("215000"), "tarif : 200 000 + 15 000 d'inscription = 215 000");
await admin.locator("#installments").fill("2");
await admin.locator("#payment_amount").fill("50000");
await admin.locator("#payment_method").selectOption("mobile_money");
await admin.locator("#payment_reference").fill(`OM-${run}`);
await shot(admin, "02-inscription");
await admin.getByRole("button", { name: "Enregistrer l'inscription" }).click();
check(await toast(admin, /Inscription enregistrée/), "inscription enregistrée");
const learner = await q1("select s.id, s.matricule, s.education_level from students s where last_name = $1", [`TESTE${run}`]);
check(Boolean(learner?.matricule), `matricule unique attribué (${learner?.matricule})`);
const inv = await q1("select i.id, i.total, (select count(*)::int from installments where invoice_id = i.id) n, (select sum(amount) from payments where invoice_id = i.id) paid, b.balance from invoices i join invoice_balances b on b.invoice_id = i.id where i.student_id = $1", [learner.id]);
check(Number(inv.total) === 215000 && inv.n === 2, "facture 215 000 liée à l'inscription, 2 échéances");
check(Number(inv.paid) === 50000 && Number(inv.balance) === 165000, "versement 50 000 ; reste à payer 165 000");
const receipt = await admin.getByRole("link", { name: "Reçu du versement" }).getAttribute("href");
check(await pdfOk(admin, `${base}${receipt}`), "reçu PDF du versement");
check(await pdfOk(admin, `${base}/api/documents/factures/${inv.id}`), "facture + échéancier PDF");

console.log("\n=== Dossier apprenant ===");
await admin.goto(`${base}/eleves/${learner.id}?onglet=formation`);
check(await admin.getByText(`Soudure industrielle ${run}`).first().isVisible(), "onglet Formation : formation et session");
check(await admin.getByText("Reste à payer").isVisible(), "situation financière (payé / reste)");
await admin.goto(`${base}/eleves/${learner.id}?onglet=badge`);
await admin.getByRole("button", { name: "Générer le badge" }).click();
await dialog(admin).getByRole("button", { name: "Générer" }).click();
check(await toast(admin, /Badge généré/), "badge apprenant généré");
await admin.reload();
check(await admin.getByRole("img", { name: /QR code du badge APP-DEMOF/ }).isVisible(), "QR personnel visible dans le dossier");
check(await pdfOk(admin, `${base}/api/documents/badges-apprenants/${learner.id}`), "badge imprimable (PDF)");
await shot(admin, "03-dossier-badge");
const firstToken = (await q1("select token from student_badges where student_id = $1 and status = 'active'", [learner.id])).token;

await admin.goto(`${base}/eleves/${learner.id}?onglet=competences`);
await admin.getByRole("button", { name: "Évaluer" }).first().click();
await dialog(admin).locator("[name=level]").selectOption("acquired");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /compétence enregistrée/), "compétence évaluée");
await admin.goto(`${base}/eleves/${learner.id}?onglet=formation`);
await admin.getByRole("button", { name: "Ajouter un stage" }).click();
const d4 = dialog(admin);
await d4.locator("[name=company_name]").fill("Métal Services SARL");
await d4.locator("[name=tutor_name]").fill("M. Kouamé");
await d4.locator("[name=starts_on]").fill(local.d);
await d4.locator("[name=ends_on]").fill(end.toISOString().slice(0, 10));
await d4.getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Stage enregistré/), "stage enregistré (entreprise, période, tuteur, statut)");
await admin.getByRole("button", { name: "Ajouter" }).last().click();
await dialog(admin).locator("select[name=category]").selectOption("piece_identite");
await dialog(admin).locator("input[type=file]").setInputFiles({ name: "cni.png", mimeType: "image/png", buffer: Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") });
await dialog(admin).getByRole("button", { name: /Envoyer|Enregistrer/ }).click();
check(await toast(admin, /Document ajouté au dossier/), "pièce du dossier enregistrée");
for (const [url, label] of [
  [`/api/documents/certificats/${learner.id}?type=training_attestation`, "attestation de formation"],
  [`/api/documents/certificats/${learner.id}?type=training_certificate`, "certificat de formation"],
  [`/api/documents/formation/${learner.id}?document=releve`, "relevé de notes de formation"],
  [`/api/documents/formation/${learner.id}?document=competences`, "fiche de compétences"],
]) {
  check(await pdfOk(admin, `${base}${url}`), `document généré : ${label}`);
}

console.log("\n=== Phase 7/8 — Tablette « SCANNER VOTRE BADGE » ===");
const kiosk = await login("pointage.formation@demo.neoscol.app", { width: 1280, height: 800 });
await kiosk.waitForURL(/pointage/);
check(await kiosk.getByRole("heading", { name: "SCANNER VOTRE BADGE" }).isVisible(), "écran dédié « SCANNER VOTRE BADGE »");
let lastScanAt = 0;
const scan = async (code) => {
  // La tablette ignore la relecture du même code pendant 4 s (anti-rebond caméra).
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
let text = await scan(`NEOSCOL-BADGE:${firstToken}`);
check(/ENTRÉE ENREGISTRÉE/i.test(text) && /APPRENANT/.test(text), "apprenant reconnu : ENTRÉE");
check(/À L'HEURE/.test(text), "statut À L'HEURE");
check(text.includes(`Soudure industrielle ${run}`) && text.includes("Atelier électricité"), "formation, cours, salle et horaire affichés");
await shot(kiosk, "04-scan-entree");
text = await scan(firstToken);
check(/Scan déjà enregistré/i.test(text), "anti double scan");
await ageScans();
text = await scan(firstToken);
check(/SORTIE/.test(text) && /Présence/.test(text), "2e scan : SORTIE + temps de présence");
await ageScans();
// Retard : le cours a commencé il y a 25 minutes.
await db.query("update timetable_slots set starts_at = greatest((now() at time zone $2)::time - interval '25 minutes', time '00:00') where class_id = $1", [sessionId, ORG.timezone]);
await db.query("delete from learner_attendance where student_id = $1", [learner.id]);
text = await scan(firstToken);
check(/EN RETARD — 2\d MINUTES/.test(text), "retard calculé : EN RETARD — X MINUTES");
await ageScans();
const trainerToken = (await q1("select b.token from staff_badges b join staff_members s on s.id = b.staff_id where s.email = 'formateur@demo.neoscol.app' and b.status = 'active'")).token;
await db.query("delete from staff_attendance where staff_id = (select id from staff_members where email = 'formateur@demo.neoscol.app') and work_date = (now() at time zone $1)::date", [ORG.timezone]);
text = await scan(`NEOSCOL-BADGE:${trainerToken}`);
check(/FORMATEUR/.test(text) && /Bonjour Koffi/.test(text), "formateur reconnu : « Bonjour Koffi »");
check(/FORMATEUR PRÉSENT/.test(text) && /Votre cours/.test(text) && /Salle Atelier électricité/.test(text), "FORMATEUR PRÉSENT, votre cours, salle");
await shot(kiosk, "05-scan-formateur");
text = await scan("NEOSCOL-BADGE:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ");
check(/QR invalide/i.test(text), "mauvais QR refusé");
const schoolToken = (await q1("select b.token from staff_badges b join organizations o on o.id = b.organization_id where o.code = 'DEMO' and b.status = 'active' limit 1")).token;
text = await scan(schoolToken);
check(/autre établissement/i.test(text), "QR d'un autre établissement refusé");

// Badge perdu : remplacé ; l'ancien ne scanne plus.
await admin.goto(`${base}/formation/badges?q=TESTE${run}`);
await admin.getByRole("button", { name: "Remplacer" }).click();
await dialog(admin).locator("[name=reason]").fill("Badge perdu");
await dialog(admin).getByRole("button", { name: "Désactiver et remplacer" }).click();
check(await toast(admin, /nouveau badge généré/), "badge perdu : désactivé et remplacé (historique conservé)");
await ageScans();
text = await scan(firstToken);
check(/badge désactivé/i.test(text), "ancien badge : refusé à la tablette");
const newToken = (await q1("select token from student_badges where student_id = $1 and status = 'active'", [learner.id])).token;
text = await scan(newToken);
check(/SORTIE|ENTRÉE/i.test(text) && !/refus/i.test(text), "nouveau badge accepté");
await ageScans();

console.log("\n=== Journal, assiduité, statistiques ===");
await admin.goto(`${base}/formation/presences`);
check(await admin.getByText(`TESTE${run} Mariam`).first().isVisible(), "journal des entrées / sorties");
check(await admin.getByText("Badge désactivé").first().isVisible(), "scans refusés listés");
await admin.goto(`${base}/eleves/${learner.id}?onglet=assiduite`);
check(await admin.getByText("Taux d'assiduité", { exact: true }).isVisible() && (await admin.getByText("Historique des entrées et sorties").isVisible()), "onglet ASSIDUITÉ (taux, absences, retards, historique)");
await admin.goto(`${base}/formation/statistiques`);
check(await admin.getByText("Reliquats (reste à payer)").isVisible(), "statistiques : paiements et reliquats");
check(await admin.getByText("Taux d'assiduité", { exact: true }).isVisible(), "statistiques : taux d'assiduité");
await shot(admin, "06-statistiques");
await admin.goto(`${base}/formation`);
check(await admin.getByText(`Mariam TESTE${run}`).first().isVisible(), "tableau du jour : mouvement de l'apprenant");

console.log("\n=== Phase 3 — Centre AVEC classes / groupes ===");
await admin.goto(`${base}/formation/parametres`);
await admin.getByLabel(/Utiliser des classes \/ groupes/).check();
await admin.getByRole("button", { name: "Enregistrer les paramètres" }).click();
check(await toast(admin, /Paramètres de la formation enregistrés/), "classes / groupes activés");
await admin.goto(`${base}/formation/sessions/${sessionId}`);
await admin.getByRole("button", { name: "Nouveau groupe" }).click();
await dialog(admin).locator("[name=name]").fill("Groupe A");
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Groupe créé/), "groupe créé dans la session");
await admin.reload();
await admin.getByRole("button", { name: "Sans groupe" }).click();
await dialog(admin).locator("[name=group_id]").selectOption({ label: "Groupe A" });
await dialog(admin).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(admin, /Groupe de l'apprenant mis à jour/), "apprenant affecté au groupe");
await admin.goto(`${base}/emploi-du-temps?classe=${sessionId}`);
check(await admin.getByLabel("Groupe").isVisible(), "emploi du temps : filtre par groupe");
text = await scan(newToken);
check(/Groupe A/.test(text), "scan : groupe affiché (cours de toute la session valable pour le groupe)");
await ageScans();
await admin.goto(`${base}/formation/parametres`);
await admin.getByLabel(/Utiliser des classes \/ groupes/).uncheck();
await admin.getByRole("button", { name: "Enregistrer les paramètres" }).click();
check(await toast(admin, /Paramètres de la formation enregistrés/), "retour au centre SANS classes (rien n'est supprimé)");
check(Number((await q1("select count(*) n from training_groups where class_id = $1", [sessionId])).n) === 1, "groupe conservé après désactivation");

console.log("\n=== Formateur ===");
const trainer = await login("formateur@demo.neoscol.app");
await trainer.goto(`${base}/emploi-du-temps`);
check(await trainer.getByText("Soudure à l'arc").first().isVisible(), "formateur : son emploi du temps");
await trainer.goto(`${base}/formation/sessions/${sessionId}/competences`);
await trainer.getByRole("button", { name: new RegExp(`Évaluer .* pour Mariam TESTE${run}`) }).first().click();
await dialog(trainer).locator("[name=level]").selectOption("mastered");
await dialog(trainer).getByRole("button", { name: "Enregistrer" }).click();
check(await toast(trainer, /compétence enregistrée/), "formateur : évalue les compétences de ses apprenants");
const other = await trainer.goto(`${base}/formation/sessions/${(await q1("select id from classes where name = 'Couture — Session en cours'")).id}/competences`);
check((await trainer.getByText("Aucun apprenant inscrit").isVisible()) || other?.status() === 404, "formateur : aucune donnée des sessions qu'il n'anime pas");

console.log("\n=== Isolation et non-régression ===");
const school = await login("admin@demo.neoscol.app");
const schoolMenu = await nav(school);
check(!schoolMenu.includes("Inscrire un apprenant") && !schoolMenu.includes("Badges apprenants"), "Module Scolaire : aucun menu Formation");
const r404 = await school.goto(`${base}/formation`);
check(r404?.status() === 404, "Module Scolaire : /formation inaccessible (404)");
const leak = await school.request.get(`${base}/api/documents/badges-apprenants/${learner.id}`);
check(leak.status() !== 200, "badge d'un apprenant d'un autre établissement : refusé");
const univ = await login("universite@demo.neoscol.app");
check((await univ.goto(`${base}/formation/formations`))?.status() === 404, "Université : module Formation inaccessible");
const schoolKiosk = await login("pointage@demo.neoscol.app");
check(await schoolKiosk.getByRole("heading", { name: "SCANNER LE BADGE" }).waitFor({ timeout: 10000 }).then(() => true, () => false), "tablette du groupe scolaire inchangée");

console.log("\n=== Mobile ===");
const mobile = await login("formation@demo.neoscol.app", { width: 390, height: 844 });
for (const [path, name] of [["/formation", "m-aujourdhui"], [`/formation/sessions/${sessionId}`, "m-session"], ["/formation/inscription", "m-inscription"], [`/eleves/${learner.id}?onglet=assiduite`, "m-assiduite"]]) {
  await mobile.goto(`${base}${path}`);
  await shot(mobile, name);
}
const mobileKiosk = await login("pointage.formation@demo.neoscol.app", { width: 800, height: 1280 });
await shot(mobileKiosk, "m-tablette");

// Réglages d'origine du centre.
await db.query("update organizations set settings = jsonb_set(settings, '{training}', $1::jsonb) where code = 'DEMOF'", [JSON.stringify(initialTraining)]);
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} PROBLÈME(S) :\n- ${problems.join("\n- ")}` : "\nTOUT EST OK");
process.exit(problems.length ? 1 : 0);
