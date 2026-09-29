// P7f — Hors ligne, de bout en bout (réseau réellement coupé dans le navigateur) :
// scan sur la tablette sans réseau → gardé → envoyé au retour du réseau à son
// heure réelle (cours déverrouillé) ; appel validé sans réseau → envoyé ensuite ;
// aucune donnée personnelle sur l'appareil ; saisie refusée signalée. Rejouable.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-hors-ligne";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const shot = async (page, name) => page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
const seen = (locator, timeout = 15000) => locator.waitFor({ timeout }).then(() => true).catch(() => false);
async function login(identifier, viewport = { width: 1280, height: 860 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|pointage|plateforme/);
  return { page, context };
}
const readOutbox = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open("neoscol-offline", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("outbox", { keyPath: "id" });
        req.onsuccess = () => {
          const all = req.result.transaction("outbox", "readonly").objectStore("outbox").getAll();
          all.onsuccess = () => resolve(all.result);
        };
      }),
  );

// Cours de maths de l'enseignant en 6e A, maintenant (créneaux du jour libérés, restaurés à la fin).
const lesson = await q1(
  `select cs.id as class_subject_id, cs.class_id, cs.teacher_id, c.academic_year_id, c.organization_id,
          to_char((now() at time zone o.timezone)::date, 'YYYY-MM-DD') as today,
          extract(isodow from (now() at time zone o.timezone))::int as weekday,
          greatest((now() at time zone o.timezone)::time - interval '10 minutes', time '00:00')::time as starts_at,
          least((now() at time zone o.timezone) + interval '50 minutes', date_trunc('day', now() at time zone o.timezone) + interval '23:59')::time as ends_at
     from class_subjects cs join classes c on c.id = cs.class_id join subjects s on s.id = cs.subject_id
     join organizations o on o.id = c.organization_id join staff_members st on st.id = cs.teacher_id
    where c.name = '6e A' and s.code = 'MATH' and st.user_id = '00000000-0000-4000-a000-000000000006'`,
);
const removed = (await db.query("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3) returning *", [lesson.weekday, lesson.class_id, lesson.teacher_id])).rows;
const slot = (
  await q1(
    `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, weekday, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [lesson.organization_id, lesson.academic_year_id, lesson.class_id, lesson.class_subject_id, lesson.teacher_id, lesson.weekday, lesson.starts_at, lesson.ends_at],
  )
).id;
await db.query("delete from staff_attendance where staff_id = $1 and work_date = $2", [lesson.teacher_id, lesson.today]);
const token = (await q1("select token from staff_badges where staff_id = $1 and status = 'active'", [lesson.teacher_id])).token;

try {
  console.log("\n=== 1. Tablette de pointage sans réseau ===");
  const { page: kiosk, context: kctx } = await login("pointage@demo.neoscol.app", { width: 1180, height: 820 });
  await kiosk.waitForURL("**/pointage");
  await kctx.setOffline(true);
  await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${token}`);
  await kiosk.keyboard.press("Enter");
  check(await seen(kiosk.getByTestId("scan-queued")), "hors ligne : « scan gardé », aucun faux « accepté »");
  check(await seen(kiosk.getByTestId("offline-status").getByText("1 saisie(s) en attente")), "1 pointage en attente sur la tablette");
  const outbox = await readOutbox(kiosk);
  check(outbox.length === 1 && !JSON.stringify(outbox).match(/KONÉ|Awa|DIALLO|@/), "appareil : code et heure seulement, aucun nom");
  check((await q1("select count(*)::int as n from staff_attendance where staff_id = $1 and work_date = $2", [lesson.teacher_id, lesson.today])).n === 0, "rien n'est enregistré tant que le réseau est coupé");
  await shot(kiosk, "01-tablette-hors-ligne");
  await kiosk.waitForTimeout(3000);
  const reconnectAt = new Date();
  await kctx.setOffline(false);
  check(await seen(kiosk.getByText("Pointage saisi hors ligne : enregistré.").first(), 20000), "retour du réseau : synchronisation automatique");
  const att = await q1("select arrived_at from staff_attendance where staff_id = $1 and work_date = $2", [lesson.teacher_id, lesson.today]);
  check(Boolean(att) && att.arrived_at < reconnectAt, "arrivée enregistrée à l'heure réelle du scan (avant la reconnexion)");
  check((await q1("select captured_offline from badge_scans where staff_id = $1 order by scanned_at desc limit 1", [lesson.teacher_id])).captured_offline, "scan marqué « hors ligne » dans l'historique");
  check((await q1("select count(*)::int as n from lesson_unlocks where timetable_slot_id = $1", [slot])).n === 1, "cours déverrouillé par le scan synchronisé");
  check((await readOutbox(kiosk)).length === 0, "file vidée après envoi");

  console.log("\n=== 2. Appel validé sans réseau ===");
  const { page: teacher, context: tctx } = await login("enseignant@demo.neoscol.app");
  await teacher.goto(`${base}/mes-cours/${slot}?date=${lesson.today}`);
  await teacher.getByRole("button", { name: /Valider l'appel/ }).waitFor();
  await tctx.setOffline(true);
  await teacher.locator("fieldset").first().getByRole("button", { name: /^Absent —/ }).click();
  await teacher.getByRole("button", { name: /Valider l'appel/ }).click();
  check(await seen(teacher.getByText(/Hors ligne : appel gardé sur cet appareil/).first()), "hors ligne : appel gardé sur l'appareil");
  check(await seen(teacher.getByTestId("offline-status").getByText("Hors ligne")), "bandeau « Hors ligne » affiché");
  const rc = await readOutbox(teacher);
  const names = (await db.query("select last_name, first_name from students s join enrollments e on e.student_id = s.id where e.class_id = $1 and e.status = 'validated'", [lesson.class_id])).rows;
  check(rc.length === 1 && names.every((n) => !JSON.stringify(rc).includes(n.last_name)), "appareil : identifiants et statuts seulement, aucun nom d'élève");
  check(!(await q1("select status from attendance_sessions where timetable_slot_id = $1", [slot])), "aucun appel enregistré avant le retour du réseau");
  await shot(teacher, "02-appel-hors-ligne");
  await tctx.setOffline(false);
  check(await seen(teacher.getByText("Appel saisi hors ligne : enregistré.").first(), 20000), "retour du réseau : appel envoyé automatiquement");
  const session = await q1("select s.status, (select count(*)::int from attendance_records r where r.session_id = s.id and r.status = 'absent') as absents from attendance_sessions s where timetable_slot_id = $1", [slot]);
  check(session?.status === "validated" && session.absents === 1, "appel validé en base (1 absent)");
  await teacher.reload();
  check(await seen(teacher.getByText("Appel validé").first()), "page : appel validé et verrouillé");

  console.log("\n=== 3. Saisie refusée par le serveur : signalée, jamais perdue en silence ===");
  await teacher.evaluate(
    ({ slot, today, userId, orgId }) =>
      new Promise((resolve) => {
        const req = indexedDB.open("neoscol-offline", 1);
        req.onsuccess = () => {
          const tx = req.result.transaction("outbox", "readwrite");
          tx.objectStore("outbox").put({
            id: crypto.randomUUID(), kind: "lesson_attendance", userId, organizationId: orgId,
            capturedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
            payload: { slot_id: slot, date: today, validate: false, records: [] }, attempts: 0, error: null, failed: false,
          });
          tx.oncomplete = () => resolve(true);
        };
      }),
    { slot, today: lesson.today, userId: "00000000-0000-4000-a000-000000000006", orgId: lesson.organization_id },
  );
  await teacher.reload();
  const failed = teacher.getByTestId("offline-failed");
  check(await seen(failed), "saisie refusée affichée");
  check((await failed.innerText()).includes("plus de 72 h"), "motif du refus affiché (plus de 72 h)");
  teacher.once("dialog", (d) => d.accept());
  await failed.getByRole("button", { name: "Retirer" }).click();
  check(await failed.waitFor({ state: "detached", timeout: 10000 }).then(() => true).catch(() => false), "retrait volontaire de la saisie refusée");
  await shot(teacher, "03-apres-synchro");
} finally {
  await db.query("delete from attendance_records where session_id in (select id from attendance_sessions where timetable_slot_id = $1)", [slot]);
  await db.query("delete from attendance_sessions where timetable_slot_id = $1", [slot]);
  await db.query("update badge_scans set lesson_unlock_id = null where lesson_unlock_id in (select id from lesson_unlocks where timetable_slot_id = $1)", [slot]);
  await db.query("delete from lesson_unlocks where timetable_slot_id = $1", [slot]);
  await db.query("delete from timetable_slots where id = $1", [slot]);
  for (const r of removed) {
    const cols = Object.keys(r);
    await db.query(`insert into timetable_slots (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) on conflict do nothing`, cols.map((c) => r[c]));
  }
}
console.log(problems.length ? `\nPROBLÈMES (${problems.length}) :\n- ${problems.join("\n- ")}` : "\nHORS LIGNE E2E : TOUT EST OK");
await browser.close();
await db.end();
process.exit(problems.length ? 1 : 0);
