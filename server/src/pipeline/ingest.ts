/**
 * Stage 2b: data/raw/otodom/*.json → data/enriched/listings.json. Runs ONCE on
 * the author's machine (needs network + ANTHROPIC_API_KEY); the grader only ever
 * consumes the committed output via seed. Per-listing failure → nulls + flags,
 * never a dead run.
 *
 * Per file: normalize (deterministic) → AI gap-fill (only if rooms/area/floor
 * still missing AND a description exists) → AI card summary → append.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { extractFromDescription, summarizeListing } from '../claude.js';
import type { NormalizedListing } from '../types.js';
import { applyGapFill } from './enrich.js';
import { normalizeOtodom } from './normalize.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: join(REPO_ROOT, '.env'), quiet: true }); // .env at repo root; workspace scripts run with cwd=server/
const RAW_DIR = join(REPO_ROOT, 'data', 'raw', 'otodom');
const OUT_DIR = join(REPO_ROOT, 'data', 'enriched');
const CONCURRENCY = 4;

interface Stats {
  total: number;
  gapFillTried: number;
  gapFillHit: number;
  summarized: number;
}

async function enrich(raw: Record<string, unknown>, stats: Stats): Promise<NormalizedListing> {
  let listing = normalizeOtodom(raw);

  const needsGapFill =
    (listing.rooms === null || listing.area_m2 === null || listing.floor === null) &&
    listing.description !== null;
  if (needsGapFill) {
    stats.gapFillTried++;
    const filled = await extractFromDescription(listing.description as string);
    if (filled && (filled.rooms !== null || filled.area_m2 !== null || filled.floor !== null)) {
      stats.gapFillHit++;
      listing = applyGapFill(listing, filled);
    }
  }

  const summary = await summarizeListing(listing);
  if (summary) stats.summarized++;
  return { ...listing, summary_ai: summary };
}

/** Small promise pool — keeps at most CONCURRENCY requests in flight. */
async function runPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠ ANTHROPIC_API_KEY not set — writing deterministic output only (no gap-fill, no summaries).');
  }
  const files = readdirSync(RAW_DIR).filter((f) => f.endsWith('.json'));
  const stats: Stats = { total: files.length, gapFillTried: 0, gapFillHit: 0, summarized: 0 };
  let done = 0;

  const listings = await runPool(files, CONCURRENCY, async (file) => {
    const raw = JSON.parse(readFileSync(join(RAW_DIR, file), 'utf-8'));
    const listing = await enrich(raw, stats);
    done++;
    if (done % 20 === 0 || done === files.length) console.log(`  ${done}/${files.length}`);
    return listing;
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'listings.json'), JSON.stringify(listings, null, 2));

  const incomplete = listings.filter((l) => l.is_incomplete).length;
  console.log(
    `\nEnriched ${stats.total} listings → data/enriched/listings.json\n` +
      `  gap-fill: ${stats.gapFillHit}/${stats.gapFillTried} listings gained fields via AI\n` +
      `  summaries: ${stats.summarized}/${stats.total}\n` +
      `  incomplete after enrichment: ${incomplete}`,
  );
}

// Script entrypoint (`npm run ingest`).
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  main().catch((err) => {
    console.error('ingest failed:', err);
    process.exit(1);
  });
}
