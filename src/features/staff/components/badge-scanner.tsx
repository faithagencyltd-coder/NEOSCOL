"use client";

import jsQR from "jsqr";
import { Camera, CameraOff, Check, CheckCircle2, Keyboard, LogOut, Maximize, ScanLine, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { AnimatedError, AnimatedSuccess } from "@/components/motion/animated-feedback";
import { scanBadge } from "@/features/staff/actions";
import type { ScanResult } from "@/features/staff/schemas";
import { cn } from "@/lib/utils/cn";

type RecentScan = { id: string; at: string; result: "accepted" | "rejected"; name: string; message: string };

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => Detector;
  }
}

const RESET_AFTER_MS = 6000;

/** Titre court affiché pour chaque motif de refus renvoyé par scan_staff_badge. */
const REJECTION_TITLES: Record<string, string> = {
  unknown_badge: "QR invalide",
  revoked_badge: "Badge désactivé",
  other_organization: "Utilisateur non autorisé",
  inactive_staff: "Utilisateur non autorisé",
  duplicate: "Scan déjà enregistré",
  already_checked_in: "Déjà pointé",
};

/** Étapes réelles d'un scan : lecture du code, analyse locale, vérification serveur, résultat. */
type Phase = "idle" | "verify" | "done";
const PHASES = ["Scan", "Analyse", "Vérification", "Résultat"] as const;

