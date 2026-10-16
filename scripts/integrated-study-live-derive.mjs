/** Exact-source adapters only. No browser, HTTP, server or socket execution. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'Unique closed adapter substitution');
  return source.replace(before, after);
}
export function deriveStudyLiveTest(bytes) {
  assert.equal(hash(bytes), '3e9aa7e936da717fe176b7fce6babeae896e410ac7b545ddd9870669bb61e360');
  let source=String(bytes);
  source=replaceOnce(source, '../scripts/integrated-study-readiness.mjs', '../scripts/integrated-study-live-readiness.mjs');
  source=replaceOnce(source, '../scripts/integrated-study-network.mjs', '../scripts/integrated-study-live-network.mjs');
  source=replaceOnce(source, 'const reports = new WeakMap<Page, any>();', '// @ts-expect-error Closed live application-body adapter.\nimport { observeStudyLiveAppBodies } from "../scripts/integrated-study-live-contract.mjs";\nconst appObservers = new WeakMap<Page, any>();\nconst reports = new WeakMap<Page, any>();');
  source=replaceOnce(source, '  reports.set(page, report);', '  reports.set(page, report);\n  appObservers.set(page, observeStudyLiveAppBodies(page, verifiedSource.assets, report));');
  source=replaceOnce(source, '        await bodyObservers.get(page).verify(report.pageResponses, report.requestFailures);', '        report.appBodies = await appObservers.get(page).finish();\n        remaining();\n        await bodyObservers.get(page).verify(report.pageResponses, report.requestFailures);');
  return source;
}
export function deriveStudyLiveNetwork(bytes) {
  assert.equal(hash(bytes), '8e1fc05e8157a37377115fae610b20b84e5d9c2868db8ac81ed8e5c7fffbb5c3');
  return replaceOnce(String(bytes), 'http://127.0.0.1:4173', 'https://gtr-lab-production.up.railway.app');
}
