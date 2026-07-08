/**
 * Express entrypoint. Boot = load .env (repo root) → ensureSchema() → listen.
 * Phase 1 ships only the health check; routes and static serving land in later
 * phases. Express 5 forwards rejected async handlers to error middleware.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import express from 'express';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: join(REPO_ROOT, '.env'), quiet: true });

// Imported after dotenv so the pool reads any DB_* overrides.
const { ensureSchema } = await import('./db.js');

const PORT = Number(process.env.PORT ?? 3004);

const app = express();
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

await ensureSchema();
app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
