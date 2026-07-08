/**
 * Integration test for the data layer: seeds the committed dataset into a live
 * MySQL, then drives the filter/pagination logic and the raw-snapshot fence.
 * Runs only via `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../db.js';
import { seed } from '../pipeline/seed.js';
import { findById, findListings, type ListingFilters } from './listingsRepo.js';

const q = (over: Partial<ListingFilters> = {}): ListingFilters => ({
  offerType: 'sale',
  page: 1,
  pageSize: 20,
  ...over,
});

beforeAll(async () => {
  await pool.query('DROP TABLE IF EXISTS listings');
  await seed();
});

afterAll(async () => {
  await pool.end();
});

describe('findListings', () => {
  test('filters by offer type — 54 sale, 54 rent (0 duplicates in the set)', async () => {
    expect((await findListings(q({ offerType: 'sale', pageSize: 200 }))).total).toBe(54);
    expect((await findListings(q({ offerType: 'rent', pageSize: 200 }))).total).toBe(54);
  });

  test('city filter returns only that city', async () => {
    const { items, total } = await findListings(q({ city: 'Kraków', pageSize: 200 }));
    expect(total).toBeGreaterThan(0);
    expect(items.every((i) => i.city === 'Kraków')).toBe(true);
  });

  test('a narrower price range never returns more, and bounds every row', async () => {
    const all = await findListings(q({ offerType: 'sale', pageSize: 200 }));
    const ranged = await findListings(
      q({ offerType: 'sale', minPrice: 500_000, maxPrice: 800_000, pageSize: 200 }),
    );
    expect(ranged.total).toBeLessThanOrEqual(all.total);
    expect(ranged.items.every((i) => i.price !== null && i.price >= 500_000 && i.price <= 800_000)).toBe(true);
  });

  test('rooms filter is ">= n" and excludes unknown rooms', async () => {
    const { items } = await findListings(q({ rooms: 3, pageSize: 200 }));
    expect(items.every((i) => i.rooms !== null && i.rooms >= 3)).toBe(true);
  });

  test('pagination caps the page and preserves the total', async () => {
    const { items, total } = await findListings(q({ offerType: 'sale', pageSize: 5, page: 1 }));
    expect(items.length).toBe(5);
    expect(total).toBe(54);
  });

  test('list rows never carry the raw snapshot', async () => {
    const { items } = await findListings(q({ pageSize: 1 }));
    expect(items[0]).toBeDefined();
    expect('raw_json' in items[0]!).toBe(false);
  });
});

describe('findById', () => {
  test('returns a detail row with description, without the raw snapshot', async () => {
    const row = await findById(1);
    expect(row).not.toBeNull();
    expect(row!.description).not.toBeUndefined();
    expect('raw_json' in row!).toBe(false);
  });

  test('returns null for a missing id', async () => {
    expect(await findById(99_999_999)).toBeNull();
  });
});
