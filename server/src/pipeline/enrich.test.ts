import { describe, expect, test } from 'vitest';
import type { GapFill } from '../claude.js';
import type { NormalizedListing } from '../types.js';
import { applyGapFill } from './enrich.js';

// A sale listing with price + city known but area/rooms/floor still missing —
// the exact shape gap-fill exists to complete.
const base: NormalizedListing = {
  source: 'otodom',
  source_id: '1',
  offer_type: 'sale',
  source_url: 'https://www.otodom.pl/pl/oferta/x',
  title: 'Mieszkanie, Dębniki',
  description: 'dwa pokoje, 40 m2, drugie piętro',
  summary_ai: null,
  price: 600000,
  monthly_fee: null,
  price_per_m2: null,
  area_m2: null,
  rooms: null,
  floor: null,
  city: 'Kraków',
  district: 'Dębniki',
  street: null,
  image_url: null,
  is_incomplete: true,
  dedupe_hash: null,
};

describe('applyGapFill', () => {
  test('fills only null fields — AI never overrides a deterministic value', () => {
    const listing = { ...base, rooms: 3 }; // rooms already resolved by code
    const filled: GapFill = { rooms: 9, area_m2: 42, floor: 2 };
    const out = applyGapFill(listing, filled);
    expect(out.rooms).toBe(3); // kept, not overridden by the model's 9
    expect(out.area_m2).toBe(42); // filled (was null)
    expect(out.floor).toBe(2); // filled (was null)
  });

  test('a filled area recomputes price_per_m2, completeness, and dedupe hash', () => {
    const filled: GapFill = { rooms: 2, area_m2: 40, floor: null };
    const out = applyGapFill(base, filled);
    expect(out.area_m2).toBe(40);
    expect(out.price_per_m2).toBe(15000); // 600000 / 40
    expect(out.is_incomplete).toBe(false); // price + area + city all present now
    expect(out.dedupe_hash).not.toBeNull(); // now has price + area to hash on
  });

  test('AI returning all nulls leaves the listing incomplete, not fabricated', () => {
    const filled: GapFill = { rooms: null, area_m2: null, floor: null };
    const out = applyGapFill(base, filled);
    expect(out.rooms).toBeNull();
    expect(out.area_m2).toBeNull();
    expect(out.is_incomplete).toBe(true); // still missing area — never guessed
    // dedupe_hash stays derivable from the known price — computeDedupeHash only
    // returns null when BOTH price and area are missing (covered in its own tests).
  });
});
