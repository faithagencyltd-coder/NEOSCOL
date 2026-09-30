// Corrections R1, de bout en bout : (1) le menu mobile du site couvre tout
// l'écran avec un fond opaque ; (2) la carte des Documents est la carte au
// design 3D (plus l'ancien modèle plat), refusée tant qu'aucune carte n'est
// active ; (3) la tablette de pointage affiche la photo de la personne scannée
// (initiales si aucune photo), servie seulement aux comptes qui scannent et
// seulement pour une photo d'identité de l'établissement. Rejouable.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-corrections-r1";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q1 = async (sql, params) => (await db.query(sql, params)).rows[0];
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

const DEMO = (await q1("select id from organizations where code = 'DEMO'")).id;
const png = readFileSync(new URL("../../public/assets/neoscool/logo/neoscool-mark.png", import.meta.url));

try {
  // 1. Menu mobile du site : panneau plein écran, fond opaque, liens lisibles.
  for (const [path, locale] of [["/", "fr"], ["/en", "en"]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    page.on("pageerror", (e) => problems.push(`[menu ${locale}] ${e.message}`));
    await page.goto(`${base}${path}`, { waitUntil: "networkidle" });
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: locale === "fr" ? "Menu" : "Menu" }).first().click();
    const menu = page.getByTestId("site-mobile-menu");
    await menu.waitFor();
    const box = await menu.boundingBox();
    const style = await menu.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, parent: el.parentElement?.tagName }));
    check(box && box.height >= 840 && box.width >= 389 && box.y <= 1, `menu mobile ${locale} : couvre tout l'écran (${box?.width}×${box?.height})`);
    check(/rgb\(7, 20, 43\)/.test(style.bg), `menu mobile ${locale} : fond opaque (${style.bg})`);
    check(style.parent === "BODY", `menu mobile ${locale} : rendu hors de la barre du haut`);
    const topAt = await page.evaluate(() => {
      const el = document.elementFromPoint(195, 600);
      return el?.closest("[data-testid=site-mobile-menu]") ? "menu" : el?.tagName;
    });
    check(topAt === "menu", `menu mobile ${locale} : rien de la page ne passe par-dessus (${topAt})`);
    await page.screenshot({ path: `${out}/menu-mobile-${locale}.png` });
    await page.getByRole("button", { name: locale === "fr" ? "Fermer" : "Close" }).click();
    check((await menu.count()) === 0, `menu mobile ${locale} : se ferme`);
    await context.close();
  }

  // 2. Carte des Documents = carte au design 3D (générée depuis « Cartes scolaires »).
  const target = await q1(
    `select s.id, e.class_id from students s join enrollments e on e.student_id = s.id and e.status = 'validated'
       join classes c on c.id = e.class_id join academic_years y on y.id = c.academic_year_id and y.is_current
      where s.organization_id = $1 and s.archived_at is null and s.status = 'active'
        and not exists (select 1 from student_badges b where b.student_id = s.id and b.status = 'active')
      order by c.name, s.last_name limit 1`,
    [DEMO],
  );
  const { page: admin, context: actx } = await login("admin@demo.neoscol.app");
  const none = await admin.request.get(`${base}/api/documents/cartes/${target.id}`);
  check(none.status() === 409, "carte (Documents) : refusée tant qu'aucune carte n'est active");
  const startedAt = new Date();
  await admin.goto(`${base}/eleves/cartes?classe=${target.class_id}`);
  await admin.getByRole("button", { name: /Générer les cartes manquantes/ }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Générer" }).click();
  await admin.waitForTimeout(2500);
  const withBadge = target;
  const card = await admin.request.get(`${base}/api/documents/cartes/${withBadge.id}`);
  const cardPdf = await card.body();
  check(card.status() === 200 && card.headers()["content-type"]?.includes("application/pdf"), "carte (Documents) : PDF produit après génération");
  const pdfText = cardPdf.toString("latin1");
  const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(pages === 2, `carte (Documents) : recto + verso comme la carte 3D (${pages} pages)`);
  const printed = await admin.request.get(`${base}/api/cartes/${withBadge.id}/pdf`);
  check(printed.status() === 200, "carte 3D (Badge & QR) : toujours disponible");
  await admin.goto(`${base}/documents?eleve=${withBadge.id}`);
  check((await admin.locator("body").innerText()).includes("Carte 3D au design de l'établissement"), "page Documents : la carte annonce le modèle 3D");
  await admin.screenshot({ path: `${out}/documents-carte.png`, fullPage: true });

  // 3. Photo au scan.
  const teacher = await q1(
    "select s.id, s.first_name, s.last_name, s.photo_path, b.token from staff_members s join auth.users u on u.id = s.user_id join staff_badges b on b.staff_id = s.id and b.status = 'active' where u.email = 'enseignant@demo.neoscol.app'",
  );
  const other = await q1(
    "select s.id, s.photo_path, b.token from staff_members s join auth.users u on u.id = s.user_id join staff_badges b on b.staff_id = s.id and b.status = 'active' where u.email = 'secretariat@demo.neoscol.app'",
  );
  const file = await q1(
    `insert into file_objects (organization_id, bucket, path, owner_type, owner_id, category, file_name, mime_type, size_bytes, content)
     values ($1::uuid, 'database', $1::text || '/photos/e2e-r1-' || gen_random_uuid() || '.png', 'staff', $2, 'photo', 'photo.png', 'image/png', $3, $4) returning id`,
    [DEMO, teacher.id, png.length, png],
  );
  // Un fichier de l'établissement qui n'est PAS une photo d'identité (justificatif).
  const stray = await q1(
    `insert into file_objects (organization_id, bucket, path, owner_type, owner_id, category, file_name, mime_type, size_bytes, content)
     values ($1::uuid, 'database', $1::text || '/e2e-r1-' || gen_random_uuid() || '.png', 'organization', $1::uuid, 'justificatif', 'piece.png', 'image/png', $2, $3) returning id`,
    [DEMO, png.length, png],
  );
  await db.query("update staff_members set photo_path = $1 where id = $2", [file.id, teacher.id]);
  await db.query("update staff_members set photo_path = null where id = $1", [other.id]);
  // Journée vierge pour ces deux personnes (sinon « badge déjà scanné », sans photo).
  const clearScans = async () => {
    await db.query("update badge_scans set lesson_unlock_id = null where staff_id = any($1) and scanned_at >= now() - interval '1 day'", [[teacher.id, other.id]]);
    await db.query("delete from badge_scans where staff_id = any($1) and scanned_at >= now() - interval '1 day'", [[teacher.id, other.id]]);
    await db.query("delete from staff_attendance where staff_id = any($1) and work_date >= (now() at time zone 'Africa/Abidjan')::date - 1", [[teacher.id, other.id]]);
  };
  await clearScans();

  const { page: kiosk, context: kctx } = await login("pointage@demo.neoscol.app", { width: 1180, height: 820 });
  await kiosk.waitForURL("**/pointage");
  await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${teacher.token}`);
  await kiosk.keyboard.press("Enter");
  const photo = kiosk.getByTestId("scan-photo");
  await photo.waitFor({ timeout: 15000 }).catch(() => {});
  const loaded = await kiosk
    .waitForFunction(() => {
      const img = document.querySelector("[data-testid=scan-photo]");
      return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
    }, null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  await kiosk.waitForTimeout(1200);
  check(loaded, "tablette : la photo de la personne scannée s'affiche");
  check((await photo.getAttribute("alt"))?.includes(teacher.last_name) || (await photo.getAttribute("alt"))?.includes(teacher.first_name), "tablette : photo avec le nom de la personne");
  await kiosk.screenshot({ path: `${out}/tablette-photo.png` });
  await kiosk.waitForTimeout(4500);
  await kiosk.getByLabel("Code du badge").fill(`NEOSCOL-BADGE:${other.token}`);
  await kiosk.keyboard.press("Enter");
  await kiosk.getByTestId("scan-photo-missing").waitFor({ timeout: 15000 }).catch(() => {});
  await kiosk.waitForTimeout(1200);
  check(await kiosk.getByTestId("scan-photo-missing").isVisible().catch(() => false), "tablette : initiales et « Photo non enregistrée » sans photo");
  await kiosk.screenshot({ path: `${out}/tablette-sans-photo.png` });

  // Accès à la photo : la tablette oui ; un fichier qui n'est pas une photo d'identité, non.
  check((await kiosk.request.get(`${base}/api/pointage/photo/${file.id}`)).status() === 200, "photo : servie à la tablette");
  check((await kiosk.request.get(`${base}/api/pointage/photo/${stray.id}`)).status() === 404, "photo : un autre fichier de l'établissement n'est jamais servi");
  const { page: parent, context: pctx } = await (async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    return { page, context };
  })();
  const anonymous = (await parent.request.get(`${base}/api/pointage/photo/${file.id}`, { maxRedirects: 0 })).status();
  check([401, 307].includes(anonymous), `photo : refusée sans session (${anonymous})`);
  await pctx.close();
  const { page: teacherPage, context: tctx } = await login("enseignant@demo.neoscol.app");
  check((await teacherPage.request.get(`${base}/api/pointage/photo/${file.id}`)).status() === 403, "photo : refusée à un compte qui ne scanne pas");
  await tctx.close();

  // Nettoyage : l'enseignant retrouve son état d'origine.
  await clearScans();
  await db.query("update staff_members set photo_path = $1 where id = $2", [teacher.photo_path, teacher.id]);
  await db.query("update staff_members set photo_path = $1 where id = $2", [other.photo_path, other.id]);
  // Cartes de test retirées (base locale de démonstration) : le test reste rejouable.
  await db.query("delete from student_badges where organization_id = $1 and issued_at >= $2", [DEMO, startedAt]).catch((e) => console.log("(nettoyage des cartes :", e.message, ")"));
  await kctx.close();
  await actx.close();
} catch (e) {
  problems.push(`Exception : ${e.message}`);
} finally {
  await db.end();
  await browser.close();
}
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nToutes les vérifications sont passées.");
process.exit(problems.length ? 1 : 0);
