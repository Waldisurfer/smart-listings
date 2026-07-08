# Reasoning

> **Living document.** The approach is decided up front and captured here first;
> the build follows it. Concrete run metrics (listing counts, populate rates,
> cost) are confirmed at finalization. This is the primary deliverable — read it
> before the code.

## What data I extract, and why

The fields people actually filter and decide on: **price, area, rooms, floor,
city/district, offer type (sale/rent), description, images, source URL** — plus
two honesty-driven fields:

- **Administrative rent (czynsz)** where the source exposes it — it materially
  changes the true monthly cost and appears on sale offers too, not only rentals.
- **A completeness flag** so incomplete offers stay visible and inspectable
  rather than being silently dropped.

I capture the **raw source payload** alongside the normalized row so every
downstream stage is reproducible offline, and skip fields that need extra
scraping for little value (coordinates/maps, image galleries, price history).

### How the ~100 are sampled

The scope is the **whole country** (`cala-polska`), not a fixed city list — each
offer's city comes from its own payload, so the sample lands wherever the random
draw does. "Random ~100" means two things, and the scraper addresses both:

- **Not the promoted top-of-list.** A naive scrape would return the first
  results, which are ad-boosted and metro-heavy. Instead the scraper reads page 1
  only to learn the result size (thousands of pages nationwide), then pools items
  from **random page offsets across the full range** and shuffles — page 1's own
  items are discarded so the promoted block never biases the set.
- **Spread across Poland.** Because the offsets are drawn from the national
  result set, the offers come from wherever those pages happen to sit. The
  committed snapshot spans **~40 cities** — big metros and small towns alike
  (Warszawa, Wrocław and Gdańsk through to Miastko, Węgorzewo, Stegna). The
  **city** distribution is metro-weighted purely because that is how the national
  inventory is distributed: an honest random draw, no per-city quota.

**One deliberate balance — offer type.** The one axis that is *not* left to the
draw is sale vs rent. otodom's national inventory is ~6× more sale than rent, so
a purely proportional sample would leave only a dozen rentals and a thin sale/rent
filter — and at n≈100 a single unlucky draw could thin it further. Instead the
snapshot is balanced at **54 sale + 54 rent = 108** so both sides of the filter
have real depth to demonstrate; rent and sale also live on entirely different
price scales (~2–5k PLN/mo vs ~0.5–1.5M PLN), so a near-empty rent view couldn't
exercise those paths at all.

This is **stratified random sampling**: sale and rent are drawn independently,
each with the same random-offset draw across the national range, so the sample
is random *within* each stratum — not a biased slice. The honest caveat is that
it therefore does **not** mirror the real ~86/14 market composition; that is an
intentional trade for a ~100-row demo, and dropping the offer-type stratum (or
raising n substantially) would recover the true ratio. It is the single
stratified dimension, stated openly; cities remain a genuine nationwide random
draw.

Because the cities aren't known ahead of time, the city filter is populated
dynamically from the data (`/api/meta/cities`) rather than hardcoded.

### Finalized snapshot metrics

The committed `data/enriched/listings.json` (regenerated from a fresh nationwide
draw):

- **108 listings** — 54 sale / 54 rent, across **42 cities**.
- **1** flagged incomplete (kept, not dropped); **3** flagged as fuzzy duplicates.
- Populate rates: price / area / rooms / floor / price-per-m² **99%** (the one
  incomplete offer lacks them), **city 100%**, description **100%**, AI summary
  **100%**, district 81%, administrative rent (czynsz) 75%.
- AI touch: 1 of 2 listings that still lacked a structured field after
  deterministic parsing gained one via gap-fill; 108/108 got a factual summary.

## How I handle low-quality data: null beats wrong

Data quality is the core of the task, and the governing principle is
**null beats wrong**. A missing or unparseable value is stored as explicit
`null` and rendered as "—" — never guessed, never defaulted to `0` or
`"Unknown"`. A user who sees "—" knows the value is unknown; a user who sees a
fabricated price decides on a lie.

- **Flag, never drop.** Incomplete offers are badged and kept — the messiness is
  exactly what the task probes.
- **Duplicates: flag, never delete.** An idempotent upsert on a natural key means
  re-running ingestion never creates duplicates; a fuzzy pass flags re-posts.

## Where and why I use AI — regex first, LLM on the residue

The pipeline is **deterministic-first**, and this single ordering is both a cost
and a quality decision:

- **Regex / structured-field parsing** handles everything code can read (price,
  area, rooms, floor, location) at **zero token cost**.
- **The LLM is invoked only on the residue** — prose-only fields, gap-fills, and
  factual summaries — and is constrained to extract **only what the text
  explicitly states** (null otherwise; it never infers or guesses).

This **cuts per-listing token spend** (the model sees a small, focused task, not
the whole record) and **shrinks the hallucination surface** (fewer fields the
model can get wrong). Numeric/structured fields never reach the model at all.
Net effect: a ~100-listing enrichment run stays negligible in cost — the
expensive tool is used last and least.

Concrete AI touchpoints: (1) gap-fill extraction for prose-only fields; (2) a
short factual card summary; (3) chat search that maps a vague query to the
**same** structured filters the manual UI produces — one search implementation,
two input modalities. Every touchpoint **degrades gracefully**: with no API key
the app still browses, filters, and searches.

## One key assumption

A single marketplace's structured fields are **more reliable than free-text
prose**, so I trust the source's typed values and use AI only to fill what the
structure lacks. One snapshot of ~100 offers is enough to demonstrate the full
ingest → normalize → serve → search pipeline; scale is explicitly not the goal.

## One success metric

A vague chat query returns **≥ 2 contextually relevant listings with zero manual
filters**, and its **counter-metric: zero fabricated listings** (every result
exists in the DB with a real source URL). This exercises the whole pipeline end
to end.

Confirmed on the committed data: *"a cheap flat in Warszawa"* parses to
`{ city: "Warszawa", maxPrice: 650000 }` ("cheap" → the metro price tier) and
returns **3 listings**; *"flat around 40 m² under 500000"* → `{ minArea: 40,
maxPrice: 500000 }` → **12**. (The metric is city-sensitive by design: a sparse
city in the random draw — e.g. Kraków, ~9 offers — can return fewer, which is
honest, not a bug; the filters are always shown so the user sees why.)

## One failure mode & mitigation

The intent parser can **hallucinate a price ceiling** for a vague word like
"cheap". Mitigation: the interpreted filters are echoed in a visible banner
**and** land in the normal filter controls — the user sees exactly what was
applied and can clear or adjust it. Nothing happens invisibly.

## What I'd improve with more time

- A second marketplace as a source (parsers written portal-tolerant to make this
  an adapter, not a rewrite).
- Search at scale: FULLTEXT / a vector index for semantic chat beyond n≈100.
- API/E2E test coverage beyond the unit-tested normalization core.
- Ranking that surfaces explicit matches above unknown-value rows.
