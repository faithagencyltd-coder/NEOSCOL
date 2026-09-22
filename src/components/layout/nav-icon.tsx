import { LayoutDashboard, UserRound, type LucideIcon } from "lucide-react";

import type { NavIcon as NavIconName } from "@/config/navigation";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  account: UserRound,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
