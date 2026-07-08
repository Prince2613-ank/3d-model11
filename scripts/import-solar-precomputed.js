// Imports the precomputed Punjabi Bagh solar-potential dataset (see
// scripts/export-solar-precomputed.py) into a dedicated `solar_precomputed`
// table. Purely additive — creates the table if missing, never touches the
// existing `buildings` table.
//
// Usage:
//   1. python scripts/export-solar-precomputed.py
//   2. node scripts/import-solar-precomputed.js [path-to-geojson]
require("dotenv").config({ path: "./.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "data/solar/punjabi-bagh-solar-may.geojson";
const BATCH = 300;
const PARALLEL = 4;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

const SUITABILITY_MAP = { High: "excellent", Medium: "good", Low: "poor" };

async function ensureTable() {
  await pool.query(`
    create extension if not exists postgis;

    create table if not exists solar_precomputed (
      id           bigserial primary key,
      external_id  text,
      geom         geometry(Polygon, 4326) not null,
      centroid     geometry(Point, 4326) not null,
      area_m2      real,
      usable_m2    real,
      solar_kw     real,
      may_kwh_day  real,
      suitability  text,
      imported_at  timestamptz not null default now()
    );

    create index if not exists solar_precomputed_geom_idx on solar_precomputed using gist (geom);
    create index if not exists solar_precomputed_external_id_idx on solar_precomputed (external_id);
  `);
}

async function insertBatch(rows) {
  if (!rows.length) return 0;
  const vals = [], params = [];
  let p = 1;
  for (const r of rows) {
    vals.push(
      `($${p++},ST_SetSRID(ST_GeomFromGeoJSON($${p++}),4326),` +
      `ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($${p++}),4326)),$${p++},$${p++},$${p++},$${p++},$${p++})`
    );
    params.push(r.eid, r.geom, r.geom, r.area_m2, r.usable_m2, r.solar_kw, r.may_kwh_day, r.suitability);
  }
  const res = await pool.query(
    `INSERT INTO solar_precomputed(external_id,geom,centroid,area_m2,usable_m2,solar_kw,may_kwh_day,suitability)
     VALUES ${vals.join(",")}`,
    params
  );
  return res.rowCount;
}

async function main() {
  await ensureTable();

  const filePath = path.resolve(FILE);
  console.log(`Reading: ${filePath}`);
  const features = JSON.parse(fs.readFileSync(filePath, "utf8")).features;
  console.log(`${features.length} features`);

  // Re-running this script would otherwise duplicate every row (unlike the
  // OSM/Overture import there's no natural external_id to ON CONFLICT on for
  // this dataset), so clear out a prior import first.
  const { rows: existing } = await pool.query(`SELECT COUNT(*) FROM solar_precomputed`);
  if (Number(existing[0].count) > 0) {
    console.log(`Clearing ${existing[0].count} existing solar_precomputed rows before re-import…`);
    await pool.query(`TRUNCATE solar_precomputed RESTART IDENTITY`);
  }

  const rows = features
    .filter((ft) => ft.geometry?.type === "Polygon" && ft.geometry.coordinates)
    .map((ft) => ({
      eid: ft.properties?.id ?? null,
      geom: JSON.stringify(ft.geometry),
      area_m2: ft.properties?.area_m2 ?? null,
      usable_m2: ft.properties?.usable_m2 ?? null,
      solar_kw: ft.properties?.solar_kw ?? null,
      may_kwh_day: ft.properties?.may_kwh_day ?? null,
      suitability: SUITABILITY_MAP[ft.properties?.solar_score] ?? null,
    }));

  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  let inserted = 0;
  const start = Date.now();

  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL);
    const counts = await Promise.all(
      chunk.map((b) => insertBatch(b).catch((e) => { console.error("\nBatch failed:", e.message); return 0; }))
    );
    inserted += counts.reduce((a, b) => a + b, 0);
    const pct = Math.round(((i + chunk.length) / batches.length) * 100);
    process.stdout.write(`\r[${pct}%] ${inserted}/${rows.length}  ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s — inserted ${inserted} precomputed solar rows`);
  await pool.end();
}

main().catch((e) => { console.error("\nFatal:", e.message); process.exit(1); });
