/** New closed adapter. Import/validation is socket-free; collection is CI-only. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {deriveShifterCollector} from './cabin-shifter-comparison.mjs';
import {requestPath,validateComparisonEnvironment,verifyFilePins,helperPaths} from './cabin-selector-topology-policy.mjs';
export function deriveSelectorCollector(source) {
 let text=deriveShifterCollector(source);
 const once=(before,after)=>{assert.equal(text.split(before).length,2,`Exactly one selector derivation preimage: ${before}`);text=text.replace(before,after);};
 once("from './cabin-shifter-comparison-policy.mjs';","from './cabin-selector-topology-policy.mjs';\nimport {collectSelectorViews,assertCloseupFromDriver} from './cabin-selector-topology-path.mjs';");
 once('env.R35_SHIFTER_COMMIT_MESSAGE','env.R35_SELECTOR_COMMIT_MESSAGE');
 once("resolve('cabin-shifter-results',target.lane+'-'+target.name)","resolve('cabin-selector-topology-results',target.lane+'-'+target.name+'-'+target.mode)");
 once('lane:target.lane,viewport:target.name,','lane:target.lane,viewport:target.name,mode:target.mode,');
 once("report.captures.length<(target.name==='desktop'?6:5)","report.captures.length<(target.mode==='diagnostic'?3:5)");
 const driver="    await enter('driver');\n",passenger=text.indexOf(driver)+driver.length,diagnostic=text.indexOf("    if(target.name==='desktop') {",passenger),retirement=text.indexOf('    const retireWindow=',diagnostic);
 assert.ok(passenger>driver.length&&diagnostic>passenger&&retirement>diagnostic);
 const acceptance=text.slice(passenger,diagnostic),closeup=text.slice(diagnostic,retirement);
 assert.ok(acceptance.includes("await capture('passenger','passenger'"));assert.ok(acceptance.includes("await enter('driver-repeat')"));
 assert.equal(closeup.split("assertCloseupCapture(row,await snap(row.screenshotWindow),target,transform);").length,2);
 const body=closeup.replace("    if(target.name==='desktop') {\n",'').replace(/    }\n$/,'').replace('assertCloseupCapture(row,await snap(row.screenshotWindow),target,transform);','assertCloseupCapture(row,await snap(row.screenshotWindow),target,transform);assertCloseupFromDriver(driver,row);');
 once(driver+acceptance+closeup,`    await collectSelectorViews(target.mode,{\n      enterDriver:()=>enter('driver'),\n      acceptance:async()=>{\n${acceptance}      },\n      diagnostic:async driver=>{\n${body}      },\n    });\n`);
 once('Actual production WebGL cap-normal-only comparison. Unchanged five functional captures plus one desktop diagnostic through existing trusted controls; native frame certificates and 11-image preparation/residency retirement. No performance, total-time or physical-device claim.', 'Actual production WebGL selector-topology comparison. Separate unchanged five-view functional path and independently reachable desktop Driver-to-closeup diagnostic. Native frame, model body, eleven-image residency and retirement proofs required. No release, timing, performance or physical-device claim.');
 return text;
}
export async function main(env=process.env) {
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),request=JSON.parse(await readFile(resolve(root,requestPath)));
 validateComparisonEnvironment(env,request);await verifyFilePins(root,request.helperPins,helperPaths);
 const source=await readFile(resolve(root,'scripts/collect-cabin-leather-comparison.mjs'),'utf8');
 const generated=deriveSelectorCollector(source),path=resolve(root,'scripts/cabin-selector-topology-collector.generated.mjs');await writeFile(path,generated);
 const {main:collect}=await import(pathToFileURL(path));return collect(env);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
