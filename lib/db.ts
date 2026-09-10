import pg from "pg";
const { Pool } = pg;
export const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000 }) : null;
export function requirePool() { if (!pool) throw new Error("DATABASE_URL is not configured."); return pool; }
