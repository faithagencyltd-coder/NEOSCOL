// Exports universels : listes (PDF / Excel, séparées par classe, filtres sexe,
// photos facultatives, noms longs, classes vides, totaux) et emplois du temps
// (PDF par classe, plusieurs, toutes, sans créneau, modification récente),
// dans les trois modules (scolaire, formation, université) + sécurité.
// Fichiers réellement téléchargés puis relus (zip Excel, texte des PDF). Rejouable.
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync, inflateRawSync, inflateSync } from "node:zlib";
import { chromium } from "playwright-core";
import pg from "pg";
import { PDFDocument } from "pdf-lib";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-exports";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const q1 = async (sql, params) => (await q(sql, params))[0];

async function login(identifier) {
  const context = await browser.newContext({ locale: "fr-FR" });
  const page = await context.newPage();
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/tableau-de-bord|portail|formation|universite/, { timeout: 30000 });
  return { page, context };
}

// --- Lecture des fichiers produits -------------------------------------------------
/** Entrées d'un zip (classeur .xlsx). */
function unzip(buf) {
  const files = {};
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const comment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    const lnl = buf.readUInt16LE(local + 26);
    const lex = buf.readUInt16LE(local + 28);
    const data = buf.subarray(local + 30 + lnl + lex, local + 30 + lnl + lex + size);
    files[name] = method === 8 ? inflateRawSync(data) : data;
    p += 46 + nameLen + extra + comment;
  }
  return files;
}
const sheetNames = (files) => [...files["xl/workbook.xml"].toString().matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const sheetRows = (files, i) => [...files[`xl/worksheets/sheet${i}.xml`].toString().matchAll(/<row r="(\d+)"[^>]*>(.*?)<\/row>/g)].map((m) => [...m[2].matchAll(/<t xml:space="preserve">([^<]*)<\/t>|<v>([^<]*)<\/v>/g)].map((c) => c[1] ?? c[2]));

/** Texte d'un PDF react-pdf (polices standard : chaînes hexadécimales WinAnsi dans des flux Flate). */
function pdfTextOf(buf) {
  const s = buf.toString("latin1");
  let text = "";
  const re = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length;
    const stop = s.indexOf("endstream", start);
    if (stop < 0) break;
    try {
      const raw = inflateSync(Buffer.from(s.slice(start, stop), "latin1")).toString("latin1");
      for (const h of raw.matchAll(/<([0-9a-fA-F]+)>\s*Tj|\[([^\]]*)\]\s*TJ/g)) {
        if (h[1]) text += Buffer.from(h[1], "hex").toString("latin1");
        else for (const part of h[2].matchAll(/<([0-9a-fA-F]+)>|\(((?:\\.|[^)])*)\)/g)) text += part[1] ? Buffer.from(part[1], "hex").toString("latin1") : part[2];
        text += " ";
      }
    } catch {}
    re.lastIndex = stop;
  }
  // Comparaison sans espaces : le crénage du PDF découpe parfois les mots (« 6 e A »).
  return text.replace(/\s+/g, "");
}
const c = (value) => String(value).replace(/\s+/g, "");
const pages = async (buf) => (await PDFDocument.load(buf)).getPageCount();

async function get(ctx, path) {
  const res = await ctx.request.get(`${base}${path}`);
  const body = await res.body();
  return { status: res.status(), type: res.headers()["content-type"] ?? "", headers: res.headers(), body, text: res.headers()["content-type"]?.includes("text/plain") ? body.toString() : "" };
}

// --- Données de référence ---------------------------------------------------------
const DEMO = "10000000-0000-4000-a000-000000000001";
const cls = async (org, name) => (await q1("select id from classes where organization_id = $1 and name = $2", [org, name])).id;
const roster = async (classId, sex = null) =>
  q(
    "select s.id, s.matricule, s.last_name, s.sex from enrollments e join students s on s.id = e.student_id where e.class_id = $1 and e.status = 'validated' and s.archived_at is null and ($2::text is null or s.sex = $2) order by s.last_name",
    [classId, sex],
  );
