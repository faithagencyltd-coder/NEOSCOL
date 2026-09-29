// P5 — « Mon badge » : QR tournant signé (30 s), usage unique, vérifié en base
// avant le pointage existant ; le badge imprimé reste valable.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, badgeToken, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Mon badge — QR tournant", () => {
  test("le titulaire obtient son code ; le jeton secret n'est jamais renvoyé", async () => {
    await as(USERS.teacher, async (q) => {
      const [{ b }] = await q("select my_badge($1) b", [ORG_DEMO]);
      assert.equal(b.kind, "staff");
      assert.equal(b.role, "ENSEIGNANT");
      assert.match(b.code, /^NEOSCOL-DYN:S:[0-9a-f-]{36}:\d+:[0-9a-f]{20}$/);
      assert.ok(new Date(b.expires_at) > new Date());
      await switchTo(q, null);
      const token = await badgeToken(q, USERS.teacher);
      assert.ok(!JSON.stringify(b).includes(token), "jeton absent de la réponse");
      // Un autre compte n'obtient jamais ce badge.
      await switchTo(q, USERS.parent);
      const [{ b: other }] = await q("select my_badge($1) b", [ORG_DEMO]);
      assert.ok(other === null || !other.code.includes(b.code.split(":")[2]));
    });
  });

  test("tablette : code valide accepté une seule fois ; capture réutilisée, code falsifié ou expiré refusés", async () => {
    await as(USERS.teacher, async (q) => {
      const [{ b }] = await q("select my_badge($1) b", [ORG_DEMO]);
      await switchTo(q, USERS.kiosk);
      const scan = async (code) => (await q("select scan_staff_badge($1, $2, 'test') r", [ORG_DEMO, code]))[0].r;
      const first = await scan(b.code);
      assert.ok(!["replayed_code", "expired_code", "invalid_code", "unknown_badge"].includes(first.reason), `accepté par le pointage : ${first.reason ?? first.result}`);
      assert.ok(first.staff?.name?.length > 0, "enseignant reconnu");
      const replay = await scan(b.code);
      assert.equal(replay.reason, "replayed_code");
      assert.match(replay.message, /déjà été utilisé/);
      const forged = b.code.replace(/[0-9a-f]{20}$/, "0".repeat(20));
      assert.equal((await scan(forged)).reason, "invalid_code");
      // Code d'il y a 5 minutes, correctement signé : expiré.
      await switchTo(q, null);
      const [, , badgeId] = b.code.split(":");
      const [{ old }] = await q(
        "select 'NEOSCOL-DYN:S:' || $1 || ':' || (app.badge_window() - 10) || ':' || app.badge_signature(b.token, 'S', b.id, app.badge_window() - 10) old from staff_badges b where b.id = $1::uuid",
        [badgeId],
      );
      await switchTo(q, USERS.kiosk);
      const expired = await scan(old);
      assert.equal(expired.reason, "expired_code");
      assert.match(expired.message, /expiré/);
    });
  });

  test("badge désactivé : code refusé ; badge imprimé (code fixe) toujours accepté", async () => {
    await as(USERS.teacher, async (q) => {
      const [{ b }] = await q("select my_badge($1) b", [ORG_DEMO]);
      await switchTo(q, null);
      const token = await badgeToken(q, USERS.teacher);
      await switchTo(q, USERS.kiosk);
      const printed = (await q("select scan_staff_badge($1, $2, 'test') r", [ORG_DEMO, `NEOSCOL-BADGE:${token}`]))[0].r;
      assert.ok(!["unknown_badge", "invalid_code"].includes(printed.reason), "badge imprimé reconnu");
      await switchTo(q, null);
      await q("update staff_badges set status = 'revoked', revoked_at = now(), revoked_reason = 'perdu' where token = $1", [token]);
      await switchTo(q, USERS.kiosk);
      assert.equal((await q("select scan_staff_badge($1, $2, 'test') r", [ORG_DEMO, b.code]))[0].r.reason, "invalid_code");
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select my_badge($1) b", [ORG_DEMO]))[0].b, null, "plus de badge actif");
    });
  });

  test("sécurité : fonctions internes inaccessibles ; sans permission de pointage, aucun scan", async () => {
    await as(USERS.teacher, async (q) => {
      const [{ b }] = await q("select my_badge($1) b", [ORG_DEMO]);
      assert.match(await rejects(q("select scan_staff_badge($1, $2)", [ORG_DEMO, b.code])), /pas autorisée/);
      assert.match(await rejects(q("select scan_staff_badge_core($1, $2)", [ORG_DEMO, b.code])), /permission denied/);
      assert.match(await rejects(q("select app.resolve_badge_code($1)", [b.code])), /permission denied/);
      assert.match(await rejects(q("select * from badge_dynamic_uses")), /permission denied/);
      // Double authentification activée mais session non vérifiée : pas de badge.
      await switchTo(q, null);
      await q("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), $1, 't', 'totp', 'verified', now(), now())", [USERS.teacher]);
      await switchTo(q, USERS.teacher);
      assert.equal((await q("select my_badge($1) b", [ORG_DEMO]))[0].b, null);
    });
  });
});
