// GET /functions/v1/reel-status/:projectId
// Polling endpoint for the frontend — mirrors functions/status. RLS only
// lets the public read a reel_projects row once status = 'ready', so the
// client needs this (service role) to see every in-between state and to
// show per-clip progress ("Generating videos... 2/5 complete").
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const projectId = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!projectId) {
    return jsonResponse({ error: "Missing projectId in path" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: project, error: projectError } = await supabase
    .from("reel_projects")
    .select("id, title, location, status, error_message, final_video_url")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) return jsonResponse({ error: projectError.message }, 500);
  if (!project) return jsonResponse({ error: "Project not found" }, 404);

  const { data: clips } = await supabase
    .from("reel_clips")
    .select("sort_order, caption_text, status")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  return jsonResponse(
    {
      projectId: project.id,
      title: project.title,
      location: project.location,
      status: project.status,
      errorMessage: project.error_message,
      finalVideoUrl: project.final_video_url,
      clips: (clips ?? []).map((c) => ({
        order: c.sort_order,
        caption: c.caption_text,
        status: c.status,
      })),
    },
    200,
  );
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
