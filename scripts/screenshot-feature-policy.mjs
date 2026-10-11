/** Pure policy for a separate, instrumented screenshot-feature diagnostic. */
import assert from 'node:assert/strict';
export const sourcePin = Object.freeze({ sha: '70b7644944f908a0dfad8999b0a44a61d84d5d4d', tree: 'cd008a4eb221e3323b988a9119e4f7f5109ad90dbf122b08b32127dfea4232a2' });
export const expectedNativeGeometry = Object.freeze({ nativeDpr: 2, viewport: { width: 1440, height: 900 }, canvas: { x: 0, y: 0, width: 1440, height: 744 }, buffer: { width: 1967, height: 1016 } });
export const automationArgument = '--enable-automation';
const commonBrowserArguments = Object.freeze(['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', automationArgument]);
export const newSurfaceArgument = '--enable-features=CDPScreenshotNewSurface';
export function validateFeatureEnvironment(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Screenshot-feature diagnostic is CI-only');
  assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab'); assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_EVENT_NAME, 'push'); assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/, 'Exact harness SHA required');
  assert.ok((env.R35_SCREENSHOT_FEATURE_COMMIT_MESSAGE ?? '').includes('[stage-screenshot-feature]'), 'Explicit screenshot-feature marker required');
  assert.equal(env.R35_ALLOW_SCREENSHOT_FEATURE, '1', 'Explicit screenshot-feature opt-in required');
  assert.equal(env.R35_SCREENSHOT_FEATURE_SOURCE_SHA, sourcePin.sha); assert.equal(env.R35_SCREENSHOT_FEATURE_SOURCE_TREE, sourcePin.tree);
  assert.equal(env.R35_SCREENSHOT_FEATURE_BASE_URL, undefined, 'Arbitrary/public targets forbidden');
  assert.ok(['default', 'ignored'].includes(env.R35_SCREENSHOT_FEATURE_MODE), 'Only the exact two reviewed feature lanes are allowed');
  assert.equal(env.R35_SCREENSHOT_FEATURE_PROTOCOL, '1', 'Both lanes require explicit, instrumented attribution');
  for (const name of ['PLAYWRIGHT_LEGACY_SCREENSHOT', 'DEBUG', 'DEBUG_FILE']) assert.equal(env[name], undefined, `Ambient ${name} is forbidden`);
  return { name: 'desktop', scale: 'css', viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, protocolAttribution: true, featureMode: env.R35_SCREENSHOT_FEATURE_MODE, baseUrl: 'http://127.0.0.1:4178' };
}
export function resolveFeatureRequest(request, env) {
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'protocolAttribution', 'sourceSha', 'sourceTree', 'version']);
  assert.equal(request.version, 1); assert.equal(request.allow, true, 'Explicit boolean allow=true required');
  assert.equal(request.protocolAttribution, true, 'This separate comparison is instrumented identically in both lanes');
  const values = { R35_ALLOW_SCREENSHOT_FEATURE: '1', R35_SCREENSHOT_FEATURE_SOURCE_SHA: request.sourceSha, R35_SCREENSHOT_FEATURE_SOURCE_TREE: request.sourceTree, R35_SCREENSHOT_FEATURE_PROTOCOL: '1' };
  validateFeatureEnvironment({ ...env, ...values }); return values;
}
export function featureLaunchOptions(mode) {
  assert.ok(['default', 'ignored'].includes(mode));
  return { args: [...commonBrowserArguments], ...(mode === 'ignored' ? { ignoreDefaultArgs: [newSurfaceArgument] } : {}) };
}
/** Preserve all actual command-line arguments except the unique ephemeral profile suffix. */
export function validateActualArguments(mode, args) {
  assert.ok(['default', 'ignored'].includes(mode));
  assert(Array.isArray(args) && args.length > 1 && args.every(a => typeof a === 'string'), 'Actual browser command line is required');
  assert.equal(args.filter(a => a === automationArgument).length, 1, 'Actual command-line proof requires exactly one explicit automation flag in both lanes');
  const exact = args.filter(a => a === newSurfaceArgument);
  assert.equal(exact.length, mode === 'default' ? 1 : 0, 'Actual feature switch does not match the reviewed lane');
  const featureMentions = args.filter(a => /CDPScreenshotNewSurface/.test(a));
  assert.deepEqual(featureMentions, exact, 'No combined or conflicting feature override is allowed');
  const profiles = args.filter(a => a.startsWith('--user-data-dir='));
  assert.equal(profiles.length, 1, 'One ephemeral Chromium profile is required');
  assert.match(profiles[0], /^--user-data-dir=\/tmp\/playwright_chromiumdev_profile-[A-Za-z0-9]{6}$/, 'Only the expected CI ephemeral profile may be normalized');
  return args.map(a => a === profiles[0] ? '--user-data-dir=/tmp/playwright_chromiumdev_profile-<ephemeral>' : a);
}
export function compareFeatureLanes(reports) {
  const failures = [], control = reports.find(r => r.featureMode === 'default'), ignored = reports.find(r => r.featureMode === 'ignored');
  let soleArgumentDifference = false, nativeGeometryMatches = false, boundaryEvidenceComplete = false;
  if (reports.length !== 2 || !control || !ignored) failures.push('Both unique screenshot-feature lanes are required');
  if (control && ignored) {
    try {
      const a = validateActualArguments('default', control.actualBrowserArguments).filter(a => a !== newSurfaceArgument);
      const b = validateActualArguments('ignored', ignored.actualBrowserArguments);
      assert.deepEqual(b, a, 'Browser arguments differ beyond the single reviewed switch and ephemeral profile suffix'); soleArgumentDifference = true;
    } catch (error) { failures.push(error.message); }
    for (const r of reports) {
      if (r.sourceCommit !== sourcePin.sha || r.sourceTree !== sourcePin.tree || r.viewport !== 'desktop' || r.scale !== 'css' || r.nativeDeviceScaleFactor !== 2 || r.protocolAttribution !== true || r.reducedMotion !== 'no-preference') failures.push(`${r.featureMode}: exact instrumented fixed-source desktop CSS conditions required`);
    }
    if (control.harnessCommit !== ignored.harnessCommit || !/^[a-f0-9]{40}$/.test(control.harnessCommit ?? '')) failures.push('Both lanes must use the same exact harness commit');
    const geometry = g => g && { nativeDpr: g.nativeDpr, viewport: g.viewport, canvas: g.canvas, buffer: g.buffer };
    boundaryEvidenceComplete = reports.every(r => ['01-initial', '02-orbit'].every(label => r.attempts?.some(a => a.label === label)) && r.attempts.every(a => a.before && a.after));
    const expected = JSON.stringify(expectedNativeGeometry);
    nativeGeometryMatches = Boolean(boundaryEvidenceComplete && control.initialGeometry && ignored.initialGeometry && JSON.stringify(control.initialGeometry) === expected && JSON.stringify(ignored.initialGeometry) === expected && reports.every(r => r.attempts.every(a => [a.before, a.after].every(g => JSON.stringify(geometry(g)) === expected))));
    if (!nativeGeometryMatches) failures.push('Missing or unequal actual native geometry invalidates the feature comparison');
  }
  return { scope: 'Instrumented screenshot-feature diagnosis only; original normal-motion acceptance remains failed/incomplete', originalAcceptanceChanged: false, soleArgumentDifference, boundaryEvidenceComplete, nativeGeometryMatches, outcomes: { default: control?.result ?? 'missing', ignored: ignored?.result ?? 'missing' }, failures };
}
