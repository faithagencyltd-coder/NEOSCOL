// Cartes : code-barres Code 128, design par défaut et vocabulaire par module.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const bc = await import("../../src/lib/barcode/code128.ts");
const d = await import("../../src/features/cards/design.ts");

describe("Code 128", () => {
  test("table : 106 motifs de 11 modules, arrêt de 13", () => {
    assert.equal(bc.CODE128_PATTERNS.length, 107);
    bc.CODE128_PATTERNS.forEach((p, i) => {
      const sum = Array.from(p, Number).reduce((a, b) => a + b, 0);
      assert.equal(sum, i === 106 ? 13 : 11, `motif ${i}`);
    });
  });

  test("encodage : départ B, somme de contrôle, arrêt ; largeur = 11 × (n + 3) + 2", () => {
    const value = "DEMO-26-00014";
    const widths = bc.code128Widths(value);
    const modules = widths.reduce((a, b) => a + b, 0);
    assert.equal(modules, 11 * (value.length + 2) + 13);
    assert.deepEqual(widths.slice(0, 6), [2, 1, 1, 2, 1, 4], "départ jeu B");
    assert.deepEqual(widths.slice(-7), [2, 3, 3, 1, 1, 1, 2], "arrêt");
    // Somme de contrôle de « AB » : (104 + 33×1 + 34×2) mod 103 = 102.
    const ab = bc.code128Widths("AB");
    assert.deepEqual(ab.slice(18, 24), Array.from(bc.CODE128_PATTERNS[102], Number));
    assert.equal(bc.code128Bars(value).width, modules);
  });
});

describe("Design des cartes", () => {
  test("défaut : modèle Prestige, coordonnées de l'établissement, texte « carte trouvée »", () => {
    const design = d.resolveCardDesign({}, { address: "Rue 12", city: "Cotonou", phone: "+229 97 12 34 56", website: "www.faithbtp.com" });
    assert.equal(design.template, "prestige");
    assert.equal(design.primary, "#0b1f3a");
    assert.equal(design.address, "Rue 12, Cotonou");
    assert.equal(design.lost_text, "Carte trouvée ? Appelez le +229 97 12 34 56.");
    assert.equal(design.show_photo, true);
  });

  test("réglages : modèle, couleur et textes propres à l'établissement l'emportent", () => {
    const design = d.resolveCardDesign({ card_design: { template: "emeraude", accent: "#ff0000", phone: "+225 01", show_barcode: false } }, { phone: "+229 00" });
    assert.deepEqual([design.template, design.primary, design.accent, design.phone, design.show_barcode], ["emeraude", "#064e3b", "#ff0000", "+225 01", false]);
  });

  test("titre selon le module : carte scolaire, apprenant, étudiant", () => {
    assert.equal(d.cardLabels({ family: "school" }).title, "CARTE SCOLAIRE");
    assert.equal(d.cardLabels({ family: "training" }).title, "CARTE APPRENANT");
    assert.equal(d.cardLabels({ family: "higher" }).title, "CARTE ÉTUDIANT");
    assert.equal(d.cardLabels({ family: "training" }).year, "ANNÉE DE FORMATION");
  });
});
