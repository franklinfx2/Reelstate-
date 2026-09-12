// POST /functions/v1/reel-upload
// Creates a reel_projects row (status 'pending') plus one reel_photos row
// per uploaded photo. Expects photos to already be in Storage via signed
// URLs from reel-upload-url — mirrors functions/upload's reasoning: never
// take raw file bytes through this function's body.
//
// Body: { projectId?: string, title: string, location: string,
//          agentName?: string, agentPhone?: string, photoPaths: string[] }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const MIN_PHOTOS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: {
    projectId?: string;
    title?: string;
    location?: string;
    agentName?: string;
    agentPhone?: string;
    photoPaths?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const title = String(body.title || "").trim();
  const location = String(body.location || "").trim();
  if (!title || !location) {
    return jsonResponse({ error: "title and location are required" }, 400);
  }

  const photoPaths: string[] = Array.isArray(body.photoPaths) ? body.photoPaths : [];
  if (photoPaths.length < MIN_PHOTOS) {
    return jsonResponse(
      { error: `At least ${MIN_PHOTOS} photos are required (got ${photoPaths.length})` },
      400,
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const projectId: string = body.projectId || crypto.randomUUID();

    const { error: insertProjectError } = await supabase.from("reel_projects").insert({
      id: projectId,
      title,
      location,
      agent_name: body.agentName || null,
      agent_phone: body.agentPhone || null,
      status: "pending",
    });
    if (insertProjectError) {
      throw new Error(`Could not save project: ${insertProjectError.message}`);
    }

    const photoRows = photoPaths.map((path, index) => ({
      project_id: projectId,
      storage_path: path,
      sort_order: index,
    }));
    const { error: insertPhotosError } = await supabase.from("reel_photos").insert(photoRows);
    if (insertPhotosError) {
      throw new Error(`Could not save photos: ${insertPhotosError.message}`);
    }

    return jsonResponse({ projectId, status: "pending" }, 201);
  } catch (err) {
    console.error("reel-upload function error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
