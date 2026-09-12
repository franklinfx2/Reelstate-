import { createClient } from "@supabase/supabase-js";

// Client for the "photos only" Kling flow. This talks to a *different*
// Supabase project (the Edge Functions backend documented in
// supabase/README's "Edge function backend" section) than src/lib/supabase.ts
// does — the two pipelines are intentionally separate, see AGENTS.md/README.
const REEL_SUPABASE_URL = process.env.NEXT_PUBLIC_REEL_SUPABASE_URL;
const REEL_ANON_KEY = process.env.NEXT_PUBLIC_REEL_ANON_KEY;

function reelSupabase() {
  if (!REEL_SUPABASE_URL || !REEL_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_REEL_SUPABASE_URL or NEXT_PUBLIC_REEL_ANON_KEY in environment."
    );
  }
  return createClient(REEL_SUPABASE_URL, REEL_ANON_KEY);
}

function functionsUrl(path: string) {
  if (!REEL_SUPABASE_URL) {
    throw new Error("Missing NEXT_PUBLIC_REEL_SUPABASE_URL in environment.");
  }
  return `${REEL_SUPABASE_URL}/functions/v1${path}`;
}

function functionHeaders(): Record<string, string> {
  if (!REEL_ANON_KEY) {
    throw new Error("Missing NEXT_PUBLIC_REEL_ANON_KEY in environment.");
  }
  return { apikey: REEL_ANON_KEY, "Content-Type": "application/json" };
}

async function readJsonOrThrow(res: Response, fallbackMessage: string) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || fallbackMessage);
  return data;
}

export async function uploadReelPhoto(projectId: string, file: File, index: number) {
  const res = await fetch(functionsUrl("/reel-upload-url"), {
    method: "POST",
    headers: functionHeaders(),
    body: JSON.stringify({ projectId, fileName: file.name, index }),
  });
  const { path, token } = await readJsonOrThrow(res, "Could not get an upload URL");

  const { error } = await reelSupabase()
    .storage.from("property-photos")
    .uploadToSignedUrl(path, token, file);
  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  return path as string;
}

export async function createReelProject(input: {
  projectId: string;
  title: string;
  location: string;
  agentName?: string;
  agentPhone?: string;
  photoPaths: string[];
}) {
  const res = await fetch(functionsUrl("/reel-upload"), {
    method: "POST",
    headers: functionHeaders(),
    body: JSON.stringify(input),
  });
  return readJsonOrThrow(res, "Could not create the project") as Promise<{
    projectId: string;
    status: string;
  }>;
}

export async function startReelGeneration(projectId: string) {
  const res = await fetch(functionsUrl(`/reel-generate/${projectId}`), {
    method: "POST",
    headers: functionHeaders(),
  });
  return readJsonOrThrow(res, "Could not start video generation") as Promise<{
    projectId: string;
    status: string;
  }>;
}

export type ReelStatus = {
  projectId: string;
  title: string;
  location: string;
  status: "pending" | "analyzing" | "prompting" | "generating" | "assembling" | "ready" | "failed";
  errorMessage: string | null;
  finalVideoUrl: string | null;
  clips: { order: number; caption: string; status: string }[];
};

export async function getReelStatus(projectId: string): Promise<ReelStatus> {
  const res = await fetch(functionsUrl(`/reel-status/${projectId}`), {
    headers: functionHeaders(),
  });
  return readJsonOrThrow(res, "Could not fetch status") as Promise<ReelStatus>;
}
