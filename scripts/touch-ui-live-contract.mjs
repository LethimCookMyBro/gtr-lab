/** Explicit source-bound UI audit targets. Browser execution is GitHub CI only. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createUiReceipts } from './ui-optimization-receipts.mjs';
import { applicationIdentity } from './diagnose-dpr-motion.mjs';
import { formulaEBuildIdentity, readFormulaEAssets, validateFormulaELiveRequest } from './formula-e-live-contract.mjs';
export const TOUCH_UI_CONTRACT = 'gtr-touch-ui-source-bound-v1';
export const TOUCH_UI_REQUEST = 'qa/touch-ui-live-request.json';
export const TOUCH_UI_VIEWPORTS = Object.freeze([
  { name: 'phone-320', width: 320, height: 568, deviceScaleFactor: 2, touch: true },
  { name: 'phone-390', width: 390, height: 844, deviceScaleFactor: 3, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, deviceScaleFactor: 2, touch: true },
  { name: 'tablet-820', width: 820, height: 1180, deviceScaleFactor: 2, touch: true },
  { name: 'tablet-landscape-1024', width: 1024, height: 768, deviceScaleFactor: 2, touch: true },
  { name: 'desktop-1440', width: 1440, height: 900, deviceScaleFactor: 1, touch: false },
]);
export const TOUCH_UI_BASELINE = Object.freeze({
  version: 1, allow: true, origin: 'https://gtr-lab-production.up.railway.app',
  expectedDeployedCommit: '91deb84a863ae1d0ca7e909564f618ea9f6959aa',
  railwayDeploymentId: '5ebece66-dbaf-4396-affe-3759f57b6c75',
  sourceTree: 'f353b758035fcc65b88376a46b5cf7c5c3e14016c1769f052368070efbe7f5dc', sourceFiles: 103,
  buildSha256: 'a07a992b2d5a925015b99de14b6c5a469d0ec2875f67fd1c29549f536c28ba7e',
});
export function validateTouchRequest(request) {
  assert.deepEqual(Object.keys(request ?? {}).sort(), ['version','allow','contract','mode','target'].sort());
  assert.equal(request.version, 1); assert.equal(request.allow, true); assert.equal(request.contract, TOUCH_UI_CONTRACT);
  assert.ok(['baseline-live','candidate-ci'].includes(request.mode));
  if (request.mode === 'baseline-live') {
    validateFormulaELiveRequest(request.target);
    assert.deepEqual(request.target, TOUCH_UI_BASELINE, 'Live baseline is frozen; changing it requires a reviewed contract');
  } else {
    // A future reviewed candidate request changes checked-in pins, never an environment override.
    assert.deepEqual(Object.keys(request.target ?? {}).sort(), ['origin','sourceTree','sourceFiles'].sort());
    assert.equal(request.target.origin, 'http://127.0.0.1:4173');
    assert.match(request.target.sourceTree ?? '', /^[a-f0-9]{64}$/);
    assert.ok(Number.isSafeInteger(request.target.sourceFiles) && request.target.sourceFiles >= 103);
    assert.notEqual(request.target.sourceTree, TOUCH_UI_BASELINE.sourceTree, 'Candidate must identify its reviewed changed source');
  }
  return request;
}
export function validateTouchCI(request, env = process.env) {
  validateTouchRequest(request);
  for (const [key,value] of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',TOUCH_UI_ALLOW:'1'})) assert.equal(env[key],value,key);
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/);
  const token = request.mode === 'baseline-live' ? '[verify-touch-ui-live]' : '[stage-touch-ui]';
  assert.ok(env.TOUCH_UI_COMMIT_MESSAGE?.includes(token), 'Explicit matching audit token required');
  assert.ok(!env.TOUCH_UI_COMMIT_MESSAGE.includes('[release-'), 'QA-only push cannot authorize a release');
  assert.ok(TOUCH_UI_VIEWPORTS.some(target => target.name === env.TOUCH_UI_VIEWPORT) || env.TOUCH_UI_VIEWPORT === 'build');
  assert.ok(['home-collection','configurator','build'].includes(env.TOUCH_UI_AREA));
  for (const key of Object.keys(env).filter(key => key.startsWith('TOUCH_UI_'))) assert.ok(['TOUCH_UI_ALLOW','TOUCH_UI_COMMIT_MESSAGE','TOUCH_UI_VIEWPORT','TOUCH_UI_AREA'].includes(key), `Unreviewed override ${key}`);
}
export async function loadTouchRequest(env = process.env) {
  const request = validateTouchRequest(JSON.parse(await readFile(TOUCH_UI_REQUEST,'utf8')));
  validateTouchCI(request,env); return request;
}
export function assertTouchSource(identity, request) {
  validateTouchRequest(request);
  assert.equal(identity?.sha256,request.target.sourceTree,'Audit production source differs from reviewed request');
  assert.equal(identity?.files?.length,request.target.sourceFiles,'Incomplete production identity');
}
export function assertTouchBuild(assets, request) {
  validateTouchRequest(request); const build = formulaEBuildIdentity(assets);
  if(request.mode === 'baseline-live') assert.equal(build.sha256,request.target.buildSha256,'Local build differs from accepted live bytes');
  return build;
}
export async function verifyTouchCheckout(env = process.env) {
  const request = await loadTouchRequest(env);
  const git = args => execFileSync('git',args,{encoding:'utf8'}).trim();
  assert.equal(git(['rev-parse','HEAD']),env.GITHUB_SHA);
  assert.equal(git(['status','--porcelain','--untracked-files=no']),'','Tracked audit and source must stay clean');
  git(['ls-files','--error-unmatch',TOUCH_UI_REQUEST]);
  if(request.mode === 'baseline-live') git(['merge-base','--is-ancestor',request.target.expectedDeployedCommit,'HEAD']);
  const source = await applicationIdentity('.'); assertTouchSource(source,request);
  return {request,source,harnessCommit:env.GITHUB_SHA};
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const identity = await verifyTouchCheckout();
  if(process.argv[2] === '--check-build') identity.build = assertTouchBuild(await readFormulaEAssets(),identity.request);
  else assert.equal(process.argv[2],'--check-checkout');
  console.log(JSON.stringify(identity,null,2));
}

/** CPU-tested acceptance of the actual browser input receipt, including short surfaces. */
export function assessTouchGesture({touch,direction,before,after,observed = [],kind}) {
  const failures = [];
  if(!['forward','backward'].includes(direction) || ![before?.position,before?.max].every(Number.isFinite)) return ['Invalid scroll receipt'];
  const canScroll = direction === 'forward' ? before.position < before.max-2 : before.position > 2;
  if(kind === 'no-scroll-required') return canScroll ? ['Scrollable surface cannot be marked no-scroll-required'] : [];
  if(!Number.isFinite(after?.position)) return ['Missing observed scroll'];
  if((after.position-before.position)*(direction === 'forward'?1:-1) <= 2) failures.push('Native gesture did not advance scroll in its requested direction');
  if(touch) for(const type of ['touchstart','touchmove','touchend']) if(!observed.some(event=>event.type === type && event.trusted === true)) failures.push(`Missing trusted ${type}`);
  return failures;
}

