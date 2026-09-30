import { ArrowRight, Megaphone, X } from "lucide-react";
import Link from "next/link";

import { dismissAnnouncement } from "@/features/announcements/actions";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils/cn";

const TONE: Record<string, string> = {
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/** Annonces de la plateforme NeoScool visibles par l'utilisateur dans l'établissement actif. */
export async function PlatformAnnouncements({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_platform_announcements", { p_org: organizationId });
  if (!data?.length) return null;
  return (
    <div data-testid="platform-announcements">
      {data.map((a) => (
        <div
          key={a.id}
          role={a.tone === "danger" ? "alert" : "status"}
          className={cn("anim-fade-up flex items-start gap-3 border-b border-border/40 px-4 py-2.5 text-sm sm:px-7", TONE[a.tone] ?? TONE.info)}
        >
          <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{a.title}</span> <span className="text-foreground/80">{a.body}</span>
            {a.link_url && a.link_label ? (
              a.link_url.startsWith("/") ? (
                <Link href={a.link_url} className="ml-2 inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
                  {a.link_label} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : (
                <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold underline-offset-4 hover:underline">
                  {a.link_label} <ArrowRight className="size-3.5" aria-hidden />
                </a>
              )
            ) : null}
          </p>
          {a.dismissible ? (
            <form action={dismissAnnouncement}>
              <input type="hidden" name="id" value={a.id} />
              <button type="submit" className="rounded-lg p-1 hover:bg-black/5" aria-label={`Masquer l'annonce « ${a.title} »`}>
                <X className="size-4" aria-hidden />
              </button>
            </form>
          ) : null}
        </div>
      ))}
    </div>
  );
}
