"use client";

import { useEffect, useState } from "react";

import { SPEECH_LANG, type VoiceGender, type VoiceLanguage } from "./messages";

/**
 * Synthèse vocale du navigateur (Web Speech API) : tout se passe sur l'appareil,
 * aucun son enregistré, aucun service externe. Sans voix disponible : silence.
 */
export type SpeakOptions = { language: VoiceLanguage; rate: number; volume: number; pitch?: number; gender?: VoiceGender; voiceName?: string | null };

// Le navigateur ne dit pas si une voix est masculine ou féminine : on le déduit
// du nom des voix courantes (Android, iOS, Windows, Chrome). Sinon : « ? ».
const FEMALE = /\b(female|femme|woman|amelie|amélie|audrey|aurelie|aurélie|marie|julie|celine|céline|hortense|virginie|denise|sylvie|eloise|éloïse|elise|élise|vivienne|brigitte|chantal|claire|juliette|léa|lea|samantha|karen|serena|moira|tessa|fiona|kate|susan|hazel|libby|sonia|zira|heather|victoria|allison|ava|emma|martha|stephanie|catherine|jenny|aria|natasha|clara)\b/i;
const MALE = /\b(male|homme|man|thomas|nicolas|daniel|paul|henri|claude|jacques|remy|rémy|antoine|alain|guillaume|mathieu|fred|alex|george|arthur|oliver|ryan|david|mark|james|jean|louis|gordon|lee|rishi|aaron|guy|eric|brian|william)\b/i;

export function voiceGender(voice: Pick<SpeechSynthesisVoice, "name">): VoiceGender {
  if (FEMALE.test(voice.name)) return "female";
  if (MALE.test(voice.name)) return "male";
  return "auto";
}

export function voicesFor(language: VoiceLanguage): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const lang = SPEECH_LANG[language];
  const all = window.speechSynthesis.getVoices();
  return all.filter((v) => v.lang === lang || v.lang.replace("_", "-").startsWith(`${language}-`) || v.lang === language);
}

/** Voix retenue : celle choisie sur la tablette, sinon la préférence de l'établissement (homme / femme), sinon la première de la langue. */
export function pickVoice(language: VoiceLanguage, gender: VoiceGender = "auto", voiceName?: string | null): SpeechSynthesisVoice | null {
  const voices = voicesFor(language);
  if (!voices.length) return null;
  if (voiceName) {
    const chosen = voices.find((v) => v.name === voiceName);
    if (chosen) return chosen;
  }
  const lang = SPEECH_LANG[language];
  const exact = voices.filter((v) => v.lang === lang);
  const pool = exact.length ? exact : voices;
  if (gender !== "auto") {
    const match = pool.find((v) => voiceGender(v) === gender) ?? voices.find((v) => voiceGender(v) === gender);
    if (match) return match;
  }
  return pool[0] ?? null;
}

export function speak(text: string, options: SpeakOptions): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return false;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[options.language];
  utterance.rate = options.rate;
  utterance.volume = options.volume;
  utterance.pitch = options.pitch ?? 1;
  const voice = pickVoice(options.language, options.gender, options.voiceName);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
  }
  synth.speak(utterance);
  return true;
}

/** Voix de l'appareil pour une langue (la liste arrive parfois après le chargement de la page). */
export function useDeviceVoices(language: VoiceLanguage): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const update = () => setVoices(voicesFor(language));
    update();
    window.speechSynthesis.addEventListener?.("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener?.("voiceschanged", update);
  }, [language]);
  return voices;
}

export const GENDER_LABELS: Record<VoiceGender, string> = { auto: "Automatique", female: "Femme", male: "Homme" };