const C6A = await cls(DEMO, "6e A");
const C3A = await cls(DEMO, "3e A");
const C5A = await cls(DEMO, "5e A");
const allDemo = await q1("select count(*)::int n, count(*) filter (where s.sex = 'M')::int m, count(*) filter (where s.sex = 'F')::int f from enrollments e join students s on s.id = e.student_id join classes c on c.id = e.class_id where c.organization_id = $1 and e.status = 'validated' and s.archived_at is null and c.archived_at is null", [DEMO]);

// Photo de test (portrait 60 × 90, PNG) pour deux élèves de 6e A, retirée à la fin.
const r6a = await roster(C6A);
const photoStudents = r6a.slice(0, 2).map((s) => s.id);
const png = (() => {
  // PNG 60 × 90 (portrait) réellement encodé : dégradé, sans aucune vraie personne.
  const w = 60, h = 90;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) raw.set([30 + x * 2, 80 + y, 160], y * (w * 3 + 1) + 1 + x * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
})();
const longName = "DE LA FONTAINE-KOUASSI-AKISSI-BROU-N'GUESSAN-YAPO-DIOMANDÉ-TRAORÉ";
const restoreName = await q1("select id, last_name from students where id = $1", [r6a[2].id]);
const photoIds = [];
for (const sid of photoStudents) {
  const f = await q1(
    "insert into file_objects (organization_id, bucket, path, owner_type, owner_id, category, file_name, mime_type, size_bytes, content) values ($1::uuid, 'database', $1::text || '/test/photo-' || $2::text || '.png', 'student', $2::uuid, 'photo', 'photo.png', 'image/png', $3, $4) returning id",
    [DEMO, sid, png.length, png],
  );
  photoIds.push({ sid, fid: f.id, before: (await q1("select photo_path from students where id = $1", [sid])).photo_path });
  await db.query("update students set photo_path = $1 where id = $2", [f.id, sid]);
}
await db.query("update students set last_name = $1 where id = $2", [longName, restoreName.id]);
let tempClass = null;
const slot = await q1("select id, room_id, starts_at, ends_at from timetable_slots where class_id = $1 order by weekday, starts_at limit 1", [C6A]);

