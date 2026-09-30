// Passerelles de paiement réglées par le Super Admin : droits, clés obligatoires,
// passerelle par défaut unique, aucune clé exposée, paiement par transfert
// déclaré par l'établissement puis validé (ou refusé) par le Super Admin.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

const CIPHER = "v1:aXY=:dGFn:ZGF0YQ==";
const update = (q, provider, enabled, opts = {}) =>
  q("select public.platform_update_payment_gateway($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)", [
    provider, enabled, opts.mode ?? "test", opts.isDefault ?? false, opts.label ?? null, opts.instructions ?? null, opts.config ?? {}, opts.secret ?? null, opts.secret ? "••1234" : null, false,
  ]);

describe("Passerelles de paiement (Super Admin)", () => {
  test("réglages réservés au Super Admin ; clés ou instructions obligatoires ; une seule par défaut ; aucune clé lisible", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.admin);
      assert.match(await rejects(update(q, "fedapay", false)), /Réservé|plateforme|insufficient/i);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(update(q, "fedapay", true)), /clés/);
      assert.match(await rejects(update(q, "fedapay", true, { secret: "clair-non-chiffre" })), /chiffrées/);
      assert.match(await rejects(update(q, "offline", true)), /comment payer/);
      await update(q, "fedapay", true, { secret: CIPHER, isDefault: true, label: "Mobile Money" });
      await update(q, "offline", true, { mode: "live", instructions: "Orange Money : +229 00 00 00 00", isDefault: true });
      const defaults = await q("select provider from payment_gateway_settings where is_default");
      assert.deepEqual(defaults.map((r) => r.provider), ["offline"], "une seule passerelle par défaut");
      assert.match(await rejects(q("select secret_ciphertext from payment_gateway_settings")), /permission denied/);

      await switchTo(q, USERS.admin);
      const options = await q("select * from available_payment_gateways()");
      assert.deepEqual(options.map((o) => o.provider), ["offline", "fedapay"]);
      assert.equal(options[1].label, "Mobile Money");
      assert.ok(!("secret_ciphertext" in options[0]) && !("config" in options[0]));
      assert.equal(options[0].instructions, "Orange Money : +229 00 00 00 00");
      assert.equal((await q("select count(*)::int n from payment_gateway_settings"))[0].n, 0, "réglages invisibles hors Super Admin");
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from audit_logs where action = 'platform.payment_gateway_updated'"))[0].n, 2);
    });
  });

  test("transfert : déclaré par l'établissement, validé par le Super Admin → abonnement actif ; refus motivé", async () => {
    await as(null, async (q) => {
      await switchTo(q, USERS.superadmin);
      await update(q, "offline", true, { mode: "live", instructions: "Virement : IBAN BJ00 0000 0000" });
      await switchTo(q, USERS.admin);
      const [{ c }] = await q("select public.billing_start_checkout($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'offline', 'live') c", [ORG_DEMO]);
      assert.match(await rejects(q("select billing_declare_offline_payment($1, 'x')", [c.reference])), /référence/);
      await q("select billing_declare_offline_payment($1, 'MP240101.1234.A56', 'Payé depuis +229…')", [c.reference]);
      assert.match(await rejects(q("select platform_decide_offline_payment($1, true)", [c.transaction_id])), /Réservé|plateforme|insufficient/i);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select billing_declare_offline_payment($1, 'ABCDEF')", [c.reference])), /introuvable/);

      await switchTo(q, USERS.superadmin);
      const [{ r }] = await q("select platform_decide_offline_payment($1, true) r", [c.transaction_id]);
      assert.equal(r.result, "confirmed");
      await switchTo(q, null);
      const [tx] = await q("select status, confirmed_by, provider_response->'declaration'->>'reference' ref from payment_transactions where id = $1", [c.transaction_id]);
      assert.equal(tx.status, "SUCCESS");
      assert.equal(tx.confirmed_by, USERS.superadmin);
      assert.equal(tx.ref, "MP240101.1234.A56");
      assert.equal((await q("select status from subscriptions where organization_id = $1", [ORG_DEMO]))[0].status, "ACTIVE");

      // Second paiement refusé : motif obligatoire, rien n'est activé en plus.
      await switchTo(q, USERS.admin);
      const [{ c: c2 }] = await q("select public.billing_start_checkout($1, 'MODULE_SCOLAIRE', 'MONTHLY', 'offline', 'live') c", [ORG_DEMO]);
      await switchTo(q, USERS.superadmin);
      assert.match(await rejects(q("select platform_decide_offline_payment($1, false, '')", [c2.transaction_id])), /motif/);
      await q("select platform_decide_offline_payment($1, false, 'Montant non reçu')", [c2.transaction_id]);
      await switchTo(q, null);
      const [tx2] = await q("select status, failure_reason from payment_transactions where id = $1", [c2.transaction_id]);
      assert.equal(tx2.status, "FAILED");
      assert.match(tx2.failure_reason, /Montant non reçu/);
    });
  });
});
