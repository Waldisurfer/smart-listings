/**
 * The data-access layer: typed functions over raw parameterized SQL. Injection
 * safety comes from `?` placeholders — never string interpolation of values. The
 * WHERE clause is built incrementally: conditions[] and params[] grow in lockstep,
 * so the query shape is code-reviewable at a glance and every value is bound.
 *
 * Column allowlists (LIST_COLUMNS / DETAIL_COLUMNS) are the raw-snapshot fence:
 * `raw_json` is NEVER selected into an API response — it stays in the DB for
 * inspection only. No `SELECT *` on this table, ever.
 */
import type { RowDataPacket } from 'mysql2/promise';
import { pool } from '../db.js';
import type { NormalizedListing, OfferType } from '../types.js';

export interface ListingFilters {
  offerType: OfferType;
  source?: 'otodom' | 'olx';
  q?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  rooms?: number; // ">= rooms" semantics: 3 means "3+"
  page: number;
  pageSize: number;
}

// mysql2 returns BOOLEAN columns as 0 | 1, so is_incomplete is narrowed here
// (Omit avoids the boolean & 0|1 → never intersection with NormalizedListing).
export type ListingRow = Omit<NormalizedListing, 'is_incomplete'> & {
  id: number;
  is_incomplete: 0 | 1;
  is_duplicate: 0 | 1;
  created_at: string;
};

/** Card view needs neither the full description nor the raw snapshot. */
const LIST_COLUMNS = `
  id, source, source_id, offer_type, source_url, title, summary_ai,
  price, monthly_fee, price_per_m2, area_m2, rooms, floor,
  city, district, street, image_url, is_incomplete, created_at
`;

/** Detail view adds the full description — but still never the raw snapshot. */
const DETAIL_COLUMNS = `${LIST_COLUMNS}, description`;

export async function findListings(
  f: ListingFilters,
): Promise<{ items: ListingRow[]; total: number }> {
  // Duplicates are excluded from every list result — still in the DB, inspectable.
  const conditions: string[] = ['is_duplicate = FALSE', 'offer_type = ?'];
  const params: unknown[] = [f.offerType];

  if (f.source) {
    conditions.push('source = ?');
    params.push(f.source);
  }
  if (f.q) {
    conditions.push('(title LIKE ? OR description LIKE ?)'); // LIKE is correct at n≈100
    params.push(`%${f.q}%`, `%${f.q}%`);
  }
  if (f.city) {
    conditions.push('city = ?'); // collation makes this case- and accent-insensitive
    params.push(f.city);
  }
  if (f.minPrice !== undefined) {
    conditions.push('price >= ?');
    params.push(f.minPrice);
  }
  if (f.maxPrice !== undefined) {
    conditions.push('price <= ?');
    params.push(f.maxPrice);
  }
  if (f.minArea !== undefined) {
    conditions.push('area_m2 >= ?');
    params.push(f.minArea);
  }
  if (f.maxArea !== undefined) {
    conditions.push('area_m2 <= ?');
    params.push(f.maxArea);
  }
  if (f.rooms !== undefined) {
    conditions.push('rooms >= ?');
    params.push(f.rooms);
  }

  const where = conditions.join(' AND ');

  const [countRows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM listings WHERE ${where}`,
    params,
  );
  const total = Number(countRows[0]!.total);

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${LIST_COLUMNS} FROM listings WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...params, f.pageSize, (f.page - 1) * f.pageSize],
  );
  return { items: rows as ListingRow[], total };
}

export async function findById(id: number): Promise<ListingRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT ${DETAIL_COLUMNS} FROM listings WHERE id = ?`,
    [id],
  );
  return (rows[0] as ListingRow) ?? null;
}

/** Distinct cities present in the (non-duplicate) data — drives the city filter,
 *  since the nationwide sample's cities aren't known ahead of time. Ordered in JS
 *  with a Polish collator: MySQL's accent-insensitive default collation lumps
 *  ł/ó/ś with their ASCII bases, whereas Polish readers expect ł after l, ó after
 *  o, etc. Sorting here also keeps the order stable across MySQL image/collation
 *  changes rather than depending on the server's default. */
export async function getDistinctCities(): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT city FROM listings
     WHERE city IS NOT NULL AND is_duplicate = FALSE`,
  );
  const collator = new Intl.Collator('pl');
  return rows.map((r) => r.city as string).sort((a, b) => collator.compare(a, b));
}
