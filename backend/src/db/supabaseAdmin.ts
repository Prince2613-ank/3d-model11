import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || (!serviceRoleKey && !anonKey)) {
  console.warn(
    "[supabase] SUPABASE_URL and an API key are required for auth verification."
  );
}

if (!serviceRoleKey) {
  console.warn(
    "[supabaseAdmin] SUPABASE_SERVICE_ROLE_KEY not set — " +
    "admin/storage operations will fail until configured."
  );
}

const clientOptions = { auth: { autoRefreshToken: false, persistSession: false } };

// Verifying a caller's JWT does not require service-role privileges. Prefer
// the same public key used by the frontends so auth verification is not tied
// to service-role key rotation or availability.
export const supabaseAuth = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || serviceRoleKey || "placeholder-api-key",
  clientOptions
);

// Service-role client: bypasses Row Level Security entirely. Server-side only —
// never send this key or this client to the frontend.
// Falls back to a syntactically-valid placeholder URL so the client can be
// constructed at import time without configuration; real calls will fail with
// a clear network/auth error rather than crashing the whole process on boot.
export const supabaseAdmin = createClient(
  url || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key",
  clientOptions
);
