import { Pool, PoolClient, types } from "pg";
import dotenv from "dotenv";
dotenv.config();

// pg's default DATE (oid 1082) parser builds a JS Date at local midnight,
// then res.json() serializes it to a UTC ISO string — on a server whose
// timezone isn't UTC, that shifts the date backward (e.g. midnight IST on
// the 23rd becomes "...-22T18:30:00.000Z"). Keep date columns as the plain
// "YYYY-MM-DD" string Postgres already returns instead of round-tripping
// through a Date object.
types.setTypeParser(1082, (value: string) => value);

// Kept conservative relative to Supabase's session-mode pooler cap
// (observed: 15 clients total for the project). Render performs
// overlapping zero-downtime deploys — the old and new server instances
// are briefly alive at once — so this pool's `max` needs headroom for
// TWO instances to be under the pooler's ceiling simultaneously
// (2 x max should stay comfortably below the pooler's limit).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  min: 0,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => console.error("[pg] idle client error", err.message));

/** Closes the pool's connections. Call once on process shutdown so a
 * deploy/restart doesn't leave connections held open against the
 * session-mode pooler's client cap until they idle-timeout server-side. */
export async function closePool(): Promise<void> {
  await pool.end();
}

export async function withClient<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try   { return await fn(c); }
  finally { c.release(); }
}
