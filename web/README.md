# web — Vue 3 frontend

The listings UI: browse, filter, text + chat search, and a detail view. Talks to
the API only over `/api` (Vite proxies to the Express server in dev; the built
`dist/` is served on the same port in production).

Run from the repo root — `npm run dev` (API + Vite). See the root
[README](../README.md).
