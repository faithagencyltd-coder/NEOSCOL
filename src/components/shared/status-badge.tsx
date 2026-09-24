import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/labels";

export function StatusBadge({ value, map }: { value: string; map: Record<string, { label: string; tone: Tone }> }) {
  const entry = map[value] ?? { label: value, tone: "neutral" as const };
  // La clé change avec la valeur : le badge « pulse » quand le statut évolue (ex. Impayé → Payé).
  return (
    <Badge key={value} tone={entry.tone} className="status-change">
      {entry.label}
    </Badge>
  );
}
