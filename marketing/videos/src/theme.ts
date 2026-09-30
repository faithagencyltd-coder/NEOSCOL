/** Charte commune des vidéos NeoScool (couleurs de l'application + accent par module). */
export const brand = {
  night: "#050d24",
  navy: "#0b1f4f",
  navy2: "#10296b",
  blue: "#1f6bff",
  sky: "#3aa0ff",
  orange: "#f7931e",
  white: "#ffffff",
  mist: "rgba(255,255,255,0.72)",
  faint: "rgba(255,255,255,0.12)",
};

export type ModuleKey = "scolaire" | "formation" | "universite";

export const accents: Record<ModuleKey, { main: string; soft: string; glow: string; label: string }> = {
  scolaire: { main: "#2f7bff", soft: "#8fb8ff", glow: "rgba(47,123,255,0.55)", label: "Module scolaire" },
  formation: { main: "#ff8a1f", soft: "#ffc38a", glow: "rgba(255,138,31,0.5)", label: "Formation professionnelle" },
  universite: { main: "#8b5cf6", soft: "#c4b0ff", glow: "rgba(139,92,246,0.55)", label: "Université · Institut" },
};

export const font = "Poppins, system-ui, sans-serif";
