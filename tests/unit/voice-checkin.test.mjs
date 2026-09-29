// Voice Check-in : choix du message selon le scan, variables, anonymat, langues.
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const v = await import("../../src/features/voice-checkin/messages.ts");

const staff = (extra = {}) => ({ result: "accepted", kind: "arrival", minutes_late: 0, at: "07:52", staff: { name: "Awa KONÉ", first_name: "Awa" }, ...extra });

describe("Voice Check-in", () => {
  test("événement selon le résultat du scan", () => {
    assert.equal(v.voiceEvent(staff()), "arrival");
    assert.equal(v.voiceEvent(staff({ minutes_late: 12 })), "arrival_late");
    assert.equal(v.voiceEvent(staff({ kind: "departure" })), "departure");
    assert.equal(v.voiceEvent(staff({ kind: "lesson" })), "lesson");
    assert.equal(v.voiceEvent({ result: "accepted", profile: "learner", kind: "entry", status: "late" }), "learner_late");
    assert.equal(v.voiceEvent({ result: "accepted", profile: "learner", kind: "exit" }), "learner_exit");
    assert.equal(v.voiceEvent({ result: "rejected", reason: "duplicate" }), "duplicate");
    assert.equal(v.voiceEvent({ result: "rejected", reason: "revoked_badge" }), "rejected");
    assert.equal(v.voiceEvent(null, true), "offline");
  });

  test("variables remplacées ; messages personnalisés prioritaires", () => {
    const vars = v.voiceVariables(staff({ minutes_late: 7 }), "Lycée Démo");
    assert.equal(v.renderVoice(v.messageFor({ language: "fr", messages: {} }, "arrival_late"), vars), "Bonjour Awa, arrivée enregistrée. Retard de 7 minutes.");
    assert.equal(v.renderVoice(v.messageFor({ language: "fr", messages: { arrival: "Salut {prenom} — {etablissement}" } }, "arrival"), vars), "Salut Awa — Lycée Démo");
    assert.equal(v.renderVoice(v.messageFor({ language: "en", messages: {} }, "departure"), vars), "Goodbye Awa, departure recorded.");
  });

  test("anonymat : sans annonce des noms, phrase propre ; refus : jamais de nom", () => {
    const vars = v.voiceVariables(staff(), "Lycée");
    assert.equal(v.renderVoice("Bonjour {prenom}, arrivée enregistrée à {heure}.", vars, false), "Bonjour, arrivée enregistrée à 07:52.");
    const refused = v.voiceVariables({ result: "rejected", reason: "other_organization", staff: { name: "X Y", first_name: "X" } }, "Lycée");
    assert.equal(refused.prenom, "");
    assert.equal(refused.nom, "");
  });

  test("messages par défaut définis pour chaque événement et chaque langue", () => {
    for (const lang of ["fr", "en"]) for (const e of v.VOICE_EVENTS) assert.ok(v.DEFAULT_VOICE_MESSAGES[lang][e.key].length > 3, `${lang}/${e.key}`);
  });
});
