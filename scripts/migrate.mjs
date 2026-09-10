import fs from "node:fs/promises";
import pg from "pg";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is missing. Add a PostgreSQL connection string to .env, for example: DATABASE_URL=postgres://user:password@localhost:5432/price_check");
}
let parsed;
try { parsed = new URL(connectionString); } catch { throw new Error("DATABASE_URL is not a valid PostgreSQL URL."); }
if (!parsed.password && !process.env.PGPASSWORD) {
  throw new Error("PostgreSQL password is missing. Put it in DATABASE_URL or set PGPASSWORD.");
}
const pool = new pg.Pool({ connectionString });
await pool.query(await fs.readFile(new URL("../db/migrations/001_initial.sql", import.meta.url), "utf8"));
await pool.end();
console.log("Migration complete");
