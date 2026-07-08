#!/usr/bin/env node
/**
 * PostToolUse nudge (non-blocking). When a test-critical file — anything under
 * server/src/pipeline/ or server/src/repo/ — is written without a sibling
 * *.test.ts, print a reminder. Tests on these surfaces are mandatory per
 * CLAUDE.md; this catches the gap the moment it opens instead of at review.
 */
import { existsSync } from 'node:fs';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const fp = input.tool_input?.file_path ?? '';
    const isCritical =
      /server\/src\/(pipeline|repo)\/[^/]+\.ts$/.test(fp) && !fp.endsWith('.test.ts');
    if (!isCritical) return;
    const sibling = fp.replace(/\.ts$/, '.test.ts');
    if (!existsSync(sibling)) {
      const name = sibling.split('/').pop();
      console.error(
        `[test-nudge] ${fp} is a test-critical surface with no ${name} — add unit tests (CLAUDE.md).`,
      );
    }
  } catch {
    // A nudge must never break the tool run.
  }
});
