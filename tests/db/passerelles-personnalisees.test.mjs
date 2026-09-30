// Agrégateurs personnalisés : réservés au Super Admin, test réussi obligatoire
// avant activation (et après toute modification), suppression définitive ou
// archivage s'il a servi (historique conservé).
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const DEF = { version: 1, base_url: { test: "https://sandbox.zed.example/v1", live: "https://api.zed.example/v1" }, secret_fields: [{ key: "api_key", label: "Clé" }] };
const CIPHER = "v1:QUJD:REVG:R0hJ";
const enable = (q, code, extra = {}) =>
  q("select platform_update_payment_gateway($1, true, 'test', false, null, null, $2, $3, null, false)", [code, extra.config ?? {}, extra.cipher ?? null]);

describe("Agrégateurs personnalisés", () => {
  test("réservé au Super Admin ; code et définition contrôlés", async () => {
    await as(USERS.admin, async (q) => {
      assert.match(await rejects(q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1)", [DEF])), /Réservé/);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_save_custom_gateway('zed', 'Zed', null, $1)", [DEF])), /Code invalide/);
      assert.match(await rejects(q("select platform_save_custom_gateway('custom_zed', 'Z', null, $1)", [DEF])), /Nom/);
      assert.equal((await q("select platform_save_custom_gateway('custom_zed', 'Zed', 'Mobile Money', $1) as r", [DEF]))[0].r, "created");
      assert.match(await rejects(q("select platform_save_custom_gateway('custom_zed2', 'Zed', null, $1)", ["[]"])), /Définition invalide/);
      const [row] = await q("select checkout_enabled, public_label from payment_gateway_settings where provider = 'custom_zed'");
      assert.deepEqual([row.checkout_enabled, row.public_label], [false, "Zed"]);
      await switchTo(q, null);
      assert.ok((await q("select count(*)::int n from audit_logs where action = 'platform.custom_gateway_created'"))[0].n >= 1);
    });
  });

  test("activation impossible sans test réussi ; toute modification impose un nouveau test", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1)", [DEF]);
      await q("select platform_update_payment_gateway('custom_zed', false, 'test', false, null, null, '{}', $1, null, false)", [CIPHER]);
      assert.match(await rejects(enable(q, "custom_zed")), /Testez d'abord/);
      await q("select platform_record_gateway_test('custom_zed', true, 'ok')");
      assert.match(await rejects(enable(q, "custom_zed", { cipher: CIPHER })), /Testez d'abord/, "nouvelles clés dans le même envoi : nouveau test");
      assert.match(await rejects(enable(q, "custom_zed", { config: { merchant: "x" } })), /Testez d'abord/, "réglages différents : nouveau test");
      await enable(q, "custom_zed");
      assert.equal((await q("select checkout_enabled from payment_gateway_settings where provider = 'custom_zed'"))[0].checkout_enabled, true);
      assert.ok((await q("select provider from available_payment_gateways()")).some((r) => r.provider === "custom_zed"), "proposé aux clients");
      assert.equal((await q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1) as r", [DEF]))[0].r, "updated");
      assert.equal((await q("select checkout_enabled from payment_gateway_settings where provider = 'custom_zed'"))[0].checkout_enabled, true, "définition identique : rien ne change");
      await q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1)", [{ ...DEF, currency: "XOF" }]);
      const [after] = await q("select checkout_enabled, last_test_ok from payment_gateway_settings where provider = 'custom_zed'");
      assert.deepEqual([after.checkout_enabled, after.last_test_ok], [false, null], "définition modifiée : retiré jusqu'au prochain test");
    });
  });

  test("suppression : définitive s'il n'a jamais servi, archivage sinon", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1)", [DEF]);
      await q("select platform_save_custom_gateway('custom_used', 'Used', null, $1)", [DEF]);
      await switchTo(q, null);
      await q("insert into sms_credit_purchases (organization_id, internal_reference, provider, mode, sms_count, unit_price, amount, currency, status) values ($1, 'NEO-2026-990001', 'custom_used', 'test', 100, 25, 2500, 'XOF', 'SUCCESS')", [ORG_DEMO]);
      await switchTo(q, USERS.admin);
      assert.match(await rejects(q("select platform_delete_custom_gateway('custom_zed')")), /Réservé/);
      await switchTo(q, USERS.superadmin);
      assert.equal((await q("select platform_delete_custom_gateway('custom_zed') as r"))[0].r, "deleted");
      assert.equal((await q("select count(*)::int n from payment_providers where code = 'custom_zed'"))[0].n, 0);
      assert.equal((await q("select platform_delete_custom_gateway('custom_used') as r"))[0].r, "archived");
      assert.equal((await q("select is_active from payment_providers where code = 'custom_used'"))[0].is_active, false);
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from sms_credit_purchases where provider = 'custom_used'"))[0].n, 1, "historique conservé");
      await switchTo(q, USERS.superadmin);
      await q("select platform_record_gateway_test('custom_used', true, 'ok')");
      await q("select platform_update_payment_gateway('custom_used', false, 'test', false, null, null, '{}', $1, null, false)", [CIPHER]);
      await q("select platform_record_gateway_test('custom_used', true, 'ok')");
      assert.match(await rejects(enable(q, "custom_used")), /archivé/, "un agrégateur archivé n'est plus proposable");
    });
  });

  test("définitions invisibles hors Super Admin", async () => {
    await as(USERS.superadmin, async (q) => {
      await q("select platform_save_custom_gateway('custom_zed', 'Zed', null, $1)", [DEF]);
      await switchTo(q, USERS.admin);
      assert.equal((await q("select count(*)::int n from custom_payment_gateways"))[0].n, 0);
    });
  });
});
