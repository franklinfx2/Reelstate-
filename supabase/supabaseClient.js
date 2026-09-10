// Plain JS Supabase client for the Reelstate edge-function backend.
// Usage: import { supabase } from "./supabaseClient.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_ANON_KEY. Copy supabase/.env.example to supabase/.env and fill in your project's credentials."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
