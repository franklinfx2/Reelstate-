import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

const run = promisify(execFile);

// There's no licensed music track bundled with the repo (shipping one would
// need real rights clearance), so this synthesizes a simple ambient pad —
// two slightly detuned tones plus a soft sub layer, lowpassed and given slow
// tremolo for movement — as a stand-in "cinematic luxury" bed. Swap this out
// for a real licensed track by pointing MUSIC_BED_PATH at an audio file;
// getMusicBedPath returns it unchanged when that env var is set.
export async function getMusicBedPath(durationSeconds) {
  if (process.env.MUSIC_BED_PATH && existsSync(process.env.MUSIC_BED_PATH)) {
    return process.env.MUSIC_BED_PATH;
  }

  const seconds = Math.max(1, Math.ceil(durationSeconds));
  const outPath = `/tmp/reel-music-bed-${seconds}.m4a`;
  if (existsSync(outPath)) return outPath;

  const fadeOutStart = Math.max(0, seconds - 1.5);
  const filter =
    `[0:a][1:a][2:a]amix=inputs=3:weights=1 1 0.6:duration=first[mix];` +
    `[mix]lowpass=f=2500,tremolo=f=0.2:d=0.25,` +
    `afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=1.5,volume=0.35[aout]`;

  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `sine=frequency=220:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=225:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=110:duration=${seconds}`,
    "-filter_complex", filter,
    "-map", "[aout]",
    "-ar", "44100", "-ac", "2",
    "-c:a", "aac", "-b:a", "128k",
    outPath,
  ]);

  return outPath;
}
