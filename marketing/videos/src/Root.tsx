import { loadFont } from "@remotion/fonts";
import { Composition, staticFile } from "remotion";

import { Extrait, EXTRAIT_FPS, EXTRAIT_FRAMES } from "./anime/Extrait";
import { Film, LogoSignature } from "./film/Film";
import { filmFrames, FPS as FILM_FPS } from "./film/timing";
import { type ModuleKey } from "./theme";
import { FPS, totalFrames } from "./timing";
import { Video } from "./Video";

for (const weight of ["400", "500", "600", "700"]) {
  loadFont({ family: "Poppins", url: staticFile(`fonts/Poppins-${weight}.ttf`), weight });
}

const VIDEOS: ModuleKey[] = ["scolaire", "formation", "universite"];

export function Root() {
  return (
    <>
      {VIDEOS.map((video) => (
        <Composition key={`${video}-16x9`} id={`${video}-16x9`} component={Video} defaultProps={{ video }} durationInFrames={totalFrames(video)} fps={FPS} width={1920} height={1080} />
      ))}
      {VIDEOS.map((video) => (
        <Composition key={`${video}-9x16`} id={`${video}-9x16`} component={Video} defaultProps={{ video }} durationInFrames={totalFrames(video)} fps={FPS} width={1080} height={1920} />
      ))}
      {/* Film officiel du module scolaire (dossier A–W) : 3 min, 60 s, 30 s, signatures logo. */}
      <Composition id="film-scolaire-16x9" component={Film} defaultProps={{ cut: "full" as const }} durationInFrames={filmFrames("full")} fps={FILM_FPS} width={1920} height={1080} />
      <Composition id="film-60s-16x9" component={Film} defaultProps={{ cut: "court" as const }} durationInFrames={filmFrames("court")} fps={FILM_FPS} width={1920} height={1080} />
      <Composition id="film-60s-9x16" component={Film} defaultProps={{ cut: "court" as const }} durationInFrames={filmFrames("court")} fps={FILM_FPS} width={1080} height={1920} />
      <Composition id="film-30s-16x9" component={Film} defaultProps={{ cut: "flash" as const }} durationInFrames={filmFrames("flash")} fps={FILM_FPS} width={1920} height={1080} />
      <Composition id="film-30s-9x16" component={Film} defaultProps={{ cut: "flash" as const }} durationInFrames={filmFrames("flash")} fps={FILM_FPS} width={1080} height={1920} />
      <Composition id="logo-6s-16x9" component={LogoSignature} defaultProps={{ seconds: 6 as const }} durationInFrames={6 * FILM_FPS} fps={FILM_FPS} width={1920} height={1080} />
      <Composition id="logo-6s-9x16" component={LogoSignature} defaultProps={{ seconds: 6 as const }} durationInFrames={6 * FILM_FPS} fps={FILM_FPS} width={1080} height={1920} />
      {/* Film animé (motion design, 100 % illustré) : extrait de validation du style. */}
      <Composition id="anime-extrait-16x9" component={Extrait} durationInFrames={EXTRAIT_FRAMES} fps={EXTRAIT_FPS} width={1920} height={1080} />
      <Composition id="logo-2s-16x9" component={LogoSignature} defaultProps={{ seconds: 2 as const }} durationInFrames={2 * FILM_FPS} fps={FILM_FPS} width={1920} height={1080} />
    </>
  );
}
