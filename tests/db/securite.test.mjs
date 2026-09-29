// P4 — Sécurité : double authentification appliquée en base, verrouillage,
// vérification e-mail (lecture seule), sessions, centre de sécurité.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const H = (c) => c.repeat(64);
/** Identité avec un niveau d'authentification donné (aal1 : mot de passe seul). */
const asAal = (q, user, aal) => q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated", aal })]);
const addFactor = (q, user) =>
  q("insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at) values (gen_random_uuid(), $1, 'test', 'totp', 'verified', now(), now())", [user]);

describe("Sécurité", () => {
  test("double authentification : compte protégé + session aal1 = aucun droit ; aal2 = droits rétablis", async () => {
    await as(null, async (q) => {
      await addFactor(q, USERS.admin);
      await addFactor(q, USERS.superadmin);
      await q("set local role authenticated");
      await asAal(q, USERS.admin, "aal1");
      assert.equal((await q("select app.has_permission($1, 'students.read') ok", [ORG_DEMO]))[0].ok, false, "mot de passe seul : rien");
      assert.equal((await q("select count(*)::int n from students"))[0].n, 0, "RLS : aucune donnée");
      await asAal(q, USERS.admin, "aal2");
      assert.equal((await q("select app.has_permission($1, 'students.read') ok", [ORG_DEMO]))[0].ok, true);
      assert.ok((await q("select count(*)::int n from students"))[0].n > 0);
      await asAal(q, USERS.superadmin, "aal1");
      assert.equal((await q("select app.is_platform_admin() ok"))[0].ok, false, "Super Admin sans code : pas de console");
      await asAal(q, USERS.superadmin, "aal2");
      assert.equal((await q("select app.is_platform_admin() ok"))[0].ok, true);
      // Compte sans double authentification : inchangé.
      await asAal(q, USERS.director, "aal1");
      assert.equal((await q("select app.has_permission($1, 'students.read') ok", [ORG_DEMO]))[0].ok, true);
      const [s] = await q("select my_security_state() s");
      assert.equal(s.s.mfa_enrolled, false);
      assert.equal(s.s.sensitive, true, "direction = rôle sensible");
    });
  });

  test("verrouillage : seuil d'échecs, anti-robot avant, réussite et déverrouillage remettent à zéro", async () => {
    await as(null, async (q) => {
      const guard = async (id, ip = null) => (await q("select login_guard($1, $2) g", [id, ip]))[0].g;
      const fail = (id, ip = null) => q("select login_record($1, $2, false)", [id, ip]);
      for (let i = 0; i < 3; i++) await fail(H("a"));
      let g = await guard(H("a"));
      assert.deepEqual([g.locked, g.captcha, g.failures], [false, true, 3], "3 échecs : anti-robot exigé");
      await fail(H("a"));
      await fail(H("a"));
      g = await guard(H("a"));
      assert.equal(g.locked, true, "5 échecs : verrouillé");
      assert.ok(g.locked_until);
      assert.equal((await guard(H("b"))).locked, false, "autre compte : non affecté");
      await switchTo(q, USERS.superadmin);
      await q("select platform_unlock_account($1)", [H("a")]);
      const [ov] = await q("select platform_security_overview() o");
      assert.ok(Array.isArray(ov.o.locked));
      await switchTo(q, null);
      assert.equal((await guard(H("a"))).locked, false, "déverrouillé par la plateforme");
      for (let i = 0; i < 5; i++) await fail(H("c"));
      await q("select login_record($1, null, true)", [H("c")]);
      assert.equal((await guard(H("c"))).locked, false, "une réussite remet le compteur à zéro");
      // Même adresse IP sur plusieurs comptes : anti-robot exigé.
      for (const c of ["d", "e", "f"]) await fail(H(c), H("9"));
      assert.equal((await guard(H("0"), H("9"))).captcha, true);
      // Tables et fonctions réservées au serveur.
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select login_guard($1, null)", [H("a")])), /permission denied/);
      assert.match(await rejects(q("select * from auth_login_attempts")), /permission denied/);
      assert.match(await rejects(q("select platform_unlock_account($1)", [H("a")])), /Réservé/);
    });
  });

  test("vérification e-mail : établissement (et ses espaces) en lecture seule, lien à usage unique", async () => {
    await as(null, async (q) => {
      await q("update organizations set email_verification = 'pending' where id = $1", [ORG_DEMO]);
      assert.equal((await q("select app.org_billing_access($1) a", [ORG_DEMO]))[0].a, "read_only");
      await switchTo(q, USERS.admin);
      assert.equal((await q("select app.has_permission($1, 'students.create') ok", [ORG_DEMO]))[0].ok, false, "écriture bloquée");
      assert.equal((await q("select app.has_permission($1, 'students.read') ok", [ORG_DEMO]))[0].ok, true, "lecture conservée");
      assert.equal((await q("select email_verification_state($1) s", [ORG_DEMO]))[0].s.pending, true);
      await switchTo(q, null);
      await q("insert into email_verification_tokens (user_id, organization_id, token_hash, expires_at) values ($1, $2, $3, now() + interval '1 day')", [USERS.admin, ORG_DEMO, H("1")]);
      await q("insert into email_verification_tokens (user_id, organization_id, token_hash, expires_at) values ($1, $2, $3, now() - interval '1 minute')", [USERS.admin, ORG_DEMO, H("2")]);
      assert.equal((await q("select verify_organization_email($1) r", [H("2")]))[0].r.ok, false, "lien expiré refusé");
      assert.equal((await q("select verify_organization_email($1) r", [H("1")]))[0].r.ok, true);
      assert.equal((await q("select verify_organization_email($1) r", [H("1")]))[0].r.ok, false, "usage unique");
      assert.equal((await q("select app.org_billing_access($1) a", [ORG_DEMO]))[0].a, "full");
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select verify_organization_email($1)", [H("1")])), /permission denied/);
      assert.match(await rejects(q("select * from email_verification_tokens")), /permission denied/);
    });
  });

  test("sessions : chacun ne voit et ne ferme que les siennes ; la plateforme peut tout fermer", async () => {
    await as(null, async (q) => {
      const [{ id: mine }] = await q("insert into auth.sessions (id, user_id, created_at, updated_at, user_agent) values (gen_random_uuid(), $1, now(), now(), 'Chrome') returning id", [USERS.admin]);
      const [{ id: other }] = await q("insert into auth.sessions (id, user_id, created_at, updated_at) values (gen_random_uuid(), $1, now(), now()) returning id", [USERS.teacher]);
      await switchTo(q, USERS.admin);
      const list = await q("select id, current from my_sessions()");
      assert.ok(list.some((s) => s.id === mine) && !list.some((s) => s.id === other));
      assert.match(await rejects(q("select revoke_my_session($1)", [other])), /introuvable/);
      await q("select revoke_my_session($1)", [mine]);
      assert.equal((await q("select count(*)::int n from my_sessions() where id = $1", [mine]))[0].n, 0);
      assert.match(await rejects(q("select platform_revoke_user_sessions($1)", [USERS.teacher])), /Réservé/);
      await switchTo(q, USERS.superadmin);
      assert.equal((await q("select platform_revoke_user_sessions($1) n", [USERS.teacher]))[0].n, 1);
    });
  });

  test("réglages de sécurité : Super Admin uniquement, bornes contrôlées", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_update_security_settings(6, 30, 2, true, true)");
      assert.deepEqual(
        (await q("select lockout_threshold, lockout_minutes, captcha_after_failures, mfa_required_sensitive from platform_security_settings"))[0],
        { lockout_threshold: 6, lockout_minutes: 30, captcha_after_failures: 2, mfa_required_sensitive: true },
      );
      assert.match(await rejects(q("select platform_update_security_settings(1, 30, 2, true, true)")), /check/);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_update_security_settings(6, 30, 2, false, false)")), /Réservé/);
      assert.match(await rejects(q("update platform_security_settings set mfa_required_sensitive = false")), /permission denied/);
    });
  });
});
