"use client";

import { SPEECH_LANG, type VoiceLanguage } from "./messages";

/**
 * Synthèse vocale du navigateur (Web Speech API) : tout se passe sur l'appareil,
 * aucun son enregistré, aucun service externe. Sans voix disponible : silence.
 */
export function speak(text: string, options: { language: VoiceLanguage; rate: number; volume: number }): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const lang = SPEECH_LANG[options.language];
  utterance.lang = lang;
  utterance.rate = options.rate;
  utterance.volume = options.volume;
  const voice = synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith(options.language));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
  return true;
}
