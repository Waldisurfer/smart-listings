import { beforeAll, expect, test } from 'vitest';
import { extractFromDescription, parseSearchIntent, summarizeListing } from './claude.js';
import type { NormalizedListing } from './types.js';

// Graceful degradation (FR-15): with no API key, every wrapper returns null
// instead of throwing — the ingest run and the chat box both survive it. Force
// the key unset so this never makes a real API call.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

const listing: NormalizedListing = {
  source: 'otodom', source_id: '1', offer_type: 'sale', source_url: 'https://x',
  title: 't', description: 'd', summary_ai: null, price: 600000, monthly_fee: null,
  price_per_m2: null, area_m2: 40, rooms: 2, floor: 1, city: 'Kraków', district: null,
  street: null, image_url: null, is_incomplete: false, dedupe_hash: null,
};

test('every AI wrapper returns null when no API key is configured', async () => {
  expect(await extractFromDescription('dwa pokoje, 40 m2')).toBeNull();
  expect(await parseSearchIntent('tanie mieszkanie w Krakowie')).toBeNull();
  expect(await summarizeListing(listing)).toBeNull();
});
