// Standalone job runner for GitHub Actions (no HTTP server needed here).
// Usage: node run-job.mjs <uploadId> <videoUrl>
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from env, renders the
// video, uploads the result to Storage, and writes the outcome straight
// onto the uploads row — there's no caller waiting on an HTTP response.
import { createReadStream, createWriteStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { renderMarketingVideo } from "./render.js";

const [, , uploadId, videoUrl] = process.argv;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!uploadId || !videoUrl) {
  console.error("Usage: node run-job.mjs <uploadId> <videoUrl>");
  process.exit(1);
}
for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const inputPath = `/tmp/reelstate-input-${uploadId}.mp4`;
const outputPath = `/tmp/reelstate-output-${uploadId}.mp4`;

try {
  await downloadTo(videoUrl, inputPath);
  const { duration, captions } = await renderMarketingVideo(inputPath, outputPath);

  const storagePath = `${uploadId}/processed/vertical.mp4`;
  const processedVideoUrl = await uploadToSupabase(outputPath, storagePath);

  await patchUpload(uploadId, {
    status: "ready",
    walkthrough_video_url: processedVideoUrl,
    reels_video_url: processedVideoUrl,
  });

  console.log(JSON.stringify({ uploadId, processedVideoUrl, duration, captions }));
} catch (err) {
  console.error("Job failed:", err);
  await patchUpload(uploadId, { status: "failed" }).catch(() => {});
  process.exit(1);
} finally {
  await Promise.all([
    unlink(inputPath).catch(() => {}),
    unlink(outputPath).catch(() => {}),
  ]);
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download source video (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

async function uploadToSupabase(filePath, storagePath) {
  const { size } = await stat(filePath);
  const fileStream = Readable.toWeb(createReadStream(filePath));
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/videos/${storagePath}`;

  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "x-upsert": "true",
    },
    body: fileStream,
    duplex: "half",
  });
  if (!res.ok) throw new Error(`Supabase storage upload failed (${res.status}): ${await res.text()}`);

  return `${SUPABASE_URL}/storage/v1/object/public/videos/${storagePath}`;
}

async function patchUpload(id, fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/uploads?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Failed to update uploads row (${res.status}): ${await res.text()}`);
}
