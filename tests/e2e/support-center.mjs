// Support Center : activation par le Super Admin, article publié, chatbot du
// site (réponse tirée de l'article), transfert vers l'équipe (demande créée),
// réponse de l'équipe reçue dans la bulle, webhook WhatsApp (vérification,
// signature), désactivation.
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import pg from "pg";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = process.env.RESULTS_DIR ?? "test-results/e2e-support";
mkdirSync(out, { recursive: true });
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const problems = [];
const check = (c, label) => (c ? console.log("OK", label) : (console.log("KO", label), problems.push(label)));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const stamp = Date.now();
const toast = (page, text) => page.getByText(text).first().waitFor({ timeout: 20000 });

async function login(identifier) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => problems.push(`[${identifier}] ${e.message}`));
  await page.goto(`${base}/connexion`);
  await page.getByLabel("Adresse e-mail ou matricule").fill(identifier);
  await page.getByLabel("Mot de passe").fill("NeoScol-Demo-2026!");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 30000 });
  return page;
}

await q("update support_settings set chatbot_enabled = false, chatbot_on_site = true, chatbot_in_portals = true, ai_enabled = false, whatsapp_inbound_enabled = false, whatsapp_bot_replies = false where id = 1");
await q("delete from knowledge_articles where title like 'Essai gratuit E2E%'");

const anon = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "fr-FR", extraHTTPHeaders: { DNT: "1" } })).newPage();
anon.on("pageerror", (e) => problems.push(`[visiteur] ${e.message}`));

console.log("\n=== 1. Désactivé par défaut ===");
await anon.goto(`${base}/tarifs`);
check((await anon.getByTestId("support-chat-open").count()) === 0, "aucune bulle tant que le Super Admin n'a pas activé l'assistant");

console.log("\n=== 2. Super Admin : article et activation ===");
const sa = await login("superadmin@demo.neoscol.app");
await sa.goto(`${base}/plateforme/support?onglet=connaissances`);
await sa.getByRole("button", { name: "Nouvel article" }).click();
let dlg = sa.getByRole("dialog");
await dlg.getByLabel("Question / titre").fill(`Essai gratuit E2E ${stamp} : comment en profiter ?`);
await dlg.getByLabel("Réponse").fill("L'essai gratuit s'active à l'inscription de l'établissement, sans moyen de paiement, selon la durée affichée sur la page Tarifs.");
await dlg.getByLabel(/Mots-clés/).fill("essai, gratuit, tester");
await dlg.getByLabel(/Publié/).check();
await dlg.getByRole("button", { name: "Enregistrer" }).click();
await toast(sa, "Article enregistré.");
await sa.goto(`${base}/plateforme/support?onglet=reglages`);
const st = sa.getByTestId("support-settings");
await st.getByLabel(/Assistant activé/).check();
await st.getByRole("button", { name: "Enregistrer" }).first().click();
await toast(sa, "Réglages du Support Center enregistrés.");
check((await q("select chatbot_enabled from support_settings where id = 1"))[0].chatbot_enabled === true, "assistant activé");

console.log("\n=== 3. Visiteur : question, réponse, transfert ===");
await anon.goto(`${base}/tarifs`);
await anon.getByTestId("support-chat-open").click();
const chat = anon.getByTestId("support-chat");
await chat.getByTestId("support-chat-input").fill("Comment profiter de l'essai gratuit ?");
await chat.getByTestId("support-chat-input").press("Enter");
await chat.locator('[data-sender="bot"]').first().waitFor({ timeout: 20000 });
check((await chat.locator('[data-sender="bot"]').first().textContent())?.includes("L'essai gratuit s'active"), "réponse tirée de l'article publié");
await chat.getByTestId("support-chat-input").fill("Pouvez-vous intégrer notre logiciel de cantine ?");
await chat.getByTestId("support-chat-input").press("Enter");
await chat.getByTestId("support-handoff-offer").waitFor({ timeout: 20000 });
check(true, "proposition de parler à l'équipe quand l'assistant ne sait pas");
await chat.getByRole("button", { name: "Parler à l'équipe Support" }).click();
const hf = chat.getByTestId("support-handoff-form");
await hf.getByLabel("Votre nom").fill("Visiteur Support");
await hf.getByLabel("E-mail").fill(`support.${stamp}@exemple.ci`);
await hf.getByLabel("Objet").fill("Intégration cantine");
await hf.getByRole("button", { name: "Envoyer au Support" }).click();
await chat.locator('[data-sender="system"]').first().waitFor({ timeout: 20000 });
const [ticket] = await q("select id, number, channel, organization_id, requester_email from support_tickets where requester_email = $1", [`support.${stamp}@exemple.ci`]);
check(ticket?.channel === "chatbot" && ticket.organization_id === null, "demande d'assistance créée (canal chatbot)");
await anon.screenshot({ path: `${out}/01-chat.png` });

