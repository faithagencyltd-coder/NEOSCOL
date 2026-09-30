// Site web : demandes (validation), systèmes institutionnels (seuls les vérifiés), textes honnêtes.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const lead = await import("../../src/features/marketing/lead.ts");
const sw = await import("../../src/features/platform/site-web.ts");
const content = await import("../../src/features/marketing/content.ts");

const form = (o) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("Demandes envoyées depuis le site", () => {
  test("démonstration : nom et e-mail suffisent", () => {
    const r = lead.validateLead(form({ kind: "demo", full_name: "Awa K.", email: "Awa@Ecole.bj" }), "fr");
    assert.equal(r.ok, true);
    assert.equal(r.value.email, "awa@ecole.bj");
  });
  test("contact : message obligatoire ; champs invalides signalés (FR/EN)", () => {
    const r = lead.validateLead(form({ kind: "contact", full_name: "A", email: "x", phone: "abc" }), "en");
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.fieldErrors).sort(), ["email", "full_name", "message", "phone"]);
    assert.match(r.message, /check/);
  });
  test("type d'établissement limité aux valeurs connues", () => {
    const r = lead.validateLead(form({ kind: "demo", full_name: "Awa", email: "a@b.co", organization_type: "hack" }), "fr");
    assert.equal(r.value.organizationType, "");
  });
});

describe("Systèmes institutionnels", () => {
  test("une ligne par système ; vérifié seulement si indiqué", () => {
    const r = sw.parseSystems("Système A | Gestion nationale | vérifié\nSystème B | À confirmer | non");
    assert.deepEqual(r, { ok: true, value: [
      { name: "Système A", description: "Gestion nationale", verified: true },
      { name: "Système B", description: "À confirmer", verified: false },
    ] });
    assert.equal(sw.parseSystems("A").ok, false);
    assert.equal(sw.systemsToText(r.value).split("\n")[0], "Système A | Gestion nationale | vérifié");
  });
});

describe("Textes du site", () => {
  const all = JSON.stringify(content.DICTS);
  test("NeoScool ne remplace pas les systèmes nationaux", () => {
    assert.ok(!/remplace (EducMaster|le système)/i.test(all));
    assert.match(content.DICTS.fr.countries.national, /ne remplace pas/);
    assert.match(content.DICTS.en.countries.national, /does not replace/);
  });
  test("aucun format d'export non disponible annoncé", () => {
    assert.deepEqual(content.DICTS.fr.data.exportFormats, ["XLSX", "CSV", "PDF", "PNG"]);
    assert.ok(!/\bJSON\b|\bZIP\b/.test(all));
  });
  test("les deux langues ont les mêmes sections", () => {
    assert.deepEqual(Object.keys(content.DICTS.en), Object.keys(content.DICTS.fr));
    assert.equal(content.DICTS.en.flow.steps.length, content.DICTS.fr.flow.details.length);
  });
});
