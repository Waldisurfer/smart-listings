/**
 * Stage 2a of the pipeline: deterministic normalization — pure functions, no I/O.
 * Maps a raw scraped otodom offer onto NormalizedListing (the schema shape).
 * No AI here: everything below is derivable by plain code; the model only gets
 * involved later, for the fields that are STILL null after this pass.
 *
 * Parsers accept otodom's word/enum encodings ("THREE", "GROUND", "ABOVE_TENTH")
 * case-insensitively, and fall back to numeric forms.
 */
import { createHash } from 'node:crypto';
import type { NormalizedListing, OfferType } from '../types.js';

const ROOM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export function parseRooms(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value === '') return null;
  const word = ROOM_WORDS[value.toLowerCase()];
  if (word) return word;
  if (value.includes('+')) return parseInt(value, 10) || null; // "10+" → 10
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

const FLOOR_ORDINALS: Record<string, number> = {
  ground: 0,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  above_tenth: 11,
  cellar: -1,
};

export function parseFloor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value === '') return null;
  const key = value.toLowerCase();
  if (key in FLOOR_ORDINALS) return FLOOR_ORDINALS[key];
  return null;
}

/** Number → rounded int; display string ("951 000 zł") → digits; else null. */
export function parsePrice(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : null;
}

const NAMED_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z]+;/gi, (entity) => NAMED_ENTITIES[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

interface DedupeFields {
  offer_type: OfferType | string;
  city: string | null;
  district: string | null;
  price: number | null;
  area_m2: number | null;
}

/**
 * Fuzzy identity for the second dedupe tier: catches the same flat re-posted
 * under a new id — or cross-posted on the other portal.
 *
 * Tuned against the real dataset (an earlier naive version lumped unrelated
 * rentals and all investment adverts together):
 * - price bucket is offer_type-scaled: 5 000 PLN for sale, 250 PLN for rent
 * - district participates (different district = different flat)
 * - no price AND no area → null: fuzzy dedupe doesn't apply where there is
 *   nothing to match on. A missed duplicate shows twice (harmless); a false
 *   positive hides a real listing (not acceptable).
 */
export function computeDedupeHash(l: DedupeFields): string | null {
  const hasPrice = l.price !== null && l.price !== undefined;
  const hasArea = l.area_m2 !== null && l.area_m2 !== undefined;
  if (!hasPrice && !hasArea) return null;

  const bucketSize = l.offer_type === 'rent' ? 250 : 5000;
  const parts = [
    l.offer_type,
    l.city?.toLowerCase() ?? 'no-city',
    l.district?.toLowerCase() ?? 'no-district',
    hasPrice ? Math.round((l.price as number) / bucketSize) : 'no-price',
    hasArea ? Math.round(l.area_m2 as number) : 'no-area',
  ];
  return createHash('md5').update(parts.join('|')).digest('hex');
}

/** Raw otodom offer (search item + our scraper's description/offerType) → schema shape. */
export function normalizeOtodom(raw: Record<string, any>): NormalizedListing {
  const money = (field: string): number | null => parsePrice(raw[field]?.value);

  const address = raw.location?.address ?? {};
  const city: string | null = address.city?.name ?? null;
  const district: string | null =
    raw.location?.reverseGeocoding?.locations?.find(
      (loc: { locationLevel?: string }) => loc.locationLevel === 'district',
    )?.name ?? null;

  // The payload's own transaction field beats the URL-derived scraper tag when
  // both exist (agrees 108/108 in the committed raw set — this only matters if
  // a search page ever leaks a mislabeled item into the other listing type).
  const offerType: OfferType =
    raw.transaction === 'RENT' ? 'rent'
    : raw.transaction === 'SELL' ? 'sale'
    : raw.offerType === 'rent' ? 'rent' : 'sale';
  const price = money('totalPrice');
  const area = typeof raw.areaInSquareMeters === 'number' ? raw.areaInSquareMeters : null;
  const derivedPricePerM2 = price !== null && area ? Math.round(price / area) : null;

  const listing: NormalizedListing = {
    source: 'otodom',
    source_id: String(raw.id),
    offer_type: offerType,
    source_url: `https://www.otodom.pl/pl/oferta/${raw.slug}`,
    title: String(raw.title ?? '').trim(),
    description: stripHtml(raw.description),
    summary_ai: null,
    price,
    monthly_fee: money('rentPrice'), // czynsz — present on sale offers too
    price_per_m2: money('pricePerSquareMeter') ?? derivedPricePerM2,
    area_m2: area,
    rooms: parseRooms(raw.roomsNumber),
    floor: parseFloor(raw.floorNumber),
    city,
    district,
    street: address.street?.name || null,
    image_url: raw.images?.[0]?.medium ?? raw.images?.[0]?.large ?? null,
    is_incomplete: !(price !== null && area !== null && city !== null),
    dedupe_hash: null,
  };
  return { ...listing, dedupe_hash: computeDedupeHash(listing) };
}
