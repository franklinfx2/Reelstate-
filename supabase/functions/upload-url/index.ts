// POST /functions/v1/upload-url
// Returns a signed Storage upload URL so the client can PUT the raw video/
// photo bytes straight to Supabase Storage — bypassing this project's
// Edge Functions entirely for the large binary. Routing large files
// through an Edge Function's request body is fragile (crashes/drops mid
// -transfer well before any platform-documented limit); signed uploads
// are Supabase's own recommended pattern for this.
//
// Body: { uploadId: string, fileName: string, kind: "video" | "photo", index?: number }
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

  let body: { uploadId?: string; fileName?: string; kind?: string; index?: number };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { uploadId, fileName, kind, index } = body;
  if (!uploadId || !fileName || (kind !== "video" && kind !== "photo")) {
    return jsonResponse(
      { error: "uploadId, fileName, and kind ('video' | 'photo') are required" },
      400,
    );
  }

  const bucket = kind === "video" ? "videos" : "photos";
  const path = kind === "video"
    ? `${uploadId}/${sanitizeFilename(fileName)}`
    : `${uploadId}/${index ?? 0}-${sanitizeFilename(fileName)}`;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.storage
    .from(bucket)
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