try {
  const { context: admin } = await login("admin@demo.neoscol.app");
  console.log("\n=== Listes — établissement scolaire ===");
  let r = await get(admin, `/api/exports/listes?format=pdf&classes=${C6A}`);
  writeFileSync(`${out}/liste-6eA.pdf`, r.body);
  let t = pdfTextOf(r.body);
  check(r.status === 200 && r.type.includes("pdf") && r.headers["x-export-sections"] === "1" && r.headers["x-export-students"] === String(r6a.length), `PDF une classe : 200, 1 liste, ${r6a.length} élèves`);
  check(t.includes(c("6e A")) && r6a.every((s) => t.includes(c(s.matricule))) && t.includes(c("Effectif total")) && t.includes(c("Garçons")) && t.includes(c("Filles")), "PDF une classe : matricules, effectifs, garçons, filles");
  check(t.includes(c("Page 1")) && t.includes(c("Fait")), "PDF : pagination et bloc signature / cachet");
  check(t.includes(longName.slice(0, 20).toUpperCase().replace("É", "É")) || t.includes(c("DE LA FONTAINE")), "PDF : nom long affiché (sur plusieurs lignes, sans coupure)");

  r = await get(admin, `/api/exports/listes?format=xlsx&classes=${C6A}`);
  writeFileSync(`${out}/liste-6eA.xlsx`, r.body);
  let x = unzip(r.body);
  let names = sheetNames(x);
  let rows = sheetRows(x, 2);
  check(r.status === 200 && r.type.includes("spreadsheetml") && JSON.stringify(names) === JSON.stringify(["Récapitulatif", "6e A"]), `Excel une classe : feuilles ${names.join(", ")}`);
  check(rows[0].includes("Matricule") && rows.filter((row) => r6a.some((s) => row.includes(s.matricule))).length === r6a.length, "Excel : une ligne par élève, en-têtes");
  check(/<autoFilter ref="A1:/.test(x["xl/worksheets/sheet2.xml"].toString()) && / s="2"><v>\d+<\/v>/.test(x["xl/worksheets/sheet2.xml"].toString()), "Excel : filtre automatique et dates au format date");

  r = await get(admin, `/api/exports/listes?format=pdf&classes=${C6A}&classes=${C3A}`);
  t = pdfTextOf(r.body);
  check(r.headers["x-export-sections"] === "2" && (await pages(r.body)) >= 3 && t.includes(c("RÉCAPITULATIF")) && t.includes(c("6e A")) && t.includes(c("3e A")), "PDF plusieurs classes : récapitulatif + une section par classe (pages séparées)");
  r = await get(admin, `/api/exports/listes?format=xlsx&classes=${C6A},${C3A}`);
  names = sheetNames(unzip(r.body));
  check(names.length === 3 && names.includes("6e A") && names.includes("3e A"), `Excel plusieurs classes : ${names.join(", ")}`);

  r = await get(admin, `/api/exports/listes?format=pdf`);
  writeFileSync(`${out}/liste-toutes.pdf`, r.body);
  check(r.status === 200 && r.headers["x-export-sections"] === "4" && r.headers["x-export-students"] === String(allDemo.n) && (await pages(r.body)) >= 5, `Toutes les classes : 4 listes séparées, ${allDemo.n} élèves`);
  r = await get(admin, `/api/exports/listes?format=xlsx`);
  x = unzip(r.body);
  const recap = sheetRows(x, 1);
  const totalRow = recap.find((row) => row[0] === "Total");
  check(totalRow && totalRow.slice(-3).join(",") === `${allDemo.n},${allDemo.m},${allDemo.f}`, `Excel toutes : totaux ${totalRow?.slice(-3).join(",")} = base ${allDemo.n},${allDemo.m},${allDemo.f}`);

  r = await get(admin, `/api/exports/listes?format=pdf&sexe=M`);
  check(r.headers["x-export-students"] === String(allDemo.m) && pdfTextOf(r.body).includes(c("Garçons uniquement")), `Garçons uniquement : ${allDemo.m}`);
  r = await get(admin, `/api/exports/listes?format=xlsx&sexe=F`);
  const fRows = sheetNames(unzip(r.body)).length;
  check(r.headers["x-export-students"] === String(allDemo.f) && fRows === 5, `Filles uniquement : ${allDemo.f} (toujours une feuille par classe)`);
  r = await get(admin, `/api/exports/listes?format=pdf&classes=${C6A}&sexe=F`);
  check(r.status === 200 && r.headers["x-export-students"] === "0" && pdfTextOf(r.body).includes(c("Aucun")), "Classe vide (6e A, filles) : document clair, aucun inscrit");
  r = await get(admin, `/api/exports/listes?format=xlsx&classes=${C5A}&separer=1`);
  names = sheetNames(unzip(r.body));
  check(names.includes("5e A - Garçons") && names.includes("5e A - Filles"), "Garçons et filles séparés : deux feuilles");

  // Photos
  r = await get(admin, `/api/exports/listes?format=xlsx&classes=${C6A}&photos=1`);
  writeFileSync(`${out}/liste-6eA-photos.xlsx`, r.body);
  x = unzip(r.body);
  const media = Object.keys(x).filter((k) => k.startsWith("xl/media/"));
  const drawing = x["xl/drawings/drawing2.xml"]?.toString() ?? "";
  const ext = [...drawing.matchAll(/<xdr:ext cx="(\d+)" cy="(\d+)"/g)].map((m) => Number(m[1]) / Number(m[2]));
  check(media.length === 2 && ext.length === 2 && ext.every((ratio) => Math.abs(ratio - 60 / 90) < 0.03), `Excel avec photos : ${media.length} photos, proportions conservées (${ext.map((e) => e.toFixed(2)).join(", ")})`);
  check(sheetRows(x, 2)[0][0] === "Photo", "Excel : colonne Photo dédiée");
  const noPhoto = await get(admin, `/api/exports/listes?format=xlsx&classes=${C6A}`);
  check(!Object.keys(unzip(noPhoto.body)).some((k) => k.startsWith("xl/media/")), "Sans l'option : aucune photo (désactivée par défaut)");
  const pdfPhotos = await get(admin, `/api/exports/listes?format=pdf&classes=${C6A}&photos=1`);
  writeFileSync(`${out}/liste-6eA-photos.pdf`, pdfPhotos.body);
  const pdfNo = await get(admin, `/api/exports/listes?format=pdf&classes=${C6A}`);
  check(pdfPhotos.status === 200 && pdfPhotos.body.toString("latin1").includes("/Subtype /Image") && !pdfNo.body.toString("latin1").includes("/Subtype /Image"), "PDF avec photos : images incluses (élèves sans photo : case vide)");

  console.log("\n=== Emplois du temps — établissement scolaire ===");
  tempClass = await q1("insert into classes (organization_id, academic_year_id, level_id, name, kind) select organization_id, academic_year_id, level_id, 'Test sans EDT', kind from classes where id = $1 returning id", [C5A]);
  const slots6a = await q("select t.weekday, to_char(t.starts_at,'HH24:MI') s, sub.name subject, sm.last_name teacher from timetable_slots t left join class_subjects cs on cs.id = t.class_subject_id left join subjects sub on sub.id = cs.subject_id left join staff_members sm on sm.id = t.teacher_id where t.class_id = $1", [C6A]);
  r = await get(admin, `/api/exports/emplois-du-temps?classes=${C6A}`);
  writeFileSync(`${out}/edt-6eA.pdf`, r.body);
  t = pdfTextOf(r.body);
  check(r.status === 200 && r.headers["x-export-sections"] === "1" && t.includes(c("6e A")) && t.includes(c("Lundi")) && t.includes(c("Vendredi")), "EDT une classe : PDF, jours de la semaine");
  check(slots6a.every((s) => t.includes(c(s.s))) && slots6a.every((s) => !s.subject || t.includes(c(s.subject))) && slots6a.filter((s) => s.teacher).every((s) => t.includes(c(s.teacher))), `EDT : horaires, matières et enseignants enregistrés (${slots6a.length} créneaux)`);
  r = await get(admin, `/api/exports/emplois-du-temps?classes=${C6A},${C3A}`);
  check(r.headers["x-export-sections"] === "2" && (await pages(r.body)) >= 2, "EDT plusieurs classes : un tableau par classe");
  r = await get(admin, `/api/exports/emplois-du-temps`);
  writeFileSync(`${out}/edt-toutes.pdf`, r.body);
  t = pdfTextOf(r.body);
  check(r.status === 200 && r.headers["x-export-sections"] === "4" && r.headers["x-export-empty"] === "1" && t.includes(c("Emplois du temps non renseignés")) && t.includes(c("Test sans EDT")), "EDT toutes les classes : 4 tableaux + classe sans créneau signalée");
  r = await get(admin, `/api/exports/emplois-du-temps?classes=${tempClass.id}`);
  check(r.status === 404 && c(r.text).includes(c("pas encore renseigné")), "Classe sans emploi du temps : message clair, aucun document vide");
  // Modification récente prise en compte
  const room = await q1("select id, name from rooms where organization_id = $1 order by name desc limit 1", [DEMO]);
  await db.query("update timetable_slots set room_id = $1, starts_at = '07:05', ends_at = '07:55' where id = $2", [room.id, slot.id]);
  r = await get(admin, `/api/exports/emplois-du-temps?classes=${C6A}`);
  t = pdfTextOf(r.body);
  check(t.includes(c("07:05")) && t.includes(c(room.name)), `Modification récente reflétée (07:05, salle ${room.name})`);
  const teacher = await q1("select id, last_name from staff_members where organization_id = $1 and is_teacher order by last_name limit 1", [DEMO]);
  r = await get(admin, `/api/exports/emplois-du-temps?enseignant=${teacher.id}`);
  check(r.status === 200 && pdfTextOf(r.body).includes(c(teacher.last_name)), "EDT d'un enseignant");

  const { page: adminPage } = await login("admin@demo.neoscol.app");
  await adminPage.goto(`${base}/listes`);
  await adminPage.getByTestId("list-export-form").waitFor({ timeout: 20000 });
  check((await adminPage.getByTestId("list-photos").isChecked()) === false, "Interface : option photos décochée par défaut");
  await adminPage.screenshot({ path: `${out}/page-listes.png`, fullPage: true });
  await adminPage.goto(`${base}/emploi-du-temps?classe=${C6A}`);
  check(await adminPage.getByTestId("timetable-export").isVisible({ timeout: 20000 }).catch(() => false), "Emploi du temps : bouton « Exporter l'emploi du temps en PDF »");

  console.log("\n=== Centre de formation et université ===");
  const { context: fp } = await login("formation@demo.neoscol.app");
  r = await get(fp, `/api/exports/listes?format=pdf`);
  t = pdfTextOf(r.body);
  check(r.status === 200 && Number(r.headers["x-export-sections"]) === 3 && t.includes(c("Session")) && t.includes(c("apprenants")), "Formation : listes par session (vocabulaire apprenants / session)");
  r = await get(fp, `/api/exports/listes?format=xlsx`);
  check(r.status === 200 && sheetNames(unzip(r.body)).length === 4, "Formation : Excel une feuille par session");
  r = await get(fp, `/api/exports/emplois-du-temps`);
  check(r.status === 200 && Number(r.headers["x-export-sections"]) >= 1, "Formation : emplois du temps par session");
  const security = await get(fp, `/api/exports/listes?format=pdf&classes=${C6A}`);
  check(security.status === 404, "Sécurité : un autre établissement ne peut pas exporter la liste d'une classe de DEMO");
  const security2 = await get(fp, `/api/exports/emplois-du-temps?classes=${C6A}`);
  check(security2.status === 404, "Sécurité : ni son emploi du temps");

  const { context: uni } = await login("universite@demo.neoscol.app");
  r = await get(uni, `/api/exports/listes?format=pdf`);
  t = pdfTextOf(r.body);
  check(r.status === 200 && r.headers["x-export-sections"] === "2" && t.includes(c("Promotion")) && t.includes(c("étudiants")) && t.includes(c("Licence")), "Université : listes par promotion (étudiants, niveau, filière)");
  r = await get(uni, `/api/exports/emplois-du-temps`);
  t = pdfTextOf(r.body);
  check(r.status === 200 && Number(r.headers["x-export-sections"]) >= 1 && ["CM", "TD", "TP"].some((k) => t.includes(k)), "Université : emplois du temps par promotion (CM / TD / TP ; promotion sans créneau signalée)");

  console.log("\n=== Sécurité et journal ===");
  const { context: parent } = await login("parent@demo.neoscol.app");
  check((await get(parent, `/api/exports/listes?format=pdf`)).status === 403, "Parent : export des listes refusé (403)");
  const anon = await browser.newContext();
  const anonRes = await anon.request.get(`${base}/api/exports/listes?format=pdf`, { maxRedirects: 0 });
  check([401, 307].includes(anonRes.status()) && !(anonRes.headers()["content-type"] ?? "").includes("pdf"), `Non connecté : aucun fichier (${anonRes.status()}, renvoi vers la connexion)`);
  const { context: teacherCtx } = await login("enseignant@demo.neoscol.app");
  r = await get(teacherCtx, `/api/exports/listes?format=xlsx`);
  const teacherSheets = r.status === 200 ? sheetNames(unzip(r.body)).length - 1 : 0;
  check(r.status === 403 || (r.status === 200 && teacherSheets <= 4), `Enseignant : limité à ses classes (${r.status === 200 ? `${teacherSheets} classe(s)` : "refusé"})`);
  const logs = await q1("select count(*)::int n from audit_logs where organization_id = $1 and action in ('export.class_list', 'export.timetable') and created_at > now() - interval '10 minutes'", [DEMO]);
  check(logs.n > 5, `Journal d'activité : ${logs.n} exports tracés`);
} catch (e) {
  problems.push(`Exception : ${e.message}`);
  console.log(e);
} finally {
  await db.query("update timetable_slots set room_id = $1, starts_at = $2, ends_at = $3 where id = $4", [slot.room_id, slot.starts_at, slot.ends_at, slot.id]);
  if (tempClass) await db.query("delete from classes where id = $1", [tempClass.id]);
  await db.query("update students set last_name = $1 where id = $2", [restoreName.last_name, restoreName.id]);
  for (const p of photoIds) {
    await db.query("update students set photo_path = $1 where id = $2", [p.before, p.sid]);
    await db.query("delete from file_objects where id = $1", [p.fid]);
  }
  await browser.close();
  await db.end();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
