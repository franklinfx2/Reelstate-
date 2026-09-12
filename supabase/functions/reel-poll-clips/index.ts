// POST /functions/v1/reel-poll-clips
// NOT called by the frontend — meant to be invoked on a schedule (Supabase
// Cron Job, e.g. every 1 minute; see supabase/reel_schema.sql for the
// cron.schedule snippet). Kling generation takes minutes and Edge Functions
// can't hold a connection open that long, so reel-generate only *submits*
// jobs; this function checks each pending clip's status once per
// invocation (no internal polling loop), and once every clip for a project
// is ready, dispatches reel-process-video.yml for ffmpeg assembly — which
// needs no Kling credentials at all, since it just downloads the
// already-generated clip URLs this function writes to the DB.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { getTaskStatus } from "../_shared/kling.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: pendingClips, error: pendingError } = await supabase
    .from("reel_clips")
    .select("id, project_id, kling_task_id")
    .eq("status", "generating")
    .not("kling_task_id", "is", null);
  if (pendingError) return jsonResponse({ error: pendingError.message }, 500);

  const touchedProjects = new Set<string>();

  for (const clip of pendingClips ?? []) {
    touchedProjects.add(clip.project_id);
    try {
      const result = await getTaskStatus(clip.kling_task_id!);
      if (result.status === "succeed") {
        await supabase
          .from("reel_clips")
          .update({ status: "ready", kling_video_url: result.videoUrl })
          .eq("id", clip.id);
      } else if (result.status === "failed") {
        await supabase.from("reel_clips").update({ status: "failed" }).eq("id", clip.id);
        await supabase
          .from("reel_projects")
          .update({
            status: "failed",
            error_message: `Clip generation failed: ${result.message ?? "unknown reason"}`,
          })
          .eq("id", clip.project_id);
      }
      // otherwise still processing — left as-is, checked again next run
    } catch (err) {
      console.error(`Polling clip ${clip.id} failed:`, err);
    }
  }

  let assembled = 0;
  for (const projectId of touchedProjects) {
    const { data: project } = await supabase
      .from("reel_projects")
      .select("status")
      .eq("id", projectId)
      .maybeSingle();
    if (!project || project.status !== "generating") continue;

    const { data: clips } = await supabase
      .from("reel_clips")
      .select("status")
      .eq("project_id", projectId);
    if (!clips || clips.length === 0 || !clips.every((c) => c.status === "ready")) continue;

    try {
      await triggerAssemblyWorkflow(projectId);
      await supabase.from("reel_projects").update({ status: "assembling" }).eq("id", projectId);
      assembled++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start assembly";
      await supabase
        .from("reel_projects")
        .update({ status: "failed", error_message: message })
        .eq("id", projectId);
    }
  }

  return jsonResponse(
    { polledClips: pendingClips?.length ?? 0, projectsChecked: touchedProjects.size, dispatchedForAssembly: assembled },
    200,
  );
});

async function triggerAssemblyWorkflow(projectId: string) {
  const ghPat = Deno.env.get("GH_PAT");
  const owner = Deno.env.get("GH_OWNER");
  const repo = Deno.env.get("GH_REPO");
  const ref = Deno.env.get("GH_REPO_REF");

  if (!ghPat || !owner || !repo || !ref) {
    throw new Error(
      "Video assembly isn't configured yet — missing GH_PAT/GH_OWNER/GH_REPO/GH_REPO_REF secrets.",
    );
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/reel-process-video.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghPat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs: { projectId } }),
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
