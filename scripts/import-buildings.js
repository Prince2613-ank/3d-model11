// Fast bulk import — supports any GeoJSON file
// Usage: node import-buildings.js [path-to-geojson]
require("dotenv").config({ path: "./.env" });
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const FILE = process.argv[2] || "data/buildings/buildings.geojson";
const BATCH = 300;
const PARALLEL = 4;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 6,
});

function parseHeight(p) {
  if (p.height) return parseFloat(p.height);
  const lvl = p["building:levels"] || p.levels;
  return lvl ? parseInt(lvl) * 3.2 : null;
}

async function insertBatch(rows) {
  if (!rows.length) return 0;
  const vals = [], params = [];
  let p = 1;
  for (const r of rows) {
    vals.push(`($${p++},'osm',$${p++},ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${p++}),4326)),$${p++},$${p++},$${p++})`);
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
  console.log(`${features.length} features — batch ${BATCH} x ${PARALLEL} parallel`);

  const client = await pool.connect();
  await client.query("DELETE FROM buildings WHERE source='osm'");
  client.release();
  console.log("Cleared existing OSM rows");

  const rows = features
    .filter(ft => ft.geometry?.coordinates)
    .map(ft => ({
      eid:    ft.properties?.id || ft.id || null,
      name:   ft.properties?.name || null,
      geom:   JSON.stringify(ft.geometry),
      type:   (ft.properties?.building && ft.properties.building !== "yes") ? ft.properties.building : null,
      height: parseHeight(ft.properties || {}),
      levels: ft.properties?.["building:levels"] ? parseInt(ft.properties["building:levels"]) : null,
    }));

  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH) batches.push(rows.slice(i, i + BATCH));

  let inserted = 0;
  const start = Date.now();

  for (let i = 0; i < batches.length; i += PARALLEL) {
    const chunk = batches.slice(i, i + PARALLEL);
    const counts = await Promise.all(chunk.map(b => insertBatch(b).catch(() => 0)));
    inserted += counts.reduce((a, b) => a + b, 0);
    const pct = Math.round(((i + chunk.length) / batches.length) * 100);
    process.stdout.write(`\r[${pct}%] ${inserted}/${rows.length}  ${((Date.now()-start)/1000).toFixed(1)}s`);
  }

  console.log(`\nDone in ${((Date.now()-start)/1000).toFixed(1)}s — inserted ${inserted} buildings`);
  const { rows: r } = await pool.query("SELECT COUNT(*) FROM buildings");
  console.log(`Total in DB: ${r[0].count}`);
  await pool.end();
}

main().catch(e => { console.error("\nFatal:", e.message); process.exit(1); });
