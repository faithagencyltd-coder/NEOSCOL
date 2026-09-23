import {
  BadgeCheck,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileText,
  NotebookPen,
  GraduationCap,
  Layers,
  LayoutDashboard,
  ListChecks,
  School,
  ScanLine,
  UserRound,
  UserRoundCog,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { NavIcon as NavIconName } from "@/config/navigation";

const ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  account: UserRound,
  students: GraduationCap,
  enrollments: ClipboardList,
  guardians: Users,
  classes: School,
  structure: Layers,
  forms: ListChecks,
  timetable: CalendarClock,
  attendance: ClipboardCheck,
  grades: NotebookPen,
  reportCards: FileText,
  staff: UserRoundCog,
  staffAttendance: BadgeCheck,
  kiosk: ScanLine,
  lessons: BookOpenCheck,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}
