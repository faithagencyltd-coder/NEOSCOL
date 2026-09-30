// Captures RÉELLES complémentaires pour le film officiel du module scolaire
// (mode démonstration, données fictives). Complète scripts/capture.mjs.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… CHROMIUM_PATH=… \
//   node marketing/videos/scripts/capture-film.mjs
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "captures");
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const failures = [];

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
async function cap(page, name, path, { full = false } = {}) {
  try {
    if (path) await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" }).catch(() => undefined);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${name}.png`), fullPage: full });
    console.log("OK", name);
  } catch (e) {
    failures.push(`${name} : ${e.message.split("\n")[0]}`);
    console.log("KO", name, e.message.split("\n")[0]);
  }
}

try {
  // Démonstration : tablettes parlantes activées (réglage de l'établissement).
  await db.query("insert into voice_checkin_settings (organization_id, enabled) select id, true from organizations on conflict (organization_id) do update set enabled = true");
  // Un cours de l'enseignant de démonstration a lieu MAINTENANT (base locale de démonstration).
  const info = await q1(
    `select cs.id as class_subject_id, cs.class_id, cs.teacher_id, c.academic_year_id, c.organization_id,
            extract(isodow from (now() at time zone o.timezone))::int as weekday,
            greatest((now() at time zone o.timezone) - interval '10 minutes', date_trunc('day', now() at time zone o.timezone))::time as starts_at,
            least((now() at time zone o.timezone) + interval '50 minutes', date_trunc('day', now() at time zone o.timezone) + interval '23:59:59')::time as ends_at
       from class_subjects cs join classes c on c.id = cs.class_id join organizations o on o.id = c.organization_id
       join staff_members st on st.id = cs.teacher_id join auth.users u on u.id = st.user_id
      where u.email = 'enseignant@demo.neoscol.app' order by c.name limit 1`,
  );
  let slotId = null;
  if (info) {
    await db.query("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3)", [info.weekday, info.class_id, info.teacher_id]);
    slotId = (
      await q1(
        `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, weekday, starts_at, ends_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [info.organization_id, info.academic_year_id, info.class_id, info.class_subject_id, info.teacher_id, info.weekday, info.starts_at, info.ends_at],
      )
    ).id;
  }

  // L'enseignant scanne son badge : l'appel de son cours se déverrouille.
  const badge = await q1(
    `select b.token from staff_badges b join staff_members s on s.id = b.staff_id join auth.users u on u.id = s.user_id
      where u.email = 'enseignant@demo.neoscol.app' and b.revoked_at is null and b.status = 'active' order by b.issued_at desc limit 1`,
  ).catch(() => null);
  const kiosk = await login("pointage@demo.neoscol.app", TABLET);
  await kiosk.goto(`${base}/pointage`);
  if (badge?.token) {
    const input = kiosk.getByPlaceholder(/NEOSCOL-BADGE/);
    await input.fill(`NEOSCOL-BADGE:${badge.token}`).catch(() => undefined);
    await kiosk.getByRole("button", { name: "Valider" }).click().catch(() => undefined);
    await kiosk.waitForTimeout(1500);
    await cap(kiosk, "s-tablette-cours", null);
  }
  await kiosk.context().close();

  const teacherTab = await login("enseignant@demo.neoscol.app", TABLET);
  if (slotId) await cap(teacherTab, "s-appel", `/mes-cours/${slotId}`);
  await teacherTab.context().close();
  const teacherPhone = await login("enseignant@demo.neoscol.app", MOBILE);
  await cap(teacherPhone, "s-mes-cours-mobile", "/mes-cours");
  await cap(teacherPhone, "s-emploi-du-temps-mobile", "/emploi-du-temps");
  await teacherPhone.context().close();

  const a = await login("admin@demo.neoscol.app");
  await cap(a, "s-structure", "/structure");
  await cap(a, "s-classes", "/classes");
  await cap(a, "s-annonces", "/communication");
  await cap(a, "s-rapports", "/rapports");
  await cap(a, "s-resultats", "/resultats-annuels");
  const student = await q1(
    "select s.id from students s where s.organization_id = '10000000-0000-4000-a000-000000000001' and s.photo_path is not null order by s.last_name limit 1",
  ).catch(() => null) ?? (await q1("select id from students where organization_id = '10000000-0000-4000-a000-000000000001' order by last_name limit 1"));
  if (student) await cap(a, "s-dossier", `/eleves/${student.id}`);
  await a.context().close();

  // Portail élève montré sans bandeau d'impayé : dérogation d'accès (fonction réelle de l'établissement).
  await db.query(
    `insert into portal_access_overrides (student_id, organization_id, mode, reason)
     select s.id, s.organization_id, 'unrestricted', 'Démonstration : accès complet'
       from students s join auth.users u on u.id = s.user_id where u.email = 'eleve@demo.neoscol.app'
     on conflict (student_id) do update set mode = 'unrestricted', expires_on = null`,
  );
  const eleve = await login("eleve@demo.neoscol.app", MOBILE);
  await cap(eleve, "s-portail-eleve", "/portail");
  await cap(eleve, "s-portail-eleve-notes", "/portail/notes");
  await eleve.context().close();
} finally {
  await db.end();
  await browser.close();
  if (failures.length) {
    console.log("\nÉCHECS :", failures.join("\n"));
    process.exit(1);
  }
}
