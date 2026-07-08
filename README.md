# Smart Listings

A real-estate listings app that scrapes ~100 real Polish apartment offers,
cleans up the messy real-world data (missing fields, duplicates, odd formats),
enriches it with AI, and serves a filterable UI with **natural-language search** —
type *"a cheap flat around 40 m²"* and it turns your words into filters.

![Listings — nationwide sample with filters and search](docs/screenshot-listings.png)

## Run it (one command)

You only need **[Docker](https://docs.docker.com/get-docker/)** installed and running.

```bash
cp .env.example .env      # optional: paste an ANTHROPIC_API_KEY to enable AI search
docker compose up         # builds everything, starts MySQL, seeds data, serves
```

Then open **<http://localhost:3004>**. That's it — no Node, no manual build, no database setup.

> The listings data ships inside the repo, so the app works fully offline.
> The AI key is **optional**: without it, browsing, filtering, and text search
> all still work — only the AI search box falls back to plain text.
>
> **To try the AI features**, paste a key into `.env` before `docker compose up`,
> then use the "Wyszukiwanie AI" box — type a sentence and watch it turn into
> filters. (CI also runs a live AI check against the repo's key on every build.)

To stop it: `Ctrl+C`, or `docker compose down` to also remove the containers.

## What you can do

- **Filter & browse** — offer type, city, price, area, rooms, and text search, with pagination. Every search is a shareable URL.
- **Natural-language search** — describe what you want; AI turns it into filters and shows you exactly what it applied.
- **Offer detail** — the full listing with an AI summary and a link back to the original source.

**Natural-language search** — *"a flat around 40 m² under 500,000 zł"* becomes real filters:

![AI search turning a sentence into filters](docs/screenshot-search.png)

**Offer detail** — full data, AI summary, and a link back to the source:

![Detail page](docs/screenshot-detail.png)

## How it works

```
otodom  →  scrape  →  normalize (deterministic)  →  AI gap-fill + summaries
                                                            │
                                       data/enriched/listings.json  (shipped in repo)
                                                            │
                                        seed → MySQL → repo → API → Vue app
```

Prices, areas, rooms, and floors are parsed by plain code — never guessed by AI.
The AI only fills gaps the text leaves and powers the search box. Anything
unparseable stays an explicit `null` and shows as "—", never a fabricated value.

The reasoning behind these choices is the real deliverable — see
**[REASONING.md](REASONING.md)**. The brief it answers is
**[requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md)**, and the
engineering conventions are in **[CLAUDE.md](CLAUDE.md)**.

## Regenerating the dataset (optional)

The scraped and AI-enriched data is committed (`data/raw/otodom/` and
`data/enriched/listings.json`), so you never need this to run or test the app.
But the pipeline is fully reproducible — you can step back to any stage and re-run it:

```bash
npm install                 # once, for the Node pipeline scripts below

# 1 · Scrape — fetch a fresh, random ~108 offers nationwide from otodom
npm run scrape              # → data/raw/otodom/   (network only, no API key)

# 2 · Enrich — deterministic normalization + AI gap-fill and Polish summaries
cp .env.example .env        # add your ANTHROPIC_API_KEY for the AI parts
npm run ingest              # → data/enriched/listings.json
                            #   (no key? it still writes the parsed fields —
                            #    just without the AI summaries and gap-fill)

# 3 · Load the fresh data into MySQL
docker compose up -d db
npm run seed
```

`scrape` draws offers at random across the country (54 sale + 54 rent, so both
sides of the filter stay populated), so every run yields a different snapshot.
`ingest` and `seed` are idempotent, so re-running them never duplicates data.

## Developing locally (optional)

Prefer running the app on your machine with only the database in Docker:

```bash
cp .env.example .env
docker compose up -d db   # just MySQL 8
npm install
npm run dev               # API + Vite dev server with hot reload
```

| Command | What it does |
|---|---|
| `npm start` | Seed → build → serve on one port (production-style demo). |
| `npm run dev` | API + Vite dev server with hot reload, on separate ports. |
| `npm test` | Unit tests (normalization, dedupe, AI merge logic). |
| `npm run test:integration` | Repo/API integration tests (needs MySQL up). |
| `npm run ai:smoke` | Live AI check — confirms your `ANTHROPIC_API_KEY` actually reaches Claude (skips cleanly if unset). |
| `npm run typecheck` | Type-check the server. |

To rebuild the dataset from scratch instead of using the committed snapshot, see
**[Regenerating the dataset](#regenerating-the-dataset-optional)** above.

## License

MIT — see [LICENSE](LICENSE).
