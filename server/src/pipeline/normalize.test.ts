import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  computeDedupeHash,
  normalizeOtodom,
  parseFloor,
  parsePrice,
  parseRooms,
  stripHtml,
} from './normalize.js';

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', `${name}.json`),
      'utf-8',
    ),
  );

describe('parseRooms', () => {
  test('maps otodom word enums, case-insensitively', () => {
    expect(parseRooms('THREE')).toBe(3);
    expect(parseRooms('four')).toBe(4);
    expect(parseRooms('ONE')).toBe(1);
  });

  test('clamps "10+" to 10 and passes numbers through', () => {
    expect(parseRooms('10+')).toBe(10);
    expect(parseRooms(3)).toBe(3);
  });

  test('returns null for missing or unrecognized input', () => {
    expect(parseRooms(null)).toBeNull();
    expect(parseRooms(undefined)).toBeNull();
    expect(parseRooms('penthouse')).toBeNull();
  });
});

describe('parseFloor', () => {
  test('maps otodom enums: GROUND=0, ordinals, ABOVE_TENTH=11, CELLAR=-1', () => {
    expect(parseFloor('GROUND')).toBe(0);
    expect(parseFloor('FIRST')).toBe(1);
    expect(parseFloor('TENTH')).toBe(10);
    expect(parseFloor('ABOVE_TENTH')).toBe(11);
    expect(parseFloor('CELLAR')).toBe(-1);
  });

  test('returns null for missing or unrecognized input', () => {
    expect(parseFloor(null)).toBeNull();
    expect(parseFloor('attic-ish')).toBeNull();
  });
});

describe('parsePrice', () => {
  test('rounds numbers and digs digits out of display strings', () => {
    expect(parsePrice(490160)).toBe(490160);
    expect(parsePrice(2022.3)).toBe(2022);
    expect(parsePrice('951 000 zł')).toBe(951000);
  });

  test('returns null for missing or digit-free input', () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice('Zapytaj o cenę')).toBeNull();
  });
});

describe('stripHtml', () => {
  test('removes tags, decodes entities, collapses whitespace', () => {
    expect(stripHtml('<ul><li>2 pokoje</li><li>balkon &amp; taras</li></ul>')).toBe(
      '2 pokoje balkon & taras',
    );
    expect(stripHtml('<p>50&nbsp;m&#178;   blisko\n\ncentrum</p>')).toBe('50 m² blisko centrum');
  });

  test('is null-safe', () => {
    expect(stripHtml(null)).toBeNull();
  });
});

describe('computeDedupeHash', () => {
  const base = {
    offer_type: 'sale',
    city: 'Kraków',
    district: 'Dębniki',
    price: 599000,
    area_m2: 42,
  } as const;

  test('is stable and case-insensitive on city', () => {
    expect(computeDedupeHash({ ...base })).toBe(computeDedupeHash({ ...base, city: 'kraków' }));
  });

  test('sale: tolerates prices within the same 5000 bucket, splits across buckets', () => {
    expect(computeDedupeHash({ ...base, price: 601000 })).toBe(computeDedupeHash({ ...base }));
    expect(computeDedupeHash({ ...base, price: 650000 })).not.toBe(computeDedupeHash({ ...base }));
  });

  test('rent: uses a 250 zł bucket, so typical rentals do NOT lump together', () => {
    const rent = { ...base, offer_type: 'rent', price: 3000 } as const;
    expect(computeDedupeHash({ ...rent, price: 3050 })).toBe(computeDedupeHash(rent));
    expect(computeDedupeHash({ ...rent, price: 3400 })).not.toBe(computeDedupeHash(rent));
  });

  test('different districts never collide (same size, same price, other flat)', () => {
    expect(computeDedupeHash({ ...base, district: 'Podgórze' })).not.toBe(
      computeDedupeHash({ ...base }),
    );
  });

  test('a rental never collides with a sale at the same rounded values', () => {
    expect(computeDedupeHash({ ...base, offer_type: 'rent' })).not.toBe(
      computeDedupeHash({ ...base }),
    );
  });

  test('returns null when both price and area are missing — fuzzy dedupe does not apply', () => {
    expect(
      computeDedupeHash({ ...base, price: null, area_m2: null }),
    ).toBeNull();
  });
});

describe('normalizeOtodom', () => {
  test('sale offer with czynsz → complete listing', () => {
    const l = normalizeOtodom(fixture('otodom-sale'));
    expect(l).toMatchObject({
      source: 'otodom',
      source_id: '64830051',
      offer_type: 'sale',
      source_url: 'https://www.otodom.pl/pl/oferta/bezposrednio-sprzedam-apartament-ul-topografow-ID4o1fZ',
      price: 599000,
      monthly_fee: 350, // czynsz on a SALE offer — real Polish-market quirk
      area_m2: 42,
      rooms: 2,
      floor: 2,
      city: 'Kraków',
      district: 'Dębniki',
      street: 'ul. Topografów',
      is_incomplete: false,
      summary_ai: null,
    });
    expect(l.price_per_m2).toBe(14262); // rounded from otodom's 14261.9
    expect(l.description).not.toMatch(/<[a-z]/i); // HTML stripped
    expect(l.image_url).toMatch(/^https:\/\//);
  });

  test('rent offer → monthly price + czynsz, GROUND floor = 0', () => {
    const l = normalizeOtodom(fixture('otodom-rent'));
    expect(l).toMatchObject({
      offer_type: 'rent',
      price: 4400,
      monthly_fee: 722,
      floor: 0,
      district: 'Grzegórzki',
      is_incomplete: false,
    });
  });

  test('payload transaction field beats the URL-derived scraper tag', () => {
    const sale = fixture('otodom-sale');
    // a rent item leaking into sale search results gets classified by its own metadata
    expect(normalizeOtodom({ ...sale, transaction: 'RENT' }).offer_type).toBe('rent');
    // without the field, the scraper's URL-derived tag still decides
    expect(normalizeOtodom({ ...sale, transaction: undefined, offerType: 'rent' }).offer_type).toBe('rent');
  });

  test('investment advert → nulls + is_incomplete flag (flag, never drop)', () => {
    const l = normalizeOtodom(fixture('otodom-investment'));
    expect(l).toMatchObject({
      source_id: '66295469',
      price: null,
      area_m2: null,
      rooms: null,
      price_per_m2: null,
      city: 'Kraków',
      is_incomplete: true,
      dedupe_hash: null, // nothing to fuzzy-match on → excluded from dedupe
    });
    expect(l.title).toContain('Piasta Towers');
  });
});
