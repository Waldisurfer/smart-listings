/**
 * Typed fetch wrappers over the Express API. The browser only ever talks to
 * /api (Vite proxy in dev) — no keys, no SDK, no CORS.
 */
export type OfferType = 'sale' | 'rent';

export interface Listing {
  id: number;
  source: 'otodom';
  source_id: string;
  offer_type: OfferType;
  source_url: string;
  title: string;
  description?: string | null;
  summary_ai: string | null;
  price: number | null;
  monthly_fee: number | null;
  price_per_m2: number | null;
  area_m2: number | null;
  rooms: number | null;
  floor: number | null;
  city: string | null;
  district: string | null;
  street: string | null;
  image_url: string | null;
  is_incomplete: 0 | 1;
  created_at: string;
}

export interface ListingFilters {
  offerType: OfferType;
  q: string;
  city: string;
  minPrice: string;
  maxPrice: string;
  minArea: string;
  maxArea: string;
  rooms: string;
  page: number;
}

export interface ListingsPage {
  items: Listing[];
  total: number;
  page: number;
  pageSize: number;
}

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export function fetchListings(filters: ListingFilters): Promise<ListingsPage> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== '' && value !== null && value !== undefined) params.set(key, String(value));
  }
  return get(`/api/listings?${params}`);
}

export function fetchListing(id: string | number): Promise<Listing> {
  return get(`/api/listings/${id}`);
}

export async function fetchCities(): Promise<string[]> {
  const { cities } = await get<{ cities: string[] }>('/api/meta/cities');
  return cities;
}
