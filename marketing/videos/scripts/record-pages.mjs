// Enregistre de VRAIES séquences d'utilisation de NeoScool (école de démonstration,
// données fictives) pour la vidéo 90 s : le logiciel est réellement piloté
// (saisie, clics, scan), filmé image par image (capture d'écran Chrome), puis
// assemblé en MP4 30 i/s dans hyperframes/neoscool-90s/assets/ecrans/.
//
//   BASE_URL=http://localhost:3000 DATABASE_URL=postgres://… CHROMIUM_PATH=… \
//   node marketing/videos/scripts/record-pages.mjs [nom-de-séquence …]
//
// Nécessite ffmpeg dans le PATH. Les séquences ne sont pas versionnées (régénérables).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "hyperframes", "neoscool-90s", "assets", "ecrans");
const tmp = join(out, ".frames");
mkdirSync(out, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3000";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const q1 = async (sql, p) => (await db.query(sql, p)).rows[0];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const only = process.argv.slice(2);
const DEMO = "10000000-0000-4000-a000-000000000001";

const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, kind: "pointer" };
const TABLET = { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1.5, kind: "touch" };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, kind: "touch" };

// Curseur visible (souris ou doigt) + onde au clic : le navigateur sans écran n'en dessine pas.
const cursorScript = (kind) => `
(() => {
  const KIND = ${JSON.stringify(kind)};
  const install = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;transition:opacity .2s";
    c.innerHTML = KIND === "touch"
      ? '<div style="width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(15,23,42,.55);box-shadow:0 6px 18px rgba(0,0,0,.25)"></div>'
      : '<svg width="30" height="30" viewBox="0 0 24 24" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.35))"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.4 L14.4 20.2 L11.4 13.6 L17.6 13.6 Z" fill="#fff" stroke="#0f172a" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    let p = {};
    try { p = JSON.parse(sessionStorage.getItem("__cur") || "{}"); } catch {}
    const at = (x, y) => { c.style.transform = "translate(" + x + "px," + y + "px)"; try { sessionStorage.setItem("__cur", JSON.stringify({ x, y })); } catch {} };
    at(p.x ?? innerWidth * 0.6, p.y ?? innerHeight * 0.55);
    if (KIND === "touch") c.style.opacity = "0";
    addEventListener("mousemove", (e) => { at(e.clientX, e.clientY); if (KIND === "touch") c.style.opacity = "1"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      r.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;left:" + e.clientX + "px;top:" + e.clientY + "px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(37,99,235,.35);border:2px solid rgba(37,99,235,.8);transition:transform .5s ease-out,opacity .5s ease-out";
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(4.5)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", install); else install();
})();`;

async function open(email, device) {
  const { kind, ...opts } = device;
  const context = await browser.newContext({ ...opts, locale: "fr-FR", timezoneId: "Africa/Abidjan" });
  await context.addInitScript(cursorScript(kind));
  const page = await context.newPage();
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(email);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/connexion"), { timeout: 60000 });
  // Pas de bulles d'aide ni de bandeau de cookies par-dessus l'interface filmée.
  await page.addStyleTag({ content: "[data-sonner-toaster]{z-index:2147483640}" }).catch(() => undefined);
  return { page, device };
}

async function dump(page, name) {
  await page.screenshot({ path: join(tmp, `dump-${name}.png`) }).catch(() => undefined);
  const t = await page.evaluate(() => [...document.querySelectorAll("main button, main [role=radio], main input, main label, main a, main h1, main h2")]
    .slice(0, 160).map((e) => `${e.tagName.toLowerCase()} [${e.getAttribute("aria-label") ?? e.getAttribute("name") ?? ""}] ${(e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 70)}`));
  writeFileSync(join(tmp, `dump-${name}.txt`), page.url() + "\n" + t.join("\n"));
}

async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.waitForTimeout(ms);
}

