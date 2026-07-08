/**
 * MySQL pool + schema bootstrap. `ensureSchema()` applies db/schema.sql
 * (CREATE TABLE IF NOT EXISTS) behind a boot-time connect retry, so there is no
 * migration step to forget and `docker compose up -d` racing MySQL's first-boot
 * init never kills the run. Defaults match docker-compose.yml — zero .env setup.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import mysql from 'mysql2/promise';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(HERE, '..', 'db', 'schema.sql');

// Load .env (repo root) before the pool reads DB_* below, so a plain
// `npm run seed` / `npm start` honors DB_HOST/DB_PORT overrides — not just the
// entrypoints that load it themselves (index.ts, ingest.ts). Missing file is a
// no-op, preserving the zero-.env-setup default. dotenv never overrides vars
// already set in the environment, so an explicit `DB_PORT=… npm run …` still wins.
loadEnv({ path: join(HERE, '..', '..', '.env'), quiet: true });

const CONNECT_RETRIES = 10;
const RETRY_DELAY_MS = 1500;

export const pool = mysql.createPool({
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? 'listings',
  database: process.env.DB_NAME ?? 'listings',
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true, // DECIMAL area_m2 comes back as a number, not a string
});

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function ensureSchema(): Promise<void> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    try {
      await pool.query('SELECT 1');
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < CONNECT_RETRIES) {
        console.log(`  MySQL not ready (attempt ${attempt}/${CONNECT_RETRIES}), retrying…`);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }
  if (lastError) {
    throw new Error(
      `Could not reach MySQL after ${CONNECT_RETRIES} attempts — is "docker compose up -d" running? (${lastError})`,
    );
  }
  // schema.sql must stay a SINGLE statement: the pool has no multipleStatements,
  // so only the first statement in this string would execute. If the schema ever
  // needs a second statement (an ALTER, a separate index), split and run each, or
  // enable multipleStatements on the pool — a silent partial-apply otherwise.
  await pool.query(readFileSync(SCHEMA_PATH, 'utf-8'));
}
