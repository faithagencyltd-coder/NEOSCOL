// P7 — Pays configurables et moteur académique multi-pays : formules sûres,
// règles versionnées (pays → établissement), publication et retour arrière,
// résultats annuels reproductibles, décisions du conseil, simulateur.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, ORG_DEMOF, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

/** Classe « 6e A » : bulletins de 3 périodes avec des moyennes choisies (contexte système). */
async function seedClass(q, averages = [[12, 14, 16], [8, 9, 7], [10, null, 11]]) {
  const [c] = await q("select id, academic_year_id from classes where organization_id = $1 and name = '6e A'", [ORG_DEMO]);
  const periods = await q("select id from academic_periods where academic_year_id = $1 order by sequence, starts_on", [c.academic_year_id]);
  const pupils = await q("select e.student_id from enrollments e join students s on s.id = e.student_id where e.class_id = $1 and e.status = 'validated' order by s.last_name, s.first_name", [c.id]);
  await q("delete from report_cards where class_id = $1", [c.id]);
  for (let i = 0; i < pupils.length; i++) {
    const avgs = averages[i % averages.length];
    for (let p = 0; p < periods.length; p++) {
      if (avgs[p] === null || avgs[p] === undefined) continue;
      await q("insert into report_cards (organization_id, student_id, class_id, academic_period_id, average) values ($1, $2, $3, $4, $5)", [ORG_DEMO, pupils[i].student_id, c.id, periods[p].id, avgs[p]]);
    }
  }
  return { classId: c.id, pupils: pupils.map((p) => p.student_id) };
}

describe("Pays configurables", () => {
  test("le Super Admin ajoute un pays sans code ; un établissement l'utilise avec sa devise et son fuseau", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_upsert_currency('MAD', 'Dirham marocain', 'DH', 2, true)");
      await q(`select platform_upsert_country('{"code":"MA","name":"Maroc","name_en":"Morocco","dial_code":"+212","default_currency":"MAD","languages":["fr","en"],"timezone":"Africa/Casablanca","phone_pattern":"^[0-9]{9}$"}'::jsonb)`);
      const [ma] = await q("select name, currencies, timezone, is_active from countries where code = 'MA'");
      assert.deepEqual(ma, { name: "Maroc", currencies: ["MAD"], timezone: "Africa/Casablanca", is_active: true });
      assert.match(await rejects(q(`select platform_upsert_country('{"code":"ZZ","name":"Test","dial_code":"+999","default_currency":"XYZ"}'::jsonb)`)), /Devise principale inconnue/);
      assert.match(await rejects(q(`select platform_upsert_country('{"code":"ZZ","name":"Test","dial_code":"+999","default_currency":"XOF","timezone":"Mars/Olympus"}'::jsonb)`)), /Fuseau horaire inconnu/);
      await switchTo(q, null);
      await q("insert into organizations (name, code, slug, type, country) values ('Lycée Casablanca', 'LYCASA', 'lycasa-test', 'high_school', 'MA')");
      const [o] = await q("select currency, timezone from organizations where code = 'LYCASA'");
      assert.deepEqual(o, { currency: "MAD", timezone: "Africa/Casablanca" }, "devise et fuseau du pays");
      assert.match(await rejects(q("insert into organizations (name, code, slug, type, country) values ('Établissement inconnu', 'XXTEST', 'xx-test', 'high_school', 'QQ')")), /foreign key/);
      // Pays utilisé par un établissement actif : impossible à désactiver.
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q(`select platform_upsert_country('{"code":"MA","name":"Maroc","dial_code":"+212","default_currency":"MAD","is_active":false}'::jsonb)`)), /ne peut pas être désactivé/);
      const audit = await q("select action from audit_logs where action like 'platform.country%'");
      assert.ok(audit.some((a) => a.action === "platform.country_created"));
    });
  });

  test("lecture publique des pays actifs ; écriture réservée au Super Admin", async () => {
    await as("anon", async (q) => {
      const rows = await q("select code from countries order by sort_order");
      assert.ok(rows.some((r) => r.code === "FR") && rows.some((r) => r.code === "BJ"));
      assert.match(await rejects(q("insert into countries (code, name, dial_code, default_currency) values ('ZZ', 'Z', '+1', 'XOF')")), /permission denied/);
    });
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q(`select platform_upsert_country('{"code":"ZZ","name":"Z","dial_code":"+1","default_currency":"XOF"}'::jsonb)`)), /Réservé/);
    });
  });
});

