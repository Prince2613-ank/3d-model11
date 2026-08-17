// One-off cleanup: wipes every complaint and announcement (plus their
// dependent rows) so the app starts fresh, with no leftover testing data
// visible to a real first-time login on the admin or user panel.
//
// Deletes:
//   - complaints            (cascades to complaint_history and to
//                             notifications.related_complaint_id, which in
//                             turn cascades to notification_reads)
//   - announcements
//   - notifications of type 'announcement' (not FK-linked to announcements,
//     so not covered by the cascade above)
//   - activity_log rows for entity_type 'complaint' or 'announcement'
//     (entity_id is a plain uuid column, no FK, so also not cascaded)
//   - every file in the Supabase Storage "complaints" bucket (complaint
//     photos + resolution photos)
//   - resets assets.live_status back to 'ok' (it's a cache written by
//     complaintService.ts whenever a complaint is raised/assigned/resolved —
//     deleting the complaint rows alone leaves it stuck on whatever it last
//     was, which is why a chair could still show "Pending" after its
//     complaint was gone)
//
// Does NOT touch: profiles, rooms, floors, bookings/direct_messages, or
// anything else outside complaints/announcements and the asset status cache
// they drive.
//
// Usage: npm run reset-complaints-announcements   (from backend/)
require("dotenv").config();
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const COMPLAINTS_BUCKET = "complaints";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearDatabase() {
  const complaints = await pool.query(`delete from complaints returning id`);
  console.log(`[db] deleted ${complaints.rowCount} complaint(s) (cascaded to complaint_history + linked notifications)`);

  const announcements = await pool.query(`delete from announcements returning id`);
  console.log(`[db] deleted ${announcements.rowCount} announcement(s)`);

  const announcementNotifications = await pool.query(`delete from notifications where type = 'announcement' returning id`);
  console.log(`[db] deleted ${announcementNotifications.rowCount} announcement notification(s)`);

  const activity = await pool.query(`delete from activity_log where entity_type in ('complaint', 'announcement') returning id`);
  console.log(`[db] deleted ${activity.rowCount} activity_log row(s)`);

  const assets = await pool.query(`update assets set live_status = 'ok' where live_status <> 'ok' and deleted_at is null returning id`);
  console.log(`[db] reset live_status to 'ok' on ${assets.rowCount} asset(s)`);
}

// Same recursive walk as clear-asset-photos.js: list() isn't recursive, so
// descend into folder entries (id: null) and collect file entries (id set).
async function collectFilePaths(prefix) {
  const { data: entries, error } = await supabase.storage.from(COMPLAINTS_BUCKET).list(prefix);
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
    console.log(`[storage] no files found in the "${COMPLAINTS_BUCKET}" bucket`);
    return;
  }

  const { data: removed, error: removeError } = await supabase.storage.from(COMPLAINTS_BUCKET).remove(paths);
  if (removeError) throw removeError;
  console.log(`[storage] deleted ${removed?.length ?? paths.length} file(s) from the "${COMPLAINTS_BUCKET}" bucket`);
}

async function main() {
  await clearDatabase();
  await clearStorageBucket();
  console.log("Done. Complaints and announcements are empty — admin and user panels will show a clean state on next load.");
}

main()
  .catch((error) => {
    console.error("[reset-complaints-announcements] failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
