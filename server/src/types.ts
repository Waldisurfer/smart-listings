export type OfferType = 'sale' | 'rent';

/**
 * The single shape every pipeline stage speaks after normalization —
 * mirrors the `listings` table in db/schema.sql.
 * `price` semantics: total PLN for sale, monthly PLN for rent.
 */
export interface NormalizedListing {
  source: 'otodom';
  source_id: string;
  offer_type: OfferType;
  source_url: string;
  title: string;
  description: string | null;
  summary_ai: string | null; // filled by ingest (AI stage), null here
  price: number | null;
  monthly_fee: number | null; // czynsz — appears on BOTH sale and rent offers
  price_per_m2: number | null;
  area_m2: number | null;
  rooms: number | null;
  floor: number | null;
  city: string | null;
  district: string | null;
  street: string | null;
  image_url: string | null;
  is_incomplete: boolean; // missing any of price/area/city — flag, never drop
  dedupe_hash: string | null; // null when price+area both missing — fuzzy dedupe N/A
}
