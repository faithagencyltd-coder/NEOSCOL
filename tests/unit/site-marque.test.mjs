// Site et marque : contraste de la couleur principale, CSS injecté, textes publiés.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const b = await import("../../src/features/platform/brand.ts");

describe("Couleur principale", () => {
  test("contraste WCAG", () => {
    assert.equal(b.contrastRatio("#000000", "#ffffff"), 21);
    assert.ok(b.contrastRatio("#1d63ed", "#ffffff") >= 4.5);
  });
  test("couleur trop claire refusée, format contrôlé", () => {
    assert.equal(b.validatePrimaryColor("#ffd700").ok, false);
    assert.equal(b.validatePrimaryColor("bleu").ok, false);
    assert.deepEqual(b.validatePrimaryColor(" #0B6E4F "), { ok: true, color: "#0b6e4f" });
  });
  test("CSS : thème clair seulement, logo en URL sûre", () => {
    const css = b.brandCss("#0b6e4f", "https://x.supabase.co/storage/v1/object/public/platform-assets/logo/a.png");
    assert.ok(css.includes("--primary:#0b6e4f"));
    assert.ok(css.includes("prefers-color-scheme: dark"));
    assert.ok(css.includes('--brand-logo:url("https://x.supabase.co/'));
    assert.equal(b.brandCss("red;}body{display:none", 'https://a/b.png");}x{'), "", "valeurs dangereuses ignorées");
    assert.equal(b.brandCss(null, null), "");
  });
  test("variantes de la couleur", () => {
    assert.equal(b.mix("#000000", -1), "#ffffff");
    assert.equal(b.mix("#ffffff", 1), "#000000");
  });
});

describe("Textes publiés", () => {
  test("intertitres et paragraphes, sans HTML", () => {
    assert.deepEqual(b.textBlocks("## Objet\nLe service NeoScool.\n\n<b>gras</b>"), [
      { kind: "h2", text: "Objet" },
      { kind: "p", text: "Le service NeoScool." },
      { kind: "p", text: "<b>gras</b>" },
    ]);
  });
  test("lien WhatsApp", () => {
    assert.equal(b.whatsappLink("229 01 90"), "https://wa.me/2290190");
  });
});