console.log("\n=== 4. Équipe : réponse depuis la console ===");
await sa.goto(`${base}/plateforme/support`);
await sa.getByTestId("support-conversations").getByRole("link").filter({ hasText: "Visiteur Support" }).first().click();
await sa.getByTestId("support-thread").waitFor();
await sa.getByTestId("support-reply").getByLabel("Réponse").fill("Bonjour, l'intégration se fait par export Excel. Un conseiller vous écrit.");
await sa.getByRole("button", { name: "Répondre" }).click();
await toast(sa, "Réponse envoyée.");
await chat.locator('[data-sender="agent"]').first().waitFor({ timeout: 20000 });
check(true, "réponse de l'équipe reçue dans la bulle du visiteur");
await sa.goto(`${base}/plateforme/incidents/${ticket.id}`);
check(await sa.getByTestId("ticket-requester").getByText(`support.${stamp}@exemple.ci`).isVisible(), "contact du visiteur sur la demande");
await sa.screenshot({ path: `${out}/02-console.png`, fullPage: true });

console.log("\n=== 5. WhatsApp (webhook officiel) ===");
const verify = `verif-${stamp}-abcdefgh`;
const appSecret = "0123456789abcdef0123456789abcdef";
await sa.goto(`${base}/plateforme/support?onglet=reglages`);
await sa.getByLabel("Jeton de vérification").fill(verify);
await sa.getByLabel("Secret de l'application Meta").fill(appSecret);
await sa.getByRole("button", { name: /Enregistrer \(jamais réaffichés\)/ }).click();
await toast(sa, /Identifiants du webhook WhatsApp enregistrés/);
check(!(await sa.content()).includes(appSecret) && !(await sa.content()).includes(verify), "identifiants jamais réaffichés");
const ok = await anon.request.get(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verify}&hub.challenge=42`);
check(ok.status() === 200 && (await ok.text()) === "42", "vérification Meta acceptée avec le bon jeton");
check((await anon.request.get(`${base}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=faux&hub.challenge=42`)).status() === 403, "mauvais jeton refusé");
await q("update support_settings set whatsapp_inbound_enabled = true where id = 1");
const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "2250700000099", type: "text", text: { body: "Bonjour, je veux une démo" } }] } }] }] });
check((await anon.request.post(`${base}/api/webhooks/whatsapp`, { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": "sha256=faux" } })).status() === 401, "signature invalide refusée");
const sig = `sha256=${createHmac("sha256", appSecret).update(payload).digest("hex")}`;
const res = await anon.request.post(`${base}/api/webhooks/whatsapp`, { data: payload, headers: { "content-type": "application/json", "x-hub-signature-256": sig } });
check(res.status() === 200, "message signé accepté");
const wa = await q("select c.status, t.channel, t.requester_phone from support_conversations c left join support_tickets t on t.id = c.ticket_id where c.whatsapp_from = '2250700000099' order by c.created_at desc limit 1");
check(wa[0]?.channel === "whatsapp" && wa[0]?.requester_phone === "+2250700000099", "message WhatsApp transformé en demande pour l'équipe");

console.log("\n=== 6. Désactivation ===");
await q("update support_settings set chatbot_enabled = false, whatsapp_inbound_enabled = false where id = 1");
await anon.goto(`${base}/tarifs`);
check((await anon.getByTestId("support-chat-open").count()) === 0, "bulle retirée quand l'assistant est désactivé");
check((await q("select count(*)::int n from support_tickets where id = $1", [ticket.id]))[0].n === 1, "historique conservé");

// Nettoyage des données du test.
await q("delete from support_conversations where whatsapp_from = '2250700000099' or ticket_id = $1", [ticket.id]);
await q("delete from support_tickets where requester_email = $1 or requester_phone = '+2250700000099'", [`support.${stamp}@exemple.ci`]);
await q("delete from knowledge_articles where title like 'Essai gratuit E2E%'");
await q("update support_secrets set whatsapp_verify_token_hash = null, whatsapp_app_secret_ciphertext = null where id = 1");
await browser.close();
await db.end();
console.log(problems.length ? `\n${problems.length} problème(s) :\n- ${problems.join("\n- ")}` : "\nTout est conforme.");
process.exit(problems.length ? 1 : 0);
