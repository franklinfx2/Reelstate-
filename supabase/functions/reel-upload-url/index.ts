// POST /functions/v1/reel-upload-url
// Returns a signed Storage upload URL for the "photos only" Kling flow, so
// the client can PUT a photo's raw bytes straight to Supabase Storage —
// same reasoning as functions/upload-url, just targeting the property-photos
// bucket used by reel_projects instead of the photos/videos buckets used by
// the raw-walkthrough-video flow.
//
// Body: { projectId: string, fileName: string, index: number }
// Returns: { path, token, signedUrl }
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { projectId?: string; fileName?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { projectId, fileName, index } = body;
  if (!projectId || !fileName || typeof index !== "number") {
    return jsonResponse(
      { error: "projectId, fileName, and index are required" },
      400,
    );
  }

  const path = `${projectId}/${index}-${sanitizeFilename(fileName)}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.storage
    .from("property-photos")
    .createSignedUploadUrl(path);

  if (error) {
    return jsonResponse({ error: `Could not create upload URL: ${error.message}` }, 500);
  }

  return jsonResponse({ path, token: data.token, signedUrl: data.signedUrl }, 200);
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "-");
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
