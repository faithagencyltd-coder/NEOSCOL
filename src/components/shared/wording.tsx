"use client";

import { createContext, useContext, type ReactNode } from "react";

import { adaptWording, vocabularyFor, type Vocabulary } from "@/lib/vocabulary";

const WordingContext = createContext<Vocabulary | null>(null);

/**
 * Module de l'établissement actif (scolaire, formation, université) pour les
 * textes communs : posé une fois dans la mise en page de l'application.
 */
export function WordingProvider({ organizationType, children }: { organizationType: string | null; children: ReactNode }) {
  return <WordingContext value={vocabularyFor(organizationType)}>{children}</WordingContext>;
}

/** Fonction d'adaptation du vocabulaire (identité hors établissement). */
export function useWording(): (text: string) => string {
  const v = useContext(WordingContext);
  return (text) => (v ? adaptWording(text, v) : text);
}

/** Texte adapté au module (« élève » → « apprenant » / « étudiant », « classe » → « session » / « promotion »). */
export function W({ text }: { text: string }) {
  return useWording()(text);
}
