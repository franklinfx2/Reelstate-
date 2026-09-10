import express from "express";
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { renderMarketingVideo } from "./render.js";

const PORT = process.env.PORT || 8080;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

for (const [name, value] of Object.entries({
  SERVICE_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
})) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.post("/process", async (req, res) => {
  if (req.get("x-service-token") !== SERVICE_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { uploadId, videoUrl } = req.body ?? {};
  if (!uploadId || !videoUrl) {
    return res.status(400).json({ error: "uploadId and videoUrl are required" });
  }

  const jobId = randomUUID();
  const inputPath = `/tmp/reelstate-input-${jobId}.mp4`;
  const outputPath = `/tmp/reelstate-output-${jobId}.mp4`;

  try {
    await downloadTo(videoUrl, inputPath);

    const { duration, captions } = await renderMarketingVideo(inputPath, outputPath);

    const storagePath = `${uploadId}/processed/vertical.mp4`;
    const publicUrl = await uploadToSupabase(outputPath, storagePath);

    res.json({ uploadId, processedVideoUrl: publicUrl, duration, captions });
  } catch (err) {
    console.error("process failed:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Processing failed" });
  } finally {
    await Promise.all([
      unlink(inputPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ]);
  }
});

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download source video (${res.status})`);
  }
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

  if (!res.ok) {
    throw new Error(`Supabase storage upload failed (${res.status}): ${await res.text()}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/videos/${storagePath}`;
}

app.listen(PORT, () => {
  console.log(`Reelstate video service listening on :${PORT}`);
});
