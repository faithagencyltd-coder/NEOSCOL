// Enseignant multi-établissements : un seul compte, invitation acceptée par
// l'enseignant, droits propres à chaque établissement, abonnement supplémentaire
// réglé par le Super Admin (prix, périodicité, grâce), paiement vérifié,
// expiration, suspension / rétablissement — sans jamais toucher au compte.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const TEACHER = USERS.teacher; // enseignant@demo.neoscol.app, enseignant dans DEMO
const ADMIN_B = USERS.otherOrgAdmin; // administrateur du centre de formation DEMOF

/** L'administrateur de DEMOF crée la fiche du même enseignant et rattache son compte existant. */
async function inviteTeacherInB(q) {
  await switchTo(q, ADMIN_B);
  const [{ id: staffId }] = await q(
    "insert into staff_members (organization_id, first_name, last_name, email, is_teacher) values ($1, 'Koffi', 'Mensah', 'ENSEIGNANT@demo.neoscol.app', true) returning id",
    [ORG_DEMOF],
  );
  const [{ id: roleId }] = await q("select id from roles where organization_id = $1 and key = 'teacher'", [ORG_DEMOF]);
  const [{ r }] = await q("select public.link_existing_staff_account($1, $2) as r", [staffId, roleId]);
  return { staffId, roleId, result: r };
}

async function acceptAsTeacher(q) {
  await switchTo(q, TEACHER);
  const [{ a }] = await q("select public.my_organization_accesses() as a");
  const invitation = a.memberships.find((m) => m.status === "invited");
  assert.ok(invitation, "invitation visible par l'enseignant");
  const [{ r }] = await q("select public.respond_membership_invitation($1, true) as r", [invitation.membership_id]);
  return { invitation, result: r };
}

const orgs = async (q) => (await q("select app.member_org_ids() as ids"))[0].ids;
const perms = async (q, org) => (await q("select public.my_permissions($1) as p", [org]))[0].p;

async function enableRule(q, { price = 5000, period = 1, grace = 0 } = {}) {
  await switchTo(q, USERS.superadmin);
  await q("select public.platform_save_teacher_access_settings(true, $1, 'XOF', $2, $3)", [price, period, grace]);
}