// Déplacement fluide (courbe douce) puis clic.
async function moveTo(page, locator, { dx = 0.5, dy = 0.5 } = {}) {
  // Élément ramené au centre (les barres fixes du mobile ne doivent pas intercepter le clic).
  const visible = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 90 && r.bottom <= innerHeight - 140;
  }).catch(() => false);
  if (!visible) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "smooth" })).catch(() => undefined);
    await page.waitForTimeout(650);
  }
  const box = await locator.boundingBox();
  if (!box) throw new Error("élément invisible");
  const x = box.x + box.width * dx;
  const y = box.y + box.height * dy;
  await page.mouse.move(x, y, { steps: 28 });
  await page.waitForTimeout(120);
  return { x, y };
}
async function click(page, locator, opts) {
  await moveTo(page, locator, opts);
  await page.mouse.down();
  await page.waitForTimeout(70);
  await page.mouse.up();
  await page.waitForTimeout(350);
}
async function type(page, locator, text, delay = 55) {
  await click(page, locator);
  await locator.fill("");
  await page.keyboard.type(text, { delay });
  await page.waitForTimeout(200);
}
async function scroll(page, dy, steps = 40) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
}

// Film : capture d'écran continue de Chrome (images horodatées) → MP4 30 i/s.
async function record(name, { page, device }, run) {
  if (only.length && !only.includes(name)) return;
  const dir = join(tmp, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => undefined);
  });
  const w = Math.round(device.viewport.width * device.deviceScaleFactor);
  const h = Math.round(device.viewport.height * device.deviceScaleFactor);
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: w, maxHeight: h, everyNthFrame: 1 });
  const start = Date.now() / 1000;
  try {
    await run(page);
    await page.waitForTimeout(800);
  } finally {
    await cdp.send("Page.stopScreencast").catch(() => undefined);
  }
  const end = Date.now() / 1000;
  if (!frames.length) throw new Error(`${name} : aucune image`);
  const list = [];
  frames.forEach((f, i) => {
    const file = join(dir, `${String(i).padStart(5, "0")}.jpg`);
    writeFileSync(file, Buffer.from(f.data, "base64"));
    const next = frames[i + 1]?.t ?? end;
    list.push(`file '${file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  list.push(`file '${join(dir, `${String(frames.length - 1).padStart(5, "0")}.jpg`)}'`);
  writeFileSync(join(dir, "list.txt"), list.join("\n"));
  const mp4 = join(out, `${name}.mp4`);
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", join(dir, "list.txt"),
    "-vf", `fps=30,scale=${w - (w % 2)}:${h - (h % 2)}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", mp4,
  ]);
  rmSync(dir, { recursive: true, force: true });
  console.log(`OK ${name} : ${(end - start).toFixed(1)} s, ${frames.length} images (${w}×${h})`);
}

const failures = [];
async function scene(name, fn) {
  if (only.length && !only.some((o) => o.startsWith(name))) return;
  try {
    await fn();
  } catch (e) {
    failures.push(`${name} : ${e.message.split("\n")[0]}`);
    for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: join(tmp, `echec-${name}.png`) }).catch(() => undefined);
    console.log("KO", name, e.message.split("\n")[0]);
  }
}

