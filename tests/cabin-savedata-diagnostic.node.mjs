import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deriveSavedataDiagnostic, validateSavedataDiagnostic, repairedDriverSha256, diagnosticHelperPins, diagnosticCase, diagnosticContract, publicSourceCommit } from '../scripts/cabin-savedata-diagnostic.mjs';
import { sha256, budgets, requiredCases } from '../scripts/cabin-preparation-policy.mjs';
const read = path => readFile(new URL('../' + path, import.meta.url));
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), R35_ALLOW_SAVEDATA_DIAGNOSTIC: '1', R35_DIAGNOSTIC_COMMIT_MESSAGE: 'Bounded QA [diagnose-cabin-savedata]', R35_QA_VIEWPORT: 'mobile' };
test('diagnostic binds only fixed public source and final SaveData case without impersonating GITHUB_SHA', async () => {
  const request = JSON.parse(await read('qa/cabin-savedata-diagnostic-request.json'));
  for (const viewport of ['mobile', 'desktop']) { const target = validateSavedataDiagnostic(request, { ...env, R35_QA_VIEWPORT: viewport }); assert.equal(target.mode, 'live'); assert.equal(target.lane, 'lifecycle'); assert.equal(target.quality, 'standard'); assert.equal(target.baseUrl, 'https://gtr-lab-production.up.railway.app'); }
  assert.equal(publicSourceCommit, 'affd86701a2f16060215b4507aa653e5229ee3a3'); assert.equal(diagnosticCase, 'savedata-and-nonpremium-boundaries');
  for (const changed of [{ case: 'direct-entry-residency' }, { case: '*' }, { sourceCommit: 'b'.repeat(40) }, { sourceTree: 'b'.repeat(64) }, { modelSha256: 'b'.repeat(64) }, { allow: false }, { origin: 'https://example.test' }, { contract: 'premium-unified-cabin-preparation-ao-static-faces-v1' }]) assert.throws(() => validateSavedataDiagnostic({ ...request, ...changed }, env));
  for (const changed of [{ GITHUB_SHA: publicSourceCommit }, { GITHUB_SHA: 'current' }, { GITHUB_EVENT_NAME: 'workflow_dispatch' }, { GITHUB_REF: 'refs/heads/other' }, { R35_ALLOW_SAVEDATA_DIAGNOSTIC: undefined }, { R35_DIAGNOSTIC_COMMIT_MESSAGE: '[release-cabin-preparation-ao-static-faces] [diagnose-cabin-savedata]' }, { R35_DIAGNOSTIC_COMMIT_MESSAGE: '' }, { R35_PREPARATION_MODE: 'live' }, { R35_SOURCE_SHA: publicSourceCommit }, { R35_PREPARATION_LANE: 'feature' }, { R35_DIAGNOSTIC_CASE: 'other' }, { R35_BASE_URL: 'https://example.test' }, { R35_PREPARATION_APP_ROOT: '/tmp/other' }]) assert.throws(() => validateSavedataDiagnostic(request, { ...env, ...changed }));
});
test('deterministic adapter retains every reviewed case body and native/source predicate unchanged', async () => {
  const source = String(await read('scripts/diagnose-cabin-preparation.mjs')); assert.equal(sha256(source), repairedDriverSha256);
  const helpers = Object.fromEntries(await Promise.all(Object.keys(diagnosticHelperPins).map(async path => [path, await read(path)])));
  const generated = deriveSavedataDiagnostic(source, helpers); assert.equal(generated, deriveSavedataDiagnostic(Buffer.from(source), helpers));
  const cases = text => text.slice(text.indexOf('async function runLifecycleCases(')); assert.equal(cases(generated), cases(source));
  assert.deepEqual(requiredCases.lifecycle.length, 7); for (const name of requiredCases.lifecycle) assert.ok(generated.includes(`await runCase('${name}'`));
  assert.ok(generated.includes('if (name !== diagnosticCase) return;')); assert.ok(generated.includes('assert.deepEqual(report.cases.map(c => c.name), [diagnosticCase])'));
  assert.ok(generated.includes("report.result = 'diagnostic-passed'")); assert.ok(generated.includes("assert.equal(report.result, 'diagnostic-passed'")); assert.ok(generated.includes('One-case SaveData diagnostic only.'));
  assert.ok(generated.includes('contract: diagnostic.contract, sourceContract: request.contract'));
  assert.doesNotMatch(generated, /report.result = '(?:failed|passed)'/);
  const failureHandlers = [...generated.matchAll(/catch \(error\) \{ ([^\n]*report\.result = 'diagnostic-failed';[^\n]*) \}/g)]; assert.equal(failureHandlers.length, 2);
  for (const [, code] of failureHandlers) { const report = { result: 'diagnostic-running', errors: [], shutdown: {} }; new Function('report', 'error', code)(report, new Error('bounded diagnostic error')); assert.equal(report.result, 'diagnostic-failed'); assert.equal(report.errors.length, 1); }
  assert.ok(generated.includes('diagnostic, mode: target.mode')); assert.ok(generated.includes('sourceCommit: commit'));
  assert.throws(() => deriveSavedataDiagnostic(source + '\n', helpers)); assert.throws(() => deriveSavedataDiagnostic(source.replace('timeout: budgets.screenshot', 'timeout: 90000'), helpers));
  assert.throws(() => deriveSavedataDiagnostic(source));
  for (const path of Object.keys(diagnosticHelperPins)) { assert.throws(() => deriveSavedataDiagnostic(source, { ...helpers, [path]: Buffer.concat([helpers[path], Buffer.from('\n')]) })); const missing = { ...helpers }; delete missing[path]; assert.throws(() => deriveSavedataDiagnostic(source, missing)); }
  assert.deepEqual(budgets, { initial: 90000, functional: 20000, lifecycle: 30000, screenshot: 45000 });
});
test('two clean checkouts and fixed served revision are mandatory; existing release gate stays independent', async () => {
  const source = String(await read('scripts/cabin-savedata-diagnostic.mjs')), workflow = String(await read('.github/workflows/cabin-savedata-diagnostic.yml'));
  for (const text of ["resolve(harness, '../release-app')", "git(harness, ['rev-parse', 'HEAD']), env.GITHUB_SHA", "git(root, ['rev-parse', 'HEAD']), publicSourceCommit", "for (const directory of [harness, root])", "'status', '--porcelain', '--untracked-files=no'", 'assert.deepEqual(source, frozen)', 'assert.deepEqual(await applicationIdentity(harness), frozen)', "changed.includes(preparationReleaseMarker), false", 'diagnosticCommit: env.GITHUB_SHA, sourceCommit: publicSourceCommit']) assert.ok(source.includes(text), text);
  for (const text of ['contents: read', 'path: harness', 'ref: ${{ github.sha }}', 'path: release-app', 'ref: affd86701a2f16060215b4507aa653e5229ee3a3', 'viewport: [desktop, mobile]', 'working-directory: release-app', 'timeout-minutes: 20', 'node scripts/cabin-savedata-diagnostic.generated.mjs']) assert.ok(workflow.includes(text), text);
  assert.doesNotMatch(workflow, /workflow_dispatch|GITHUB_SHA:|R35_SOURCE_SHA:|release-cabin-realism.*approved|railway up|git push|continue-on-error/);
  const driver = String(await read('scripts/diagnose-cabin-preparation.mjs'));
  assert.ok(driver.includes("assert.equal(commit, env.GITHUB_SHA)")); assert.ok(driver.includes("assert.equal(root, harness, 'Live proof and release source must be the same checkout')"));
  assert.equal(diagnosticContract, 'fixed-affd-cabin-savedata-diagnostic-v1');
});
