# Smart Listings

A smart real-estate listings platform: scrapes ~100 real Polish apartment
offers nationwide, normalizes the mess (missing fields, duplicates, quirky
formats), enriches with AI, and serves a filterable listings UI with
natural-language chat search.

**[REASONING.md](REASONING.md) is the point** — the decisions and trade-offs
matter more than the feature count. [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md)
is the brief this build answers.

![Listings UI — nationwide sample with filters and chat search](docs/screenshot-listings.png)

## Quickstart

```bash
cp .env.example .env    # ANTHROPIC_API_KEY optional — only the chat box uses it
docker compose up -d    # MySQL 8 (host port parameterized, loopback-only)
npm install
npm start               # seed → build → serve on one port → http://localhost:3004
```

`npm start` seeds the committed dataset, builds the frontend, and serves the API
and the SPA from a single Express port. The data ships in the repo
(`data/enriched/listings.json`), so no scraping or API key is needed to run it.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Seed → build → serve on one port (the demo). |
| `npm run serve` | Serve an already-built, already-seeded app (no rebuild). |
| `npm run dev` | API + Vite dev server with HMR, on separate ports. |
| `npm test` | Unit tests (normalization, dedupe, AI merge). |
| `npm run test:integration` | Repo/API integration tests (needs MySQL up). |
| `npm run typecheck` | `tsc --noEmit` across the server. |

`scrape` and `ingest` are author-only, one-time steps (network + API key) that
produced the committed dataset; the grader never runs them.

## How it fits together

```
otodom  →  scrape  →  normalize (deterministic)  →  AI gap-fill + summaries
                                                            │
                                       data/enriched/listings.json (committed)
                                                            │
                                        seed → MySQL → repo → API → Vue SPA
```

Layering is strict: `routes → repo → MySQL`, all SQL in the repo layer; `claude.ts`
is the only file touching the AI SDK; every unparseable field is explicit `null`.
See [CLAUDE.md](CLAUDE.md) for the conventions and [REASONING.md](REASONING.md)
for why.

## License

MIT — see [LICENSE](LICENSE).
