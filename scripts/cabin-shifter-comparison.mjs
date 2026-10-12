/** Exact-preimage source adapter. New request is disabled by default; no public target. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {sha256,requestPath,validateComparisonEnvironment,verifyFilePins,helperPaths} from './cabin-shifter-comparison-policy.mjs';
export const collectorPreimage='55b4447832474776d78b883ccd4daf4abdb9797ad70ff01159c244cc8e0eb0d8';
export function deriveShifterCollector(source) {
 assert.equal(sha256(source),collectorPreimage,'Proven collector must remain byte-identical');let text=String(source);
 const once=(before,after)=>{assert.equal(text.split(before).length,2,`Exactly one bounded derivation preimage: ${before}`);text=text.replace(before,after);};
 once("from './cabin-leather-comparison-policy.mjs';","from './cabin-shifter-comparison-policy.mjs';\nimport {closeupInputs,closeupOracle,selectorFraming,installShifterInputObserver,assertCloseupCapture} from './cabin-shifter-closeup.mjs';");
 once("env.R35_LEATHER_COMMIT_MESSAGE??''","env.R35_SHIFTER_COMMIT_MESSAGE??''");
 once("resolve('cabin-leather-results',","resolve('cabin-shifter-results',");
 once("qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz","qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz");
 once('report.material=inspectMaterialModel(','report.material=await inspectMaterialModel(');
 once("    page=await context.newPage();", "    await context.addInitScript({content:`(${installShifterInputObserver.toString()})();`});\n    page=await context.newPage();");
 once('phase=label;assert.ok(report.captures.length<5);',"phase=label;assert.ok(report.captures.length<(target.name==='desktop'?6:5));");
 once("if(seat){oracle.reset(seat);const d=certificate.snapshot.dimensions;assert.ok(oracle.compare(certificate.snapshot,d.renderWidth,d.renderHeight),'Independent exact seat pose/projection');}","if(seat){oracle.reset(seat);const expectedOracle=label==='shifter-top'?closeupOracle(transform):oracle;const d=certificate.snapshot.dimensions;assert.ok(expectedOracle.compare(certificate.snapshot,d.renderWidth,d.renderHeight),'Independent exact seat/diagnostic pose/projection');}");
 once("    const retireWindow=readinessWindow(budgets.lifecycle);",`    if(target.name==='desktop') {
      const window=readinessWindow(budgets.functional);await armFunctionalCapture(page);
      await tap(canvas,window);await boundedOperation(window,'start passive close-up input receipts',()=>page.evaluate(()=>globalThis.__r35ShifterInputs.start()));
      const bounds=await canvas.boundingBox();assert.ok(bounds);
      await boundedOperation(window,'place trusted wheel over canvas',()=>page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2));
      for(const input of closeupInputs)await boundedOperation(window,'fixed bounded diagnostic input',()=>input.type==='keydown'?page.keyboard.press(input.key):page.mouse.wheel(0,input.deltaY));
      const row=await capture('shifter-top','driver',window);
      row.inputs=await boundedOperation(row.screenshotWindow,'read exact trusted input receipts',()=>page.evaluate(()=>globalThis.__r35ShifterInputs.stop()));
      row.framing=selectorFraming(row.certificate.snapshot,transform);
      assertCloseupCapture(row,await snap(row.screenshotWindow),target,transform);assert.equal(row.certificate.owner,owner);
      assertResidentWorkUnchanged(initialWork,(await snap(row.screenshotWindow)).totals);await save();
    }
    const retireWindow=readinessWindow(budgets.lifecycle);`);
 once('Actual production WebGL material-only comparison with native frame certificates and 11-image preparation/residency retirement. SwiftShader only; no performance or physical-device claim.','Actual production WebGL cap-normal-only comparison. Unchanged five functional captures plus one desktop diagnostic through existing trusted controls; native frame certificates and 11-image preparation/residency retirement. No performance, total-time or physical-device claim.');
 once("if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});\n",'');
 return text;
}
export async function main(env=process.env) {
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),request=JSON.parse(await readFile(resolve(root,requestPath)));
 // All gates and closure checks precede generated import, Playwright, server or sockets.
 validateComparisonEnvironment(env,request);await verifyFilePins(root,request.helperPins,helperPaths);
 const source=await readFile(resolve(root,'scripts/collect-cabin-leather-comparison.mjs'),'utf8');
 const generated=deriveShifterCollector(source),path=resolve(root,'scripts/cabin-shifter-collector.generated.mjs');await writeFile(path,generated);
 const {main:collect}=await import(pathToFileURL(path));return collect(env);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
