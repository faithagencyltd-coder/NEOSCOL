// P7d — Centre d'envois : modèles avec variables vérifiées, publics calculés en
// base (parents, classes, impayés, personnel), contacts masqués, envoi par lots
// réservé au serveur, historique par destinataire, automatisation, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

async function template(q, org = ORG_DEMO, channel = "sms", body = "Bonjour {{destinataire}}, solde de {{eleve_prenom}} : {{solde}} {{devise}}.", subject = null) {
  const [{ id }] = await q("select save_message_template($1, null, 'Rappel test', $2, $3, $4) as id", [org, channel, subject, body]);
  return id;
}

describe("Modèles de messages", () => {
  test("variables et longueurs vérifiées en base ; réservé à communication.send", async () => {
    await as(USERS.admin, async (q) => {
      assert.ok(await template(q));
      assert.match(await rejects(template(q, ORG_DEMO, "sms", "Bonjour {{mot_de_passe}}")), /Variable inconnue/);
      assert.match(await rejects(template(q, ORG_DEMO, "sms", "x".repeat(481))), /480 caractères/);
      assert.match(await rejects(template(q, ORG_DEMO, "email", "Bonjour {{destinataire}}")), /Objet de l'e-mail/);
      assert.ok(await template(q, ORG_DEMO, "email", "Bonjour {{destinataire}}", "Information {{etablissement}}"));
      assert.match(await rejects(template(q, ORG_DEMO, "whatsapp", "Bonjour")), /modèle approuvé par Meta/);

      for (const user of [USERS.teacher, USERS.secretary, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(template(q)), /Permission refusée/);
      }
    });
  });

  test("WhatsApp : modèle approuvé et nombre de variables exact", async () => {
    await as(null, async (q) => {
      const [{ id: wa }] = await q("insert into whatsapp_templates (name, language, variables_count) values ('rappel_solde', 'fr', 2) returning id");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select save_message_template($1, null, 'WA', 'whatsapp', null, 'Rappel', $2, array['destinataire'])", [ORG_DEMO, wa])), /attend 2 variable/);
      const [{ id }] = await q("select save_message_template($1, null, 'WA', 'whatsapp', null, 'Rappel', $2, array['destinataire', 'solde']) as id", [ORG_DEMO, wa]);
      assert.ok(id);
      assert.equal((await q("select id from whatsapp_templates where id = $1", [wa])).length, 1, "modèle approuvé visible par l'établissement");
    });
  });
});

describe("Publics et envois", () => {
  test("aperçu : public calculé en base, coordonnées masquées", async () => {
    await as(USERS.admin, async (q) => {
      const [{ p: all }] = await q(`select preview_message_audience($1, '{"kind":"guardians"}', 'sms') as p`, [ORG_DEMO]);
      const [{ n }] = await q("select count(*)::int as n from students s where organization_id = $1 and status = 'active' and archived_at is null and exists (select 1 from student_guardians sg where sg.student_id = s.id)", [ORG_DEMO]);
      assert.equal(all.total, n, "un message par élève (responsable principal)");
      assert.ok(all.sample.every((x) => x.contact.includes("•")), "numéros masqués dans l'aperçu");
      const [{ p: unpaid }] = await q(`select preview_message_audience($1, '{"kind":"unpaid"}', 'sms') as p`, [ORG_DEMO]);
      const [{ o }] = await q("select count(distinct b.student_id)::int as o from student_balances b join students s on s.id = b.student_id where b.organization_id = $1 and b.has_overdue and s.status = 'active' and s.archived_at is null and exists (select 1 from student_guardians sg where sg.student_id = s.id)", [ORG_DEMO]);
      assert.equal(unpaid.total, o, "parents d'élèves en impayé uniquement");
      assert.match(unpaid.sample[0].variables.solde, /^\d[\d ]*$/, "solde formaté");
      const [cls] = await q("select c.id from classes c join academic_years y on y.id = c.academic_year_id and y.is_current where c.organization_id = $1 and c.name = '6e A'", [ORG_DEMO]);
      const [{ p: byClass }] = await q("select preview_message_audience($1, $2::jsonb, 'sms') as p", [ORG_DEMO, JSON.stringify({ kind: "classes", class_ids: [cls.id] })]);
      assert.ok(byClass.total > 0 && byClass.total < all.total);
      assert.match(await rejects(q(`select preview_message_audience($1, '{"kind":"classes"}', 'sms')`, [ORG_DEMO])), /au moins une classe/);
      const [{ p: staff }] = await q(`select preview_message_audience($1, '{"kind":"staff"}', 'email') as p`, [ORG_DEMO]);
      assert.ok(staff.total > 0);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q(`select preview_message_audience($1, '{"kind":"guardians"}', 'sms')`, [ORG_DEMO])), /Permission refusée/);
    });
  });

  test("envoi : destinataires figés, lot réservé au serveur, résultats par destinataire, audit", async () => {
    await as(USERS.admin, async (q) => {
      const tpl = await template(q);
      const [{ id }] = await q(`select create_message_campaign($1, $2, 'Relance octobre', '{"kind":"unpaid"}') as id`, [ORG_DEMO, tpl]);
      const [c] = await q("select status, total, channel, body from message_campaigns where id = $1", [id]);
      assert.equal(c.status, "ready");
      assert.ok(c.total > 0);
      const rec = await q("select contact_masked, status, variables from message_campaign_recipients where campaign_id = $1", [id]);
      assert.ok(rec.every((r) => !r.contact_masked || r.contact_masked.includes("•")), "aucune coordonnée en clair dans l'historique");
      // Le navigateur (rôle authentifié) ne peut ni lire les contacts en clair ni écrire les résultats.
      assert.match(await rejects(q("select * from message_campaign_batch($1, 10)", [id])), /permission denied/);
      assert.match(await rejects(q("select message_campaign_record($1, '[]'::jsonb)", [id])), /permission denied/);

      await switchTo(q, null);
      const batch = await q("select * from message_campaign_batch($1, 200)", [id]);
      assert.equal(batch.length, rec.filter((r) => r.status === "pending").length);
      assert.ok(batch.every((b) => /^\+?\d+$/.test(b.contact)), "contact en clair relu en base pour le serveur");
      const results = batch.map((b, i) => ({ id: b.recipient_id, status: i === 0 ? "failed" : "sent", error: i === 0 ? "Numéro invalide" : null }));
      const [{ r }] = await q("select message_campaign_record($1, $2::jsonb) as r", [id, JSON.stringify(results)]);
      assert.equal(r.pending, 0);
      const [done] = await q("select status, sent, failed from message_campaigns where id = $1", [id]);
      assert.deepEqual(done, { status: "done", sent: batch.length - 1, failed: 1 });
      const audit = await q("select action from audit_logs where entity_id = $1 order by created_at", [id]);
      assert.deepEqual(audit.map((a) => a.action), ["communication.campaign_created", "communication.campaign_sent"]);

      // Isolation : un autre établissement ne voit rien et ne peut pas réutiliser le modèle.
      await switchTo(q, USERS.otherOrgAdmin);
      assert.equal((await q("select id from message_campaigns where id = $1", [id])).length, 0);
      assert.equal((await q("select id from message_campaign_recipients where campaign_id = $1", [id])).length, 0);
      assert.match(await rejects(q(`select create_message_campaign($1, $2, 'x', '{"kind":"guardians"}')`, [ORG_DEMOF, tpl])), /introuvable/);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select id from message_templates where id = $1", [tpl])).length, 0, "modèles invisibles sans la permission");
    });
  });

  test("arrêt d'un envoi : destinataires restants non contactés, historique conservé", async () => {
    await as(USERS.director, async (q) => {
      const tpl = await template(q);
      const [{ id }] = await q(`select create_message_campaign($1, $2, null, '{"kind":"staff"}') as id`, [ORG_DEMO, tpl]);
      await q("select cancel_message_campaign($1)", [id]);
      assert.equal((await q("select status from message_campaigns where id = $1", [id]))[0].status, "cancelled");
      assert.match(await rejects(q("select cancel_message_campaign($1)", [id])), /déjà terminé/);
      await switchTo(q, null);
      assert.equal((await q("select * from message_campaign_batch($1, 10)", [id])).length, 0, "plus aucun lot après l'arrêt");
    });
  });

  test("relance automatique des impayés : modèle actif exigé, exécutée une fois par période", async () => {
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select save_communication_automation($1, 'invoice_overdue', null, true, 7)", [ORG_DEMO])), /modèle de message actif/);
      const tpl = await template(q);
      await q("select save_communication_automation($1, 'invoice_overdue', $2, true, 7)", [ORG_DEMO, tpl]);
      await switchTo(q, null);
      const due = await q("select * from due_communication_automations()");
      assert.ok(due.some((d) => d.organization_id === ORG_DEMO && d.template_id === tpl));
      assert.equal((await q("select * from due_communication_automations()")).filter((d) => d.organization_id === ORG_DEMO).length, 0, "pas de doublon dans la période");
      const [{ id }] = await q(`select create_message_campaign($1, $2, 'Auto', '{"kind":"unpaid"}', 'automation') as id`, [ORG_DEMO, tpl]);
      assert.equal((await q("select source from message_campaigns where id = $1", [id]))[0].source, "automation");
    });
  });
});
