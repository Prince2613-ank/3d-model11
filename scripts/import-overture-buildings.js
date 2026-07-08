// Imports Overture Maps building footprints NOT already covered by OSM.
// Purely additive — never touches or deletes existing source='osm' rows.
//
// Usage:
//   1. Download an extract for your area (needs Python + `pip install overturemaps`):
//        overturemaps download --bbox=<minLon>,<minLat>,<maxLon>,<maxLat> -f geojson --type=building -o data/buildings/overture-buildings.geojson
//   2. node scripts/import-overture-buildings.js [path-to-geojson]
//
// Note: as of the current Overture release, the buildings theme's Google/Microsoft
// contributions are footprint-only (no height/floor data) for most areas — this
// script only improves footprint completeness, not building height. Verify with
// your own extract before assuming otherwise.
require("dotenv").config({ path: "./.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "data/buildings/overture-buildings.geojson";
const BATCH = 300;
const PARALLEL = 4;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

async function insertBatch(rows) {
  if (!rows.length) return 0;
  const vals = [], params = [];
  let p = 1;
  for (const r of rows) {
    vals.push(`($${p++},'overture',$${p++},ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${p++}),4326)),$${p++},$${p++},$${p++})`);
    params.push(r.eid, r.name, r.geom, r.type, r.height, r.levels);
  }
  const res = await pool.query(
    `INSERT INTO buildings(external_id,source,name,geom,building_type,height,levels)
     VALUES ${vals.join(",")} ON CONFLICT DO NOTHING`,
    params
  );
  return res.rowCount;
}

async function main() {
  const filePath = path.resolve(FILE);
  console.log(`Reading: ${filePath}`);
  const features = JSON.parse(fs.readFileSync(filePath, "utf8")).features;
  console.log(`${features.length} total Overture features`);

  // Only import buildings not already sourced from OpenStreetMap — those are
  // already covered by the existing OSM import. Keeps this purely additive.
  const newFeatures = features.filter((ft) => {
    const primarySource = ft.properties?.sources?.[0]?.dataset;
    return primarySource && primarySource !== "OpenStreetMap";
  });
  console.log(`${newFeatures.length} features not already sourced from OSM — importing these`);

  const rows = newFeatures
    .filter((ft) => ft.geometry?.coordinates)
    .map((ft) => ({
      eid: ft.id || null,
      name: ft.properties?.names?.primary || null,
      geom: JSON.stringify(ft.geometry),
      type: ft.properties?.class || ft.properties?.subtype || null,
      height: ft.properties?.height ?? null,
      levels: ft.properties?.num_floors ?? null,
    }));

  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  let inserted = 0;
  const start = Date.now();

  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL);
    const counts = await Promise.all(chunk.map((b) => insertBatch(b).catch((e) => { console.error("\nBatch failed:", e.message); return 0; })));
    inserted += counts.reduce((a, b) => a + b, 0);
    const pct = Math.round(((i + chunk.length) / batches.length) * 100);
    process.stdout.write(`\r[${pct}%] ${inserted}/${rows.length}  ${((Date.now() - start) / 1000).toFixed(1)}s`);
  }

  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s — inserted ${inserted} Overture buildings (source='overture')`);
  const { rows: r } = await pool.query("SELECT source, COUNT(*) FROM buildings GROUP BY source ORDER BY source");
  console.log("Current buildings table by source:", r);
  await pool.end();
}

main().catch((e) => { console.error("\nFatal:", e.message); process.exit(1); });
