/** Closed read-only diagnostic of one case against an already deployed immutable release. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { preparationTree, preparationOrigin, preparationContract, preparationReleaseMarker, models, sha256 } from './cabin-preparation-policy.mjs';
export const diagnosticContract = 'fixed-affd-cabin-savedata-diagnostic-v1';
export const diagnosticCase = 'savedata-and-nonpremium-boundaries';
export const publicSourceCommit = 'affd86701a2f16060215b4507aa653e5229ee3a3';
export const diagnosticToken = '[diagnose-cabin-savedata]';
export const repairedDriverSha256 = '38a510ded2e1737fe2472fca2fbaf16b6efc039fa173719f90d3ff7a74533bf3';
export const diagnosticHelperPins = Object.freeze({"scripts/cabin-runtime-body-ledger.mjs": "356ec061cdea91e834d9a060e1837d06e2cc2d9977bb4232aae3c0d2a239703b", "scripts/cabin-preparation-checkpoint.mjs": "4fe9c71291c32e2363ce1efa892ded92c3348beadacad519e4c2daeff3563b34"});
const readDiagnosticHelpers = async root => Object.fromEntries(await Promise.all(Object.keys(diagnosticHelperPins).map(async path => [path, await readFile(resolve(root, path))])));
export function validateSavedataDiagnostic(request, env) {
  assert.deepEqual(request, { version: 1, allow: true, contract: diagnosticContract, case: diagnosticCase, sourceCommit: publicSourceCommit, sourceTree: preparationTree, modelSha256: models[0].sha256 });
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab'); assert.equal(env.GITHUB_REF, 'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/); assert.notEqual(env.GITHUB_SHA, publicSourceCommit);
  assert.equal(env.R35_ALLOW_SAVEDATA_DIAGNOSTIC, '1'); assert.ok((env.R35_DIAGNOSTIC_COMMIT_MESSAGE ?? '').includes(diagnosticToken));
  assert.equal((env.R35_DIAGNOSTIC_COMMIT_MESSAGE ?? '').includes('[release-'), false);
  assert.ok(['desktop', 'mobile'].includes(env.R35_QA_VIEWPORT));
  for (const key of Object.keys(env)) if (key.startsWith('R35_')) assert.ok(['R35_QA_VIEWPORT', 'R35_ALLOW_SAVEDATA_DIAGNOSTIC', 'R35_DIAGNOSTIC_COMMIT_MESSAGE'].includes(key), `Unreviewed diagnostic override ${key}`);
  return { mode: 'live', name: env.R35_QA_VIEWPORT, lane: 'lifecycle', quality: 'standard', baseUrl: preparationOrigin('live'),
    ...(env.R35_QA_VIEWPORT === 'desktop' ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }) };
}
export function deriveSavedataDiagnostic(source, helperSources) {
  assert.deepEqual(Object.keys(helperSources ?? {}).sort(), Object.keys(diagnosticHelperPins).sort(), 'Exact reviewed diagnostic helper closure required');
  for (const [path, hash] of Object.entries(diagnosticHelperPins)) assert.equal(sha256(helperSources[path]), hash, `Reviewed diagnostic helper ${path}`);
  source = String(source); assert.equal(sha256(source), repairedDriverSha256, 'Only the exact reviewed repaired driver is eligible');
  const once = (before, after) => { assert.equal(source.split(before).length, 2, `One exact adapter seam: ${before.slice(0, 70)}`); source = source.replace(before, after); };
  const start = source.indexOf('  // This gate precedes filesystem traversal, browser/server imports and all sockets.');
  const end = source.indexOf('  await buildPreparationReadiness(harness);', start); assert.ok(start > 0 && end > start);
  once(source.slice(start, end), "  const { target, harness, root, request, release, source, commit, diagnostic } = await preflightSavedataDiagnostic(env, resolve(dirname(fileURLToPath(import.meta.url)), '..'));\n");
  once("const runCase = async (name, action, options = {}) => {", "const runCase = async (name, action, options = {}) => {\n    if (name !== diagnosticCase) return;");
  once("target.mode === 'live' ? 'cabin-live-results' : 'cabin-preparation-results'", "'cabin-savedata-diagnostic-results'");
  once("const report = { result: 'running', mode: target.mode, release, sourceCommit: commit", "const report = { result: 'diagnostic-running', diagnostic, mode: target.mode, release, sourceCommit: commit");
  once("{ source, commit, request, release, assets:", "{ source, commit, diagnostic, request, release, assets:");
  once("contract: request.contract, viewport:", "contract: diagnostic.contract, sourceContract: request.contract, viewport:");
  once("scope: 'Bounded functional preparation/residency proof on the actual built bundle and native-positive main completion. No historical causal/raster qualification is transferred.'", "scope: 'One-case SaveData diagnostic only. It is not a complete feature/lifecycle or release verdict; historical timed-out lanes remain failed.'");
  once("assert.deepEqual(report.cases.map(c => c.name), requiredCases[target.lane]); assert.ok(report.cases.every(c => c.result === 'passed')); report.result = 'passed';", "assert.deepEqual(report.cases.map(c => c.name), [diagnosticCase]); assert.ok(report.cases.every(c => c.result === 'passed')); report.result = 'diagnostic-passed';");
  once("assert.equal(report.result, 'passed', 'Preparation evidence failed; inspect the preserved report')", "assert.equal(report.result, 'diagnostic-passed', 'SaveData diagnostic failed; inspect the preserved report')");
  once("catch (error) { report.result = 'failed'; report.errors.push", "catch (error) { report.result = 'diagnostic-failed'; report.errors.push");
  once("report.shutdown.error = String(error); report.result = 'failed';", "report.shutdown.error = String(error); report.result = 'diagnostic-failed';");
  // The existing seven case bodies and their predicates are deliberately not transformed.
  return "import { preflightSavedataDiagnostic, diagnosticCase } from './cabin-savedata-diagnostic.mjs';\n" + source;
}
export async function preflightSavedataDiagnostic(env, harness) {
  const diagnosticRequest = JSON.parse(await readFile(resolve(harness, 'qa/cabin-savedata-diagnostic-request.json'))), target = validateSavedataDiagnostic(diagnosticRequest, env);
  const root = resolve(harness, '../release-app'); assert.notEqual(root, harness);
  const git = (directory, args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
  assert.equal(git(harness, ['rev-parse', 'HEAD']), env.GITHUB_SHA); assert.equal(git(root, ['rev-parse', 'HEAD']), publicSourceCommit);
  for (const directory of [harness, root]) assert.equal(git(directory, ['status', '--porcelain', '--untracked-files=no']), '', 'Both exact checkouts must remain clean');
  assert.equal(git(harness, ['log', '-1', '--format=%B']), env.R35_DIAGNOSTIC_COMMIT_MESSAGE.trim());
  const changed = git(harness, ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD']).split('\n'); assert.ok(changed.includes('qa/cabin-savedata-diagnostic-request.json'));
  assert.equal(changed.includes(preparationReleaseMarker), false, 'A diagnostic never writes release approval');
  const source = await applicationIdentity(root), frozen = JSON.parse(await readFile(resolve(harness, 'qa/fixtures/cabin-preparation-identity.json')));
  assert.deepEqual(source, frozen); assert.equal(source.sha256, preparationTree); assert.deepEqual(await applicationIdentity(harness), frozen);
  const request = JSON.parse(await readFile(resolve(root, 'qa/cabin-preparation-request.json'))), release = JSON.parse(await readFile(resolve(root, preparationReleaseMarker)));
  assert.equal(request.sourceTree, preparationTree); assert.equal(request.contract, preparationContract); assert.equal(request.modelSha256, models[0].sha256); assert.equal(release.sourceTree, preparationTree); assert.equal(release.modelSha256, models[0].sha256);
  const driver = await readFile(resolve(harness, 'scripts/diagnose-cabin-preparation.mjs'));
  const generated = deriveSavedataDiagnostic(driver, await readDiagnosticHelpers(harness)); assert.equal(generated, await readFile(resolve(harness, 'scripts/cabin-savedata-diagnostic.generated.mjs'), 'utf8'));
  return { target, harness, root, request, release, source, commit: publicSourceCommit,
    diagnostic: { contract: diagnosticContract, case: diagnosticCase, diagnosticCommit: env.GITHUB_SHA, sourceCommit: publicSourceCommit, request: diagnosticRequest, driverSha256: sha256(driver), helperPins: diagnosticHelperPins, generatedSha256: sha256(generated) } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  validateSavedataDiagnostic(JSON.parse(await readFile(resolve(root, 'qa/cabin-savedata-diagnostic-request.json'))), process.env);
  const generated = deriveSavedataDiagnostic(await readFile(resolve(root, 'scripts/diagnose-cabin-preparation.mjs')), await readDiagnosticHelpers(root));
  await writeFile(resolve(root, 'scripts/cabin-savedata-diagnostic.generated.mjs'), generated); console.log(JSON.stringify({ generatedSha256: sha256(generated) }));
}
