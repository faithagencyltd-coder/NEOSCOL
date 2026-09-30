"use client";

import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  CloudOff,
  Cloud,
  IdCard,
  KeyRound,
  Play,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  UserRound,
  Wifi,
  X,
  Clock,
  FileCheck2,
  ListChecks,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { CAPTURE } from "@/features/marketing/content";
import { Flag } from "@/features/marketing/flags";
import { cn } from "@/lib/utils/cn";

import { useInView } from "./reveal";

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Préférence « réduire les animations » de l'appareil. */
function useReducedMotion() {
  return useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED).matches, () => false);
}

/** Index qui avance tout seul tant que la section est visible (arrêté si mouvement réduit ou pause). */
function useCycle(count: number, delay: number, paused = false) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const reduced = useReducedMotion();
  useInView(ref, setVisible);
  useEffect(() => {
    if (!visible || reduced || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), delay);
    return () => window.clearInterval(id);
  }, [visible, reduced, paused, count, delay]);
  return { ref, index, setIndex };
}

const isMobileCapture = (name: string) => /portail|verifier/.test(name);
const isTabletCapture = (name: string) => /tablette/.test(name);

/** Capture réelle dans un cadre de navigateur, de tablette ou de téléphone. */
export function Screen({ name, alt, className, priority = false }: { name: string; alt: string; className?: string; priority?: boolean }) {
  if (isMobileCapture(name)) {
    return (
      <div className={cn("overflow-hidden rounded-[2rem] border-[6px] border-[#0b1633] bg-[#0b1633] shadow-2xl", className)}>
        <Image src={CAPTURE(name)} alt={alt} width={780} height={1688} className="h-auto w-full rounded-[1.5rem]" priority={priority} sizes="(min-width: 1024px) 260px, 45vw" />
      </div>
    );
  }
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-[#0b2559]/10 bg-white shadow-[0_40px_80px_-30px_rgba(11,37,89,0.45)]", className)}>
      <div className="flex items-center gap-1.5 border-b border-[#0b2559]/10 bg-[#f3f6fb] px-3 py-2" aria-hidden>
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-3 h-4 flex-1 rounded-md bg-white" />
      </div>
      <Image src={CAPTURE(name)} alt={alt} width={1600} height={isTabletCapture(name) ? 1112 : 1000} className="h-auto w-full" priority={priority} sizes="(min-width: 1024px) 720px, 100vw" />
    </div>
  );
}

