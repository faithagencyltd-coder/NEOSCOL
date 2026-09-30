// Site et marque : lecture publique, modifications réservées au Super Admin,
// validations (e-mail, WhatsApp, questions, couleur, logo), journal d'audit.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Site et marque", () => {
  test("lecture publique, table non exposée", async () => {
    await as("anon", async (q) => {
      const [{ s }] = await q("select site_settings() s");
      assert.ok(Array.isArray(s.faq));
      assert.match(await rejects(q("select * from platform_site_settings")), /permission/i);
    });
  });

  test("modifications Super Admin seulement ; validations ; audit", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_save_site_contacts('a@b.co', null, null, null, null)")), /Réservé|plateforme/i);
      assert.match(await rejects(q("select platform_save_site_brand('#123456', null)")), /Réservé|plateforme/i);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_save_site_contacts('pas-un-email', null, null, null, null)")), /check/i);
      assert.match(await rejects(q("select platform_save_site_contacts(null, null, '12', null, null)")), /check/i);
      await q("select platform_save_site_contacts('Contact@NeoScool.com', '+229 01 90 00 00 00', '+229 01-90-00-00-00', 'Cotonou', 'Lun–ven 8 h–18 h')");
      assert.match(await rejects(q(`select platform_save_site_faq('[{"q":"?","a":"Réponse"}]')`)), /Chaque question/);
      await q(`select platform_save_site_faq('[{"q":" Comment payer ? ","a":"Par mobile money."}]')`);
      await q("select platform_save_site_legal('## Objet\nTexte', null)");
      assert.match(await rejects(q("select platform_save_site_brand('rouge', null)")), /check/i);
      assert.match(await rejects(q("select platform_save_site_brand(null, '../../etc/passwd')")), /check/i);
      await q("select platform_save_site_brand('#0B6E4F', 'logo/abc.png')");
      await switchTo(q, null);
      await q("set local role anon");
      const [{ s }] = await q("select site_settings() s");
      assert.equal(s.contact_email, "contact@neoscool.com");
      assert.equal(s.whatsapp, "2290190000000", "WhatsApp : chiffres seulement");
      assert.deepEqual(s.faq, [{ q: "Comment payer ?", a: "Par mobile money." }]);
      assert.equal(s.terms, "## Objet\nTexte");
      assert.ok(s.terms_updated_at);
      assert.equal(s.privacy, null);
      assert.equal(s.primary_color, "#0b6e4f");
      assert.equal(s.logo_path, "logo/abc.png");
      await switchTo(q, null);
      const [{ n }] = await q("select count(*)::int n from audit_logs where action = 'platform.site_settings_saved'");
      assert.ok(n >= 4, "modifications journalisées");
    });
  });
});