describe("Compte unique pour plusieurs établissements", () => {
  test("compte existant : invitation (aucun second compte), droits seulement après acceptation, rôle propre à B", async () => {
    await as(null, async (q) => {
      const accountsBefore = (await q("select count(*)::int as n from auth.users"))[0].n;
      const { staffId, result } = await inviteTeacherInB(q);
      assert.equal(result.result, "invited");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int as n from auth.users"))[0].n, accountsBefore, "aucun compte créé");
      const [staff] = await q("select user_id from staff_members where id = $1", [staffId]);
      assert.equal(staff.user_id, TEACHER, "fiche du personnel reliée au compte existant");

      await switchTo(q, TEACHER);
      assert.ok(!(await orgs(q)).includes(ORG_DEMOF), "invitation non acceptée : aucun accès à B");
      assert.deepEqual(await perms(q, ORG_DEMOF), []);
      const { result: accepted } = await acceptAsTeacher(q);
      assert.equal(accepted.result, "accepted");
      assert.equal(accepted.access_state, "not_required", "règle inactive : accès libre");
      assert.ok((await orgs(q)).includes(ORG_DEMO) && (await orgs(q)).includes(ORG_DEMOF), "A et B avec le même compte");
      const inB = await perms(q, ORG_DEMOF);
      assert.ok(inB.includes("grades.enter") || inB.includes("attendance.take"), "droits d'enseignant dans B");
      assert.ok(!inB.includes("users.manage"), "aucun droit d'administration dans B");
      assert.ok((await perms(q, ORG_DEMO)).length > 0, "droits de A inchangés");
    });
  });

  test("refus de l'invitation : fiche déliée, compte conservé ; e-mail inconnu → création classique", async () => {
    await as(null, async (q) => {
      const { staffId } = await inviteTeacherInB(q);
      await switchTo(q, TEACHER);
      const [{ a }] = await q("select public.my_organization_accesses() as a");
      const inv = a.memberships.find((m) => m.status === "invited");
      const [{ r }] = await q("select public.respond_membership_invitation($1, false) as r", [inv.membership_id]);
      assert.equal(r.result, "declined");
      await switchTo(q, null);
      assert.equal((await q("select user_id from staff_members where id = $1", [staffId]))[0].user_id, null);
      assert.equal((await q("select is_active from profiles where id = $1", [TEACHER]))[0].is_active, true, "compte intact");
      assert.equal((await q("select count(*)::int as n from memberships where user_id = $1 and organization_id = $2", [TEACHER, ORG_DEMO]))[0].n, 1);

      await switchTo(q, ADMIN_B);
      const [{ id: other }] = await q("insert into staff_members (organization_id, first_name, last_name, email) values ($1, 'Nouveau', 'Venu', 'nouveau.venu@exemple.org') returning id", [ORG_DEMOF]);
      const [{ id: roleId }] = await q("select id from roles where organization_id = $1 and key = 'teacher'", [ORG_DEMOF]);
      assert.equal((await q("select public.link_existing_staff_account($1, $2) as r", [other, roleId]))[0].r.result, "no_account");
    });
  });

  test("contrôles : droit users.manage requis, fiche d'un autre établissement invisible, rôle parent refusé", async () => {
    await as(null, async (q) => {
      await switchTo(q, ADMIN_B);
      const [{ id: staffId }] = await q("insert into staff_members (organization_id, first_name, last_name, email) values ($1, 'Test', 'Prof', 'enseignant@demo.neoscol.app') returning id", [ORG_DEMOF]);
      const [{ id: parentRole }] = await q("select id from roles where organization_id = $1 and persona = 'parent' limit 1", [ORG_DEMOF]);
      assert.match(await rejects(q("select public.link_existing_staff_account($1, $2)", [staffId, parentRole])), /Rôle invalide/);
      const [{ id: roleId }] = await q("select id from roles where organization_id = $1 and key = 'teacher'", [ORG_DEMOF]);
      for (const user of [USERS.admin, USERS.teacher, USERS.secretary]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select public.link_existing_staff_account($1, $2)", [staffId, roleId])), /introuvable/);
      }
      await switchTo(q, TEACHER);
      assert.match(await rejects(q("select public.respond_membership_invitation(gen_random_uuid(), true)")), /Invitation introuvable/);
    });
  });
});

