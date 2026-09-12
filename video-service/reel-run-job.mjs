// Standalone job runner for GitHub Actions — the assembly half of the
// "photos only" flow. By the time this runs, reel-generate (Claude
// analysis/prompts) and reel-poll-clips (Kling job submission + polling)
// have already finished in Supabase Edge Functions and every clip has a
// kling_video_url — Kling credentials are Supabase-secret-only and never
// reach this job. Usage: node reel-run-job.mjs <projectId>
// Reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY from env, downloads each
// ready clip, assembles the final video, uploads it, and writes the
// outcome straight onto the reel_projects row — there's no caller waiting
// on an HTTP response.
import { unlink } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { assembleReelVideo } from "./reel-assemble.js";

const [, , projectId] = process.argv;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  if (clips.length === 0) throw new Error("Project has no clips to assemble");

  await patchProject(projectId, { status: "assembling" });

  const localClips = [];
  for (const clip of clips) {
    if (!clip.kling_video_url) {
      throw new Error(`Clip ${clip.sort_order} has no generated video yet (status: ${clip.status})`);
    }
    const destPath = `/tmp/reel-clip-source-${projectId}-${clip.sort_order}.mp4`;
    tmpFiles.push(destPath);
    await downloadTo(clip.kling_video_url, destPath);
    localClips.push({ path: destPath, caption: clip.caption_text });
  }

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
    `/rest/v1/reel_clips?project_id=eq.${id}&select=id,sort_order,caption_text,status,kling_video_url&order=sort_order.asc`,
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

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download clip (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
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
