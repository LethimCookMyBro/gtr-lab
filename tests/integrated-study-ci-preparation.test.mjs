import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

test('Quality prepares the exact study fixture before tests on a clean checkout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  const steps = [...workflow.matchAll(/^\s+- run: (.+)$/gm)].map(match => match[1]);
  const prepare = workflow.indexOf('run: node scripts/prepare-integrated-study.mjs');
  assert.ok(prepare > workflow.indexOf('- run: npm ci'));
  assert.ok(prepare < workflow.indexOf('- run: npm test'));
  assert.equal(workflow.split('run: node scripts/prepare-integrated-study.mjs').length, 2);
  assert.ok(steps.includes('npm test'));
  assert.ok(steps.includes('npx playwright install --with-deps chromium'));
});
