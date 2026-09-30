// Tableau de bord des revenus : période choisie, raccourcis, évolution.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const r = await import("../../src/features/platform/revenue.ts");
const today = new Date(Date.UTC(2026, 1, 14)); // 14 février 2026

describe("Période des revenus", () => {
  test("par défaut : le mois en cours", () => {
    assert.deepEqual(r.parseRevenuePeriod({}, today), { from: "2026-02-01", to: "2026-02-28", preset: "mois" });
  });
  test("raccourcis : mois dernier, trimestre, année, 12 mois", () => {
    const p = Object.fromEntries(r.revenuePresets(today).map((x) => [x.key, [x.from, x.to]]));
    assert.deepEqual(p["mois-dernier"], ["2026-01-01", "2026-01-31"]);
    assert.deepEqual(p.trimestre, ["2026-01-01", "2026-03-31"]);
    assert.deepEqual(p.annee, ["2026-01-01", "2026-12-31"]);
    assert.deepEqual(p["12-mois"], ["2025-03-01", "2026-02-28"]);
  });
  test("dates libres valides", () => {
    assert.deepEqual(r.parseRevenuePeriod({ du: "2026-01-10", au: "2026-01-20" }, today), { from: "2026-01-10", to: "2026-01-20", preset: null });
  });
  test("dates invalides ou inversées : retour au mois en cours", () => {
    assert.equal(r.parseRevenuePeriod({ du: "2026-02-30", au: "2026-03-01" }, today).preset, "mois");
    assert.equal(r.parseRevenuePeriod({ du: "2026-03-01", au: "2026-01-01" }, today).preset, "mois");
    assert.equal(r.parseRevenuePeriod({ du: "x' or 1=1", au: "2026-01-01" }, today).preset, "mois");
  });
  test("évolution en %", () => {
    assert.equal(r.evolution(150, 100), 50);
    assert.equal(r.evolution(50, 100), -50);
    assert.equal(r.evolution(10, 0), null);
  });
});
