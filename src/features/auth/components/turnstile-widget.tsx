"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (el: HTMLElement, options: { sitekey: string; language?: string; theme?: string }) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Vérification anti-robot Cloudflare Turnstile. Le jeton est placé par
 * Cloudflare dans le champ « cf-turnstile-response » du formulaire et vérifié
 * côté serveur (jamais de décision dans le navigateur).
 */
export function TurnstileWidget({ siteKey }: { siteKey: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | null = null;
    let cancelled = false;
    loadScript()
      .then(() => {
        if (!cancelled && ref.current && window.turnstile) id = window.turnstile.render(ref.current, { sitekey: siteKey, language: "fr" });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);
  return <div ref={ref} className="min-h-[65px]" aria-label="Vérification anti-robot" />;
}

export type CaptchaConfig = { siteKey: string; mode: "progressive" | "always" } | null;
