# Product Requirements — Smart Listings

A requirements spec for a smart real-estate listings platform: it ingests real
listings from a public marketplace, normalizes messy real-world data, and lets
users explore offers through filters and natural-language search.

> **Context.** Built to a deliberately time-boxed scope (≤ 6 hours of build
> time). That cap is intentional and shapes priorities: correctness, data-quality
> handling, and clear reasoning are prioritized over feature count or scale. The
> requirement
> IDs below (`FR-*`, `NFR-*`) are referenced by the pull requests that satisfy
> them.

## 1. Vision

Real-estate marketplaces look simple but fight messy, inconsistent, duplicated,
and incomplete data — and users who search by *intent*, not exact filters. A
credible platform is more than a table of flats: it ingests external data,
normalizes and structures it, and presents offers clearly and consistently.
This product demonstrates that pipeline end to end on ~100 real listings.

## 2. Scope

**In scope**
- Acquiring ~100 real listings from a public marketplace and committing them as
  offline fixtures.
- Two-stage normalization (deterministic + AI) into a consistent schema.
- A browsable listings page (filters, text search, pagination) and a detail page.
- Natural-language chat search that maps vague intent to structured filters.

**Out of scope** (consciously — see `REASONING.md`)
- Live/continuous crawling, accounts/auth, maps, image hosting, price history.
- Cross-marketplace ingestion beyond the single chosen source.
- Production hardening (rate limiting, CDN, horizontal scale).

## 3. Functional requirements

### 3.1 Data acquisition
- **FR-1** — Acquire ~100 real apartment offers from one public marketplace.
- **FR-2** — Extract the fields that carry product value (price, area, rooms,
  floor, location, description, images, offer type); capture the raw payload so
  every downstream stage is reproducible offline.
- **FR-3** — Commit the acquired data as fixtures so the app runs with zero
  network and no API key.

### 3.2 Storage & normalization
- **FR-4** — Persist offers in **MySQL** under one consistent schema.
- **FR-5** — Normalize deterministically first: parse prices, areas, rooms,
  floors, and location from structured/source fields — no AI on values code can
  read directly.
- **FR-6** — Handle low-quality data honestly: missing/unparseable fields are
  stored as explicit `null` and shown as "—", never fabricated (no `0`,
  no `"Unknown"`).
- **FR-7** — Detect duplicates and flag them (never silently drop data);
  re-running ingestion is idempotent (no duplicate rows).

### 3.3 Listings & search
- **FR-8** — A listings page with text search and filters (at minimum: offer
  type, city, price range, area range, rooms).
- **FR-9** — Pagination (or lazy loading) over the result set.
- **FR-10** — Filter/search state lives in the URL (shareable, refreshable).
- **FR-11** — Incomplete listings remain visible, badged, and rank sensibly
  rather than being hidden.

### 3.4 Offer detail
- **FR-12** — A detail page showing the full offer, with a link back to the
  original source.

### 3.5 AI (intentional, optional by the brief — included here deliberately)
- **FR-13** — Use AI only where it adds value the deterministic layer cannot:
  gap-filling prose-only fields, factual summaries, and intent parsing.
- **FR-14** — Chat search: a free-text box maps a vague query (e.g. *"a nice,
  cheap flat, 40 m² in Kraków"*) to the **same** structured filters the manual
  UI produces — one search implementation, two input modalities.
- **FR-15** — Every AI touchpoint degrades gracefully: with no API key the app
  still browses, filters, and searches (chat falls back to plain text search).

## 4. Non-functional requirements

- **NFR-1 — Stack.** Backend: TypeScript + Node.js. Database: MySQL. Frontend
  and AI provider: free choice, justified in `REASONING.md`.
- **NFR-2 — Reproducibility.** Runs on a clean machine straight from the README
  with a documented, minimal command sequence; MySQL via Docker.
- **NFR-3 — Code quality.** Clear structure, readable code, no overengineering.
  Files stay small and single-purpose; critical logic is unit/integration
  tested (see `CLAUDE.md`).
- **NFR-4 — Cost.** AI usage stays negligible for a ~100-listing run; no secret
  ever enters the repo or the wire.
- **NFR-5 — UX.** Clean and usable over decorative — sensible states for
  loading, empty, and error.

## 5. Acceptance scenarios

- **Journey A (must pass).** A user filters for flats in **Kraków, 40–80 m²**,
  gets relevant results, and opens a detail page.
- **Journey B (hard, optional).** A user types a vague intent into the chat box —
  *"I want a nice, cheap flat, 40 m² in Kraków"* — and the normalization/AI layer
  returns relevant listings, echoing the interpreted filters.

## 6. Assumptions & constraints

- The dataset is a **snapshot in time** — no freshness or re-crawl semantics.
- A single marketplace with ~100 offers is sufficient to demonstrate the full
  ingest → normalize → serve → search pipeline; scale is explicitly not the goal.
- One denormalized listings table is appropriate at this size (normalizing
  cities/images would be correct at scale, wrong here under the time cap).

## 7. Primary deliverable

A **1-page `REASONING.md`** is the most important artifact, covering: what data
was extracted and why · how low-quality data was handled · where and why AI was
used (and where not) · one key assumption · one success metric · one failure
mode and its mitigation · what would be improved with more time.
