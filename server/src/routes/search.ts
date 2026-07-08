/**
 * POST /api/search/parse-intent — the fallback ladder: parse failure, API error,
 * or a missing key all degrade to plain text search with HTTP 200. The chat box
 * never 500s, and the API key never leaves the server.
 */
import { Router } from 'express';
import { z } from 'zod';
import { parseSearchIntent } from '../claude.js';

const Body = z.object({ query: z.string().trim().min(1).max(300) });

export const searchRouter = Router();

searchRouter.post('/search/parse-intent', async (req, res) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { message: 'Body must be { query: string (1-300 chars) }' } });
    return;
  }

  const intent = await parseSearchIntent(parsed.data.query);
  if (!intent) {
    res.json({
      filters: { q: parsed.data.query },
      interpretation: 'AI unavailable — using plain text search.',
      degraded: true,
    });
    return;
  }

  const { interpretation, ...fields } = intent;
  const filters = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
  res.json({ filters, interpretation, degraded: false });
});
