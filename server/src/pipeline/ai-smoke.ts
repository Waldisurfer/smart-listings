/**
 * Live AI smoke test — proves the real Anthropic path works end to end with a
 * key present. The unit suite mocks the SDK (deterministic, DB-free); this one
 * actually calls the API, so it self-gates on the key:
 *
 *   - No ANTHROPIC_API_KEY → skip with success. Fork PRs and key-less clones
 *     stay green; CI never goes red just because a secret is absent.
 *   - Key present → parse a vague Polish query and assert we got structured
 *     filters back, not the degraded/null path. A present-but-broken key
 *     (expired, wrong, rate-limited) fails the build, which is the point.
 *
 * Run locally with `npm run ai:smoke` (reads .env); CI runs it with the
 * ANTHROPIC_API_KEY repo secret injected as an env var.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { parseSearchIntent } from '../claude.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: join(REPO_ROOT, '.env'), quiet: true });

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('ai-smoke: no ANTHROPIC_API_KEY — skipping the live AI check (this is fine).');
  process.exit(0);
}

const QUERY = 'tanie mieszkanie 2 pokoje w Gdańsku do 500 tys';

const intent = await parseSearchIntent(QUERY);

if (!intent) {
  console.error(
    'ai-smoke: FAIL — parseSearchIntent returned null. The key is set but the ' +
      'live call failed (auth, network, rate limit, or unparseable output).',
  );
  process.exit(1);
}

const { interpretation, ...fields } = intent;
const chosen = Object.entries(fields).filter(([, v]) => v !== null);

if (!interpretation?.trim() || chosen.length === 0) {
  console.error('ai-smoke: FAIL — API responded but produced no interpretation or filters.', intent);
  process.exit(1);
}

console.log(`ai-smoke: OK — query "${QUERY}"`);
console.log(`  filters:        ${JSON.stringify(Object.fromEntries(chosen))}`);
console.log(`  interpretation: ${interpretation}`);
process.exit(0);
