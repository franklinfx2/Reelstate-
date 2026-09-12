// Minimal Kling AI (Open Platform) REST client: submit an image-to-video
// job, poll it to completion, and download the resulting clip.
//
// Auth: Kling's Open Platform uses a short-lived JWT, HS256-signed with an
// access key / secret key pair (not a single bearer API key) — see
// https://docs.qingque.cn (Kling's developer docs) for the exact contract.
// Required env vars: KLING_ACCESS_KEY, KLING_SECRET_KEY. Optional:
// KLING_API_BASE (defaults to the international endpoint).
import { createHmac } from "node:crypto";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const DEFAULT_API_BASE = "https://api-singapore.klingai.com";
const POLL_INTERVAL_MS = 10_000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(accessKey, secretKey) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }),
  );
  const signature = createHmac("sha256", secretKey)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${payload}.${signature}`;
}

function authHeaders(accessKey, secretKey) {
  return {
    Authorization: `Bearer ${signJwt(accessKey, secretKey)}`,
    "Content-Type": "application/json",
  };
}

async function submitImageToVideo({ accessKey, secretKey, apiBase, imageUrl, prompt, durationSeconds }) {
  const res = await fetch(`${apiBase}/v1/videos/image2video`, {
    method: "POST",
    headers: authHeaders(accessKey, secretKey),
    body: JSON.stringify({
      model_name: "kling-v1",
      image: imageUrl,
      prompt,
      duration: String(durationSeconds),
      mode: "std",
      cfg_scale: 0.5,
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(
      `Kling submit failed (${res.status}): ${body ? JSON.stringify(body) : await res.text()}`,
    );
  }
  return body.data.task_id;
}

async function pollUntilDone({ accessKey, secretKey, apiBase, taskId }) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await fetch(`${apiBase}/v1/videos/image2video/${taskId}`, {
      headers: authHeaders(accessKey, secretKey),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.code !== 0) {
      throw new Error(
        `Kling status check failed (${res.status}): ${body ? JSON.stringify(body) : await res.text()}`,
      );
    }

    const status = body.data.task_status;
    if (status === "succeed") {
      const video = body.data.task_result?.videos?.[0];
      if (!video?.url) throw new Error("Kling reported success but returned no video URL");
      return video.url;
    }
    if (status === "failed") {
      throw new Error(`Kling generation failed: ${body.data.task_status_msg ?? "unknown reason"}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Kling generation timed out after ${POLL_TIMEOUT_MS / 1000}s`);
}

async function downloadTo(url, destPath) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download Kling clip (${res.status})`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

/**
 * Generates a single clip from a photo + prompt and saves it to destPath.
 * Returns destPath once the file is fully downloaded.
 */
export async function generateClipFromPhoto({ imageUrl, prompt, durationSeconds, destPath }) {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  const apiBase = process.env.KLING_API_BASE || DEFAULT_API_BASE;

  if (!accessKey || !secretKey) {
    throw new Error("Missing KLING_ACCESS_KEY / KLING_SECRET_KEY environment variables");
  }

  const taskId = await submitImageToVideo({
    accessKey,
    secretKey,
    apiBase,
    imageUrl,
    prompt,
    durationSeconds,
  });
  const videoUrl = await pollUntilDone({ accessKey, secretKey, apiBase, taskId });
  await downloadTo(videoUrl, destPath);
  return { taskId, videoUrl, destPath };
}