describe("Abonnement supplémentaire (Super Admin)", () => {
  test("réglage réservé au Super Admin, validé, historisé et audité", async () => {
    await as(null, async (q) => {
      for (const user of [USERS.admin, TEACHER, ADMIN_B]) {
        await switchTo(q, user);
        assert.match(await rejects(q("select public.platform_save_teacher_access_settings(true, 5000, 'XOF', 1, 0)")), /Réservé/);
        assert.match(await rejects(q("select public.platform_teacher_accesses()")), /Réservé/);
      }
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select public.platform_save_teacher_access_settings(true, 0, 'XOF', 1, 0)")), /prix supérieur à 0/);
      assert.match(await rejects(q("select public.platform_save_teacher_access_settings(true, 5000, 'XOF', 2, 0)")), /Périodicité invalide/);
      assert.match(await rejects(q("select public.platform_save_teacher_access_settings(true, 5000, 'XOF', 1, 90)")), /grâce invalide/);
      await q("select public.platform_save_teacher_access_settings(true, 5000, 'XOF', 1, 3)");
      await q("select public.platform_save_teacher_access_settings(true, 7500, 'XOF', 3, 3)");
      const [s] = await q("select enabled, price, period_months, grace_days from platform_teacher_access_settings");
      assert.deepEqual(s, { enabled: true, price: 7500, period_months: 3, grace_days: 3 });
      assert.deepEqual((await q("select price from platform_teacher_access_settings_history order by id")).map((r) => r.price).slice(-2), [5000, 7500], "historique des prix");
      assert.equal((await q("select count(*)::int as n from audit_logs where action = 'platform.teacher_access_settings'"))[0].n >= 2, true);
    });
  });

  test("règle active : B bloqué jusqu'au paiement confirmé ; A jamais touché ; paiement vérifié et idempotent", async () => {
    await as(null, async (q) => {
      await inviteTeacherInB(q);
      await acceptAsTeacher(q);
      await enableRule(q, { price: 5000, period: 1 });

      await switchTo(q, TEACHER);
      assert.ok(!(await orgs(q)).includes(ORG_DEMOF), "B bloqué : plus aucune donnée lisible");
      assert.deepEqual(await perms(q, ORG_DEMOF), []);
      assert.equal((await q("select count(*)::int as n from students where organization_id = $1", [ORG_DEMOF]))[0].n, 0);
      assert.ok((await orgs(q)).includes(ORG_DEMO) && (await perms(q, ORG_DEMO)).length > 0, "premier établissement jamais bloqué");
      const [{ a }] = await q("select public.my_organization_accesses() as a");
      const b = a.memberships.find((m) => m.organization_id === ORG_DEMOF);
      assert.deepEqual([b.extra, b.access_state, a.rule.price], [true, "pending", 5000]);
      assert.equal(a.memberships.find((m) => m.organization_id === ORG_DEMO).access_state, "not_required");

      // Le prix vient de la base, jamais du navigateur.
      const [{ c }] = await q("select public.teacher_access_start_checkout($1, 'simulation', 'test') as c", [ORG_DEMOF]);
      assert.equal(c.amount, 5000);
      assert.match(c.reference, /^NEO-\d{4}-\d{6,}$/);
      assert.match(await rejects(q("select public.teacher_access_confirm_payment('simulation', 'test', 'SIM-x', $1, 5000, 'XOF')", [c.reference])), /permission denied/);
      assert.match(await rejects(q("select public.teacher_access_start_checkout($1, 'simulation', 'test')", [ORG_DEMO])), /ne demande pas/);

      await switchTo(q, null); // serveur (clé de service) après vérification auprès du fournisseur
      await q("select public.teacher_access_attach_checkout($1, $2, 'https://pay.test', '{}')", [c.payment_id, `SIM-${c.reference}`]);
      const [{ r: wrong }] = await q("select public.teacher_access_confirm_payment('simulation', 'test', $1, $2, 100, 'XOF') as r", [`SIM-${c.reference}`, c.reference]);
      assert.deepEqual([wrong.result, wrong.reason], ["rejected", "montant_different"]);
      await switchTo(q, TEACHER);
      assert.ok(!(await orgs(q)).includes(ORG_DEMOF), "montant faux : toujours bloqué");

      await switchTo(q, null);
      const [{ r: ok }] = await q("select public.teacher_access_confirm_payment('simulation', 'test', $1, $2, 5000, 'XOF', 'simulation') as r", [`SIM-${c.reference}`, c.reference]);
      assert.equal(ok.result, "confirmed");
      const [{ r: dup }] = await q("select public.teacher_access_confirm_payment('simulation', 'test', $1, $2, 5000, 'XOF') as r", [`SIM-${c.reference}`, c.reference]);
      assert.equal(dup.result, "duplicate", "notification répétée sans effet");
      const [acc] = await q("select status, period_start::text, period_end::text, (period_end - period_start + 1) as days from teacher_extra_accesses where user_id = $1 and organization_id = $2", [TEACHER, ORG_DEMOF]);
      assert.equal(acc.status, "active");
      assert.ok(acc.days >= 28 && acc.days <= 31, `un mois payé (${acc.days} jours)`);

      await switchTo(q, TEACHER);
      assert.ok((await orgs(q)).includes(ORG_DEMOF), "paiement confirmé : accès à B activé");
      assert.ok((await perms(q, ORG_DEMOF)).length > 0);
      assert.equal((await q("select count(*)::int as n from notifications where user_id = $1 and type = 'teacher_access.paid'", [TEACHER]))[0].n, 1);
      const [{ a: after2 }] = await q("select public.my_organization_accesses() as a");
      assert.equal(after2.payments[0].status, "SUCCESS");
    });
  });

  test("expiration, délai de grâce, renouvellement anticipé ; compte principal jamais supprimé", async () => {
    await as(null, async (q) => {
      await inviteTeacherInB(q);
      await acceptAsTeacher(q);
      await enableRule(q, { price: 5000, period: 1, grace: 3 });
      await switchTo(q, null);
      await q("insert into teacher_extra_accesses (user_id, organization_id, status, period_start, period_end) values ($1, $2, 'active', current_date - 40, current_date - 2) on conflict (user_id, organization_id) do update set status = 'active', period_start = excluded.period_start, period_end = excluded.period_end", [TEACHER, ORG_DEMOF]);
      await switchTo(q, TEACHER);
      assert.ok((await orgs(q)).includes(ORG_DEMOF), "délai de grâce (3 jours) : accès maintenu");
      await switchTo(q, null);
      await q("update teacher_extra_accesses set period_end = current_date - 5 where user_id = $1 and organization_id = $2", [TEACHER, ORG_DEMOF]);
      await switchTo(q, TEACHER);
      assert.ok(!(await orgs(q)).includes(ORG_DEMOF), "abonnement expiré : accès supplémentaire suspendu");
      const [{ a }] = await q("select public.my_organization_accesses() as a");
      assert.equal(a.memberships.find((m) => m.organization_id === ORG_DEMOF).access_state, "expired");
      await switchTo(q, null);
      const [p] = await q("select is_active from profiles where id = $1", [TEACHER]);
      assert.equal(p.is_active, true, "compte actif");
      assert.equal((await q("select count(*)::int as n from memberships where user_id = $1 and status = 'active'", [TEACHER]))[0].n, 2, "adhésions conservées");

      // Renouvellement anticipé : la période suit la période en cours.
      await q("update teacher_extra_accesses set period_end = current_date + 10 where user_id = $1 and organization_id = $2", [TEACHER, ORG_DEMOF]);
      await switchTo(q, TEACHER);
      const [{ c }] = await q("select public.teacher_access_start_checkout($1, 'simulation', 'test') as c", [ORG_DEMOF]);
      await switchTo(q, null);
      await q("select public.teacher_access_attach_checkout($1, $2, 'https://pay.test', '{}')", [c.payment_id, `SIM-${c.reference}`]);
      await q("select public.teacher_access_confirm_payment('simulation', 'test', $1, $2, 5000, 'XOF')", [`SIM-${c.reference}`, c.reference]);
      const [pay] = await q("select covers_from = current_date + 11 as follows from teacher_access_payments where internal_reference = $1", [c.reference]);
      assert.equal(pay.follows, true, "nouvelle période après la fin de la période en cours");
    });
  });

  test("Super Admin : enseignants concernés, paiements, paiement manuel, suspendre / rétablir / offrir", async () => {
    await as(null, async (q) => {
      await inviteTeacherInB(q);
      await acceptAsTeacher(q);
      await enableRule(q, { price: 5000, period: 1 });
      await switchTo(q, USERS.superadmin);
      const [{ list }] = await q("select public.platform_teacher_accesses() as list");
      const row = list.find((r) => r.user_id === TEACHER && r.organization_id === ORG_DEMOF);
      assert.ok(row, "enseignant concerné listé");
      assert.equal(row.access_state, "pending");
      assert.ok(row.other_organizations.length >= 1, "autres établissements affichés");
      assert.ok(!list.some((r) => r.user_id === TEACHER && r.organization_id === ORG_DEMO), "premier établissement non concerné");

      assert.match(await rejects(q("select public.platform_teacher_access_record_payment($1, $2, 5000, '', 'espèces')", [TEACHER, ORG_DEMOF])), /Référence/);
      await q("select public.platform_teacher_access_record_payment($1, $2, 5000, 'RECU-001', 'espèces', 'Payé au bureau')", [TEACHER, ORG_DEMOF]);
      assert.match(await rejects(q("select public.platform_teacher_access_record_payment($1, $2, 5000, 'RECU-001', 'espèces')", [TEACHER, ORG_DEMOF])), /déjà été enregistrée/);
      const [{ pays }] = await q("select public.platform_teacher_access_payments(10) as pays");
      assert.equal(pays[0].provider, "manual");
      await switchTo(q, TEACHER);
      assert.ok((await orgs(q)).includes(ORG_DEMOF), "paiement manuel : accès activé");

      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select public.platform_teacher_access_set_status($1, $2, 'suspend', '')", [TEACHER, ORG_DEMOF])), /motif/);
      await q("select public.platform_teacher_access_set_status($1, $2, 'suspend', 'Chèque rejeté')", [TEACHER, ORG_DEMOF]);
      await switchTo(q, TEACHER);
      assert.ok(!(await orgs(q)).includes(ORG_DEMOF), "suspendu malgré la période payée");
      assert.ok((await orgs(q)).includes(ORG_DEMO), "autre établissement non concerné");
      assert.match(await rejects(q("select public.teacher_access_start_checkout($1, 'simulation', 'test')", [ORG_DEMOF])), /suspendu/);

      await switchTo(q, USERS.superadmin);
      const [{ s }] = await q("select public.platform_teacher_access_set_status($1, $2, 'restore', 'Régularisé') as s", [TEACHER, ORG_DEMOF]);
      assert.deepEqual([s.status, s.state], ["active", "active"], "rétabli selon la période payée");
      await q("select public.platform_teacher_access_set_status($1, $2, 'exempt', 'Partenariat')", [TEACHER, ORG_DEMOF]);
      await switchTo(q, null);
      await q("update teacher_extra_accesses set period_start = current_date - 60, period_end = current_date - 30 where user_id = $1 and organization_id = $2", [TEACHER, ORG_DEMOF]);
      await switchTo(q, TEACHER);
      assert.ok((await orgs(q)).includes(ORG_DEMOF), "accès offert : sans paiement");
      await switchTo(q, USERS.superadmin);
      const [{ s: s2 }] = await q("select public.platform_teacher_access_set_status($1, $2, 'remove_exemption', 'Fin du partenariat') as s", [TEACHER, ORG_DEMOF]);
      assert.equal(s2.status, "pending", "période échue : paiement de nouveau requis");
      await q("select public.platform_save_teacher_access_settings(false, 5000, 'XOF', 1, 0)");
      await switchTo(q, TEACHER);
      assert.ok((await orgs(q)).includes(ORG_DEMOF), "règle désactivée : accès libre de nouveau");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int as n from audit_logs where action like 'teacher_access.%' and organization_id = $1", [ORG_DEMOF]))[0].n >= 4, true);
    });
  });

  test("isolation : l'établissement voit l'état d'accès de ses enseignants, pas les paiements ; les autres ne voient rien", async () => {
    await as(null, async (q) => {
      await inviteTeacherInB(q);
      await acceptAsTeacher(q);
      await enableRule(q);
      await q("select public.platform_teacher_access_record_payment($1, $2, 5000, 'RECU-XYZ', 'virement')", [TEACHER, ORG_DEMOF]);
      await switchTo(q, ADMIN_B);
      assert.equal((await q("select count(*)::int as n from teacher_extra_accesses where user_id = $1", [TEACHER]))[0].n, 1);
      assert.equal((await q("select count(*)::int as n from teacher_access_payments"))[0].n, 0);
      await switchTo(q, USERS.secretary);
      assert.equal((await q("select count(*)::int as n from teacher_extra_accesses where organization_id = $1", [ORG_DEMOF]))[0].n, 0);
      await switchTo(q, USERS.teacher2);
      assert.equal((await q("select count(*)::int as n from teacher_access_payments"))[0].n, 0);
      assert.match(await rejects(q("insert into teacher_extra_accesses (user_id, organization_id, status) values ($1, $2, 'exempt')", [USERS.teacher2, ORG_DEMOF])), /permission denied|row-level security/);
    });
  });
});
