import { QrCode } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";

export type BadgeCardData = {
  name: string;
  jobTitle: string | null;
  employeeNumber: string | null;
  photoId: string | null;
  organization: string;
  logoId: string | null;
  badgeNumber: string | null;
  year: string | null;
  qr: string | null;
  isTeacher: boolean;
};

/**
 * Badge professionnel (format carte CR80) tel qu'il sera imprimé : bandeau aux
 * couleurs de l'établissement, photo, nom, fonction, matricule, QR de pointage.
 * Le QR n'est rendu que pour les utilisateurs autorisés à gérer les badges.
 */
export function BadgeCard({ data, className }: { data: BadgeCardData; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex aspect-[54/86] w-full max-w-[270px] flex-col overflow-hidden rounded-2xl bg-white text-[#0b1f3a] shadow-[0_18px_40px_rgba(11,37,89,0.22)] ring-1 ring-black/5",
        className,
      )}
    >
      <div className="relative bg-gradient-to-br from-[#07142b] via-[#0b2559] to-[#1d63ed] px-4 pb-10 pt-3.5 text-white">
        <div aria-hidden className="absolute -right-8 -top-10 size-28 rounded-full bg-cyan-400/25 blur-xl" />
        <div className="relative flex items-center gap-2">
          {data.logoId ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/fichiers/${data.logoId}`} alt="" className="size-7 rounded-md bg-white object-contain p-0.5" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-md bg-white/15 text-xs font-bold">NS</span>
          )}
          <span className="line-clamp-2 text-[10px] font-semibold uppercase leading-tight tracking-wide">{data.organization}</span>
        </div>
        <p className="relative mt-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
          {data.isTeacher ? "Personnel enseignant" : "Personnel administratif"}
        </p>
      </div>
      <div className="-mt-8 flex justify-center">
        <Avatar name={data.name} photoId={data.photoId} className="size-[72px] border-4 border-white text-xl shadow-md" />
      </div>
      <div className="grid flex-1 content-start justify-items-center gap-0.5 px-3 pt-1.5 text-center">
        <p className="text-sm font-bold uppercase leading-tight">{data.name}</p>
        <p className="text-[11px] text-[#5b6b8c]">{data.jobTitle ?? "—"}</p>
        <p className="mt-1 rounded-full bg-[#e8f0fe] px-2 py-0.5 text-[10px] font-semibold text-[#1d63ed]">{data.employeeNumber ?? "Sans matricule"}</p>
      </div>
      <div className="flex items-end justify-between gap-2 px-3.5 pb-3">
        <div className="grid text-[9px] leading-tight text-[#5b6b8c]">
          <span className="font-semibold text-[#0b1f3a]">{data.badgeNumber ?? "Badge non généré"}</span>
          {data.year ? <span>Année {data.year}</span> : null}
          <span>Badge de pointage</span>
        </div>
        {data.qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.qr} alt={`QR du badge ${data.badgeNumber ?? ""}`} className="size-16 rounded-md border border-[#e3e9f4] p-0.5" />
        ) : (
          <span className="flex size-16 flex-col items-center justify-center rounded-md border border-dashed border-[#d5ddec] text-center text-[8px] text-[#5b6b8c]">
            <QrCode className="size-5" aria-hidden />
            {data.badgeNumber ? "QR réservé" : "À générer"}
          </span>
        )}
      </div>
      <div className="h-1.5 bg-gradient-to-r from-[#1d63ed] via-cyan-400 to-[#1d63ed]" />
    </div>
  );
}
