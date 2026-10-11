import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { main } from '../scripts/diagnose-screenshot-feature.mjs';
test('unapproved driver exits before helper, browser or server import/setup', async () => { await assert.rejects(main({}),/CI-only/); });
test('driver reuses immutable models, original screenshot promise/retry and fixed native evidence',async()=>{
 const s=await readFile(new URL('../scripts/diagnose-screenshot-feature.mjs',import.meta.url),'utf8');
 assert(s.indexOf('validateFeatureEnvironment(env)')<s.indexOf("await import('@playwright/test')"));
 for(const pattern of [/const cabinModels = captureModels/,/runCaptureAttempt/,/captureWithTimeoutRetry/,/timeout: 45_000/,/reducedMotion: 'no-preference'/,/expectedNativeGeometry/,/Browser.getBrowserCommandLine/,/validateActualArguments/,/sceneIds.has\(f.contextId\) && f.complete !== false/,/mapped.pixelBounds/,/browser = await launchFeatureBrowser\(chromium, target.featureMode\)/]) assert.match(s,pattern);
 assert.doesNotMatch(s,/cabin-integration-policy|setViewportSize|readPixels\(|animations: 'disabled'|reducedMotion: 'reduce'/);
});
test('new workflow has exactly two desktop CSS feature lanes and leaves old request outside trigger',async()=>{
 const w=await readFile(new URL('../.github/workflows/screenshot-feature-diagnostic.yml',import.meta.url),'utf8');
 assert.match(w,/feature: \[default, ignored\]/);assert.match(w,/\[stage-screenshot-feature\]/);assert.match(w,/summary.failures.length/);
 assert.doesNotMatch(w,/matrix.viewport|matrix.scale|capture-path-request.json|dpr-motion-request.json/);
 const q=JSON.parse(await readFile(new URL('../qa/screenshot-feature-request.json',import.meta.url),'utf8'));assert.equal(q.allow,true);assert.equal(q.protocolAttribution,true);
});
test('actual launcher receives automation metadata flag equally in both feature lanes without losing SwiftShader args', async()=>{
 const {launchFeatureBrowser}=await import('../scripts/diagnose-screenshot-feature.mjs');
 const calls=[], browser={fake:true};
 const chromium={launch:async options=>{calls.push(options);assert(options.args.includes('--enable-automation'),'CDP command-line metadata prerequisite missing');return browser;}};
 for(const mode of ['default','ignored']) assert.equal(await launchFeatureBrowser(chromium,mode),browser);
 const expected=['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader','--enable-automation'];
 assert.deepEqual(calls[0],{timeout:30_000,args:expected});
 assert.deepEqual(calls[1],{timeout:30_000,args:expected,ignoreDefaultArgs:['--enable-features=CDPScreenshotNewSurface']});
 const failure=new Error('launcher failed');await assert.rejects(launchFeatureBrowser({launch:async()=>{throw failure;}},'default'),error=>error===failure);
});
