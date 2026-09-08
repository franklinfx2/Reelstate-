import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const FONT_PATH = join(process.cwd(), "src/lib/assets/DejaVuSans-Bold.ttf");
const MAX_OUTPUT_SECONDS = 45;
const FFMPEG_TIMEOUT_MS = 2 * 60 * 1000;

function escapeDrawtext(text: string): string {
  // ffmpeg drawtext treats : \ ' and % as special — escape for literal use.
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "’")
    .replace(/%/g, "\\%");
}

function drawTextFilter(
  text: string,
  opts: { y: string; fontSize: number; box?: boolean }
): string {
  const { y, fontSize, box = true } = opts;
  const parts = [
    `fontfile='${FONT_PATH}'`,
    `text='${escapeDrawtext(text)}'`,
    `fontcolor=white`,
    `fontsize=${fontSize}`,
    `x=(w-text_w)/2`,
    `y=${y}`,
  ];
  if (box) {
    parts.push("box=1", "boxcolor=black@0.55", "boxborderw=18");
  }
  return `drawtext=${parts.join(":")}`;
}

export type PropertyVideoOverlay = {
  headline: string; // e.g. "2 Bedroom Apartment"
  location: string; // e.g. "East Legon, Accra"
  price: string; // e.g. "GH₵ 1,200 / month"
  cta: string; // e.g. "WhatsApp 024 123 4567 to view"
};

/**
 * Crops/scales a raw phone video to vertical 9:16 and burns in property
 * details as text overlays — ready for TikTok/Reels/WhatsApp Status.
 */
export async function renderVerticalPropertyVideo(
  inputBuffer: Buffer,
  overlay: PropertyVideoOverlay
): Promise<Buffer> {
  const workDir = await mkdtemp(join(tmpdir(), "reelstate-"));
  const inputPath = join(workDir, `${randomUUID()}-in.mp4`);
  const outputPath = join(workDir, `${randomUUID()}-out.mp4`);

  try {
    await writeFile(inputPath, inputBuffer);

    const filters = [
      "scale=1080:1920:force_original_aspect_ratio=increase",
      "crop=1080:1920",
      drawTextFilter(overlay.headline, { y: "80", fontSize: 56 }),
      drawTextFilter(overlay.location, { y: "160", fontSize: 40 }),
      drawTextFilter(overlay.price, { y: "h-260", fontSize: 52 }),
      drawTextFilter(overlay.cta, { y: "h-160", fontSize: 40 }),
    ].join(",");

    const args = [
      "-y",
      "-i",
      inputPath,
      "-t",
      String(MAX_OUTPUT_SECONDS),
      "-vf",
      filters,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ];

    await runFfmpeg(args);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffmpeg timed out"));
    }, FFMPEG_TIMEOUT_MS);

    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}
