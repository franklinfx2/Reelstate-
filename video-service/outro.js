import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const OUTRO_PATH = "/tmp/reelstate-outro.mp4";

// Renders the blue logo outro card once and caches it on disk — every
// request reuses the same file instead of re-rendering it.
export async function getOutroPath({ width, height, iconPath }) {
  if (existsSync(OUTRO_PATH)) return OUTRO_PATH;

  const filter =
    `[1:v]scale=${Math.round(width * 0.33)}:${Math.round(width * 0.33)}[icon];` +
    `[0:v][icon]overlay=(W-w)/2:H*0.36[bg];` +
    `[bg]drawtext=fontfile=${FONT}:text='Reelstate':fontsize=${Math.round(width * 0.06)}:fontcolor=white:` +
    `x=(w-text_w)/2:y=H*0.58`;

  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x007AFF:s=${width}x${height}:d=2`,
    "-i", iconPath,
    "-filter_complex", filter,
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-t", "2",
    OUTRO_PATH,
  ]);

  return OUTRO_PATH;
}
