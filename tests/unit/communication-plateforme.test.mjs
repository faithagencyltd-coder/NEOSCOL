// Communication de la plateforme : e-mail d'envoi groupé (texte échappé) et cases cochées.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const c = await import("../../src/features/platform/communication.ts");

describe("E-mail d'envoi groupé", () => {
  test("le texte est échappé (aucune balise injectée)", () => {
    const html = c.campaignEmailHtml("<b>Objet</b>", "Bonjour <script>alert(1)</script>", "A & B", "École \"Test\"");
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&lt;b&gt;Objet&lt;/b&gt;"));
    assert.ok(html.includes("Bonjour A &amp; B,"));
    assert.ok(html.includes("École &quot;Test&quot;"));
  });
  test("paragraphes et retours à la ligne conservés", () => {
    const html = c.campaignEmailHtml("Objet", "Ligne 1\nLigne 2\n\nParagraphe 2");
    assert.equal((html.match(/<p style="margin:0 0 14px;line-height:1.6">/g) ?? []).length, 2);
    assert.ok(html.includes("Ligne 1<br>Ligne 2"));
  });
});

describe("Cases cochées", () => {
  test("seules les valeurs autorisées cochées sont retenues", () => {
    const f = new FormData();
    f.set("module_school", "on");
    f.set("module_hack", "on");
    f.set("module_higher", "off");
    assert.deepEqual(c.checkedValues(f, "module", c.MODULES), ["school"]);
  });
});

describe("Messages automatiques : variables", () => {
  test("variables remplacées, inconnues laissées telles quelles", () => {
    assert.equal(c.renderTemplate("{etablissement} : J-{jours} {x}", { etablissement: "Lycée A", jours: "3" }), "Lycée A : J-3 {x}");
  });
  test("exemple d'aperçu limité aux variables connues", () => {
    assert.deepEqual(Object.keys(c.exampleVars(["formule", "inconnue"])), ["formule"]);
  });
});
