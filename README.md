# Smart Listings

A smart real-estate listings platform: scrapes ~100 real Polish apartment
offers, normalizes the mess (missing fields, duplicates, quirky formats),
enriches with AI, and serves a filterable listings UI with natural-language
chat search.

**[REASONING.md](REASONING.md) is the point** — the decisions and trade-offs
matter more than the feature count. [requirements/REQUIREMENTS.md](requirements/REQUIREMENTS.md)
is the brief this build answers.

> 🚧 Built in the open, layer by layer — see the commit history and pull
> requests for how it comes together. Quickstart lands with the first runnable
> slice.

## Planned quickstart

```bash
cp .env.example .env    # API key optional — only the chat box uses it
docker compose up -d    # MySQL 8
npm install
npm start               # seed → build → serve on one port → http://localhost:3004
```

## License

MIT — see [LICENSE](LICENSE).