try {
  // ------------------------------------------------- Préparation (non filmée)
  // Base locale de démonstration uniquement : rien n'est inventé à l'écran, les
  // séquences montrent le logiciel tel qu'il fonctionne.
  await db.query("insert into voice_checkin_settings (organization_id, enabled) select id, true from organizations on conflict (organization_id) do update set enabled = true");
  // Un cours de l'enseignant de démonstration a lieu MAINTENANT.
  const info = await q1(
    `select cs.id as class_subject_id, cs.class_id, cs.teacher_id, c.academic_year_id, c.organization_id,
            extract(isodow from (now() at time zone o.timezone))::int as weekday,
            ((now() at time zone o.timezone) - interval '2 minutes')::time as starts_at,
            least((now() at time zone o.timezone) + interval '63 minutes', date_trunc('day', now() at time zone o.timezone) + interval '23:59:59')::time as ends_at,
            (now() at time zone o.timezone)::date as today
       from class_subjects cs join classes c on c.id = cs.class_id join organizations o on o.id = c.organization_id
       join staff_members st on st.id = cs.teacher_id join auth.users u on u.id = st.user_id
      where u.email = 'enseignant@demo.neoscol.app' order by c.name limit 1`,
  );
  await db.query("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3) and starts_at <= $5 and ends_at >= $4", [info.weekday, info.class_id, info.teacher_id, info.starts_at, info.ends_at]);
  const slotId = (
    await q1(
      `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, weekday, starts_at, ends_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [info.organization_id, info.academic_year_id, info.class_id, info.class_subject_id, info.teacher_id, info.weekday, info.starts_at, info.ends_at],
    )
  ).id;
  // Journée de l'enseignant remise à zéro (base locale) : arrivée, appel du jour.
  await db.query("delete from staff_attendance where staff_id = $1 and work_date = $2", [info.teacher_id, info.today]);
  await db.query("delete from attendance_records where session_id in (select id from attendance_sessions where class_id = $1 and session_date = $2)", [info.class_id, info.today]);
  await db.query("delete from attendance_sessions where class_id = $1 and session_date = $2", [info.class_id, info.today]);
  const teacherBadge = await q1(
    `select b.token from staff_badges b join staff_members s on s.id = b.staff_id join auth.users u on u.id = s.user_id
      where u.email = 'enseignant@demo.neoscol.app' and b.revoked_at is null and b.status = 'active' order by b.issued_at desc limit 1`,
  );
  // Anti-doublon de la tablette (60 s) : on laisse passer la fenêtre depuis le dernier scan.
  const last = await q1("select extract(epoch from now() - max(scanned_at))::float as ago from badge_scans");
  if (last?.ago != null && last.ago < 65) await new Promise((r) => setTimeout(r, (65 - last.ago) * 1000));

  // L'élève du portail parent de démonstration (Aya BAMBA) : c'est elle qui badge le matin.
  const aya = await q1(
    `select s.id, s.first_name, s.last_name from students s join student_guardians sg on sg.student_id = s.id
       join guardians g on g.id = sg.guardian_id join auth.users u on u.id = g.user_id
      where u.email = 'parent@demo.neoscol.app' and s.organization_id = $1 order by s.first_name limit 1`,
    [DEMO],
  );
  await db.query(
    `insert into portal_access_overrides (student_id, organization_id, mode, reason)
     select s.id, s.organization_id, 'unrestricted', 'Démonstration : accès complet' from students s where s.id = $1
     on conflict (student_id) do update set mode = 'unrestricted', expires_on = null`,
    [aya.id],
  ).catch(() => undefined);

  // ---------------------------------------------------- 2. De la maternelle au lycée
  await scene("niveaux", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("niveaux", s, async (page) => {
      await page.goto(`${base}/structure?onglet=niveaux`);
      await settle(page, 600);
      for (const n of ["Maternelle", "Primaire", "Collège", "Lycée"]) {
        await moveTo(page, page.getByText(n, { exact: true }).first());
        await page.waitForTimeout(450);
      }
      await scroll(page, 380, 50);
      await page.waitForTimeout(900);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 3. Inscription + carte
  await scene("inscription", async () => {
    const s = await open("secretariat@demo.neoscol.app", DESKTOP).catch(() => open("admin@demo.neoscol.app", DESKTOP));
    await record("inscription", s, async (page) => {
      await page.goto(`${base}/inscriptions/nouvelle`);
      await settle(page, 500);
      await click(page, page.locator("label").filter({ hasText: "Nouvelle inscription" }).first());
      await click(page, page.getByRole("button", { name: /Suivant/ }));
      await settle(page, 300);
      await type(page, page.locator('input[name="student_last_name"]'), "ADJOVI");
      await type(page, page.locator('input[name="student_first_name"]'), "Ama");
      await click(page, page.locator('select[name="student_sex"]'));
      await page.locator('select[name="student_sex"]').selectOption({ label: "Féminin" });
      await click(page, page.locator('input[name="student_birth_date"]'));
      await page.locator('input[name="student_birth_date"]').fill("2015-03-12");
      await type(page, page.locator('input[name="student_birth_place"]'), "Abidjan");
      await page.waitForTimeout(500);
    });
    await s.page.context().close();
  });

  await scene("carte", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("carte", s, async (page) => {
      await page.goto(`${base}/eleves/${aya.id}`);
      await settle(page, 500);
      await click(page, page.getByRole("tab", { name: /Badge/ }).or(page.getByRole("link", { name: /Badge & QR/ })).or(page.getByRole("button", { name: /Badge & QR/ })).first());
      await settle(page, 600);
      const gen = page.getByRole("button", { name: /Générer/ }).first();
      if (await gen.isVisible().catch(() => false)) {
        await click(page, gen);
        await settle(page, 1200);
      }
      const card = page.locator("[data-testid*=card], [class*=perspective]").first();
      if (await card.isVisible().catch(() => false)) {
        await moveTo(page, card, { dx: 0.25, dy: 0.3 });
        await moveTo(page, card, { dx: 0.8, dy: 0.7 });
        await moveTo(page, card, { dx: 0.5, dy: 0.5 });
      }
      await page.waitForTimeout(1200);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 4. Arrivée : tablette + parent
  await scene("tablette", async () => {
    // Module scolaire : la tablette pointe le PERSONNEL. L'enseignant badge, la
    // tablette le salue et débloque l'appel de son cours.
    const s = await open("pointage@demo.neoscol.app", TABLET);
    await s.page.waitForURL("**/pointage");
    await settle(s.page, 800);
    await record("tablette", s, async (page) => {
      await page.waitForTimeout(1000);
      await page.getByLabel("Code du badge").focus();
      await page.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${teacherBadge.token}`);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(4500);
    });
    await s.page.context().close();
  });

  await scene("appel", async () => {
    const s = await open("enseignant@demo.neoscol.app", PHONE);
    await record("appel", s, async (page) => {
      await page.goto(`${base}/mes-cours`);
      await settle(page, 500);
      await page.goto(`${base}/mes-cours/${slotId}`);
      await settle(page, 600);
      await click(page, page.getByRole("button", { name: "Absent — Kofi BAMBA" }));
      await click(page, page.getByRole("button", { name: "Retard — Nadia DIABATÉ" }));
      await click(page, page.getByRole("button", { name: /^Valider l'appel/ }));
      await settle(page, 1500);
    });
    await s.page.context().close();
  });

  await scene("notes", async () => {
    const s = await open("enseignant@demo.neoscol.app", PHONE);
    await record("notes", s, async (page) => {
      await page.goto(`${base}/notes`);
      await settle(page, 500);
      await click(page, page.locator('a[href^="/notes/"]').first());
      await settle(page, 700);
      await click(page, page.getByText("Interrogation écrite").first());
      await settle(page, 700);
      const marks = { "Inès ASSI": "14.5", "Kofi BAMBA": "12", "Nadia DIABATÉ": "16", "Fatou GBAGBO": "11.5" };
      for (const [who, mark] of Object.entries(marks)) await type(page, page.getByLabel(`Note de ${who}`), mark, 110);
      await click(page, page.getByRole("button", { name: "Enregistrer les notes" }));
      await settle(page, 1300);
    });
    await s.page.context().close();
  });

  await scene("parent", async () => {
    const s = await open("parent@demo.neoscol.app", PHONE);
    await record("parent", s, async (page) => {
      await page.goto(`${base}/portail`);
      await settle(page, 700);
      await click(page, page.getByRole("button", { name: /Notifications/ }));
      await settle(page, 1800);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await click(page, page.getByRole("link", { name: "Présences" }).last());
      await settle(page, 1500);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 5. En classe : appel + notes
  await scene("bulletins", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("bulletins", s, async (page) => {
      await page.goto(`${base}/bulletins`);
      await settle(page, 700);
      await click(page, page.getByRole("button", { name: "Recalculer" }));
      await page.waitForTimeout(500);
      await click(page, page.getByRole("dialog").getByRole("button", { name: "Calculer" }));
      await settle(page, 1300);
      await moveTo(page, page.getByText("Moyenne de classe"));
      await page.waitForTimeout(500);
      await moveTo(page, page.locator("tbody tr").first(), { dx: 0.3 });
      await page.waitForTimeout(500);
      await page.goto(`${base}/bulletins/apercu`);
      await settle(page, 1500);
      await scroll(page, 500, 60);
      await page.waitForTimeout(800);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 7. Caisse
  await scene("caisse", async () => {
    const target = await q1(
      `select s.matricule from invoice_balances b join students s on s.id = b.student_id
        where b.organization_id = $1 and b.status = 'issued' and b.balance > 0
          and (select count(*) from installments i where i.invoice_id = b.invoice_id) >= 2
        order by b.balance desc limit 1`,
      [DEMO],
    );
    const s = await open("comptable@demo.neoscol.app", DESKTOP);
    await record("caisse", s, async (page) => {
      await page.goto(`${base}/finances?onglet=paiements`);
      await settle(page, 600);
      await click(page, page.getByTestId("cashier-open"));
      const dlg = page.getByRole("dialog");
      await type(page, dlg.getByLabel(/nom, prénom ou matricule/), target.matricule, 45);
      await settle(page, 500);
      await click(page, dlg.getByTestId("cashier-results").getByRole("button").first());
      await page.waitForTimeout(600);
      await click(page, dlg.getByRole("radio", { name: "Mobile Money" }));
      await type(page, dlg.getByLabel("Référence (transaction, chèque…)"), "MM-240917-4471", 40);
      await click(page, dlg.getByRole("button", { name: "Valider et générer le reçu" }));
      await dlg.getByTestId("cashier-done").waitFor({ timeout: 20000 });
      await page.waitForTimeout(600);
      await moveTo(page, dlg.getByRole("link", { name: "Imprimer le reçu" }));
      await page.waitForTimeout(1000);
      await click(page, dlg.getByTestId("cashier-done").getByRole("button", { name: "Fermer" }));
      await page.goto(`${base}/finances?onglet=impayes`);
      await settle(page, 1200);
      await scroll(page, 300, 40);
      await page.waitForTimeout(800);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 8. Communication
  await scene("annonce", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("annonce", s, async (page) => {
      await page.goto(`${base}/communication`);
      await settle(page, 600);
      await click(page, page.getByRole("button", { name: "Nouvelle annonce" }));
      await page.waitForTimeout(400);
      await type(page, page.locator('input[name="title"]'), "Réunion de rentrée des parents", 40);
      await type(page, page.locator('textarea[name="body"]'), "Chers parents, la réunion de rentrée aura lieu samedi à 9 h dans la grande salle.", 22);
      const pub = page.getByRole("button", { name: /Publier/ }).first();
      await click(page, pub);
      await settle(page, 1500);
    });
    await s.page.context().close();
  });

  // ---------------------------------------------------- 9. Documents + vérification
  await scene("documents", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("documents", s, async (page) => {
      await page.goto(`${base}/documents`);
      await settle(page, 600);
      await click(page, page.getByLabel("Choisir l'élève"));
      await page.getByLabel("Choisir l'élève").selectOption({ value: aya.id }).catch(() => undefined);
      await settle(page, 800);
      await click(page, page.getByRole("button", { name: /^Aperçu — Certificat de scolarité/ }).first());
      await settle(page, 2500);
      await page.waitForTimeout(1500);
    });
    const doc = await q1(
      "select verification_code from issued_documents where organization_id = $1 and verification_code is not null order by issued_at desc limit 1",
      [DEMO],
    ).catch(() => null);
    if (doc) {
      await record("verifier", s, async (page) => {
        await page.goto(`${base}/verifier/${doc.verification_code}`);
        await settle(page, 2500);
      });
    }
    await s.page.context().close();
  });

  // ---------------------------------------------------- 10. Pilotage
  await scene("tableau", async () => {
    const s = await open("admin@demo.neoscol.app", DESKTOP);
    await record("tableau", s, async (page) => {
      await page.goto(`${base}/tableau-de-bord`);
      await settle(page, 900);
      await moveTo(page, page.getByText("Encaissé ce mois"));
      await page.waitForTimeout(500);
      await scroll(page, 420, 60);
      await page.waitForTimeout(700);
      await scroll(page, 420, 60);
      await page.waitForTimeout(900);
    });
    await s.page.context().close();
  });
} finally {
  await db.end();
  await browser.close();
  if (failures.length) {
    console.log("\nÉCHECS :", failures.join("\n"));
    process.exit(1);
  }
}
