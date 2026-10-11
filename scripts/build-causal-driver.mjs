import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL}from'node:url';
import assert from 'node:assert/strict';
import {hash}from'./causal-motion-preflight.mjs';
export const originalDriverHash='b56d962004c4d0a65e0080eec5f9138c76f18e5b22602ea455bc5f64ecf97110';
export function deriveCausalDriver(original){
  assert.equal(hash(original),originalDriverHash,'The original driver is immutable');
  let source=String(original);
  const replace=(from,to)=>{assert.equal(source.split(from).length,2,`Exact single instrumentation anchor: ${from.slice(0,50)}`);source=source.replace(from,to);};
  replace("import assert from 'node:assert/strict';",`import assert from 'node:assert/strict';
import {createCabinOracle} from './causal-cabin-model.mjs';
import {installCausalMotionObserver} from './causal-motion-observer.mjs';
import {validateCausalEnvironment,prepareCausalConfig} from './causal-motion-preflight.mjs';
import {collectCausalCapture} from './causal-capture.mjs';
import {tracePage} from './causal-transport-ledger.mjs';
import {assessObservedEffectRun} from './causal-observed-effect-policy.mjs';`);
  replace('  const target = validateMotionEnvironment(env);',`  const collectorRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  const causalRequest=JSON.parse(await readFile(resolve(collectorRoot,'qa/causal-motion-request.json'),'utf8'));
  const resolved=validateCausalEnvironment(env,causalRequest);
  env={...env,...resolved};
  const target = validateMotionEnvironment(env);`);
  replace("  const cabinModels = motionModelsForSource(source.sha256);",`  const cabinModels = motionModelsForSource(source.sha256);
  const causalConfig=await prepareCausalConfig(root,collectorRoot,causalRequest,target.name);
  const causalTransactions=[],transportLedger=[];`);
  replace("dpr-motion-results/${target.mode}-${target.name}","causal-motion-results/${target.mode}-${target.name}");
  replace('    page = await context.newPage(); page.setDefaultTimeout(15_000);',`    await context.addInitScript({content:\`globalThis.__r35CreateCabinOracle=(\${createCabinOracle.toString()});(\${installCausalMotionObserver.toString()})(\${JSON.stringify(causalConfig)});\`});
    page = tracePage(await context.newPage(),transportLedger); page.setDefaultTimeout(15_000);`);
  // Playwright does not guarantee ordering across distinct init scripts. Combine before page creation.
  replace('    await context.addInitScript({ content: `(${installCabinResourceObserver.toString()})({maxFrames:8192});(${installDprMotionObserver.toString()})({maxRecords:8192,observeContextCreation:${Boolean(target.geometry?.contextCreation)}});` });',`    await context.addInitScript({ content: \`(\${installCabinResourceObserver.toString()})({maxFrames:8192});(\${installDprMotionObserver.toString()})({maxRecords:8192,observeContextCreation:\${Boolean(target.geometry?.contextCreation)}});globalThis.__r35CreateCabinOracle=(\${createCabinOracle.toString()});(\${installCausalMotionObserver.toString()})(\${JSON.stringify(causalConfig)});\` });`);
  replace('    await context.addInitScript({content:`globalThis.__r35CreateCabinOracle=(${createCabinOracle.toString()});(${installCausalMotionObserver.toString()})(${JSON.stringify(causalConfig)});`});\n','');
  replace('const cdp = await context.newCDPSession(page);','const cdp = await context.newCDPSession(context.pages()[0]);');
  replace('window.__r35DprMotion.mark(name, stable);','window.__r35DprMotion.mark(name, stable); window.__r35CausalMotion.mark(name);');
  replace("const png = await captureWithTimeoutRetry(() => page.screenshot({ path: file, timeout: 45_000, scale: 'css' }), async error => { report.screenshotRetries.push({ phase, captureRetry: label, reason: error.message, maxAttempts: 2, timeoutMs: 45_000 }); await save(); });", "const png = await collectCausalCapture({page,label,file,transactions:causalTransactions,onRetry:async error => { report.screenshotRetries.push({ phase, captureRetry: label, reason: error.message, maxAttempts: 2, timeoutMs: 45_000 }); await save(); }});");
  replace("await save(); return report.captures.at(-1);", "causalTransactions.at(-1).pixels=report.captures.at(-1); causalTransactions.at(-1).evidenceFinishedAt=performance.now();\n      await save(); return report.captures.at(-1);");
  replace('      await page.setViewportSize(changed);', '      await page.setViewportSize(changed); await page.evaluate(()=>globalThis.__r35CausalMotion.resize());');
  replace('    await save(); await browser?.close()',`    if(page){try{
      const causal=await page.evaluate(()=>globalThis.__r35CausalMotion.report());
      const historical=await readFile(resolve(collectorRoot,'evidence',target.name+'-original-report.json'));
      const sidecar=assessObservedEffectRun({causal,transactions:causalTransactions,transportLedger,report,source,causalRequest,historical,config:{...causalConfig,bundlePins:Object.fromEntries(bundles)}});
      await writeFile(output+'/causal-report.json',JSON.stringify(sidecar,null,2));
      if(sidecar.result==='insufficient')process.exitCode=1;
      await writeFile(output+'/causal-observations.json',JSON.stringify({causal,transactions:causalTransactions,transportLedger},null,2));
    }catch(error){process.exitCode=1;await writeFile(output+'/causal-collector-error.json',JSON.stringify({result:'insufficient',error:String(error)},null,2));}}
    await save(); await browser?.close()`);
  return source;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const dir=dirname(fileURLToPath(import.meta.url));await writeFile(resolve(dir,'diagnose-causal-motion.mjs'),deriveCausalDriver(await readFile(resolve(dir,'diagnose-dpr-motion.mjs'))));}
