import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { Fragment } from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { Background } from "./components/Background";
import { Captions } from "./components/Captions";
import { Scene } from "./scenes/Scenes";
import { accents, type ModuleKey } from "./theme";
import { LEAD, TRANSITION, timeline, totalFrames } from "./timing";
import { VIDEOS } from "./videos";
import script from "./voiceover.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPresentation = TransitionPresentation<any>;
const presentations: (() => AnyPresentation)[] = [
  () => slide({ direction: "from-right" }) as AnyPresentation,
  () => fade() as AnyPresentation,
  () => wipe({ direction: "from-left" }) as AnyPresentation,
  () => slide({ direction: "from-bottom" }) as AnyPresentation,
];

/** Balayage lumineux à la couleur du module pendant chaque transition. */
function Sweep({ color }: { color: string }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const x = interpolate(frame, [0, TRANSITION + 6], [-0.6, 1.6]);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -height * 0.25, left: x * width, width: width * 0.18, height: height * 1.5, transform: "rotate(14deg)", background: `linear-gradient(90deg, transparent, ${color}, transparent)`, opacity: 0.35, filter: "blur(18px)" }} />
    </AbsoluteFill>
  );
}

export function Video({ video }: { video: ModuleKey }) {
  const accent = accents[video];
  const scenes = timeline(video);
  const texts = (script as Record<string, { id: string; text: string }[]>)[video];
  const total = totalFrames(video);
  let cursor = 0;
  const transitionsAt: number[] = [];
  scenes.forEach((s, i) => {
    if (i > 0) transitionsAt.push(cursor - TRANSITION);
    cursor += s.frames - (i > 0 ? TRANSITION : 0);
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#050d24" }}>
      <Background accent={accent.main} glow={accent.glow} />
      <Audio
        src={staticFile(`musique/${video}.wav`)}
        volume={(f) => interpolate(f, [0, 30, total - 60, total], [0, 0.22, 0.22, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
      <TransitionSeries>
        {scenes.map((s, i) => {
          const spec = VIDEOS[video][s.id];
          const text = texts.find((t) => t.id === s.id)?.text ?? "";
          if (!spec) throw new Error(`Scène sans visuel : ${video}/${s.id}`);
          return (
            <Fragment key={s.id}>
              {i > 0 ? <TransitionSeries.Transition presentation={presentations[i % presentations.length]()} timing={linearTiming({ durationInFrames: TRANSITION })} /> : null}
              <TransitionSeries.Sequence durationInFrames={s.frames}>
                <Scene spec={spec} frames={s.frames} voiceFrames={s.voiceFrames} accent={accent} />
                <Sequence from={LEAD} durationInFrames={s.voiceFrames + 10}>
                  <Audio src={staticFile(`voix/${video}/${s.id}.wav`)} volume={1} />
                </Sequence>
                <Captions text={text} start={LEAD} frames={s.voiceFrames} />
              </TransitionSeries.Sequence>
            </Fragment>
          );
        })}
      </TransitionSeries>
      {transitionsAt.map((at) => (
        <Sequence key={at} from={at} durationInFrames={TRANSITION + 8}>
          <Sweep color={accent.main} />
          <Audio src={staticFile("musique/whoosh.wav")} volume={0.35} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