function PhaseTrack({ phase, success }: { phase: Phase; success: boolean | null }) {
  // Scan et analyse sont faits dès que le code est lu ; la vérification dure le temps de l'appel serveur.
  const reached = phase === "idle" ? -1 : phase === "verify" ? 2 : 3;
  return (
    <ol className="relative flex items-center justify-center gap-1.5 text-xs font-medium sm:gap-2" aria-label="Étapes du scan">
      {PHASES.map((label, i) => {
        const done = i < reached || (i === 3 && phase === "done");
        const active = i === reached && phase !== "done";
        const failed = i === 3 && phase === "done" && success === false;
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-all duration-300",
                done && !failed && "bg-emerald-400/20 text-emerald-200",
                failed && "bg-rose-400/20 text-rose-200",
                active && "bg-[#22d3ee]/20 text-[#a5f3fc]",
                !done && !active && !failed && "bg-white/5 text-[#6f86b8]",
              )}
            >
              {done && !failed ? <Check className="anim-pop size-3.5" aria-hidden /> : null}
              {failed ? <XCircle className="anim-pop size-3.5" aria-hidden /> : null}
              {active ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
              {label}
            </span>
            {i < PHASES.length - 1 ? <span aria-hidden className={cn("h-px w-3 transition-colors sm:w-6", i < reached ? "bg-emerald-300/60" : "bg-white/15")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Tablette « SCANNER LE BADGE » : caméra (BarcodeDetector ou jsQR), douchette
 * USB/Bluetooth (saisie clavier + Entrée) ou saisie manuelle du code. Toute la
 * décision (badge, établissement, cours, doublons) est prise par le serveur.
 */
export function BadgeScanner({
  organizationName,
  operator,
  timezone,
  canOpenBackOffice,
  signOut,
  initialScans,
}: {
  organizationName: string;
  operator: string;
  timezone: string;
  canOpenBackOffice: boolean;
  signOut: () => Promise<void>;
  initialScans: RecentScan[];
}) {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>(initialScans);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [pending, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const [scanCount, setScanCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wedgeRef = useRef<HTMLInputElement>(null);
  const lastCode = useRef<{ code: string; at: number } | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);

  const clock = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, weekday: "long", day: "numeric", month: "long" }).format(now);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const submit = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code || busy.current) return;
    // Anti-rebond local : la même lecture caméra ne part qu'une fois (le serveur contrôle aussi).
    if (lastCode.current && lastCode.current.code === code && Date.now() - lastCode.current.at < 4000) return;
    lastCode.current = { code, at: Date.now() };
    busy.current = true;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setResult(null);
    setError(null);
    // Code lu et analysé localement (anti-rebond) : la vérification serveur commence.
    setPhase("verify");
    startTransition(async () => {
      const response = await scanBadge(code);
      busy.current = false;
      setPhase("done");
      setScanCount((n) => n + 1);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      if (!response.ok) {
        setResult(null);
        setError(response.message);
      } else {
        setError(null);
        setResult(response.result);
        setRecent((current) =>
          [
            {
              id: `${Date.now()}`,
              at: new Date().toISOString(),
              result: response.result.result,
              name: response.result.staff?.name ?? "Badge refusé",
              message: response.result.message,
            },
            ...current,
          ].slice(0, 12),
        );
      }
      resetTimer.current = setTimeout(() => {
        setResult(null);
        setError(null);
        setPhase("idle");
      }, RESET_AFTER_MS);
      wedgeRef.current?.focus();
    });
  }, []);

  // Caméra : lecture continue du QR.
  useEffect(() => {
    if (!cameraOn) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const detector = typeof window !== "undefined" && window.BarcodeDetector ? new window.BarcodeDetector({ formats: ["qr_code"] }) : null;
    const tick = async () => {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2 && !busy.current) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) submit(codes[0].rawValue);
          } else {
            const width = Math.min(640, video.videoWidth);
            const height = Math.round((video.videoHeight / video.videoWidth) * width) || 480;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(video, 0, 0, width, height);
              const found = jsQR(ctx.getImageData(0, 0, width, height).data, width, height, { inversionAttempts: "dontInvert" });
              if (found?.data) submit(found.data);
            }
          }
        } catch {
          // Image illisible : on réessaie à la prochaine trame.
        }
      }
      frame = window.setTimeout(() => void tick(), 250);
    };
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }
        void tick();
      })
      .catch(() => {
        setCameraError("Caméra indisponible : utilisez une douchette ou la saisie manuelle.");
        setCameraOn(false);
      });
    return () => {
      stopped = true;
      window.clearTimeout(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraOn, submit]);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const accepted = result?.result === "accepted";
  return (
    <div className="relative grid min-h-dvh grid-rows-[auto_1fr] overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[#1e6fff]/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 size-[30rem] rounded-full bg-[#22d3ee]/20 blur-3xl" />

      <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="grid">
          <span className="text-sm text-[#9fb4de]">{organizationName}</span>
          <span className="font-display text-lg font-semibold">Pointage du personnel</span>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-semibold tabular-nums" suppressHydrationWarning>
            {clock}
          </p>
          <p className="text-sm capitalize text-[#9fb4de]" suppressHydrationWarning>
            {date}
          </p>
        </div>
      </header>

      <main className="relative z-10 grid gap-6 px-5 pb-8 sm:px-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="grid content-start gap-5">
          <div
            className={cn(
              "relative grid min-h-[22rem] place-items-center overflow-hidden rounded-3xl border p-6 pb-16 text-center shadow-2xl backdrop-blur-xl transition-colors duration-300",
              result ? (accepted ? "border-emerald-400/60 bg-emerald-500/15" : "border-rose-400/60 bg-rose-500/15") : "border-white/15 bg-white/[0.06]",
            )}
            aria-live="assertive"
          >
            <video ref={videoRef} muted playsInline className={cn("absolute inset-0 size-full object-cover opacity-35", !cameraOn && "hidden")} />
            <canvas ref={canvasRef} className="hidden" />
            {result ? (
              <div key={scanCount} className="relative grid animate-[fade-in_0.25s_ease-out] justify-items-center gap-3">
                {accepted ? (
                  <AnimatedSuccess className="size-24 text-emerald-300" label="Badge accepté" />
                ) : (
                  <AnimatedError className="size-24 text-rose-300" label="Badge refusé" />
                )}
                <p className={cn("text-sm font-semibold uppercase tracking-[0.2em]", accepted ? "text-emerald-200" : "text-rose-200")}>
                  {accepted ? (result.kind === "departure" ? "Départ enregistré" : "Succès") : (REJECTION_TITLES[result.reason ?? ""] ?? "Badge refusé")}
                </p>
                {result.staff ? (
                  <div className="anim-fade-up grid" style={{ "--delay": "150ms" } as React.CSSProperties}>
                    <p className="font-display text-3xl font-semibold">{result.staff.name}</p>
                    <p className="text-[#c7d3f0]">{result.staff.job_title}</p>
                  </div>
                ) : null}
                <p className="anim-fade-up max-w-lg text-xl font-medium" style={{ "--delay": "220ms" } as React.CSSProperties} data-testid="scan-message">
                  {result.message}
                </p>
                {result.lesson ? (
                  <p className="anim-fade-up rounded-2xl bg-white/10 px-5 py-3 text-lg" style={{ "--delay": "300ms" } as React.CSSProperties}>
                    Appel disponible : <strong>{result.lesson.subject}</strong> · {result.lesson.class} · {result.lesson.starts_at}–{result.lesson.ends_at}
                    {result.lesson.room ? ` · ${result.lesson.room}` : ""}
                  </p>
                ) : null}
              </div>
            ) : error ? (
              <div key={scanCount} className="relative grid animate-[fade-in_0.25s_ease-out] justify-items-center gap-3">
                <AnimatedError className="size-20 text-rose-300" label="Scan impossible" />
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-200">Vérification impossible</p>
                <p className="text-lg">{error}</p>
              </div>
            ) : (
              <div className="relative grid justify-items-center gap-4">
                <span className={cn("relative flex size-32 items-center justify-center", pending && "animate-pulse")}>
                  {/* Viseur : quatre coins et ligne de lecture animée. */}
                  <span aria-hidden className="absolute left-0 top-0 size-7 rounded-tl-2xl border-l-4 border-t-4 border-[#22d3ee]" />
                  <span aria-hidden className="absolute right-0 top-0 size-7 rounded-tr-2xl border-r-4 border-t-4 border-[#22d3ee]" />
                  <span aria-hidden className="absolute bottom-0 left-0 size-7 rounded-bl-2xl border-b-4 border-l-4 border-[#22d3ee]" />
                  <span aria-hidden className="absolute bottom-0 right-0 size-7 rounded-br-2xl border-b-4 border-r-4 border-[#22d3ee]" />
                  <ScanLine className="size-14 text-[#22d3ee]/80" aria-hidden />
                  <span aria-hidden className="scan-beam absolute inset-x-3 h-0.5 rounded-full bg-[#22d3ee] shadow-[0_0_12px_2px_rgba(34,211,238,0.7)]" />
                </span>
                <h1 className="font-display text-4xl font-bold tracking-wide">{pending ? "VÉRIFICATION…" : "SCANNER LE BADGE"}</h1>
                <p className="max-w-md text-[#c7d3f0]">
                  {pending
                    ? "Contrôle du badge, de l'établissement et du cours en cours."
                    : <>Présentez le QR Code de votre badge {cameraOn ? "devant la caméra" : "à la douchette"}. L&apos;arrivée est enregistrée et le cours en cours est débloqué.</>}
                </p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-4 px-4">
              <PhaseTrack phase={phase} success={phase === "done" ? Boolean(accepted) : null} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setCameraError(null);
                setCameraOn((v) => !v);
              }}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 font-semibold backdrop-blur hover:bg-white/15"
            >
              {cameraOn ? <CameraOff className="size-5" aria-hidden /> : <Camera className="size-5" aria-hidden />}
              {cameraOn ? "Arrêter la caméra" : "Utiliser la caméra"}
            </button>
            <button
              type="button"
              onClick={() => void document.documentElement.requestFullscreen?.()}
              className="flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-5 font-semibold backdrop-blur hover:bg-white/15"
            >
              <Maximize className="size-5" aria-hidden /> Plein écran
            </button>
          </div>
          {cameraError ? <p className="text-sm text-amber-300">{cameraError}</p> : null}

          <form
            className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit(manual);
              setManual("");
            }}
          >
            <label className="grid flex-1 gap-1.5 text-sm text-[#c7d3f0]">
              <span className="flex items-center gap-2">
                <Keyboard className="size-4" aria-hidden /> Douchette ou saisie manuelle du code du badge
              </span>
              <input
                ref={wedgeRef}
                autoFocus
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                autoComplete="off"
                aria-label="Code du badge"
                className="h-12 rounded-xl border border-white/20 bg-[#0b2559]/60 px-4 font-mono text-white placeholder:text-[#6f86b8] focus:border-[#22d3ee] focus:outline-none"
                placeholder="NEOSCOL-BADGE:…"
              />
            </label>
            <button type="submit" disabled={pending || !manual.trim()} className="press h-12 rounded-xl bg-[#1e6fff] px-6 font-semibold transition-colors hover:bg-[#3b82f6] disabled:opacity-50">
              Valider
            </button>
          </form>
        </section>

        <aside className="grid content-start gap-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
            <h2 className="mb-3 font-semibold">Derniers scans</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-[#9fb4de]">Aucun scan aujourd&apos;hui.</p>
            ) : (
              <ul className="grid gap-2">
                {recent.map((scan) => (
                  <li key={scan.id} className="anim-fade-up flex items-start gap-3 rounded-xl bg-white/[0.05] px-3 py-2">
                    {scan.result === "accepted" ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-rose-300" aria-hidden />
                    )}
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate text-sm font-medium">{scan.name}</span>
                      <span className="truncate text-xs text-[#9fb4de]">{scan.message}</span>
                    </span>
                    <time className="text-xs tabular-nums text-[#9fb4de]" suppressHydrationWarning>
                      {new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(new Date(scan.at))}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#9fb4de]">
            <span>Opérateur : {operator}</span>
            <span className="flex gap-2">
              {canOpenBackOffice ? (
                <Link href="/personnel/pointage" className="rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">
                  Historique
                </Link>
              ) : null}
              <form action={signOut}>
                <button type="submit" className="flex items-center gap-1.5 rounded-xl border border-white/15 px-3 py-2 hover:bg-white/10">
                  <LogOut className="size-4" aria-hidden /> Déconnexion
                </button>
              </form>
            </span>
          </div>
        </aside>
      </main>
    </div>
  );
}
