// Captures RÉELLES de l'application (mode démonstration, données fictives du
// jeu de démo) utilisées par les vidéos. Aucune maquette inventée.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… CHROMIUM_PATH=… \
//   node marketing/videos/scripts/capture.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "captures");
const pdfOut = join(here, "..", "pdf");
mkdirSync(out, { recursive: true });
mkdirSync(pdfOut, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];
const ORG = { school: "10000000-0000-4000-a000-000000000001", training: "10000000-0000-4000-a000-000000000002", univ: "10000000-0000-4000-a000-000000000003" };

// Démonstration : tablettes parlantes activées (réglage de l'établissement).
await db.query("insert into voice_checkin_settings (organization_id, enabled) select id, true from organizations on conflict (organization_id) do update set enabled = true");

const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 };
const TABLET = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2 };
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

async function login(email, device = DESKTOP) {
  const context = await browser.newContext({ ...device, locale: "fr-FR", timezoneId: "Africa/Abidjan", reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(email);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}
async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "[data-sonner-toaster],[role=status].toast{display:none!important}" }).catch(() => undefined);
  await page.waitForTimeout(600);
}
async function cap(page, name, path, { full = false, before } = {}) {
  try {
    if (path) await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await settle(page);
    if (before) await before(page);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
    console.log("OK", name);
  } catch (e) {
    failures.push(`${name} : ${e.message.split("\n")[0]}`);
    console.log("KO", name, e.message.split("\n")[0]);
  }
}
async function pdf(page, name, path) {
  try {
    const res = await page.request.get(`${base}${path}`);
    if (!res.ok()) throw new Error(`HTTP ${res.status()}`);
    writeFileSync(join(pdfOut, `${name}.pdf`), await res.body());
    console.log("OK pdf", name);
  } catch (e) {
    failures.push(`${name} (pdf) : ${e.message}`);
  }
}
async function scan(kiosk, token) {
  await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${token}`);
  await kiosk.keyboard.press("Enter");
  await kiosk.waitForTimeout(1800);
}
const badge = (email) => q1("select sb.token from staff_members s join auth.users u on u.id = s.user_id join staff_badges sb on sb.staff_id = s.id and sb.status = 'active' where u.email = $1", [email]);

// ---------- Module scolaire ----------
{
  const t = await badge("enseignant@demo.neoscol.app");
  const kiosk = await login("pointage@demo.neoscol.app", TABLET);
  await cap(kiosk, "s-tablette-attente", "/pointage");
  if (t) {
    await scan(kiosk, t.token);
    await cap(kiosk, "s-tablette-scan", null);
  }
  await kiosk.context().close();

  const a = await login("admin@demo.neoscol.app");
  await cap(a, "s-dashboard", "/tableau-de-bord");
  await cap(a, "s-dashboard-full", "/tableau-de-bord", { full: true });
  await cap(a, "s-inscription", "/inscriptions/nouvelle");
  await cap(a, "s-eleves", "/eleves");
  const card = await q1("select s.id from students s join auth.users u on u.id = s.user_id where u.email = 'eleve@demo.neoscol.app'");
  if (card)
    await cap(a, "s-carte-3d", `/eleves/${card.id}?onglet=badge`, {
      before: async (p) => {
        const gen = p.getByRole("button", { name: "Générer la carte" });
        if (await gen.isVisible().catch(() => false)) {
          await gen.click();
          await p.waitForTimeout(2500);
          await p.reload();
          await settle(p);
        }
      },
    });
  await cap(a, "s-emploi-du-temps", "/emploi-du-temps");
  const ev = await q1("select a.id from assessments a join grades g on g.assessment_id = a.id where a.organization_id = $1 group by a.id order by count(*) desc limit 1", [ORG.school]);
  if (ev) {
    await cap(a, "s-notes", `/notes/evaluations/${ev.id}`);
    await cap(a, "s-notes-import", `/notes/evaluations/${ev.id}`, {
      before: async (p) => {
        await p.getByRole("button", { name: /Importer \(Excel/ }).click();
        await p.waitForTimeout(700);
      },
    });
  }
  await cap(a, "s-bulletins", "/bulletins");
  await cap(a, "s-bulletins-apercu", "/bulletins/apercu");
  await cap(a, "s-finances", "/finances");
  await cap(a, "s-impayes", "/finances?onglet=impayes");
  const inv = await q1("select invoice_id id from invoice_balances where organization_id = $1 and balance > 0 and status not in ('cancelled','draft') order by total desc limit 1", [ORG.school]);
  if (inv) await cap(a, "s-facture", `/finances/factures/${inv.id}`);
  await cap(a, "s-envois", "/communication/envois");
  await cap(a, "s-assistant", "/assistant", {
    before: async (p) => {
      const box = p.getByRole("textbox").first();
      await box.fill("Quels élèves ont des impayés ?");
      await box.press("Enter");
      await p.waitForTimeout(4000);
    },
  });
  await cap(a, "s-audit", "/audit");
  await cap(a, "s-passage", "/passage-annee");
  await cap(a, "s-notifications", "/notifications");
  const rc = await q1("select id from report_cards where organization_id = $1 and status = 'published' limit 1", [ORG.school]);
  if (rc) await pdf(a, "s-bulletin", `/api/documents/bulletins/${rc.id}`);
  const pay = await q1("select id from payments where organization_id = $1 order by paid_at desc limit 1", [ORG.school]);
  if (pay) await pdf(a, "s-recu", `/api/documents/recus/${pay.id}`);
  const stu = await q1("select s.id from students s join auth.users u on u.id = s.user_id where u.email = 'eleve@demo.neoscol.app'");
  if (stu) await pdf(a, "s-certificat", `/api/documents/certificats/${stu.id}`);
  await a.context().close();

  const verif = await q1("select verification_code from issued_documents where organization_id = $1 order by issued_at desc limit 1", [ORG.school]);
  if (verif) {
    const ctx = await browser.newContext({ ...MOBILE, locale: "fr-FR" });
    await cap(await ctx.newPage(), "s-verifier", `/verifier/${verif.verification_code}`);
    await ctx.close();
  }

  const teacher = await login("enseignant@demo.neoscol.app");
  await cap(teacher, "s-mes-cours", "/mes-cours");
  const slot = await q1(
    `select ts.id from timetable_slots ts join staff_members s on s.id = ts.teacher_id join auth.users u on u.id = s.user_id
      where u.email = 'enseignant@demo.neoscol.app' and ts.day_of_week = extract(isodow from now() at time zone 'Africa/Abidjan') order by ts.starts_at limit 1`,
  ).catch(() => null);
  if (slot) await cap(teacher, "s-appel", `/mes-cours/${slot.id}`);
  await teacher.context().close();

  const parent = await login("parent@demo.neoscol.app", MOBILE);
  await cap(parent, "s-portail", "/portail");
  await cap(parent, "s-portail-notes", "/portail/notes");
  await cap(parent, "s-portail-finances", "/portail/finances");
  await cap(parent, "s-portail-presences", "/portail/presences");
  await cap(parent, "s-portail-documents", "/portail/documents");
  await parent.context().close();
}

// ---------- Formation professionnelle ----------
{
  const kiosk = await login("pointage.formation@demo.neoscol.app", TABLET);
  await cap(kiosk, "f-tablette-attente", "/pointage");
  const lb = await q1("select token from student_badges where organization_id = $1 and status = 'active' limit 1", [ORG.training]);
  if (lb) {
    await scan(kiosk, lb.token);
    await cap(kiosk, "f-tablette-apprenant", null);
  }
  const fb = await badge("formateur@demo.neoscol.app");
  if (fb) {
    await kiosk.waitForTimeout(4500);
    await scan(kiosk, fb.token);
    await cap(kiosk, "f-tablette-formateur", null);
  }
  await kiosk.context().close();
  const f = await login("formation@demo.neoscol.app");
  await cap(f, "f-aujourdhui", "/formation");
  await cap(f, "f-formations", "/formation/formations");
  const prog = await q1("select id from programs where organization_id = $1 and kind = 'training' order by name limit 1", [ORG.training]);
  if (prog) await cap(f, "f-formation", `/formation/formations/${prog.id}`);
  await cap(f, "f-sessions", "/formation/sessions");
  const sess = await q1("select c.id from classes c join enrollments e on e.class_id = c.id where c.organization_id = $1 group by c.id order by count(*) desc limit 1", [ORG.training]);
  if (sess) {
    await cap(f, "f-session", `/formation/sessions/${sess.id}`);
    await cap(f, "f-competences", `/formation/sessions/${sess.id}/competences`);
  }
  await cap(f, "f-inscription", "/formation/inscription");
  await cap(f, "f-badges", "/formation/badges");
  await cap(f, "f-presences", "/formation/presences");
  await cap(f, "f-emploi-du-temps", "/emploi-du-temps");
  await cap(f, "f-statistiques", "/formation/statistiques");
  const learner = await q1("select b.student_id id from student_badges b where b.organization_id = $1 and b.status = 'active' limit 1", [ORG.training]);
  if (learner) {
    await cap(f, "f-dossier", `/eleves/${learner.id}?onglet=formation`);
    await cap(f, "f-carte-3d", `/eleves/${learner.id}?onglet=badge`);
    await pdf(f, "f-releve", `/api/documents/formation/${learner.id}`);
    await pdf(f, "f-competences", `/api/documents/formation/${learner.id}?document=competences`);
    await pdf(f, "f-attestation", `/api/documents/certificats/${learner.id}?type=training_certificate`);
  }
  await f.context().close();

}

// ---------- Université ----------
{
  const kiosk = await login("pointage.universite@demo.neoscol.app", TABLET);
  await cap(kiosk, "u-tablette-attente", "/pointage");
  const sb = await q1("select token from student_badges where organization_id = $1 and status = 'active' limit 1", [ORG.univ]);
  if (sb) {
    await scan(kiosk, sb.token);
    await cap(kiosk, "u-tablette-etudiant", null);
  }
  const pb = await badge("professeur@demo.neoscol.app");
  if (pb) {
    await kiosk.waitForTimeout(4500);
    await scan(kiosk, pb.token);
    await cap(kiosk, "u-tablette-enseignant", null);
  }
  await kiosk.context().close();
  const u = await login("universite@demo.neoscol.app");
  await cap(u, "u-dashboard", "/universite");
  await cap(u, "u-structure", "/universite/structure");
  await cap(u, "u-ue", "/universite/ue");
  await cap(u, "u-inscription", "/universite/inscription");
  await cap(u, "u-badges", "/universite/badges");
  const ucard = await q1("select s.id from students s join auth.users u on u.id = s.user_id where u.email = 'etudiant@demo.neoscol.app'");
  if (ucard) await cap(u, "u-carte-3d", `/eleves/${ucard.id}?onglet=badge`);
  await cap(u, "u-presences", "/universite/presences");
  await cap(u, "u-resultats", "/universite/resultats");
  await cap(u, "u-rattrapage", "/universite/resultats?onglet=rattrapage");
  await cap(u, "u-deliberations", "/universite/deliberations");
  const delib = await q1("select id from deliberations where organization_id = $1 order by created_at limit 1", [ORG.univ]);
  if (delib) {
    await cap(u, "u-deliberation", `/universite/deliberations/${delib.id}`);
    await pdf(u, "u-pv", `/api/documents/universite/pv/${delib.id}`);
  }
  await cap(u, "u-stages", "/universite/stages");
  await cap(u, "u-memoires", "/universite/memoires");
  await cap(u, "u-soutenances", "/universite/soutenances");
  await cap(u, "u-diplomes", "/universite/diplomes");
  await cap(u, "u-statistiques", "/universite/statistiques");
  const st = await q1("select s.id from students s join auth.users u on u.id = s.user_id where u.email = 'etudiant@demo.neoscol.app'");
  const per = await q1("select id from academic_periods where organization_id = $1 order by starts_on limit 1", [ORG.univ]).catch(() => null);
  if (st && per) await pdf(u, "u-releve", `/api/documents/universite/releve/${st.id}?semestre=${per.id}`);
  const dip = await q1("select id from student_diplomas where organization_id = $1 limit 1", [ORG.univ]);
  if (dip) await pdf(u, "u-diplome", `/api/documents/universite/diplome/${dip.id}`);
  await u.context().close();


  const etu = await login("etudiant@demo.neoscol.app", MOBILE);
  await cap(etu, "u-portail", "/portail");
  await cap(etu, "u-portail-resultats", "/portail/resultats");
  await cap(etu, "u-portail-parcours", "/portail/parcours");
  await etu.context().close();
}

await browser.close();
await db.end();
console.log(failures.length ? `\n${failures.length} échec(s) :\n- ${failures.join("\n- ")}` : "\nToutes les captures sont faites.");
