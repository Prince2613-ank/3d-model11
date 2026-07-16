require("dotenv").config();
const { Pool } = require("pg");

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run set-admin -- user@example.com");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const result = await pool.query(
    `update profiles
     set role = 'admin', is_active = true, updated_at = now()
     where lower(email) = $1 and deleted_at is null
     returning email, role, is_active`,
    [email]
  );

  if (result.rowCount === 0) {
    throw new Error(`No active profile found for ${email}. Sign in once before granting admin access.`);
  }

  const profile = result.rows[0];
  console.log(`Admin access granted: ${profile.email} (${profile.role}, active=${profile.is_active})`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
