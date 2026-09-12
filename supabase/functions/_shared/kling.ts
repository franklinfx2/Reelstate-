// Minimal Kling AI (Open Platform) REST client for the "photos only" flow.
// Lives in the Edge Functions runtime (not video-service) because the Kling
// credential is Supabase-secret-only — it never leaves this project, so the
// GitHub Actions job that later assembles the final video needs no Kling
// credentials at all.
//
// Auth: supports either a single bearer KLING_API_KEY, or Kling's documented
// access-key/secret-key pair (HS256-signed short-lived JWT) as
// KLING_ACCESS_KEY/KLING_SECRET_KEY — whichever is set. Optional
// KLING_API_BASE overrides the default international endpoint.
const DEFAULT_API_BASE = "https://api-singapore.klingai.com";

function base64url(bytes: Uint8Array | string): string {
  const bin = typeof bytes === "string" ? bytes : String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(accessKey: string, secretKey: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

async function authHeader(): Promise<string> {
  const apiKey = Deno.env.get("KLING_API_KEY");
  if (apiKey) return `Bearer ${apiKey}`;

  const accessKey = Deno.env.get("KLING_ACCESS_KEY");
  const secretKey = Deno.env.get("KLING_SECRET_KEY");
  if (accessKey && secretKey) return `Bearer ${await signJwt(accessKey, secretKey)}`;

  throw new Error(
    "Missing Kling credentials: set KLING_API_KEY, or KLING_ACCESS_KEY + KLING_SECRET_KEY.",
  );
}

function apiBase(): string {
  return Deno.env.get("KLING_API_BASE") || DEFAULT_API_BASE;
}

/** Submits an image-to-video job and returns Kling's task_id. Does not wait for completion. */
export async function submitImageToVideo(
  { imageUrl, prompt, durationSeconds }: { imageUrl: string; prompt: string; durationSeconds: number },
): Promise<string> {
  const res = await fetch(`${apiBase()}/v1/videos/image2video`, {
    method: "POST",
    headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
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

export type KlingTaskStatus = { status: string; videoUrl?: string; message?: string };

/** Checks a task's current status once — does not poll/wait. */
export async function getTaskStatus(taskId: string): Promise<KlingTaskStatus> {
  const res = await fetch(`${apiBase()}/v1/videos/image2video/${taskId}`, {
    headers: { Authorization: await authHeader() },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.code !== 0) {
    throw new Error(
      `Kling status check failed (${res.status}): ${body ? JSON.stringify(body) : await res.text()}`,
    );
  }

  const status = body.data.task_status;
  if (status === "succeed") {
    const videoUrl = body.data.task_result?.videos?.[0]?.url;
    if (!videoUrl) throw new Error("Kling reported success but returned no video URL");
    return { status, videoUrl };
  }
  if (status === "failed") {
    return { status, message: body.data.task_status_msg ?? "unknown reason" };
  }
  return { status };
}
