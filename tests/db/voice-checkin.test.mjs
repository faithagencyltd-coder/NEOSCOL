// Voice Check-in : réglages par établissement (droits, variables vérifiées,
// audit), lecture par la tablette, désactivation par pays, isolation.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const save = (q, messages = {}, enabled = true) =>
  q("select save_voice_checkin_settings($1, $2, 'fr', 1.1, 0.8, false, $3::jsonb)", [ORG_DEMO, enabled, JSON.stringify(messages)]);

describe("Voice Check-in", () => {
  test("réglages : direction uniquement, variables et événements vérifiés, messages vides = défaut, audit", async () => {
    await as(USERS.admin, async (q) => {
      const [{ c: before }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.deepEqual([before.enabled, before.language, before.available], [false, "fr", true], "désactivé par défaut, langue du pays, disponible");
      await save(q, { arrival: "Bonjour {prenom}, bienvenue au {etablissement}.", departure: "  " });
      const [{ c }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.equal(c.enabled, true);
      assert.equal(Number(c.rate), 1.1);
      assert.equal(c.announce_names, false);
      assert.deepEqual(c.messages, { arrival: "Bonjour {prenom}, bienvenue au {etablissement}." }, "message vide non conservé (défaut)");
      assert.match(await rejects(save(q, { arrival: "Bonjour {motdepasse}" })), /Variable inconnue/);
      assert.match(await rejects(save(q, { hacked: "x" })), /Événement inconnu/);
      assert.match(await rejects(save(q, { arrival: "x".repeat(201) })), /trop long/);
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'settings.voice_checkin'"))[0].n, 1);

      await switchTo(q, USERS.kiosk);
      const [{ c: kiosk }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.equal(kiosk.enabled, true, "la tablette lit les réglages");
      assert.match(await rejects(save(q)), /Permission refusée/);
      for (const user of [USERS.teacher, USERS.secretary, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(save(q)), /Permission refusée/);
      }
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select voice_checkin_config($1)", [ORG_DEMO])), /Permission refusée/);
      assert.equal((await q("select * from voice_checkin_settings where organization_id = $1", [ORG_DEMO])).length, 0, "réglages d'un autre établissement invisibles");
    });
  });

  test("désactivation par pays (Super Admin) : réglages conservés, indisponible", async () => {
    await as(USERS.admin, async (q) => {
      await save(q);
      await switchTo(q, null);
      await q("update countries set settings = settings || '{\"voice_checkin_enabled\": false}' where code = 'CI'");
      await switchTo(q, USERS.admin);
      const [{ c }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.deepEqual([c.available, c.enabled], [false, true], "indisponible pour le pays, réglages intacts");
    });
  });

  test("scan du personnel : prénom renvoyé pour le message", async () => {
    await as(null, async (q) => {
      const [{ token }] = await q("select b.token from staff_badges b join staff_members s on s.id = b.staff_id where s.user_id = $1 and b.status = 'active'", [USERS.director]);
      await q("delete from staff_attendance where staff_id = (select id from staff_members where user_id = $1)", [USERS.director]);
      await switchTo(q, USERS.kiosk);
      const [{ r }] = await q("select scan_staff_badge($1, $2) as r", [ORG_DEMO, `NEOSCOL-BADGE:${token}`]);
      assert.equal(r.result, "accepted");
      assert.ok(r.staff.first_name && r.staff.name.startsWith(r.staff.first_name));
    });
  });

  test("voix : homme, femme ou automatique et hauteur ; direction uniquement ; lue par la tablette ; audit", async () => {
    await as(USERS.admin, async (q) => {
      const [{ c: before }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.deepEqual([before.voice_gender, Number(before.pitch)], ["auto", 1], "automatique et hauteur normale par défaut");
      await q("select save_voice_checkin_voice($1, 'female', 1.2)", [ORG_DEMO]);
      const [{ c }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.deepEqual([c.voice_gender, Number(c.pitch), c.enabled], ["female", 1.2, false], "voix enregistrée, sans activer les messages");
      assert.match(await rejects(q("select save_voice_checkin_voice($1, 'robot', 1)", [ORG_DEMO])), /Type de voix invalide/);
      assert.match(await rejects(q("select save_voice_checkin_voice($1, 'male', 3)", [ORG_DEMO])), /Hauteur de la voix invalide/);
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'settings.voice_checkin' and summary = 'Voix de la tablette modifiée'"))[0].n, 1);
      await q("select save_voice_checkin_voice($1, 'female', 1.2)", [ORG_DEMO]);
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'settings.voice_checkin' and summary = 'Voix de la tablette modifiée'"))[0].n, 1, "sans changement : pas de nouvelle ligne d'audit");
      await switchTo(q, USERS.kiosk);
      const [{ c: kiosk }] = await q("select voice_checkin_config($1) as c", [ORG_DEMO]);
      assert.equal(kiosk.voice_gender, "female", "la tablette lit la voix choisie");
      for (const user of [USERS.kiosk, USERS.teacher, USERS.secretary, USERS.otherOrgAdmin]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select save_voice_checkin_voice($1, 'male', 1)", [ORG_DEMO])), /Permission refusée/);
      }
    });
  });
});
