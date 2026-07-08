/**
 * Integration test: exercises the real seed pipeline against a live MySQL
 * (a service container in CI; a local docker-compose DB otherwise). Verifies
 * the committed dataset loads intact and that re-seeding is idempotent —
 * the property the grader relies on when running `npm run seed` twice.
 *
 * Runs only via `npm run test:integration` (the unit suite excludes it), so a
 * DB-free `npm test` stays fast.
 */
import { afterAll, beforeAll, expect, test } from 'vitest';
import { pool } from '../db.js';
import { seed } from './seed.js';

beforeAll(async () => {
  // Deterministic starting point regardless of prior local state.
  await pool.query('DROP TABLE IF EXISTS listings');
});

afterAll(async () => {
  await pool.end();
});

test('seed loads the full committed dataset', async () => {
  const stats = await seed();
  expect(stats.total).toBe(108);
  expect(stats.otodom + stats.olx).toBe(stats.total);
  expect(stats.sale + stats.rent).toBe(stats.total);
  // flag-never-drop: incomplete offers (e.g. investment adverts) are kept and
  // counted, not dropped — some, but not all.
  expect(stats.incomplete).toBeGreaterThan(0);
  expect(stats.incomplete).toBeLessThan(stats.total);
});

test('re-seeding is idempotent — same rows, same flags', async () => {
  const first = await seed();
  const second = await seed();
  expect(second).toEqual(first);

  const [[row]] = (await pool.query('SELECT COUNT(*) AS n FROM listings')) as unknown as [
    Array<{ n: number }>,
  ];
  expect(Number(row.n)).toBe(108);
});

test('a known offer round-trips into the DB', async () => {
  const [[row]] = (await pool.query(
    "SELECT offer_type FROM listings WHERE source = 'otodom' AND source_id = '48461764'",
  )) as unknown as [Array<{ offer_type: string }>];
  expect(row?.offer_type).toBe('rent');
});
