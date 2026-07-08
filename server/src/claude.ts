/**
 * The single Claude surface: one lazily-constructed client, one MODEL constant,
 * exported wrapper functions. The browser never sees this — only ingest (our
 * machine) and the chat-search endpoint call it.
 *
 * Every wrapper returns null on ANY failure (missing key, API error, schema
 * mismatch) — the pipeline never dies on one bad listing, and the product still
 * works with no API key configured. Haiku is a deliberate cost choice: the model
 * only ever sees the residue the deterministic layer couldn't resolve.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { NormalizedListing } from './types.js';

const MODEL = 'claude-haiku-4-5';

let client: Anthropic | null = null;

/** Missing key ≠ boot crash: callers get null and degrade gracefully. */
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

const GapFillSchema = z.object({
  rooms: z.number().int().nullable(),
  area_m2: z.number().nullable(),
  floor: z.number().int().nullable(),
});

export type GapFill = z.infer<typeof GapFillSchema>;

/**
 * AI job 1: extract rooms/area/floor from the free-text description — called
 * ONLY for listings where they are still null after deterministic normalization.
 * Schema-enforced output, no prompt-begging.
 */
export async function extractFromDescription(description: string): Promise<GapFill | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 256,
      system:
        'You extract facts from Polish real-estate listing descriptions. ' +
        'Return only values stated explicitly in the text: number of rooms (pokoje), ' +
        'area in square meters (m², metry), floor number (piętro; parter = 0). ' +
        'Use null for anything the text does not state. Never guess.',
      messages: [{ role: 'user', content: description.slice(0, 6000) }],
      output_config: { format: zodOutputFormat(GapFillSchema) },
    });
    return res.parsed_output ?? null;
  } catch {
    return null;
  }
}

// Structured outputs reject optional keys, so every field is required+nullable;
// the route strips nulls before handing filters to the normal search path.
const SearchIntentSchema = z.object({
  offerType: z.enum(['sale', 'rent']).nullable(),
  q: z.string().nullable(),
  city: z.string().nullable(),
  minPrice: z.number().int().nullable(),
  maxPrice: z.number().int().nullable(),
  minArea: z.number().nullable(),
  maxArea: z.number().nullable(),
  rooms: z.number().int().nullable(),
  interpretation: z.string(),
});

export type SearchIntent = z.infer<typeof SearchIntentSchema>;

/**
 * AI job 3: vague natural language → the SAME filter JSON the manual UI
 * produces. One search implementation, two input modalities.
 */
export async function parseSearchIntent(query: string): Promise<SearchIntent | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const res = await c.messages.parse({
      model: MODEL,
      max_tokens: 400,
      system:
        'Convert a natural-language Polish real-estate search into filters. Dataset: flats for sale and rent in cities across Poland, prices in PLN (sale = total, rent = monthly). Rules: ' +
        '"cheap"/"tanie" → maxPrice at the affordable end for the implied city tier AND offer type: major metros (Warszawa, Kraków, Wrocław, Gdańsk, Poznań) sale ≈ 650000, rent ≈ 3000; smaller cities and towns sale ≈ 450000, rent ≈ 2000. With no city named, use the smaller-city figure. ' +
        '"40m"/"40m2" → minArea 40. City names may lack diacritics ("krakow" → "Kraków", "wroclaw" → "Wrocław", "gdansk" → "Gdańsk"). ' +
        'offerType: "rent" only for renting language (wynajem, wynająć, rent); null otherwise. ' +
        'NEVER invent a city that is not mentioned. Drop vague qualifiers ("nice", "ładne") unless they are concrete words likely to appear in descriptions (balkon, garaż, ogród → q). ' +
        'interpretation: ONE short sentence IN POLISH stating the filters you chose, e.g. "Szukam ofert sprzedaży w Krakowie, ≥40 m², poniżej 650 000 zł."',
      messages: [{ role: 'user', content: query.slice(0, 300) }],
      output_config: { format: zodOutputFormat(SearchIntentSchema) },
    });
    return res.parsed_output ?? null;
  } catch {
    return null;
  }
}

/**
 * AI job 2: 1–2 factual sentences for the card UI. No marketing superlatives —
 * the visible AI touch in the product stays trustworthy.
 */
export async function summarizeListing(l: NormalizedListing): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  const facts = [
    l.title,
    l.offer_type === 'rent' ? `najem ${l.price ?? '?'} PLN/mies.` : `cena ${l.price ?? '?'} PLN`,
    l.monthly_fee ? `czynsz ${l.monthly_fee} PLN` : null,
    l.area_m2 ? `${l.area_m2} m²` : null,
    l.rooms ? `${l.rooms} pok.` : null,
    l.floor !== null ? `piętro ${l.floor}` : null,
    [l.city, l.district].filter(Boolean).join(', '),
  ].filter(Boolean).join(' · ');
  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 200,
      system:
        'Napisz 1–2 zdaniowe, rzeczowe streszczenie ogłoszenia nieruchomości do karty w UI — po polsku. ' +
        'Podawaj wyłącznie fakty z wejścia. Cenę za m² wspomnij tylko, jeśli się wyróżnia. ' +
        'Bez marketingowych superlatyw („wymarzone", „idealne", „przepiękne"). Bez wstępu.',
      messages: [{
        role: 'user',
        content: `${facts}\n\nDescription:\n${(l.description ?? '').slice(0, 4000)}`,
      }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text.trim();
    return text || null;
  } catch {
    return null;
  }
}
