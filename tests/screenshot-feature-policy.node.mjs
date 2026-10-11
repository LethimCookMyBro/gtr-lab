import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../scripts/screenshot-feature-policy.mjs';
const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'LethimCookMyBro/gtr-lab', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: 'a'.repeat(40), R35_SCREENSHOT_FEATURE_COMMIT_MESSAGE: 'Reviewed [stage-screenshot-feature]', R35_ALLOW_SCREENSHOT_FEATURE: '1', R35_SCREENSHOT_FEATURE_MODE: 'default', R35_SCREENSHOT_FEATURE_PROTOCOL: '1', R35_SCREENSHOT_FEATURE_SOURCE_SHA: p.sourcePin.sha, R35_SCREENSHOT_FEATURE_SOURCE_TREE: p.sourcePin.tree };
const request = { version: 1, allow: true, protocolAttribution: true, sourceSha: p.sourcePin.sha, sourceTree: p.sourcePin.tree };
const argv = mode => ['/cache/chrome-headless-shell', '--enable-automation', '--disable-features=PaintHolding,Translate', ...(mode === 'default' ? [p.newSurfaceArgument] : []), '--use-angle=swiftshader', '--user-data-dir=/tmp/playwright_chromiumdev_profile-AbC123', '--remote-debugging-pipe', '--no-startup-window'];
const reports = () => ['default', 'ignored'].map(featureMode => ({ featureMode, sourceCommit: p.sourcePin.sha, sourceTree: p.sourcePin.tree, harnessCommit: env.GITHUB_SHA, viewport: 'desktop', scale: 'css', nativeDeviceScaleFactor: 2, reducedMotion: 'no-preference', protocolAttribution: true, actualBrowserArguments: argv(featureMode), initialGeometry: p.expectedNativeGeometry, attempts: ['01-initial', '02-orbit'].map(label => ({ label, before: p.expectedNativeGeometry, after: p.expectedNativeGeometry })), result: 'observed' }));
test('strict CI, main, source and explicit stage-specific opt-in are required', () => {
  assert.equal(p.validateFeatureEnvironment(env).featureMode, 'default');
  for (const patch of [{GITHUB_ACTIONS:'false'}, {GITHUB_REPOSITORY:'fork/repo'}, {GITHUB_REF:'refs/heads/other'}, {GITHUB_EVENT_NAME:'workflow_dispatch'}, {GITHUB_SHA:'main'}, {R35_SCREENSHOT_FEATURE_COMMIT_MESSAGE:'[stage-capture-path]'}, {R35_ALLOW_SCREENSHOT_FEATURE:'0'}, {R35_SCREENSHOT_FEATURE_SOURCE_SHA:'current'}, {R35_SCREENSHOT_FEATURE_SOURCE_TREE:'b'.repeat(64)}, {R35_SCREENSHOT_FEATURE_BASE_URL:'https://example.com'}, {R35_SCREENSHOT_FEATURE_MODE:'legacy'}, {R35_SCREENSHOT_FEATURE_PROTOCOL:'0'}]) assert.throws(() => p.validateFeatureEnvironment({...env,...patch}));
});
test('ambient legacy screenshot and raw/debug logging overrides are rejected even when empty', () => {
  for (const name of ['PLAYWRIGHT_LEGACY_SCREENSHOT','DEBUG','DEBUG_FILE']) for (const value of ['', '1']) assert.throws(() => p.validateFeatureEnvironment({...env,[name]:value}), new RegExp(name));
});
test('request resolves exact pinned source only and requires attribution identically enabled', () => {
  assert.equal(p.resolveFeatureRequest(request,env).R35_SCREENSHOT_FEATURE_PROTOCOL,'1');
  for (const patch of [{allow:false},{allow:'true'},{protocolAttribution:false},{protocolAttribution:'true'},{sourceSha:'current'},{version:2},{skipBlanks:true}]) assert.throws(() => p.resolveFeatureRequest({...request,...patch},env));
});
test('launch options remove only the exact default enable argument', () => {
  const common=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--enable-automation'];
  assert.deepEqual(p.featureLaunchOptions('default'),{args:common});
  assert.deepEqual(p.featureLaunchOptions('ignored'),{args:common,ignoreDefaultArgs:[p.newSurfaceArgument]});
  assert.throws(() => p.featureLaunchOptions('all'));
});
test('actual argv requires exact presence/absence and normalizes only one ephemeral profile suffix', () => {
  const args=argv('default'); const normalized=p.validateActualArguments('default',args);
  assert.equal(normalized[0],args[0]); assert.equal(normalized[1],args[1]); assert.match(normalized.find(a=>a.startsWith('--user-data-dir=')),/<ephemeral>/);
  assert.notEqual(args.find(a=>a.startsWith('--user-data-dir=')),normalized.find(a=>a.startsWith('--user-data-dir=')));
  assert.throws(()=>p.validateActualArguments('ignored',args));
  assert.throws(()=>p.validateActualArguments('default',args.filter(a=>a!=='--enable-automation')),/automation flag/);
  assert.throws(()=>p.validateActualArguments('default',[...args,'--enable-automation']),/automation flag/);
  assert.throws(()=>p.validateActualArguments('default',[...args,p.newSurfaceArgument]));
  assert.throws(()=>p.validateActualArguments('default',[...args,'--disable-features=CDPScreenshotNewSurface']));
  assert.throws(()=>p.validateActualArguments('ignored',argv('ignored').map(a=>a.startsWith('--user-data-dir=')?'--user-data-dir=/home/custom':a)));
  assert.throws(()=>p.validateActualArguments('ignored',argv('ignored').map(a=>a.startsWith('--user-data-dir=')?'--user-data-dir=/tmp/playwright_chromiumdev_profile-TooLong':a)));
});
test('two lanes prove sole intended argv difference and preserve failure outcomes', () => {
  const r=reports();r[1].actualBrowserArguments=r[1].actualBrowserArguments.map(a=>a.startsWith('--user-data-dir=')?'--user-data-dir=/tmp/playwright_chromiumdev_profile-XyZ987':a);r[0].result='failed';
  const result=p.compareFeatureLanes(r);assert.equal(result.soleArgumentDifference,true);assert.equal(result.nativeGeometryMatches,true);assert.deepEqual(result.failures,[]);assert.equal(result.outcomes.default,'failed');assert.equal(result.originalAcceptanceChanged,false);
});
test('unrelated switch differences, executable changes and mixed instrumentation invalidate comparison', () => {
  for (const mutate of [r=>r[1].actualBrowserArguments.push('--disable-gpu'),r=>r[1].actualBrowserArguments[0]='/other/chrome',r=>r[1].protocolAttribution=false,r=>r[1].harnessCommit='b'.repeat(40)]) { const r=reports(); mutate(r);assert(p.compareFeatureLanes(r).failures.length); }
});
test('every capture boundary must retain the exact reviewed native buffer', () => {
  const r=reports();r[1].attempts[1].after={...p.expectedNativeGeometry,buffer:{width:1440,height:744}};
  assert.equal(p.compareFeatureLanes(r).nativeGeometryMatches,false);
  delete r[1].attempts[1].after;assert.equal(p.compareFeatureLanes(r).boundaryEvidenceComplete,false);
  assert(p.compareFeatureLanes([r[0]]).failures.length);
});
