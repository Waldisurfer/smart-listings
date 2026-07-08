/**
 * Stage 1 of the data pipeline: a one-time otodom scrape (run once by the author,
 * never by the grader). Writes raw offers to data/raw/otodom/offer-<id>.json,
 * committed to the repo so every later stage (ingest, seed) is re-runnable offline.
 *
 * Strategy: otodom is a Next.js site — every page embeds its full structured data in
 * <script id="__NEXT_DATA__">. Search pages carry ~35 typed offer items each
 * (price/area/rooms/floor/location as real values, not display strings), so we harvest
 * those directly and visit each offer's detail page ONLY for the full description.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const RAW_DIR = join(REPO_ROOT, 'data', 'raw', 'otodom');
const FAILED_DIR = join(REPO_ROOT, 'data', 'raw', 'failed');

const BASE_URL = 'https://www.otodom.pl';
// Kraków for demo density (Example A journey) + Warszawa for filter variety.
const CITIES: Record<string, string> = {
  krakow: 'malopolskie/krakow/krakow/krakow',
  warszawa: 'mazowieckie/warszawa/warszawa/warszawa',
};
const OFFER_TYPES = [
  { path: 'sprzedaz', offerType: 'sale' },
  { path: 'wynajem', offerType: 'rent' },
] as const;

const TARGET_PER_COMBO = 27; // 2 cities × 2 types × 27 ≈ 108 → ≥100 after failures
const MAX_SEARCH_PAGES = 4;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  'Accept-Language': 'pl-PL,pl;q=0.9',
};

interface SearchItem {
  id: number;
  slug: string;
  href?: string;
  title?: string;
  [key: string]: unknown;
}

const sleep = () =>
  new Promise((resolve) => setTimeout(resolve, 1000 + Math.random() * 1000));

/** Fetch with browser-like headers; retry once on failure, then throw. */
async function fetchHtml(url: string): Promise<string> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.ok) return await res.text();
      console.warn(`  ! HTTP ${res.status} (attempt ${attempt}) ${url}`);
    } catch (err) {
      console.warn(`  ! ${(err as Error).message} (attempt ${attempt}) ${url}`);
    }
    await sleep();
  }
  throw new Error(`failed after 2 attempts: ${url}`);
}

/** Pull the embedded Next.js page state — no HTML parser needed. The shape is
 *  otodom's untyped __NEXT_DATA__, so `any` is scoped to this boundary. */
function extractPageProps(html: string): Record<string, any> {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) throw new Error('__NEXT_DATA__ not found');
  return JSON.parse(match[1]).props.pageProps;
}

/** Paginate one city×type search until we have TARGET_PER_COMBO unique offers. */
async function collectSearchItems(cityPath: string, typePath: string): Promise<SearchItem[]> {
  const byId = new Map<number, SearchItem>(); // promoted offers repeat across pages — dedupe by id
  for (let page = 1; page <= MAX_SEARCH_PAGES && byId.size < TARGET_PER_COMBO; page++) {
    const url = `${BASE_URL}/pl/wyniki/${typePath}/mieszkanie/${cityPath}?page=${page}`;
    const items: SearchItem[] =
      extractPageProps(await fetchHtml(url))?.data?.searchAds?.items ?? [];
    if (items.length === 0) break; // ran out of results
    for (const item of items) {
      if (byId.size >= TARGET_PER_COMBO) break;
      if (item?.id && item?.slug) byId.set(item.id, item);
    }
    console.log(`  page ${page}: +${items.length} items (${byId.size} unique)`);
    await sleep();
  }
  return [...byId.values()];
}

/** Detail page visit — ONLY for the full description (search items carry the rest). */
async function fetchDescription(item: SearchItem): Promise<string | null> {
  const url = item.href?.startsWith('http')
    ? item.href
    : `${BASE_URL}/pl/oferta/${item.slug}`;
  try {
    const html = await fetchHtml(url);
    try {
      return extractPageProps(html)?.ad?.description ?? null;
    } catch (err) {
      // extraction failure → keep the evidence, never crash the run
      writeFileSync(join(FAILED_DIR, `${item.id}.html`), html);
      throw err;
    }
  } catch (err) {
    console.warn(`  ! description failed for ${item.id}: ${(err as Error).message}`);
    return null;
  }
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  mkdirSync(FAILED_DIR, { recursive: true });

  const counts: Record<string, number> = {};
  let skipped = 0;
  let noDescription = 0;

  for (const [city, cityPath] of Object.entries(CITIES)) {
    for (const { path, offerType } of OFFER_TYPES) {
      const combo = `${city}/${path}`;
      console.log(`\n▶ ${combo}`);
      const items = await collectSearchItems(cityPath, path);
      counts[combo] = 0;

      for (const item of items) {
        const file = join(RAW_DIR, `offer-${item.id}.json`);
        if (existsSync(file)) {
          skipped++; // resume-safe: re-runs only fetch what's missing
          continue;
        }
        const description = await fetchDescription(item);
        if (description === null) noDescription++;
        writeFileSync(
          file,
          JSON.stringify(
            { ...item, description, offerType, city, scrapedAt: new Date().toISOString() },
            null,
            2,
          ),
        );
        counts[combo]++;
        await sleep();
      }
      console.log(`  saved ${counts[combo]} offers`);
    }
  }

  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  console.log('\n── Summary ──');
  for (const [combo, n] of Object.entries(counts)) console.log(`  ${combo}: ${n}`);
  console.log(`  total new: ${total}, skipped existing: ${skipped}, missing description: ${noDescription}`);
}

main().catch((err) => {
  console.error('Scrape failed:', err);
  process.exit(1);
});
