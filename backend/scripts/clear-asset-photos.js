// One-off cleanup: clears every employee/chair "profile photo" so the app
// starts fresh after the findByObjectKey lookup bug (object_key OR seat_id)
// let one chair's popup resolve to a *different* chair's asset row — and
// therefore that other chair's uploaded photo. The lookup bug itself is
// already fixed in assetRepository.ts; this just resets the data.
//
// Scope: ONLY the assets.image_url column and the Supabase Storage "assets"
// bucket (confirmed via routes/uploads.ts + uploadController.ts to be used
// exclusively for this profile-photo feature — complaint photos live in a
// separate "complaints" bucket and are untouched).
//
// Usage: npm run clear-asset-photos   (from backend/)
require("dotenv").config();
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const ASSETS_BUCKET = "assets";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearDatabaseColumn() {
  const result = await pool.query(
    `update assets set image_url = null, updated_at = now() where image_url is not null returning id`
  );
  console.log(`[db] cleared image_url on ${result.rowCount} asset row(s)`);
}

// uploadAssetPhoto builds its path as `assets/{userId}/{uuid}.ext` and
// passes that as the object path *within* the already-named "assets"
// bucket — so the real layout is bucket "assets" -> folder "assets" ->
// folder {userId} -> files, one level deeper than the bucket name alone
// suggests. list() isn't recursive, so walk it generically: entries with
// id: null are folders (descend into them), entries with an id are files
// (collect for deletion).
async function collectFilePaths(prefix) {
  const { data: entries, error } = await supabase.storage.from(ASSETS_BUCKET).list(prefix);
  if (error) {
    if (error.message?.toLowerCase().includes("not found")) return [];
    throw error;
  }

  const paths = [];
  for (const entry of entries ?? []) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) {
      paths.push(entryPath);
    } else {
      paths.push(...(await collectFilePaths(entryPath)));
    }
  }
  return paths;
}

async function clearStorageBucket() {
  const paths = await collectFilePaths("");
  if (paths.length === 0) {
    console.log(`[storage] no files found in the "${ASSETS_BUCKET}" bucket`);
    return;
  }

  // remove() takes a flat list of paths regardless of nesting depth.
  const { data: removed, error: removeError } = await supabase.storage.from(ASSETS_BUCKET).remove(paths);
  if (removeError) throw removeError;
  console.log(`[storage] deleted ${removed?.length ?? paths.length} file(s) from the "${ASSETS_BUCKET}" bucket`);
}

async function main() {
  await clearDatabaseColumn();
  await clearStorageBucket();
  console.log("Done. Every employee/chair now has no photo until they re-upload their own.");
}

main()
  .catch((error) => {
    console.error("[clear-asset-photos] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
