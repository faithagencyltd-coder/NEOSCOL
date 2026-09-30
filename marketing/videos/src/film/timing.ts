import cuts from "./cuts.json";
import durations from "./durees.json";

export const FPS = 30;
export type Cut = "full" | "court" | "flash";

const voice = Object.fromEntries((durations as { id: string; seconds: number }[]).map((d) => [d.id, d.seconds]));
const storyboard = cuts.full.storyboard as Record<string, number>;

/** La voix commence après l'entrée dans la scène. */
export const VOICE_LEAD = 18;

export type FilmScene = { id: string; from: number; frames: number; voiceFrames: number };

/** Même règle que scripts/film-music.py : durée du storyboard (film) ou voix + respiration (versions courtes). */
export function filmTimeline(cut: Cut): FilmScene[] {
  const ids = cuts[cut].scenes;
  let from = 0;
  return ids.map((id, i) => {
    const last = i === ids.length - 1;
    const seconds = cut === "full" ? Math.max(storyboard[id]!, voice[id]! + 1.6) : voice[id]! + 1.6 + (last ? 2.4 : 0);
    const frames = Math.round(seconds * FPS);
    const scene = { id, from, frames, voiceFrames: Math.ceil(voice[id]! * FPS) };
    from += frames;
    return scene;
  });
}

export const filmFrames = (cut: Cut) => filmTimeline(cut).reduce((s, x) => s + x.frames, 0);
