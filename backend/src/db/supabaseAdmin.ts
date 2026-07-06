import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.warn(
    "[supabaseAdmin] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — " +
    "service-role operations (storage, auth verification) will fail until configured."
  );
}

// Service-role client: bypasses Row Level Security entirely. Server-side only —
// never send this key or this client to the frontend.
// Falls back to a syntactically-valid placeholder URL so the client can be
// constructed at import time without configuration; real calls will fail with
// a clear network/auth error rather than crashing the whole process on boot.
export const supabaseAdmin = createClient(
  url || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key",
  { auth: { autoRefreshToken: false, persistSession: false } }
);
