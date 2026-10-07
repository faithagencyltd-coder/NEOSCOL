// Tests de la logique de l'application mobile (lecture des liens, QR codes, liste des établissements).
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const Lib = createRequire(import.meta.url)("../www/lib.js");

test("adresse du serveur : https par défaut, http sur le réseau local", () => {
  assert.equal(Lib.normalizeServer("ecole.exemple.com"), "https://ecole.exemple.com");
  assert.equal(Lib.normalizeServer("192.168.1.20:3000"), "http://192.168.1.20:3000");
  assert.equal(Lib.normalizeServer("http://10.0.0.5:3000/acces/DEMO"), "http://10.0.0.5:3000");
  assert.equal(Lib.normalizeServer("ftp://x"), null);
  assert.equal(Lib.normalizeServer(""), null);
});

test("lien de portail (QR code) : serveur, code et portail", () => {
  assert.deepEqual(Lib.parseInput("https://app.neoscool.com/acces/demo?portail=parent"), { origin: "https://app.neoscool.com", code: "DEMO", portal: "parent" });
  assert.deepEqual(Lib.parseInput("http://192.168.1.20:3000/acces/DEMOF"), { origin: "http://192.168.1.20:3000", code: "DEMOF", portal: null });
  assert.equal(Lib.parseInput("https://x.com/acces/DEMO?portail=pirate").portal, null);
  assert.ok(Lib.parseInput("https://x.com/acces/<script>").error);
});

test("code seul : exige l'adresse du serveur", () => {
  assert.ok(Lib.parseInput("DEMO").error);
  assert.deepEqual(Lib.parseInput("demo", "192.168.1.20:3000"), { origin: "http://192.168.1.20:3000", code: "DEMO", portal: null });
  assert.ok(Lib.parseInput("").error);
});

test("liste : ajout sans doublon, mise à jour, retrait", () => {
  let list = Lib.upsert([], { origin: "https://a.com", code: "DEMO", name: "École A" });
  list = Lib.upsert(list, { origin: "https://b.com", code: "DEMO", name: "École B" });
  list = Lib.upsert(list, { origin: "https://a.com", code: "DEMO", name: "École A (nouveau nom)" });
  assert.equal(list.length, 2);
  assert.equal(list[0].name, "École A (nouveau nom)");
  assert.ok(list[0].added_at);
  assert.equal(Lib.remove(list, "https://b.com", "DEMO").length, 1);
});

test("adresse du portail et initiales", () => {
  assert.equal(Lib.portalUrl({ origin: "https://a.com", code: "DEMO" }, "eleve"), "https://a.com/acces/DEMO?portail=eleve");
  assert.equal(Lib.portalUrl({ origin: "https://a.com", code: "DEMO" }, "x"), "https://a.com/acces/DEMO");
  assert.equal(Lib.initials("Groupe Scolaire de la Paix"), "GS");
});
