import { NextFunction, Request, Response } from "express";
import { supabaseAuth } from "../db/supabaseAdmin";
import { pool } from "../db/client";
import { AuthenticatedUser, UserRole } from "../types/domain";
import { ServiceUnavailableError } from "../errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

// Supabase's own JWT/refresh-token lifetime is not tied to user activity —
// a tab left open will keep auto-refreshing indefinitely. This enforces the
// product's own 24h-of-inactivity rule server-side (never trust the frontend
// alone for this): `last_login_at` doubles as "last seen doing an
// authenticated request" since attachUser bumps it on every call below.
const INACTIVITY_LIMIT_MS = 24 * 60 * 60 * 1000;

/**
 * Validates the Supabase-issued JWT with Supabase itself (handles expiry/
 * revocation correctly) and loads the caller's role from `profiles`. Attaches
 * `req.user` on success. Does not reject the request — use `requireAuth`/
 * `requireAdmin` after this to enforce presence.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req);
  if (!token) { next(); return; }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) { next(); return; }

    // Check the caller's *previous* activity timestamp before this request
    // touches it — if they've been inactive past the limit, treat the
    // session as expired (leave req.user unset; requireAuth returns a clean
    // 401) instead of silently reviving it by refreshing the timestamp below.
    const { rows: existingRows } = await pool.query<{ last_login_at: string | null }>(
      `SELECT last_login_at FROM profiles WHERE id = $1`,
      [data.user.id]
    );
    const previousLastActive = existingRows[0]?.last_login_at;
    if (previousLastActive && Date.now() - new Date(previousLastActive).getTime() > INACTIVITY_LIMIT_MS) {
      next();
      return;
    }

    // The database trigger creates profiles for new auth users. Upserting here
    // also backfills users who signed up before that trigger was installed.
    // Existing roles and active/disabled state are deliberately left unchanged.
    // (`last_login_at` doubles as the inactivity clock above — it's bumped on
    // every authenticated request, not only at sign-in.)
    const metadata = data.user.user_metadata ?? {};
    const displayName = metadata.full_name || metadata.name || null;
    const avatarUrl = metadata.avatar_url || metadata.picture || null;
    const { rows } = await pool.query<{ role: UserRole; is_active: boolean; display_name: string | null }>(
      `INSERT INTO profiles (id, email, display_name, avatar_url, last_login_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE
       SET email = EXCLUDED.email,
           last_login_at = now()
       RETURNING role, is_active, display_name`,
      [data.user.id, data.user.email ?? "", displayName, avatarUrl]
    );

    if (!rows[0].is_active) { next(); return; }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? "",
      displayName: rows[0].display_name,
      role: rows[0].role
    };
  } catch (err) {
    console.error("[auth] token verification failed:", (err as Error).message);
    next(new ServiceUnavailableError("Authentication service temporarily unavailable"));
    return;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required" }); return; }
  if (req.user.role !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}
