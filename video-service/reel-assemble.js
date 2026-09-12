// Assembles the final "photos only" marketing video: a title card, N Kling
// clips (each color-graded and caption-overlaid), joined with crossfade
// transitions, with a synthesized music bed under the whole thing.
//
// Deliberately its own module rather than reusing render.js/captions.js/
// outro.js — those render a *caption overlay on the agent's own walkthrough
// video* for a different, still-in-use pipeline; this one assembles several
// independently-generated clips from scratch, which is a different enough
// shape (multi-clip concat, title card, synthesized music, color grading)
// that sharing code would mean threading unrelated concerns through both.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { unlink } from "node:fs/promises";
import { getMusicBedPath } from "./music.js";

const run = promisify(execFile);
const FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const WIDTH = 1920;
const HEIGHT = 1080;
const TITLE_DURATION = 2.5;
const TRANSITION = 0.5;
const COLOR_GRADE =
  "eq=contrast=1.10:saturation=1.15,colorbalance=rs=0.06:gs=0.0:bs=-0.06:rm=0.05:bm=-0.05:rh=0.03:bh=-0.03";

function escapeDrawtext(text) {
  return text.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "’");
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

function fadeAlpha(duration, fade = 0.3) {
  return (
    `if(lt(t,${fade}),t/${fade},` +
    `if(lt(t,${duration - fade}),1,(${duration}-t)/${fade}))`
  );
}

async function renderTitleCard({ title, location, outPath }) {
  const titleText = drawText(title, {
    y: "h*0.44", fontSize: 64, alpha: fadeAlpha(TITLE_DURATION, 0.5),
  });
  const locationText = drawText(location, {
    y: "h*0.44+80", fontSize: 34, alpha: fadeAlpha(TITLE_DURATION, 0.5),
  });

  await run("ffmpeg", [
    "-y",
    "-f", "lavfi", "-i", `color=c=0x14110d:s=${WIDTH}x${HEIGHT}:d=${TITLE_DURATION}`,
    "-vf", [titleText, locationText].join(","),
    "-r", "30",
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    outPath,
  ]);
  return TITLE_DURATION;
}

function drawText(text, { y, fontSize, alpha }) {
  return (
    `drawtext=fontfile=${FONT}:text='${escapeDrawtext(text)}':fontsize=${fontSize}:` +
    `fontcolor=white:x=(w-text_w)/2:y=${y}:alpha='${alpha}'`
  );
}

function captionFilter(text, duration) {
  const alpha = fadeAlpha(duration, 0.3);
  return (
    `drawtext=fontfile=${FONT}:text='${escapeDrawtext(text)}':fontsize=44:fontcolor=white:` +
    `x=(w-text_w)/2:y=h-text_h-60:box=1:boxcolor=black@0.45:boxborderw=16:alpha='${alpha}'`
  );
}

async function renderClip({ inputPath, caption, outPath }) {
  const rawDuration = await probeDuration(inputPath);

  const filters = [
    `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${WIDTH}:${HEIGHT}`,
    COLOR_GRADE,
    captionFilter(caption, rawDuration),
  ];

  await run("ffmpeg", [
    "-y",
    "-i", inputPath,
    "-vf", filters.join(","),
    "-r", "30",
    "-an",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    outPath,
  ]);

  return rawDuration;
}

/**
 * clips: [{ path: string (local mp4), caption: string }, ...] in final order.
 * Returns { outputPath, duration }.
 */
export async function assembleReelVideo({ projectTitle, projectLocation, clips, outputPath }) {
  const tmpFiles = [];
  try {
    const titlePath = "/tmp/reel-title-card.mp4";
    tmpFiles.push(titlePath);
    const titleDuration = await renderTitleCard({
      title: projectTitle,
      location: projectLocation,
      outPath: titlePath,
    });

    const segments = [{ path: titlePath, duration: titleDuration }];
    for (const [i, clip] of clips.entries()) {
      const clipOutPath = `/tmp/reel-clip-${i}.mp4`;
      tmpFiles.push(clipOutPath);
      const duration = await renderClip({
        inputPath: clip.path,
        caption: clip.caption,
        outPath: clipOutPath,
      });
      segments.push({ path: clipOutPath, duration });
    }

    const silentPath = "/tmp/reel-assembled-silent.mp4";
    tmpFiles.push(silentPath);
    const totalDuration = await concatWithCrossfade(segments, silentPath);

    const musicPath = await getMusicBedPath(totalDuration);

    await run("ffmpeg", [
      "-y",
      "-i", silentPath,
      "-i", musicPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-shortest",
      "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-b:v", "8M",
      "-c:a", "aac", "-b:a", "192k",
      "-movflags", "+faststart",
      outputPath,
    ]);

    return { outputPath, duration: totalDuration };
  } finally {
    await Promise.all(tmpFiles.map((f) => unlink(f).catch(() => {})));
  }
}

async function concatWithCrossfade(segments, outputPath) {
  if (segments.length === 1) {
    await run("ffmpeg", ["-y", "-i", segments[0].path, "-c", "copy", outputPath]);
    return segments[0].duration;
  }

  const inputArgs = segments.flatMap((s) => ["-i", s.path]);

  let filterParts = [];
  let cum = segments[0].duration;
  let prevLabel = "0:v";
  for (let i = 1; i < segments.length; i++) {
    const offset = Math.max(0, cum - TRANSITION);
    const outLabel = i === segments.length - 1 ? "vout" : `v${i}`;
    filterParts.push(
      `[${prevLabel}][${i}:v]xfade=transition=fade:duration=${TRANSITION}:offset=${offset.toFixed(3)}[${outLabel}]`,
    );
    cum = cum + segments[i].duration - TRANSITION;
    prevLabel = outLabel;
  }

  await run("ffmpeg", [
    "-y",
    ...inputArgs,
    "-filter_complex", filterParts.join(";"),
    "-map", "[vout]",
    "-r", "30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
    outputPath,
  ]);

  return cum;
}
