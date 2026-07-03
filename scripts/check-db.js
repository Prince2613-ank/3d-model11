require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const tables = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log("Tables:", tables.rows.map(r => r.table_name));

  try {
    const cnt = await pool.query("SELECT COUNT(*) FROM buildings");
    console.log("buildings rows:", cnt.rows[0].count);

    // Test one insert
    const geom = JSON.stringify({ type: "Polygon", coordinates: [[[77.133,28.670],[77.134,28.670],[77.134,28.671],[77.133,28.671],[77.133,28.670]]] });
    await pool.query(
      "INSERT INTO buildings(external_id,source,geom) VALUES($1,'test',ST_SetSRID(ST_GeomFromGeoJSON($2),4326))",
      ["test-1", geom]
    );
    console.log("Test insert OK");
    await pool.query("DELETE FROM buildings WHERE source='test'");
  } catch(e) {
    console.error("Error:", e.message);
  }
  await pool.end();
}
main();
