// POST /functions/v1/generate/:uploadId
// Triggers the "Process video" GitHub Actions workflow to run the real
// ffmpeg editing pipeline (video-service/), then returns immediately —
// this is fire-and-forget, not synchronous. The workflow itself writes
// the result (or a 'failed' status) straight onto the uploads row when
// it finishes, using GH_REPO_REF's own SUPABASE_SERVICE_ROLE_KEY secret.
// The client is expected to poll GET /functions/v1/status/:uploadId
// until status is 'ready' or 'failed'.
//
// Required secrets (supabase secrets set ...):
//   GH_PAT       — fine-grained PAT scoped to this repo, Actions: read/write
//   GH_OWNER     — e.g. "franklinfx2"
//   GH_REPO      — e.g. "Reelstate-"
//   GH_REPO_REF  — branch that contains .github/workflows/process-video.yml
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const uploadId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!uploadId) {
    return jsonResponse({ error: "Missing uploadId in path" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: upload, error: fetchError } = await supabase
    .from("uploads")
    .select("*")
    .eq("id", uploadId)
    .maybeSingle();

  if (fetchError) return jsonResponse({ error: fetchError.message }, 500);
  if (!upload) return jsonResponse({ error: "Upload not found" }, 404);

  try {
    await triggerProcessingWorkflow(uploadId, upload.video_file_url);
  } catch (err) {
    console.error("Failed to trigger processing workflow:", err);
    await supabase.from("uploads").update({ status: "failed" }).eq("id", uploadId);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Could not start processing" },
      500,
    );
  }

  await supabase.from("uploads").update({ status: "generating" }).eq("id", uploadId);

  return jsonResponse({ uploadId, status: "generating" }, 202);
});

async function triggerProcessingWorkflow(uploadId: string, videoUrl: string) {
  const ghPat = Deno.env.get("GH_PAT");
  const owner = Deno.env.get("GH_OWNER");
  const repo = Deno.env.get("GH_REPO");
  const ref = Deno.env.get("GH_REPO_REF");

  if (!ghPat || !owner || !repo || !ref) {
    throw new Error(
      "Video processing isn't configured yet — missing GH_PAT/GH_OWNER/GH_REPO/GH_REPO_REF secrets.",
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/process-video.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghPat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { uploadId, videoUrl } }),
    },
  );

  if (!res.ok) {
    throw new Error(`GitHub workflow dispatch failed (${res.status}): ${await res.text()}`);
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