/** Hero : les acteurs apparaissent un à un autour de NeoScool, puis tout est relié. */
export function ConnectedHub({ core, actors }: { core: string; actors: string[] }) {
  const { ref, index } = useCycle(actors.length + 2, 1100);
  const reduced = useReducedMotion();
  const shown = reduced ? actors.length : Math.min(index, actors.length);
  const all = reduced || index >= actors.length;
  const R = 150;
  const nodes = actors.map((name, i) => {
    const a = (i / actors.length) * Math.PI * 2 - Math.PI / 2;
    return { name, x: 200 + R * Math.cos(a), y: 200 + R * Math.sin(a) };
  });
  return (
    <div ref={ref} className="mx-auto w-full max-w-[26rem]" data-testid="connected-hub">
      <svg viewBox="0 0 400 400" className="w-full" role="img" aria-label={`${core} : ${actors.join(", ")}`}>
        <defs>
          <radialGradient id="hub-core" cx="50%" cy="40%">
            <stop offset="0" stopColor="#2f7bff" />
            <stop offset="1" stopColor="#0b2559" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="200" r={R} fill="none" stroke="#0b2559" strokeOpacity="0.08" strokeDasharray="3 7" />
        {nodes.map((n, i) => (
          <line key={`l-${n.name}`} x1="200" y1="200" x2={n.x} y2={n.y} stroke={i < shown ? "#1d63ed" : "#0b2559"} strokeOpacity={i < shown ? 0.55 : 0.08} strokeWidth="2" className={i < shown ? "site-dash" : undefined} style={{ transition: "stroke-opacity 600ms" }} />
        ))}
        {all
          ? nodes.map((n, i) => {
              const m = nodes[(i + 1) % nodes.length]!;
              return <line key={`r-${n.name}`} x1={n.x} y1={n.y} x2={m.x} y2={m.y} stroke="#0ea5a4" strokeOpacity="0.35" strokeWidth="1.5" className="site-dash" />;
            })
          : null}
        <circle cx="200" cy="200" r="58" fill="#1d63ed" className="site-pulse" opacity="0.4" />
        <circle cx="200" cy="200" r="54" fill="url(#hub-core)" />
        <text x="200" y="206" textAnchor="middle" fontSize="19" fontWeight="700" fill="#ffffff" fontFamily="var(--font-heading)">
          {core}
        </text>
        {nodes.map((n, i) => (
          <g key={n.name} style={{ opacity: i < shown ? 1 : 0.25, transition: "opacity 600ms" }}>
            <circle cx={n.x} cy={n.y} r="34" fill="#ffffff" stroke={i === shown - 1 && !all ? "#1d63ed" : "#0b2559"} strokeOpacity={i === shown - 1 && !all ? 1 : 0.15} strokeWidth="2" />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="#0b2559">
              {n.name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type Actor = { key: string; name: string; text: string; capture: string };

/** Acteurs : un onglet par profil, avec son écran réel. */
export function ActorTabs({ actors }: { actors: Actor[] }) {
  const [paused, setPaused] = useState(false);
  const { ref, index, setIndex } = useCycle(actors.length, 4200, paused);
  const active = actors[index]!;
  return (
    <div ref={ref} className="grid items-center gap-8 lg:grid-cols-[0.9fr_1.1fr]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div role="tablist" aria-label="Profils" className="grid gap-2">
        {actors.map((a, i) => (
          <button
            key={a.key}
            role="tab"
            type="button"
            aria-selected={i === index}
            onClick={() => {
              setIndex(i);
              setPaused(true);
            }}
            className={cn(
              "group relative overflow-hidden rounded-2xl border px-5 py-4 text-left transition-all",
              i === index ? "border-[#1d63ed]/30 bg-white shadow-[0_18px_40px_-24px_rgba(11,37,89,0.5)]" : "border-transparent hover:bg-white/60",
            )}
          >
            <span className="block font-display text-lg font-semibold text-[#0b2559]">{a.name}</span>
            <span className="block text-sm text-[#0b2559]/65">{a.text}</span>
            {i === index && !paused ? <span className="absolute bottom-0 left-0 h-0.5 bg-[#1d63ed]" style={{ animation: "site-progress 4.2s linear" }} /> : null}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="relative flex min-h-[20rem] items-center justify-center">
        <div key={active.key} className="site-flag-in w-full">
          <Screen name={active.capture} alt={`${active.name} — ${active.text}`} className={isMobileCapture(active.capture) ? "mx-auto w-[15rem]" : ""} />
        </div>
      </div>
    </div>
  );
}

/** Module scolaire : chaîne d'étapes reliées, l'étape active est détaillée. */
export function SchoolFlow({ steps, details }: { steps: string[]; details: string[] }) {
  const { ref, index, setIndex } = useCycle(steps.length, 1800);
  return (
    <div ref={ref} className="grid gap-8">
      <ol className="flex flex-wrap justify-center gap-x-1 gap-y-3" data-testid="school-flow">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center">
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-current={i === index ? "step" : undefined}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all duration-500",
                i === index ? "scale-105 border-[#1d63ed] bg-[#1d63ed] text-white shadow-lg shadow-[#1d63ed]/30" : i < index ? "border-[#1d63ed]/30 bg-[#e8f0fe] text-[#0b2559]" : "border-[#0b2559]/15 bg-white text-[#0b2559]/70",
              )}
            >
              {s}
            </button>
            {i < steps.length - 1 ? <span aria-hidden className={cn("mx-1 h-0.5 w-4 rounded-full transition-colors duration-500", i < index ? "bg-[#1d63ed]" : "bg-[#0b2559]/15")} /> : null}
          </li>
        ))}
      </ol>
      <p key={index} className="site-flag-in mx-auto max-w-xl text-center text-lg text-[#0b2559]/80" aria-live="polite">
        <strong className="text-[#0b2559]">{steps[index]}</strong> — {details[index]}
      </p>
    </div>
  );
}

/** Saisie unique : la donnée circule d'écran en écran. */
export function DataJourney({ source, stops }: { source: string; stops: string[] }) {
  const { ref, index } = useCycle(stops.length, 1300);
  return (
    <div ref={ref} className="relative mx-auto grid max-w-5xl gap-6 md:grid-cols-[auto_1fr] md:items-center" data-testid="data-journey">
      <div className="mx-auto flex items-center gap-3 rounded-2xl bg-[#0b2559] px-5 py-4 text-white shadow-xl">
        <UserRound className="size-6 text-sky-300" aria-hidden />
        <span className="font-display font-semibold">{source}</span>
        <span className="relative ml-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-300 opacity-75" />
          <span className="relative inline-flex size-3 rounded-full bg-sky-300" />
        </span>
      </div>
      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {stops.map((s, i) => (
          <li
            key={s}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border bg-white px-2 py-3 text-center text-xs font-semibold transition-all duration-500",
              i <= index ? "border-[#1d63ed]/40 text-[#0b2559] shadow-[0_10px_24px_-16px_rgba(29,99,237,0.8)]" : "border-[#0b2559]/10 text-[#0b2559]/45",
            )}
          >
            <span className={cn("flex size-7 items-center justify-center rounded-full transition-colors duration-500", i <= index ? "bg-[#1d63ed] text-white" : "bg-[#0b2559]/5")}>
              {i < index ? <CheckCircle2 className="size-4" aria-hidden /> : <span className="text-[10px]">{i + 1}</span>}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

const BADGE_ICONS = [UserRound, IdCard, ScanLine, BadgeCheck, Building2, KeyRound, ShieldCheck, Clock, FileCheck2];

/** Smart Badge : du badge à l'enregistrement, étape par étape. */
export function BadgeScene({ steps }: { steps: string[] }) {
  const { ref, index } = useCycle(steps.length, 1200);
  return (
    <div ref={ref} className="grid items-center gap-10 lg:grid-cols-2">
      <ol className="grid grid-cols-3 gap-3" data-testid="badge-scene">
        {steps.map((s, i) => {
          const Icon = BADGE_ICONS[i] ?? CheckCircle2;
          return (
            <li key={s} className={cn("flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-sm font-semibold transition-all duration-500", i <= index ? "border-emerald-400/50 bg-emerald-400/10 text-white" : "border-white/10 text-sky-100/40")}>
              <Icon className={cn("size-6 transition-colors duration-500", i <= index ? "text-emerald-300" : "text-sky-100/30")} aria-hidden />
              {s}
            </li>
          );
        })}
      </ol>
      <Screen name="s-tablette-scan" alt="Tablette de pointage : arrivée enregistrée après scan du badge" />
    </div>
  );
}

const OFFLINE_ICONS = [Wifi, CloudOff, CloudOff, ListChecks, Clock, Wifi, RefreshCw, CheckCircle2];

/** Hors ligne : perte de réseau, travail continu, synchronisation. */
export function OfflineScene({ steps }: { steps: string[] }) {
  const { ref, index } = useCycle(steps.length, 1400);
  const offline = index >= 1 && index <= 4;
  return (
    <div ref={ref} className="grid gap-8" data-testid="offline-scene">
      <div className="mx-auto flex items-center gap-3 rounded-full border border-[#0b2559]/10 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
        {offline ? <CloudOff className="size-4 text-amber-500" aria-hidden /> : <Cloud className="size-4 text-emerald-600" aria-hidden />}
        <span className={offline ? "text-amber-600" : "text-emerald-700"}>{steps[index]}</span>
        <span className="flex gap-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("size-2 rounded-full transition-colors", index >= 3 && index <= 6 && i < Math.min(3, index - 2) ? "bg-amber-400" : "bg-[#0b2559]/10")} />
          ))}
        </span>
      </div>
      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {steps.map((s, i) => {
          const Icon = OFFLINE_ICONS[i] ?? CheckCircle2;
          const warn = i >= 1 && i <= 4;
          return (
            <li key={s} className={cn("flex flex-col items-center gap-2 rounded-2xl border bg-white p-3 text-center text-xs font-semibold transition-all duration-500", i === index ? (warn ? "border-amber-400 shadow-lg" : "border-emerald-500 shadow-lg") : "border-[#0b2559]/10 text-[#0b2559]/60")}>
              <Icon className={cn("size-5", i === index ? (warn ? "text-amber-500" : "text-emerald-600") : "text-[#0b2559]/35")} aria-hidden />
              {s}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export type CountryCard = {
  code: string;
  name: string;
  availability: string;
  rows: { label: string; value: string }[];
  context: string | null;
  systems: { name: string; description: string | null }[];
  marketing: string | null;
};

/** Pays : les drapeaux se succèdent ; un clic affiche la configuration réelle du pays. */
export function CountryShowcase({ countries, labels }: { countries: CountryCard[]; labels: { context: string; systems: string; systemsNote: string } }) {
  const [paused, setPaused] = useState(false);
  const { ref, index, setIndex } = useCycle(Math.max(countries.length, 1), 3200, paused);
  if (!countries.length) return null;
  const c = countries[index]!;
  return (
    <div ref={ref} className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]" data-testid="country-showcase">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-6 lg:grid-cols-3">
        {countries.map((country, i) => (
          <li key={country.code}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setPaused(true);
              }}
              aria-pressed={i === index}
              className={cn("flex w-full flex-col items-center gap-2 rounded-2xl border p-3 text-xs font-semibold transition-all", i === index ? "border-sky-300/60 bg-white/10 text-white" : "border-white/10 text-sky-100/70 hover:bg-white/5")}
            >
              <Flag code={country.code} className="h-8 w-12 rounded shadow-md ring-1 ring-black/10" />
              {country.name}
            </button>
          </li>
        ))}
      </ul>
      <div key={c.code} className="site-flag-in grid content-start gap-5 rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur" aria-live="polite">
        <div className="flex items-center gap-4">
          <Flag code={c.code} title={c.name} className="h-12 w-[4.5rem] rounded-md shadow-lg ring-1 ring-black/10" />
          <div>
            <h3 className="font-display text-2xl font-semibold text-white">{c.name}</h3>
            <span className="text-sm text-sky-200/80">{c.availability}</span>
          </div>
        </div>
        {c.marketing ? <p className="text-sky-100/85">{c.marketing}</p> : null}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {c.rows.map((r) => (
            <div key={r.label} className="rounded-xl bg-white/5 px-3 py-2">
              <dt className="text-[11px] uppercase tracking-wider text-sky-200/60">{r.label}</dt>
              <dd className="text-sm font-semibold text-white">{r.value}</dd>
            </div>
          ))}
        </dl>
        {c.context ? (
          <div>
            <h4 className="text-xs uppercase tracking-wider text-sky-200/60">{labels.context}</h4>
            <p className="text-sm text-sky-100/85">{c.context}</p>
          </div>
        ) : null}
        {c.systems.length ? (
          <div className="grid gap-2">
            <h4 className="text-xs uppercase tracking-wider text-sky-200/60">{labels.systems}</h4>
            <ul className="grid gap-1 text-sm text-white">
              {c.systems.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong>
                  {s.description ? <span className="text-sky-100/75"> — {s.description}</span> : null}
                </li>
              ))}
            </ul>
            <p className="text-xs text-sky-200/70">{labels.systemsNote}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type VideoItem = { id: string; title: string; topic: string; description: string | null; video_url: string; poster_url: string | null };

/** Vidéos publiées par le Super Admin, lecture dans une fenêtre dédiée. */
export function VideoGallery({ videos, labels }: { videos: VideoItem[]; labels: { play: string; close: string } }) {
  const [open, setOpen] = useState<VideoItem | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  const [first, ...rest] = videos;
  if (!first) return null;
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]" data-testid="video-gallery">
        <button type="button" onClick={() => setOpen(first)} className="group relative aspect-video overflow-hidden rounded-3xl bg-[#07142b] text-left shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element -- affiche hébergée ailleurs, réglée par le Super Admin */}
          {first.poster_url ? <img src={first.poster_url} alt="" className="absolute inset-0 size-full object-cover opacity-80 transition-transform duration-700 group-hover:scale-105" /> : null}
          <span className="absolute inset-0 bg-gradient-to-t from-[#07142b] via-transparent" />
          <span className="absolute left-1/2 top-1/2 flex size-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0b2559] shadow-2xl transition-transform group-hover:scale-110">
            <Play className="ml-1 size-8" aria-hidden />
            <span className="sr-only">{labels.play}</span>
          </span>
          <span className="absolute bottom-5 left-6 right-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">{first.topic}</span>
            <span className="block font-display text-2xl font-semibold text-white">{first.title}</span>
          </span>
        </button>
        {rest.length ? (
          <ul className="grid content-start gap-3">
            {rest.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setOpen(v)} className="flex w-full items-center gap-4 rounded-2xl border border-[#0b2559]/10 bg-white p-3 text-left transition-shadow hover:shadow-lg">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#0b2559] text-white">
                    <Play className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-xs font-semibold uppercase tracking-wider text-[#1d63ed]">{v.topic}</span>
                    <span className="block font-semibold text-[#0b2559]">{v.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={open.title} className="anim-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
          <div className="relative w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(null)} className="absolute -top-12 right-0 flex size-10 items-center justify-center rounded-full bg-white/15 text-white" aria-label={labels.close}>
              <X className="size-5" aria-hidden />
            </button>
            <video src={open.video_url} poster={open.poster_url ?? undefined} controls autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black" />
          </div>
        </div>
      ) : null}
    </>
  );
}
