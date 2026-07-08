/**
 * Express app + entrypoint. `createApp()` is exported so tests can drive the API
 * without binding a port or starting the DB. Routers are imported dynamically
 * (after dotenv) so DB_* overrides reach the pool before it is constructed.
 * Express 5 forwards rejected async handlers to the error middleware.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadEnv } from 'dotenv';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
loadEnv({ path: join(REPO_ROOT, '.env'), quiet: true });

export async function createApp(): Promise<Express> {
  const { listingsRouter } = await import('./routes/listings.js');
  const { searchRouter } = await import('./routes/search.js');

  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api', listingsRouter);
  app.use('/api', searchRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { message: 'Not found' } });
  });

  // Detailed context stays server-side; the client gets a stable shape.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: { message: 'Internal server error' } });
  });

  return app;
}

// Script entrypoint: apply the schema, then listen.
if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const { ensureSchema } = await import('./db.js');
  const PORT = Number(process.env.PORT ?? 3004);
  const app = await createApp();
  await ensureSchema();
  app.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}
