require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name='buildings' ORDER BY ordinal_position")
  .then(r => { r.rows.forEach(x => console.log(x.column_name, "-", x.udt_name)); pool.end(); })
  .catch(e => { console.error(e.message); pool.end(); });
