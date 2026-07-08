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
// Scope: the whole country. Random page offsets across the national result set
// (thousands of pages) return offers from random cities — that is how "random
// ~100" is met. Each offer's city comes from its own payload, so no city is
// fixed here; the committed snapshot spans ~40 cities nationwide.
//
// The ONE dimension deliberately held even is offer type: otodom's national
// inventory is ~6× more sale than rent, so a proportional draw would leave a
// dozen rentals and a lopsided filter. Collecting TARGET_PER_TYPE of each keeps
// both sides of the sale/rent filter well-populated. Cities stay fully random.
const SCOPE = 'cala-polska';
const OFFER_TYPES = [
  { path: 'sprzedaz', offerType: 'sale' },
  { path: 'wynajem', offerType: 'rent' },
] as const;

const TARGET_PER_TYPE = 54; // balanced by design: 2 offer types × 54 ≈ 108 → ≥100 after failures
const SAMPLE_PAGES = 8; // random page offsets pooled per type, then shuffled
const OVER_COLLECT = TARGET_PER_TYPE * 2; // stop early once there is plenty to shuffle from

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

/**
 * `count` distinct random page numbers in [2, totalPages]. Page 1 is excluded
 * on purpose: it is the promoted, top-of-list block and is fetched separately
 * only as a size probe, so it must never re-enter the random sample.
 */
function randomPages(totalPages: number, count: number): number[] {
  if (totalPages < 2) return []; // only page 1 exists — nothing to sample past the promoted block
  const span = totalPages - 1; // pages 2..totalPages
  const picked = new Set<number>();
  const cap = Math.min(count, span);
  while (picked.size < cap) picked.add(2 + Math.floor(Math.random() * span));
  return [...picked];
}

/** Fisher-Yates shuffle in place. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Random sampling for one offer type at the given scope. Page 1 reveals the
 * result size; we then pool items from SAMPLE_PAGES RANDOM offsets across pages
 * 2..totalPages and shuffle. "random ~100" means the sample must not be the
 * first (promoted-heavy) results — random page offsets over the national range
 * spread it across the whole country. Page 1 is never sampled, so the promoted
 * block never biases the set.
 */
async function collectSearchItems(scopePath: string, typePath: string): Promise<SearchItem[]> {
  const pageUrl = (p: number) =>
    `${BASE_URL}/pl/wyniki/${typePath}/mieszkanie/${scopePath}?page=${p}`;

  const firstSa = extractPageProps(await fetchHtml(pageUrl(1)))?.data?.searchAds;
  const totalPages = Math.max(1, firstSa?.pagination?.totalPages ?? 1);
  await sleep();

  const byId = new Map<number, SearchItem>(); // promoted offers repeat across pages — dedupe by id
  for (const page of randomPages(totalPages, SAMPLE_PAGES)) {
    if (byId.size >= OVER_COLLECT) break;
    const items: SearchItem[] =
      extractPageProps(await fetchHtml(pageUrl(page)))?.data?.searchAds?.items ?? [];
    for (const item of items) if (item?.id && item?.slug) byId.set(item.id, item);
    console.log(`  page ${page}/${totalPages}: +${items.length} items (${byId.size} unique)`);
    await sleep();
  }

  return shuffle([...byId.values()]).slice(0, TARGET_PER_TYPE);
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

  for (const { path, offerType } of OFFER_TYPES) {
    console.log(`\n▶ ${offerType} (nationwide)`);
    const items = await collectSearchItems(SCOPE, path);
    counts[offerType] = 0;

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
          { ...item, description, offerType, scrapedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
      counts[offerType]++;
      await sleep();
    }
    console.log(`  saved ${counts[offerType]} offers`);
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
