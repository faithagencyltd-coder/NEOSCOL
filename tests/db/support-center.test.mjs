// Support Center : chatbot désactivé par défaut, base de connaissances (publiés
// seulement), conversation protégée par jeton, transfert vers une demande
// d'assistance, réponse de l'équipe visible dans la conversation, droits.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const one = async (q, sql, params) => (await q(sql, params))[0];
const h = (t) => createHash("sha256").update(`support|${t}`).digest("hex");

describe("Support Center", () => {
  test("réglages par défaut, base de connaissances, droits", async () => {
    await as(USERS.admin, async (q) => {
      const s = await one(q, "select chatbot_enabled, ai_enabled, whatsapp_inbound_enabled from support_settings where id = 1");
      assert.deepEqual([s.chatbot_enabled, s.ai_enabled, s.whatsapp_inbound_enabled], [false, false, false], "modules sensibles désactivés par défaut");
      assert.match(await rejects(q("select platform_save_support_settings('{\"chatbot_enabled\": true}'::jsonb)")), /Réservé à l'administration/);
      assert.match(await rejects(q("select support_chat_record($1, $2, 'visitor', 'x', '{}', null)", [randomUUID(), h("x")])), /permission denied/);
      assert.match(await rejects(q("select * from support_secrets")), /permission denied/);
      assert.equal((await q("select * from support_conversations")).length, 0, "conversations invisibles pour un établissement");
      assert.equal((await q("select * from knowledge_articles where not published")).length, 0, "brouillons invisibles");
    });
    await as(USERS.superadmin, async (q) => {
      const id = (await one(q, "select platform_save_knowledge_article(null, $1) id", [JSON.stringify({ category: "connexion", title: "Réinitialiser son mot de passe", body: "Cliquez sur « Mot de passe oublié » puis suivez le lien reçu par e-mail.", keywords: ["mot de passe", "oublié"], audience: "all", published: true })])).id;
      const found = await q("select id from knowledge_search('j''ai oublié mon mot de passe', 'public', 3)");
      assert.ok(found.some((r) => r.id === id), "article publié trouvé");
      await q("select platform_save_knowledge_article($1, $2)", [id, JSON.stringify({ category: "connexion", title: "Réinitialiser son mot de passe", body: "Cliquez sur « Mot de passe oublié » puis suivez le lien reçu par e-mail.", audience: "all", published: false })]);
      assert.equal((await q("select id from knowledge_search('mot de passe oublié', 'public', 3) where id = $1", [id])).length, 0, "dépublié : plus utilisé");
    });
  });

  test("conversation : jeton, transfert, réponse de l'équipe, messages suivants rattachés à la demande", async () => {
    await as(USERS.superadmin, async (q) => {
      await switchTo(q, null);
      const token = "jeton-de-test-suffisamment-long-123456";
      const conv = (await one(q, "insert into support_conversations (channel, token_hash, audience) values ('chatbot', $1, 'public') returning id", [h(token)])).id;
      await q("select support_chat_record($1, $2, 'visitor', 'Combien coûte NeoScool ?', '{}', null)", [conv, h(token)]);
      assert.match(await rejects(q("select support_chat_record($1, $2, 'visitor', 'intrus', '{}', null)", [conv, h("autre")])), /introuvable/, "mauvais jeton refusé");
      assert.match(await rejects(q("select support_chat_handoff($1, $2, 'Awa', '', '', '')", [conv, h(token)])), /e-mail ou un téléphone/, "contact exigé pour un visiteur");
      const t = (await one(q, "select support_chat_handoff($1, $2, 'Awa', 'awa@exemple.ci', '', 'Tarifs') r", [conv, h(token)])).r;
      const ticket = await one(q, "select channel, organization_id, requester_email, description from support_tickets where id = $1", [t.ticket_id]);
      assert.equal(ticket.channel, "chatbot");
      assert.equal(ticket.organization_id, null);
      assert.equal(ticket.requester_email, "awa@exemple.ci");
      assert.match(ticket.description, /Combien coûte NeoScool/, "historique joint à la demande");
      assert.equal((await one(q, "select status from support_conversations where id = $1", [conv])).status, "waiting_agent");

      await switchTo(q, USERS.superadmin);
      await q("select platform_support_reply($1, 'Bonjour Awa, les tarifs sont sur la page Tarifs.')", [conv]);
      await switchTo(q, null);
      const agent = await q("select body from support_conversation_messages where conversation_id = $1 and sender = 'agent'", [conv]);
      assert.equal(agent.length, 1, "réponse de l'équipe visible dans la conversation");
      assert.equal((await one(q, "select status from support_conversations where id = $1", [conv])).status, "agent");
      await q("select support_chat_record($1, $2, 'visitor', 'Merci, et pour une université ?', '{}', null)", [conv, h(token)]);
      const msgs = await q("select author_side, body from support_ticket_messages where ticket_id = $1 order by created_at", [t.ticket_id]);
      assert.ok(msgs.some((m) => m.author_side === "visitor" && /université/.test(m.body)), "message suivant rattaché à la demande");
      assert.ok(msgs.some((m) => m.author_side === "platform"), "réponse enregistrée dans la demande");
    });
  });

  test("compte d'établissement : la demande transférée apparaît dans son Assistance", async () => {
    await as(USERS.admin, async (q) => {
      await switchTo(q, null);
      const token = "jeton-ecole-suffisamment-long-0987654321";
      const conv = (await one(q, "insert into support_conversations (channel, token_hash, audience, organization_id, user_id) values ('chatbot', $1, 'school', $2, $3) returning id", [h(token), ORG_DEMO, USERS.admin])).id;
      await q("select support_chat_record($1, $2, 'visitor', 'Comment importer mes élèves ?', '{}', null)", [conv, h(token)]);
      const t = (await one(q, "select support_chat_handoff($1, $2, '', '', '', '') r", [conv, h(token)])).r;
      await switchTo(q, USERS.admin);
      assert.equal((await q("select id from support_tickets where id = $1", [t.ticket_id])).length, 1, "visible par l'auteur dans Assistance");
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from support_tickets where id = $1", [t.ticket_id])).length, 0, "invisible pour un autre membre sans droit");
    });
  });
});
