import { loadFont } from "@remotion/fonts";
import { Composition, staticFile } from "remotion";

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
    </>
  );
}
