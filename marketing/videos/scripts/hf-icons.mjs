// Génère les icônes (lucide) en SVG inline pour la composition HyperFrames (aucun réseau au rendu).
//   node scripts/hf-icons.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const lucide = require("lucide-react");
const names = ["FileText","Receipt","BookOpen","NotebookPen","Smartphone","Clock","TriangleAlert","Baby","Backpack","GraduationCap","UserPlus","IdCard","ScanLine","Volume2","BellRing","Check","CalendarDays","ClipboardCheck","PenLine","Calculator","Award","Wallet","Coins","Banknote","Printer","Send","Megaphone","MessageCircle","Mail","FileBadge","ShieldCheck","Search","LayoutDashboard","Sparkles","Bot","Lock","Users","TrendingUp","ChartColumn","School","User","CircleCheck","BadgeCheck","Bell","QrCode","Stamp","FileCheck"];
const out = {};
for (const n of names) out[n] = renderToStaticMarkup(React.createElement(lucide[n], { size: 24, strokeWidth: 2, color: "currentColor" }));
writeFileSync(new URL("../hyperframes/neoscool-90s/assets/icons.js", import.meta.url), `window.ICONS = ${JSON.stringify(out)};\n`);
console.log(Object.keys(out).length, "icônes");
