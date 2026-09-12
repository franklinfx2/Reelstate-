// Standalone job runner for GitHub Actions — the heavy half of the "photos
// only" flow (analysis + prompt-writing already happened in the reel-generate
// Edge Function). Usage: node reel-run-job.mjs <projectId>
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / KLING_ACCESS_KEY /
// KLING_SECRET_KEY from env, generates each clip via Kling, assembles the
// final video, uploads it, and writes the outcome straight onto the
// reel_projects row — there's no caller waiting on an HTTP response.
import { unlink } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { generateClipFromPhoto } from "./kling.js";
import { assembleReelVideo } from "./reel-assemble.js";

const [, , projectId] = process.argv;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CLIP_DURATION_SECONDS = 10;

if (!projectId) {
  console.error("Usage: node reel-run-job.mjs <projectId>");
  process.exit(1);
}
for (const [name, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

const tmpFiles = [];

try {
  const project = await getProject(projectId);
  const clips = await getClips(projectId);
  if (clips.length === 0) throw new Error("Project has no clips to generate");

  await patchProject(projectId, { status: "generating" });

  const localClips = [];
  for (const clip of clips) {
    const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/property-photos/${clip.reel_photos.storage_path}`;
    const destPath = `/tmp/reel-clip-source-${projectId}-${clip.sort_order}.mp4`;
    tmpFiles.push(destPath);

    try {
      const { taskId, videoUrl } = await generateClipFromPhoto({
        imageUrl: photoUrl,
        prompt: clip.prompt_text,
        durationSeconds: CLIP_DURATION_SECONDS,
        destPath,
      });
      await patchClip(clip.id, { status: "ready", kling_task_id: taskId, kling_video_url: videoUrl });
      localClips.push({ path: destPath, caption: clip.caption_text });
    } catch (err) {
      await patchClip(clip.id, { status: "failed" }).catch(() => {});
      throw new Error(`Clip ${clip.sort_order} generation failed: ${err.message}`);
    }
  }

  await patchProject(projectId, { status: "assembling" });

  const outputPath = `/tmp/reel-final-${projectId}.mp4`;
  tmpFiles.push(outputPath);
  const { duration } = await assembleReelVideo({
    projectTitle: project.title,
    projectLocation: project.location,
    clips: localClips,
    outputPath,
  });

  const storagePath = `${projectId}/final.mp4`;
  const finalVideoUrl = await uploadToSupabase(outputPath, storagePath);

  await patchProject(projectId, { status: "ready", final_video_url: finalVideoUrl });

  console.log(JSON.stringify({ projectId, finalVideoUrl, duration }));
} catch (err) {
  console.error("Reel job failed:", err);
  await patchProject(projectId, { status: "failed", error_message: err.message }).catch(() => {});
  process.exit(1);
} finally {
  await Promise.all(tmpFiles.map((f) => unlink(f).catch(() => {})));
}

async function getProject(id) {
  const res = await restFetch(`/rest/v1/reel_projects?id=eq.${id}&select=*`);
  const rows = await res.json();
  if (!rows[0]) throw new Error("Project not found");
  return rows[0];
}

async function getClips(id) {
  const res = await restFetch(
    `/rest/v1/reel_clips?project_id=eq.${id}&select=id,sort_order,caption_text,prompt_text,status,reel_photos(storage_path)&order=sort_order.asc`,
  );
  return res.json();
}

async function patchProject(id, fields) {
  const res = await restFetch(`/rest/v1/reel_projects?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
    headers: { Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`Failed to update reel_projects row (${res.status}): ${await res.text()}`);
}

async function patchClip(id, fields) {
  const res = await restFetch(`/rest/v1/reel_clips?id=eq.${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
    headers: { Prefer: "return=minimal" },
  });
  if (!res.ok) throw new Error(`Failed to update reel_clips row (${res.status}): ${await res.text()}`);
}

async function restFetch(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...headers,
    },
    body,
  });
  if (method === "GET" && !res.ok) {
    throw new Error(`Supabase REST GET ${path} failed (${res.status}): ${await res.text()}`);
  }
  return res;
}

async function uploadToSupabase(filePath, storagePath) {
  const { size } = await stat(filePath);
  const fileStream = Readable.toWeb(createReadStream(filePath));
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/generated-videos/${storagePath}`;

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

  return `${SUPABASE_URL}/storage/v1/object/public/generated-videos/${storagePath}`;
}
