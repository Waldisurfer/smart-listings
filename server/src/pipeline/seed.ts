/**
 * Stage 3: data/enriched/listings.json → MySQL. The ONLY pipeline stage run at
 * runtime — zero network, zero API key, idempotent by construction:
 *
 * - Hard dedupe: UNIQUE (source, source_id) + INSERT … ON DUPLICATE KEY UPDATE
 *   → re-running seed can never create a second row for the same offer.
 * - Fuzzy dedupe: rows sharing a dedupe_hash with an earlier row get
 *   is_duplicate = TRUE (flag, never delete — still in DB, inspectable).
 *   Flags are recomputed from scratch each run, so seed twice = same state.
 *
 * `seed()` is exported (and never closes the pool) so the integration test can
 * drive it; the script entrypoint below owns the pool lifecycle.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureSchema, pool } from '../db.js';
import type { NormalizedListing } from '../types.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENRICHED = join(REPO_ROOT, 'data', 'enriched', 'listings.json');

const UPSERT = `
  INSERT INTO listings (
    source, source_id, offer_type, source_url, title, description, summary_ai,
    price, monthly_fee, price_per_m2, area_m2, rooms, floor,
    city, district, street, image_url, is_incomplete, dedupe_hash, raw_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    offer_type = VALUES(offer_type), source_url = VALUES(source_url),
    title = VALUES(title), description = VALUES(description),
    summary_ai = VALUES(summary_ai), price = VALUES(price),
    monthly_fee = VALUES(monthly_fee), price_per_m2 = VALUES(price_per_m2),
    area_m2 = VALUES(area_m2), rooms = VALUES(rooms), floor = VALUES(floor),
    city = VALUES(city), district = VALUES(district), street = VALUES(street),
    image_url = VALUES(image_url), is_incomplete = VALUES(is_incomplete),
    dedupe_hash = VALUES(dedupe_hash), raw_json = VALUES(raw_json)
`;

export interface SeedStats {
  total: number;
  otodom: number;
  sale: number;
  rent: number;
  incomplete: number;
  duplicates: number;
}

/**
 * Fuzzy-dedupe pass: rows sharing a dedupe_hash with an earlier (lower-id) row
 * are flagged is_duplicate = TRUE; the MIN(id) row per hash is kept. Recomputed
 * from scratch (reset to FALSE first) so re-running never leaves a stale flag.
 * Exported so the integration test can drive it against a controlled collision.
 */
export async function flagDuplicates(): Promise<void> {
  await pool.query('UPDATE listings SET is_duplicate = FALSE');
  await pool.query(`
    UPDATE listings l
    JOIN (
      SELECT dedupe_hash, MIN(id) AS keeper_id
      FROM listings
      WHERE dedupe_hash IS NOT NULL
      GROUP BY dedupe_hash
      HAVING COUNT(*) > 1
    ) dupes ON l.dedupe_hash = dupes.dedupe_hash AND l.id <> dupes.keeper_id
    SET l.is_duplicate = TRUE
  `);
}

export async function seed(): Promise<SeedStats> {
  const listings: NormalizedListing[] = JSON.parse(readFileSync(ENRICHED, 'utf-8'));

  await ensureSchema();

  for (const l of listings) {
    await pool.execute(UPSERT, [
      l.source, l.source_id, l.offer_type, l.source_url, l.title, l.description,
      l.summary_ai, l.price, l.monthly_fee, l.price_per_m2, l.area_m2, l.rooms,
      l.floor, l.city, l.district, l.street, l.image_url, l.is_incomplete,
      l.dedupe_hash, JSON.stringify(l),
    ]);
  }

  await flagDuplicates();

  const [[row]] = (await pool.query(`
    SELECT COUNT(*) AS total,
      SUM(source = 'otodom') AS otodom,
      SUM(offer_type = 'sale') AS sale, SUM(offer_type = 'rent') AS rent,
      SUM(is_incomplete) AS incomplete, SUM(is_duplicate) AS duplicates
    FROM listings
  `)) as unknown as [Array<Record<string, number>>];

  return {
    total: Number(row.total),
    otodom: Number(row.otodom),
    sale: Number(row.sale),
    rent: Number(row.rent),
    incomplete: Number(row.incomplete),
    duplicates: Number(row.duplicates),
  };
}

// Script entrypoint (`npm run seed`) — owns the pool lifecycle.
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  seed()
    .then((s) => {
      console.log(
        `Seeded ${s.total} listings ` +
          `(otodom ${s.otodom} · sale ${s.sale} / rent ${s.rent} · ` +
          `${s.incomplete} incomplete, ${s.duplicates} duplicates flagged)`,
      );
      return pool.end();
    })
    .catch((err) => {
      console.error('seed failed:', err);
      process.exit(1);
    });
}
