import type { Move } from "../components/Devices";

export type Device = "browser" | "phone" | "tablet";
export type ShotSpec = { src: string; device: Device; move?: Move };
export type Icon =
  | "BookOpen" | "Sheet" | "Receipt" | "PhoneCall" | "ClipboardList" | "FileText" | "CalendarX" | "PenLine" | "Wallet" | "Award"
  | "Clock" | "Network" | "Calculator" | "Gavel" | "ShieldAlert" | "Users" | "LayoutDashboard" | "GraduationCap" | "Backpack"
  | "Presentation" | "UserCheck" | "Building2" | "Scale" | "School" | "Wrench" | "Sparkles";

export type SceneSpec =
  | { kind: "hero"; title: string; accentWords?: string[]; icons: Icon[] }
  | { kind: "problem"; title: string; items: { icon: Icon; label: string }[] }
  | { kind: "screen"; eyebrow: string; title: string; accentWords?: string[]; chips?: string[]; shots: ShotSpec[]; voice?: boolean; push?: { title: string; body: string } }
  | { kind: "mosaic"; eyebrow: string; title: string; accentWords?: string[]; tiles: ShotSpec[] }
  | { kind: "docs"; eyebrow: string; title: string; accentWords?: string[]; papers: string[]; chips?: string[] }
  | { kind: "benefits"; title: string; items: { icon: Icon; who: string; text: string }[] }
  | { kind: "cta"; slogan: string };
