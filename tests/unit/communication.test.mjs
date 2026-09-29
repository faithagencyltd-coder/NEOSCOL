// Centre d'envois : rendu des modèles (variables, échappement HTML), segments SMS.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { renderText, renderEmailHtml, smsSegments } = await import("../../src/features/communication/render.ts");

describe("Rendu des modèles", () => {
  test("variables remplacées ; variable absente vide, jamais la balise brute", () => {
    assert.equal(renderText("Bonjour {{ destinataire }}, solde : {{solde}} {{devise}}{{inconnue}}", { destinataire: "Awa DOSSO", solde: "25 000", devise: "XOF" }), "Bonjour Awa DOSSO, solde : 25 000 XOF");
  });

  test("e-mail : texte et variables échappés (aucune injection HTML)", () => {
    const html = renderEmailHtml("Bonjour {{destinataire}}\nMerci", { destinataire: "<script>alert(1)</script>" }, "Lycée <A&B>");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes("Lycée &lt;A&amp;B&gt;"));
    assert.ok(html.includes("<br>Merci"));
  });

  test("segments SMS : 160 caractères GSM, 70 en Unicode", () => {
    assert.equal(smsSegments("a".repeat(160)), 1);
    assert.equal(smsSegments("a".repeat(161)), 2);
    assert.equal(smsSegments("é".repeat(160)), 1, "é fait partie de l'alphabet GSM");
    assert.equal(smsSegments("ô".repeat(71)), 2, "ô hors GSM : 67 par segment");
  });
});
