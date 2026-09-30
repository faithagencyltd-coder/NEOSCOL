import durations from "./voix-durees.json";
import type { ModuleKey } from "./theme";

export const FPS = 30;
/** Durée des transitions entre scènes (chevauchement). */
export const TRANSITION = 16;
/** La voix démarre une fois la transition terminée, puis un temps de respiration. */
export const LEAD = TRANSITION + 8;
const TAIL = 22;

export type SceneTiming = { id: string; frames: number; voiceFrames: number };

export function timeline(video: ModuleKey): SceneTiming[] {
  return (durations as Record<string, { id: string; seconds: number }[]>)[video].map((s, i, all) => {
    const voiceFrames = Math.ceil(s.seconds * FPS);
    const extra = i === 0 ? 10 : i === all.length - 1 ? 60 : 0;
    return { id: s.id, voiceFrames, frames: LEAD + voiceFrames + TAIL + extra };
  });
}

export function totalFrames(video: ModuleKey): number {
  const t = timeline(video);
  return t.reduce((sum, s) => sum + s.frames, 0) - TRANSITION * (t.length - 1);
}
