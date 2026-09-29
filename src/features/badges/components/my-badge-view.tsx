"use client";

import { Maximize2, Minimize2, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import { Badge3D } from "@/components/shared/badge-3d";
import { Button } from "@/components/ui/button";
import { refreshMyBadge } from "@/features/badges/actions";
import type { MyBadge } from "@/features/badges/types";

const PERIOD = 30;

function useRotatingCode(initial: { code: string; expires_at: string }) {
  const [current, setCurrent] = useState(initial);
  const [qr, setQr] = useState<string | null>(null);
  const [left, setLeft] = useState(PERIOD);
  const [error, setError] = useState<string | null>(null);
  const fetching = useRef(false);

  useEffect(() => {
    QRCode.toDataURL(current.code, { errorCorrectionLevel: "M", margin: 1, width: 640, color: { dark: "#0b1f4d", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [current.code]);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    const result = await refreshMyBadge();
    fetching.current = false;
    if (result.ok && result.data) {
      setCurrent(result.data);
      setError(null);
    } else if (!result.ok) setError(result.message);
  }, []);

  useEffect(() => {
    const tick = () => {
      const seconds = Math.ceil((new Date(current.expires_at).getTime() - Date.now()) / 1000);
      setLeft(Math.max(0, Math.min(PERIOD, seconds)));
      if (seconds <= 1) void refresh();
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [current.expires_at, refresh]);

  return { qr, left, error, code: current.code };
}

function Countdown({ left, size = 44 }: { left: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} aria-label={`Nouveau code dans ${left} secondes`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - left / PERIOD)} className="transition-[stroke-dashoffset] duration-500" />
      </svg>
      <span className="absolute text-xs font-bold tabular-nums">{left}</span>
    </span>
  );
}

/**
 * « Mon badge » : carte 3D (recto identité, verso QR tournant) et mode plein
 * écran pour la tablette de pointage (écran maintenu allumé). Le QR change
 * toutes les 30 s ; il est calculé et vérifié par le serveur, à usage unique.
 */
export function MyBadgeView({ badge, photoUrl }: { badge: MyBadge; photoUrl: string | null }) {
  const { qr, left, error, code } = useRotatingCode({ code: badge.code, expires_at: badge.expires_at });
  const [full, setFull] = useState(false);
  const fullRef = useRef<HTMLDivElement>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);

  const enter = async () => {
    setFull(true);
    try {
      await fullRef.current?.requestFullscreen?.();
    } catch {}
    try {
      wake.current = await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    } catch {}
  };
  const exit = async () => {
    setFull(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    await wake.current?.release().catch(() => {});
    wake.current = null;
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const qrImage = qr ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={qr} alt={`QR code du badge (change dans ${left} s)`} data-badge-code={code} className="aspect-square w-full rounded-2xl bg-white" />
  ) : (
    <div className="aspect-square w-full animate-pulse rounded-2xl bg-slate-100" />
  );

  return (
    <div className="grid justify-items-center gap-6">
      <Badge3D
        data={{
          role: badge.role,
          first_name: badge.first_name,
          last_name: badge.last_name,
          subtitle: badge.subtitle,
          identifier: badge.identifier,
          number: badge.number,
          organization: { name: badge.organization.name, color: badge.organization.color, is_demo: badge.organization.is_demo },
          photoUrl,
        }}
        back={
          <>
            <div className="w-[82%]">{qrImage}</div>
            <div className="flex items-center gap-2 text-[#0b1f4d] dark:text-white">
              <Countdown left={left} size={36} />
              <span className="text-left text-[11px] leading-tight text-slate-500">Code tournant sécurisé<br />Nouveau code toutes les 30 s</span>
            </div>
            <p className="font-mono text-[10px] text-slate-400">{badge.number}</p>
          </>
        }
      />
      {error ? <p className="text-sm font-medium text-danger">{error}</p> : null}
      <Button size="lg" onClick={enter}>
        <Maximize2 aria-hidden /> Afficher en plein écran pour scanner
      </Button>
      <p className="flex max-w-sm items-start gap-2 text-center text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        Présentez le QR code à la tablette de pointage. Une capture d&apos;écran est inutile : chaque code expire au bout de 30 secondes et ne sert qu&apos;une fois.
      </p>

      <div
        ref={fullRef}
        role="dialog"
        aria-modal={full}
        aria-label="Badge en plein écran"
        hidden={!full}
        className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#1d63ed] p-6 text-white"
      >
        {full ? (
          <div className="grid w-full max-w-md justify-items-center gap-5 text-center">
            <div className="grid gap-1">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">{badge.organization.name}</p>
              <p className="text-2xl font-extrabold uppercase">
                {badge.last_name} <span className="font-medium normal-case">{badge.first_name}</span>
              </p>
              <p className="text-sm text-white/75">
                {badge.role}
                {badge.identifier ? ` · ${badge.identifier}` : ""}
              </p>
            </div>
            <div className="w-full max-w-[min(80vw,420px)] rounded-3xl bg-white p-4 shadow-2xl">{qrImage}</div>
            <div className="flex items-center gap-3">
              <Countdown left={left} size={52} />
              <span className="text-left text-sm text-white/80">Nouveau code dans {left} s</span>
            </div>
            <Button variant="secondary" size="lg" onClick={exit}>
              <Minimize2 aria-hidden /> Fermer
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
