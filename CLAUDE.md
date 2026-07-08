# CLAUDE.md — conventions for this repo

Guidance for any contributor (human or AI) working in this codebase. These rules
are the contract; the CI enforces the testable parts.

## What this is

A smart real-estate listings platform: scrape ~100 real Polish listings →
two-stage normalization (deterministic + AI) → MySQL → filterable Vue frontend
with natural-language chat search. See `requirements/REQUIREMENTS.md` for the
brief and `REASONING.md` for the decisions.

## Stack

Node 20+ · TypeScript (ESM, `.js` import suffix) · Express 5 · mysql2 · Vue 3 +
Vite · MySQL 8 (Docker) · Vitest · `@anthropic-ai/sdk` (Claude, single surface).

## Architecture rules (the spine)

1. **Layering:** `routes → repo → MySQL`. Routes only validate + call the repo;
   all SQL lives in the repo layer. Never inline SQL in a route.
2. **AI confinement:** `claude.ts` is the ONLY file importing the Anthropic SDK.
   Prices, areas, rooms, floors are parsed by deterministic code — never sent to
   the model. AI fills gaps only.
3. **Nulls end-to-end:** every unparseable field is explicit `null` (never 0 or
   'Unknown'). Missing data renders as "—".
4. **Config:** the API key is optional — its absence disables the chat box but
   never blocks browse/search. No secret ever enters the repo or the wire.
5. **Idempotency:** `seed` upserts on a natural key; re-running never duplicates.

## Leanness (anti-bloat — enforced in review)

- **File size:** target < 300 lines, hard cap 400. A file that grows past it
  gets split.
- **One responsibility per module.** No `any` in application code — a scoped,
  commented `any` is acceptable only at untyped external-data boundaries (e.g.
  parsing third-party HTML/JSON). No `console.log` in request-handling paths
  (CLI scripts under `pipeline/` log freely).
- **YAGNI:** no speculative abstraction. Delete dead code as you touch it.

## Test-critical surfaces (where tests are mandatory)

Tests earn their place only where they carry signal. CI runs `npm test` as the
merge gate.

| Surface | Test? | Type |
|---|---|---|
| Deterministic normalization (pure fns) | **mandatory** | unit — real trap strings |
| Dedupe hash / bucket logic | **mandatory** | unit |
| AI merge/precedence (params-first, pure) | **mandatory** | unit (SDK mocked) |
| Repo filter building + routes | **mandatory** | integration |
| Vue components | light or skip | smoke / golden-path e2e |
| Network scraper | skip | non-deterministic, not the grader path |

A new file under `pipeline/` or `repo/` without a sibling `*.test.ts` for its
pure logic is an incomplete change.

## Workflow

- One PR per layer; branch `phase-N-slug`. 2–4 meaningful commits per branch.
- CI green before merge; merge with `--no-ff` (the history is the story).
- Conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`.
- Every PR body links the requirement it satisfies.
