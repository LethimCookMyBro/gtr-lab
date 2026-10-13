/** CPU-only regression: execute the runner's actual binding against the pinned installed package. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('actual app-resolved Playwright binding provides chromium.launch and expect without launching', async () => {
  const app = resolve(process.env.R35_TEST_APP_ROOT ?? '.');
  const require = createRequire(resolve(app, 'package.json'));
  const source = await readFile(new URL('../../scripts/current-render-cost-runner.mjs', import.meta.url), 'utf8');
  const statements = source.match(/^\s*const \{chromium,expect\}=.*;$/gm) ?? [];
  assert.equal(statements.length, 1, 'One exact runtime Playwright binding is exercised');
  const bind = new Function('require', 'pathToFileURL', `return (async () => { ${statements[0]} return { chromium, expect }; })();`);
  const bound = await bind(require, pathToFileURL);
  assert.equal(typeof bound.chromium?.launch, 'function', 'Runner must obtain the actual browser API from the CommonJS entry');
  assert.equal(typeof bound.expect, 'function', 'Runner must obtain the actual assertion API from the CommonJS entry');
  assert.equal(bound.chromium, require('@playwright/test').chromium);
  assert.equal(bound.expect, require('@playwright/test').expect);
});

test('reviewed loader correction triggers only bounded main staging with unchanged source checkout', async () => {
  const source = await readFile(new URL('../../.github/workflows/current-render-cost.yml', import.meta.url), 'utf8');
  const push = source.match(/^  push:\n([\s\S]*?)(?=^permissions:)/m)?.[1];
  assert.ok(push, 'Bounded push trigger must exist');
  assert.match(push, /^    branches: \[main\]$/m);
  assert.deepEqual([...push.matchAll(/^      - (.+)$/gm)].map(match => match[1]), [
    'qa/current-render-cost-request.json',
    'scripts/current-render-cost-runner.mjs',
  ]);
  assert.equal(source.match(/^    if: (.+)$/m)?.[1], "github.repository == 'LethimCookMyBro/gtr-lab' && github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || contains(github.event.head_commit.message, '[stage-current-render-cost]'))");
  assert.match(source, /authorizeRun\(JSON\.parse\(readFileSync\('qa\/current-render-cost-request\.json'\)\), process\.env\);/);
  assert.match(source, /^          ref: 28f586ce35b4441254c10583fc7bc1da3265a106$/m);
});
