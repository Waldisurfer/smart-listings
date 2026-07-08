/**
 * Integration test for the HTTP boundary: boots the real app on an ephemeral
 * port and drives it with fetch (zero test deps). Covers the response envelope,
 * zod validation, 404 shaping, graceful chat degradation, and — critically —
 * that the raw snapshot never crosses the API boundary.
 */
import type { Server } from 'node:http';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { pool } from '../db.js';
import { createApp } from '../index.js';
import { seed } from '../pipeline/seed.js';

let server: Server;
let base: string;

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY; // exercise the degraded chat path deterministically
  await pool.query('DROP TABLE IF EXISTS listings');
  await seed();
  const app = await createApp();
  server = app.listen(0);
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test('GET /api/listings returns the paginated envelope', async () => {
  const res = await fetch(`${base}/api/listings?offerType=sale&pageSize=5`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.total).toBeGreaterThan(0);
  expect(body.items.length).toBe(Math.min(5, body.total));
  expect(body).toMatchObject({ page: 1, pageSize: 5 });
});

test('GET /api/listings rejects a malformed param with 400 + issues', async () => {
  const res = await fetch(`${base}/api/listings?minPrice=abc`);
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.message).toMatch(/invalid/i);
  expect(Array.isArray(body.error.issues)).toBe(true);
});

test('GET /api/listings/:id returns detail WITHOUT the raw snapshot', async () => {
  const res = await fetch(`${base}/api/listings/1`);
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.description).not.toBeUndefined(); // detail carries the description
  expect(body).not.toHaveProperty('raw_json'); // ...but never the raw snapshot
});

test('GET /api/listings/:id 404s for a missing id, 400s for a non-numeric id', async () => {
  expect((await fetch(`${base}/api/listings/99999999`)).status).toBe(404);
  expect((await fetch(`${base}/api/listings/abc`)).status).toBe(400);
});

test('POST /api/search/parse-intent degrades to plain text with no API key (HTTP 200)', async () => {
  const res = await fetch(`${base}/api/search/parse-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'tanie mieszkanie w Krakowie' }),
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.degraded).toBe(true);
  expect(body.filters.q).toBe('tanie mieszkanie w Krakowie');
});

test('unknown route returns a shaped 404', async () => {
  const res = await fetch(`${base}/api/nope`);
  expect(res.status).toBe(404);
  expect((await res.json()).error.message).toBe('Not found');
});
