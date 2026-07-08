/**
 * Pure gap-fill merge (deterministic-wins). The deterministic normalizer runs
 * first; AI-extracted rooms/area/floor fill ONLY the fields that are still null —
 * the model can never override a value code already resolved. A newly-filled
 * area cascades into the derived price_per_m2, the completeness flag, and the
 * dedupe hash. No I/O, no SDK: the unit test drives this directly.
 */
import type { GapFill } from '../claude.js';
import type { NormalizedListing } from '../types.js';
import { computeDedupeHash } from './normalize.js';

export function applyGapFill(listing: NormalizedListing, filled: GapFill): NormalizedListing {
  const merged: NormalizedListing = {
    ...listing,
    rooms: listing.rooms ?? filled.rooms,
    area_m2: listing.area_m2 ?? filled.area_m2,
    floor: listing.floor ?? filled.floor,
  };
  // A newly-filled area changes everything derived from it.
  return {
    ...merged,
    price_per_m2:
      merged.price_per_m2 ??
      (merged.price !== null && merged.area_m2
        ? Math.round(merged.price / merged.area_m2)
        : null),
    is_incomplete: !(merged.price !== null && merged.area_m2 !== null && merged.city !== null),
    dedupe_hash: computeDedupeHash(merged),
  };
}