describe("Moteur académique", () => {
  test("formules sûres : calcul correct ; toute tentative d'injection ou élément inconnu refusé", async () => {
    await as(USERS.director, async (q) => {
      const tr = async (rules, values) => (await q("select try_academic_rules($1::jsonb, $2::numeric[]) r", [JSON.stringify(rules), values]))[0].r;
      const base = { decisions: [{ min: 10, code: "promoted", label: "Admis" }, { min: 0, code: "repeat", label: "Redouble" }] };
      const f = await tr({ ...base, annual: { mode: "formula", formula: "(T1 + T2 + 2*T3) / 4" } }, [12, 14, 16]);
      assert.deepEqual([Number(f.average), f.decision_code, f.complete], [14.5, "promoted", true]);
      const w = await tr({ ...base, annual: { mode: "weights", weights: [1, 1, 2] } }, [8, 10, null]);
      assert.equal(Number(w.average), 9, "période manquante : pondération recalculée");
      assert.equal(w.decision_code, "repeat");
      const inc = await tr({ ...base, missing_period: "incomplete", annual: { mode: "weights", weights: [1, 1, 1] } }, [8, 10, null]);
      assert.equal(inc.average, null);
      const mx = await tr({ ...base, annual: { mode: "formula", formula: "max(T1, T2) * 0.5 + round(T3, 0) * 0.5" } }, [9, 13, 10.6]);
      assert.equal(Number(mx.average), 12);
      for (const bad of ["T1; drop table students", "pg_sleep(5)", "T1 -- commentaire", "(select 1)", "T9 + 1", "T1 + ", "T1 /* x */", "current_user"]) {
        const r = await tr({ ...base, annual: { mode: "formula", formula: bad } }, [10, 10, 10]);
        assert.ok(r.error, `refusée : ${bad}`);
      }
      assert.equal((await q("select count(*)::int n from students"))[0].n > 0, true, "aucune table touchée");
      assert.match(await rejects(q("select app.eval_formula('1+1', '{}')")), /permission denied/);
    });
  });

  test("versions : brouillon → publication ; republier une ancienne version = retour arrière ; version publiée figée", async () => {
    await as(USERS.admin, async (q) => {
      const rules = (w) => JSON.stringify({ annual: { mode: "weights", weights: w }, decisions: [{ min: 10, code: "promoted", label: "Admis" }, { min: 0, code: "repeat", label: "Redouble" }] });
      const [{ id: v1 }] = await q("select save_academic_rule_draft($1, null, 'school', 'Règles 2026', $2::jsonb) id", [ORG_DEMO, rules([1, 1, 1])]);
      await q("select publish_academic_rule_set($1)", [v1]);
      const [{ id: v2 }] = await q("select save_academic_rule_draft($1, null, 'school', 'Règles 2026', $2::jsonb) id", [ORG_DEMO, rules([1, 1, 2])]);
      await q("select publish_academic_rule_set($1)", [v2]);
      let eff = (await q("select effective_academic_rules($1) e", [ORG_DEMO]))[0].e;
      assert.deepEqual([eff.version, eff.source, eff.rules.annual.weights], [2, "organization", [1, 1, 2]]);
      await q("select publish_academic_rule_set($1)", [v1]);
      eff = (await q("select effective_academic_rules($1) e", [ORG_DEMO]))[0].e;
      assert.equal(eff.version, 1, "retour à la version 1");
      await switchTo(q, null);
      assert.match(await rejects(q("update academic_rule_sets set rules = '{}' where id = $1", [v1])), /ne peut plus être modifiée/);
      assert.match(await rejects(q("delete from academic_rule_sets where id = $1", [v2])), /conservée/);
      const actions = (await q("select action from audit_logs where action like 'academic.rules%' order by created_at")).map((a) => a.action);
      assert.ok(actions.includes("academic.rules_published") && actions.includes("academic.rules_rollback"));
      // Autre établissement / enseignant : refusés.
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select save_academic_rule_draft($1, null, 'school', 'X', $2::jsonb)", [ORG_DEMO, rules([1])])), /Permission refusée/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select publish_academic_rule_set($1)", [v2])), /Permission refusée/);
      assert.equal((await q("select count(*)::int n from academic_rule_sets where organization_id = $1", [ORG_DEMO]))[0].n, 0, "RLS : règles d'un autre établissement invisibles");
    });
  });

  test("modèle pays : appliqué par défaut aux établissements du pays ; l'établissement peut l'adopter puis le personnaliser", async () => {
    await as(USERS.superadmin, async (q) => {
      const [{ country }] = await q("select country from organizations where id = $1", [ORG_DEMO]);
      const tpl = JSON.stringify({ annual: { mode: "formula", formula: "(T1 + T2 + 2*T3) / 4" }, decisions: [{ min: 10, code: "promoted", label: "Admis" }, { min: 0, code: "repeat", label: "Redouble" }] });
      const [{ id }] = await q("select save_academic_rule_draft(null, $1, 'school', 'Modèle national', $2::jsonb) id", [country, tpl]);
      await q("select publish_academic_rule_set($1)", [id]);
      await switchTo(q, USERS.admin);
      const eff = (await q("select effective_academic_rules($1) e", [ORG_DEMO]))[0].e;
      assert.deepEqual([eff.source, eff.rules.annual.formula], ["country", "(T1 + T2 + 2*T3) / 4"]);
      const [{ id: draft }] = await q("select adopt_academic_template($1, $2) id", [ORG_DEMO, id]);
      const [d] = await q("select status, based_on_id, organization_id from academic_rule_sets where id = $1", [draft]);
      assert.deepEqual([d.status, d.based_on_id, d.organization_id], ["draft", id, ORG_DEMO]);
      assert.match(await rejects(q("select save_academic_rule_draft(null, 'BJ', 'school', 'X', $1::jsonb)", [tpl])), /Permission refusée/, "modèle pays : Super Admin uniquement");
    });
  });

  test("résultats annuels : calcul, rang, décisions du conseil (motif), validation figée et reproductible", async () => {
    await as(null, async (q) => {
      const { classId, pupils } = await seedClass(q);
      await switchTo(q, USERS.admin);
      const rules = JSON.stringify({ annual: { mode: "weights", weights: [1, 1, 2] }, decisions: [{ min: 10, code: "promoted", label: "Admis(e)" }, { min: 8, code: "repeat", label: "Redouble" }, { min: 0, code: "excluded", label: "Exclu(e)" }] });
      const [{ id }] = await q("select save_academic_rule_draft($1, null, 'school', 'Règles', $2::jsonb) id", [ORG_DEMO, rules]);
      await q("select publish_academic_rule_set($1)", [id]);
      const n = (await q("select compute_annual_results($1) n", [classId]))[0].n;
      assert.equal(n, pupils.length);
      const rows = await q("select student_id, average, rank, proposed_code, decision_code, rule_version, inputs from annual_results where class_id = $1", [classId]);
      const first = rows.find((r) => r.student_id === pupils[0]);
      assert.equal(Number(first.average), 14.5, "(12 + 14 + 2×16) / 4");
      assert.equal(first.rank, 1);
      assert.equal(first.rule_version, 1);
      assert.equal(first.inputs.length, 3);
      const second = rows.find((r) => r.student_id === pupils[1]);
      assert.deepEqual([Number(second.average), second.proposed_code], [7.75, "excluded"]);
      const third = rows.find((r) => r.student_id === pupils[2]);
      assert.equal(Number(third.average), 10.67, "période manquante : (10 + 2×11) / 3");
      // Décision du conseil différente de la proposition : motif exigé.
      const [{ id: rid }] = await q("select id from annual_results where class_id = $1 and student_id = $2", [classId, pupils[1]]);
      assert.match(await rejects(q("select set_annual_decision($1, 'repeat', '')", [rid])), /Motif obligatoire/);
      await q("select set_annual_decision($1, 'repeat', 'Progrès constants au 3e trimestre')", [rid]);
      // Nouveau calcul : la décision du conseil est conservée.
      await q("select compute_annual_results($1)", [classId]);
      assert.equal((await q("select decision_code from annual_results where id = $1", [rid]))[0].decision_code, "repeat");
      // Validation : figée ; de nouvelles règles ne changent plus rien (reproductible).
      await switchTo(q, USERS.director);
      assert.equal((await q("select validate_annual_results($1) n", [classId]))[0].n, pupils.length);
      await switchTo(q, USERS.admin);
      const [{ id: v2 }] = await q("select save_academic_rule_draft($1, null, 'school', 'Règles', $2::jsonb) id", [ORG_DEMO, rules.replace("[1, 1, 2]", "[1, 1, 1]").replace('"weights":[1,1,2]', '"weights":[1,1,1]')]);
      await q("select publish_academic_rule_set($1)", [v2]);
      assert.equal((await q("select compute_annual_results($1) n", [classId]))[0].n, 0, "résultats validés inchangés");
      const kept = (await q("select average, rule_version from annual_results where class_id = $1 and student_id = $2", [classId, pupils[0]]))[0];
      assert.deepEqual([Number(kept.average), kept.rule_version], [14.5, 1]);
      await switchTo(q, null);
      assert.match(await rejects(q("update annual_results set average = 20 where id = $1", [rid])), /figé/);
    });
  });

  test("simulateur : effet d'un brouillon sur la classe réelle, sans rien enregistrer ; permissions", async () => {
    await as(null, async (q) => {
      const { classId } = await seedClass(q);
      await switchTo(q, USERS.director);
      const draft = JSON.stringify({ annual: { mode: "formula", formula: "max(T1, T2, T3)" }, decisions: [{ min: 10, code: "promoted", label: "Admis" }, { min: 0, code: "repeat", label: "Redouble" }] });
      const rows = await q("select student_name, current_result, simulated_result from simulate_academic_rules($1, $2::jsonb)", [classId, draft]);
      assert.ok(rows.length > 0);
      const changed = rows.filter((r) => r.current_result.decision_code !== r.simulated_result.decision_code);
      assert.ok(changed.length > 0, "des décisions changent avec la règle simulée");
      assert.equal((await q("select count(*)::int n from annual_results where class_id = $1", [classId]))[0].n, 0, "rien n'est enregistré");
      assert.match(await rejects(q("select * from simulate_academic_rules($1, $2::jsonb)", [classId, '{"annual":{"mode":"formula","formula":"T1;"},"decisions":[]}'])), /Caractère non autorisé|Décisions/);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select * from simulate_academic_rules($1, $2::jsonb)", [classId, draft])), /Permission refusée/);
      await switchTo(q, USERS.parent);
      assert.match(await rejects(q("select compute_annual_results($1)", [classId])), /Permission refusée/);
      assert.equal((await q("select count(*)::int n from annual_results"))[0].n, 0);
    });
  });

  test("autre établissement : règles et résultats totalement isolés", async () => {
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select save_academic_rule_draft($1, null, 'school', 'X', $2::jsonb)", [ORG_DEMOF, JSON.stringify({ annual: { mode: "weights", weights: [1] }, decisions: [{ min: 0, code: "ok", label: "OK" }] })])), /Permission refusée/);
      assert.equal((await q("select effective_academic_rules($1) e", [ORG_DEMOF]))[0].e, null);
    });
  });
});
