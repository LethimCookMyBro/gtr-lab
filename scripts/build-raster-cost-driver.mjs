/** Source-only generator. Does not import or run the generated browser driver. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const originalDriverHash = '7135b466b3318d5bbeb8a7b4a4867a7fbf5e33796cf54b973285d9f2af2f2e3c';
export function deriveRasterDriver(original) {
  assert.equal(createHash('sha256').update(original).digest('hex'), originalDriverHash, 'Reviewed driver bytes must be unchanged');
  let source = String(original);
  const replace = (from, to) => { assert.equal(source.split(from).length, 2, `Exactly one reviewed anchor: ${from.slice(0, 70)}`); source = source.replace(from, to); };
  replace("import { validateDrainedKeyEnvironment, assessDrainedKeyObservation, limits } from './drained-key-policy.mjs';", `import { validateRasterEnvironment, assessRasterObservation, limits, msaaProof } from './raster-cost-policy.mjs';
import { installRasterStateObserver } from './raster-cost-state-observer.mjs';
import { collectDistAssets, sharedAssetBodies, runnerIdentity, backendIdentity } from './raster-cost-evidence.mjs';`);
  replace('const target = validateDrainedKeyEnvironment(env);', 'const target = validateRasterEnvironment(env);');
  replace('featureLaunchOptions, validateActualArguments, expectedNativeGeometry', 'featureLaunchOptions, validateActualArguments');
  replace("const { launchFeatureBrowser }", "const expectedNativeGeometry = target.expectedGeometry;\n  const { launchFeatureBrowser }");
  replace("const bundles = new Map([['/index.html', hash(await readFile(resolve(root, 'dist/index.html')))]]);\n  for (const name of await readdir(resolve(root, 'dist/assets'))) if (/\\.(?:js|css)$/.test(name)) bundles.set(`/assets/${name}`, hash(await readFile(resolve(root, 'dist/assets', name))));", "const bundles = await collectDistAssets(resolve(root, 'dist'));");
  replace("const output = resolve('drained-key-results/desktop');", 'const output = resolve(target.output);');
  replace("const report = { scope:", 'const report = { trial: target.trial, lane: target.lane, runnerIdentity: runnerIdentity(env), stateSnapshots: [], unpinnedRuntime: [], scope:');
  replace('explicitJavascriptFlush: false,', 'observerExplicitFlush: false, productionExplicitFlush: true,');
  replace('No explicit JavaScript flush is called, but pinned Chromium query polling and ANGLE fence creation can internally flush/submit work. The instrumentation is not a passive scheduling control.', 'The unchanged production completion-pacing path explicitly calls flush(); the observer does not. Pinned Chromium query polling and ANGLE fence creation can also internally flush/submit work. Both treatments use identical instrumentation and scheduler.');
  replace("limitations: ['One 45s screenshot", "limitations: ['Production read-only state observation is activated identically in both lanes and adds instrumentation overhead. Creation-only MSAA queries are outside timing. Nominal pixel caps are not actual pixel counts.', 'One 45s screenshot");
  replace("assert.match(JSON.stringify(report.gpu), /SwiftShader/i);", "assert.match(JSON.stringify(report.gpu), /SwiftShader/i); report.backend = backendIdentity(report.gpu);");
  replace('({maxRecords:8192});(${installDrainedKeyObserver.toString()})', '({maxRecords:8192,observeContextCreation:true});(${installRasterStateObserver.toString()})();(${installDrainedKeyObserver.toString()})');
  replace("if (!bundles.has(path) && !modelPins.some(m => m.path === path)) return;", "if (!bundles.has(path) || url.origin !== target.baseUrl) { if (/^https?:$/.test(url.protocol)) report.unpinnedRuntime.push({url: response.url, path, status: response.status}); return; }");
  replace('let cleanGate;', `const recordState = async name => {
      const state = await bounded(page.evaluate(() => {
        const state=window.__r35RasterState.read(),context=window.__r35DrainedKey.status().contexts.find(c=>c.sceneCanvas);
        return {...state,outsideRafMethods:context.outsideRafMethods,outsideRafDrawCalls:context.outsideRafDrawCalls};
      }), limits.commandMs, 'Read checkpoint scene state');
      report.stateSnapshots.push({ name, ...state }); await save();
    };
    let cleanGate;`);
  replace('return api.status().pendingObservedFrames?null:api.checkpoint(name);', 'return api.status().pendingObservedFrames||!window.__r35RasterState.ready()?null:api.checkpoint(name);');
  replace("cleanGate=await gate('initial');", "cleanGate=await gate('initial');await recordState('initial');");
  replace('cleanGate=await gate(`key-${index}`,index);await geometry();', 'cleanGate=await gate(`key-${index}`,index);await geometry();await recordState(`key-${index}`);');
  replace('dimensions:window.__r35DprMotion.snapshot()', 'dimensions:window.__r35DprMotion.snapshot(),state:window.__r35RasterState.snapshot()');
  replace('report.assessment=assessDrainedKeyObservation(data.observation);', `report.assessment=assessRasterObservation(data.observation,target.lane);
      report.stateEvidence=data.state;
      report.frameEntryEvidence=data.observation.frames.map(f=>({id:f.id,entryCleanCheckpoint:f.entryCleanCheckpoint,entryCheckpointId:f.entryCheckpointId}));
      if(data.state.issues.length||data.state.reads!==4)report.assessment.failures.push('Four healthy state checkpoints required');
      report.requestedContextAttributes=data.observation.contexts.find(c=>c.sceneCanvas)?.requestedAttributes;
      const sceneContexts=data.dimensions.contexts.filter(c=>c.sceneCanvas);
      assert.equal(sceneContexts.length,1); report.contextCreation=sceneContexts[0].creation; msaaProof(report.contextCreation);`);
  replace("for(const path of ['/index.html',...modelPins.map(m=>m.path)])", "report.sharedRuntimeAssets=sharedAssetBodies(report.runtimeBodies);\n      if(report.unpinnedRuntime.length)report.assessment.failures.push('Unpinned or external runtime response');\n      for(const path of ['/index.html',...modelPins.map(m=>m.path)])");
  replace("for(const [name,action]of [['browser session detach'", "report.cleanupConfirmed = true;\n    for(const [name,action]of [['browser session detach'");
  replace("catch(error){report.result='failed';report.errors.push({phase:'cleanup',message:String(error)});}", "catch(error){report.cleanupConfirmed=false;report.result='failed';report.errors.push({phase:'cleanup',message:String(error)});}");
  return source;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = dirname(fileURLToPath(import.meta.url));
  await writeFile(resolve(root, 'diagnose-raster-cost-trial.mjs'), deriveRasterDriver(await readFile(resolve(root, 'diagnose-drained-key.mjs'))));
}
