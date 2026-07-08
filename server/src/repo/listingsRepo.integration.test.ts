/**
 * Integration test for the data layer: seeds the committed dataset into a live
 * MySQL, then drives the filter/pagination logic and the raw-snapshot fence.
 * Runs only via `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { pool } from '../db.js';
import { seed } from '../pipeline/seed.js';
import type { OfferType } from '../types.js';
import {
  findById,
  findListings,
  getDistinctCities,
  type ListingFilters,
} from './listingsRepo.js';

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
  test('filters by offer type — both types present, none leaked', async () => {
    const sale = await findListings(q({ offerType: 'sale', pageSize: 200 }));
    const rent = await findListings(q({ offerType: 'rent', pageSize: 200 }));
    expect(sale.total).toBeGreaterThan(0);
    expect(rent.total).toBeGreaterThan(0);
    expect(sale.items.every((i) => i.offer_type === 'sale')).toBe(true);
    expect(rent.items.every((i) => i.offer_type === 'rent')).toBe(true);
  });

  test('city filter returns only that city', async () => {
    // Pick a real (city, offer_type) pair from the nationwide sample: a small
    // city may hold only sale OR only rent, so the query must use that row's own
    // offer type — filtering by the default 'sale' could otherwise hit a
    // rent-only city and return nothing.
    const [[row]] = (await pool.query(
      'SELECT city, offer_type FROM listings WHERE city IS NOT NULL AND is_duplicate = FALSE LIMIT 1',
    )) as unknown as [Array<{ city: string; offer_type: OfferType }>];
    const { city, offer_type } = row!;
    const { items, total } = await findListings(q({ city, offerType: offer_type, pageSize: 200 }));
    expect(total).toBeGreaterThan(0);
    expect(items.every((i) => i.city === city)).toBe(true);
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
    const all = await findListings(q({ offerType: 'sale', pageSize: 200 }));
    const page = await findListings(q({ offerType: 'sale', pageSize: 5, page: 1 }));
    expect(page.items.length).toBe(Math.min(5, all.total));
    expect(page.total).toBe(all.total); // page size doesn't change the total
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

describe('getDistinctCities', () => {
  test('returns a sorted, de-duplicated, non-empty list', async () => {
    const cities = await getDistinctCities();
    expect(cities.length).toBeGreaterThan(0);
    expect(new Set(cities).size).toBe(cities.length); // no duplicates
    // Polish-collated order (ł after l, ó after o …), not raw code-point sort.
    const collator = new Intl.Collator('pl');
    expect([...cities].sort((a, b) => collator.compare(a, b))).toEqual(cities);
    expect(cities.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
  });
});
