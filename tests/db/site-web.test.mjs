// Site web : contenu public administrable, systèmes institutionnels publiés
// seulement s'ils sont vérifiés, témoignages avec accord, demandes limitées.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const content = (q) => q("select site_public_content() c").then((r) => r[0].c);

describe("Site web", () => {
  test("lecture publique ; pays demandés affichés, jamais « déployés » par défaut", async () => {
    await as("anon", async (q) => {
      const c = await content(q);
      assert.deepEqual(c.countries.map((x) => x.code), ["BJ", "CI", "BF", "TG", "NE", "GA"]);
      assert.ok(c.countries.every((x) => x.availability === "configurable" && x.institutional_systems.length === 0));
      assert.deepEqual([c.videos, c.testimonials, c.social_links], [[], [], []], "rien d'inventé");
      assert.match(await rejects(q("select * from site_leads")), /permission/i);
    });
  });

  test("Super Admin : réseaux, pays (systèmes vérifiés seulement), vidéos, témoignages avec accord", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_save_social_link(null, 'facebook', 'Facebook', 'https://facebook.com/neoscool', true, 1)")), /Réservé|plateforme/i);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_save_social_link(null, 'facebook', 'Facebook', 'javascript:alert(1)', true, 1)")), /check/i);
      await q("select platform_save_social_link(null, 'linkedin', 'LinkedIn', 'https://linkedin.com/company/neoscool', true, 2)");
      await q("select platform_save_social_link(null, 'tiktok', 'TikTok', 'https://tiktok.com/@neoscool', false, 3)");
      await q(`select platform_save_country_profile('BJ', true, 'configurable', 'Enseignement primaire et secondaire', null, null, null,
        '[{"name":"Système A","description":"Vérifié","verified":true},{"name":"Système B","verified":false}]', null, null, 1)`);
      await q("select platform_save_site_video(null, 'school', 'Le module scolaire', null, null, 'https://videos.example/neoscool.mp4', null, true, 1)");
      assert.match(await rejects(q("select platform_save_testimonial(null, 'Nom', null, null, 'Un témoignage assez long.', null, false, true, 1)")), /accord confirmé/);
      await q("select platform_save_testimonial(null, 'Nom Réel', 'Directrice', 'École', 'Un témoignage assez long.', null, true, true, 1)");
      await q("select platform_save_site_web('Votre établissement. Un seul écosystème.', null, null, null, false, 'Bonjour', 'Parler à NeoScool', 'left', '{\"testimonials\": true}')");
      await switchTo(q, null);
      await q("update platform_site_settings set whatsapp = '2290100000000' where id = 1");
      await q("set local role anon");
      const c = await content(q);
      assert.deepEqual(c.social_links.map((s) => s.network), ["linkedin"], "réseaux désactivés masqués");
      assert.deepEqual(c.countries[0].institutional_systems, [{ name: "Système A", description: "Vérifié" }], "seuls les systèmes vérifiés");
      assert.equal(c.videos.length, 1);
      assert.equal(c.testimonials.length, 1);
      assert.equal(c.settings.whatsapp, null, "WhatsApp désactivé : numéro non publié");
      assert.equal(c.settings.whatsapp_position, "left");
    });
  });

  test("demandes : dépôt public, limite par adresse, suivi Super Admin", async () => {
    await as(null, async (q) => {
      await switchTo(q, null);
      await q("set local role anon");
      for (let i = 0; i < 5; i++) {
        await q("select submit_site_lead('demo', 'Awa K.', 'awa@ecole.bj', null, 'École', 'school', 'Bénin', 'Démonstration', 'fr')");
      }
      assert.match(await rejects(q("select submit_site_lead('demo', 'Awa K.', 'AWA@ecole.bj', null, null, null, null, null, 'fr')")), /Trop de demandes/);
      assert.match(await rejects(q("select submit_site_lead('contact', 'A', 'pas-un-email', null, null, null, null, null, 'fr')")), /check/i);
      await switchTo(q, USERS.superadmin);
      const [lead] = await q("select id from site_leads where email = 'awa@ecole.bj' limit 1");
      await q("select platform_update_lead($1, 'done', 'Rappelée')", [lead.id]);
      const [row] = await q("select status, admin_note from site_leads where id = $1", [lead.id]);
      assert.deepEqual([row.status, row.admin_note], ["done", "Rappelée"]);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select count(*)::int n from site_leads"))[0].n, 0, "invisible des établissements");
    });
  });
});