/** Reuse the reviewed exact live UI adapter and its original 15s drain windows. */
export function createTouchRuntimeEvidence({page,origin,pins,receipts,...clock}) {
  assert.ok([TOUCH_UI_BASELINE.origin,'http://127.0.0.1:4173'].includes(origin));
  const accepted = new Map(pins);
  // The existing drawer adapter normalizes / and /configurator/* documents.
  // Catalog is the same accepted HTML; adding an alias changes no body identity.
  assert.ok(accepted.has('/index.html'));
  accepted.set('/models',accepted.get('/index.html'));
  return createUiReceipts({page,origin,pins:accepted,receipts,...clock});
}
export function assertTouchRuntimeRequest({url,resourceType,mainFrame,redirected},origin,pins) {
  const parsed=new URL(url);
  if(!mainFrame && parsed.origin!==origin) return 'provider-frame-outside-app-identity';
  if(['document','script','stylesheet'].includes(resourceType)) {
    assert.equal(parsed.origin,origin,'App document/bundle escaped reviewed origin');
    assert.equal(parsed.search,'','App runtime must not add a query');
    assert.equal(redirected,false,'App runtime must not redirect');
    if(resourceType!=='document') assert.ok(pins.has(parsed.pathname),'Unpinned app bundle');
  }
  return 'application';
}
export function assertTouchRuntimeComplete(snapshot) {
  assert.equal(snapshot?.state,'finished','App runtime body ledger did not finish');
  assert.deepEqual(snapshot.eventErrors,[],'App runtime body event failures');
  for(const kind of ['html','js','css']) assert.ok(snapshot.requests.some(row=>row.state==='body-completed' && (kind==='html' ? ['/index.html','/models'].includes(row.path) : row.path.endsWith('.'+kind))),`Missing completed ${kind} app body`);
  return snapshot;
}
