import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { getOutroPath } from "./outro.js";
import { pickCaptions } from "./captions.js";

const run = promisify(execFile);
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const WIDTH = 1080;
const HEIGHT = 1920;
const SEGMENT_SECONDS = 6;
const MIN_DURATION = 18;
const MAX_DURATION = 48;

function escapeDrawtext(text) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’");
}

function captionFilter(start, end, text) {
  const fade = 0.4;
  const alpha =
    `if(lt(t,${start + fade}),(t-${start})/${fade},` +
    `if(lt(t,${end - fade}),1,(${end}-t)/${fade}))`;
  return (
    `drawtext=fontfile=${FONT}:text='${escapeDrawtext(text)}':fontsize=54:fontcolor=white:` +
    `x=(w-text_w)/2:y=h*0.52:shadowcolor=black@0.65:shadowx=2:shadowy=2:` +
    `enable='between(t,${start},${end})':alpha='${alpha}'`
  );
}

async function probeDuration(path) {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    path,
  ]);
  return parseFloat(stdout.trim());
}

/**
 * Renders the vertical marketing video: caption-overlaid walkthrough +
 * blue logo outro card. Returns the path to the finished mp4.
 */
export async function renderMarketingVideo(inputPath, outputPath) {
  const rawDuration = await probeDuration(inputPath);
  const targetDuration = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, Math.floor(rawDuration)),
  );
  const needsLoop = rawDuration < targetDuration;

  const numCaptions = Math.max(1, Math.floor(targetDuration / SEGMENT_SECONDS));
  const captions = pickCaptions(numCaptions);

  const watermark =
    `drawtext=fontfile=${FONT}:text='Reelstate':fontsize=28:fontcolor=white@0.75:` +
    `x=w-text_w-32:y=h-text_h-40`;

  const filters = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
  ];
  captions.forEach((text, i) => {
    const start = i * SEGMENT_SECONDS + 1;
    const end = Math.min(start + 2.5, targetDuration);
    filters.push(captionFilter(start, end, text));
  });
  filters.push(watermark);

  const mainPath = "/tmp/reelstate-main.mp4";
  const inputArgs = needsLoop
    ? ["-stream_loop", "-1", "-i", inputPath]
    : ["-i", inputPath];

  await run("ffmpeg", [
    "-y",
    ...inputArgs,
    "-t", String(targetDuration),
    "-vf", filters.join(","),
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-an",
    mainPath,
  ]);

  const outroPath = await getOutroPath({
    width: WIDTH,
    height: HEIGHT,
    iconPath: new URL("./assets/icon.png", import.meta.url).pathname,
  });

  const listPath = "/tmp/reelstate-concat-list.txt";
  await run("bash", [
    "-c",
    `printf "file '%s'\\nfile '%s'\\n" "${mainPath}" "${outroPath}" > "${listPath}"`,
  ]);

  await run("ffmpeg", [
    "-y",
    "-f", "concat", "-safe", "0", "-i", listPath,
    "-c", "copy",
    outputPath,
  ]);

  await Promise.all([
    unlink(mainPath).catch(() => {}),
    unlink(listPath).catch(() => {}),
  ]);

  return { outputPath, duration: targetDuration + 2, captions };
}
