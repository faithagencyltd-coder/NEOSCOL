// Remises sur facture (tous modules) : droit, motif, plafond, échéancier ajusté, journal.
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";

import { as, ORG_DEMO, pool, rejects, switchTo, USERS } from "./helpers.mjs";

after(() => pool.end());

describe("Remises sur facture", () => {
  test("comptable : remise appliquée, total et échéancier réduits ; contrôles et droits", async () => {
    await as(null, async (q) => {
      const [inv] = await q(
        `select i.id, i.total, (select coalesce(sum(amount), 0) from installments t where t.invoice_id = i.id) as inst
         from invoices i where i.organization_id = $1 and i.status <> 'cancelled'
           and exists (select 1 from installments t where t.invoice_id = i.id)
           and i.total - app.invoice_paid_amount(i.id) > 20000
         order by i.number limit 1`,
        [ORG_DEMO],
      );
      assert.ok(inv, "facture de démonstration avec échéancier");
      await switchTo(q, USERS.teacher);
      assert.match(await rejects(q("select public.apply_invoice_discount($1, null, 5000, 'Fratrie')", [inv.id])), /introuvable/);
      await switchTo(q, USERS.accountant);
      assert.match(await rejects(q("select public.apply_invoice_discount($1, null, 5000, '')", [inv.id])), /motif/);
      assert.match(await rejects(q("select public.apply_invoice_discount($1, null, 0, 'Fratrie')", [inv.id])), /invalide/);
      assert.match(await rejects(q("select public.apply_invoice_discount($1, null, 99999999, 'Fratrie')", [inv.id])), /dépasse/);
      const [{ r }] = await q("select public.apply_invoice_discount($1, null, 5000, 'Fratrie (2e enfant)') as r", [inv.id]);
      assert.equal(Number(r.total), Number(inv.total) - 5000);
      const [after2] = await q("select discount_total, (select sum(amount) from installments where invoice_id = $1) as inst from invoices where id = $1", [inv.id]);
      assert.equal(Number(after2.inst), Number(inv.inst) - 5000, "échéancier réduit du même montant");
      assert.ok(Number(after2.discount_total) >= 5000);
      const [line] = await q("select discount_reason from invoice_lines where invoice_id = $1 and discount_amount >= 5000 limit 1", [inv.id]);
      assert.match(line.discount_reason, /Fratrie/);
      await switchTo(q, null);
      assert.equal((await q("select count(*)::int n from audit_logs where action = 'finance.discount' and entity_id = $1", [inv.id]))[0].n, 1);
      await switchTo(q, USERS.otherOrgAdmin);
      assert.match(await rejects(q("select public.apply_invoice_discount($1, null, 1000, 'Test')", [inv.id])), /introuvable/, "autre établissement : refus");
    });
  });
});
