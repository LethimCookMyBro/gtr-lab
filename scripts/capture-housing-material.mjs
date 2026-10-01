/** Isolated A/B study. Uses only the unchanged, already published vehicle GLB. */
import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const output='housing-material-review-results';
await mkdir(output,{recursive:true});
const bytes=await readFile('public/models/ciasny-r35.glb');
const digest=createHash('sha256').update(bytes).digest('hex');
assert.equal(digest,'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d');
const report={commit:process.env.GITHUB_SHA,assetBytes:bytes.length,assetSha256:digest,scope:'Existing published GLB; one reversible housing material override in an isolated QA entrypoint. No production source, geometry, normals or other optical materials modified.',errors:[],frames:[]};
const save=()=>writeFile(`${output}/report.json`,JSON.stringify(report,null,2));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.renderer-qa.config.ts','--mode','renderer-qa'],{stdio:'inherit'});
let browser;
try{
 let started=false;
 for(let i=0;i<100;i++){if(await fetch('http://127.0.0.1:4174').then(r=>r.ok).catch(()=>false)){started=true;break;}await new Promise(r=>setTimeout(r,100));}
 assert.ok(started,'Isolated QA server starts');
 browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1,reducedMotion:'reduce'});
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
 await page.route('**/published-car.glb',route=>route.fulfill({status:200,contentType:'model/gltf-binary',headers:{'Content-Length':String(bytes.length)},body:bytes}));
 await page.goto('http://127.0.0.1:4174/?review=housing',{waitUntil:'domcontentloaded'});
 async function capture(name,candidate,lamps){
  await expect.poll(async()=>JSON.parse(await page.getByTestId('metrics').textContent()||'null'),{timeout:90000}).toMatchObject({candidate,lamps,matches:1});
  await expect(page.getByTestId('status')).toHaveText('ready');
  const metrics=JSON.parse(await page.getByTestId('metrics').textContent());
  const png=await page.locator('canvas').screenshot({path:`${output}/${name}.png`,timeout:40000});
  const frame={name,candidate,lamps,canvasSha256:createHash('sha256').update(png).digest('hex'),metrics};
  report.frames.push(frame);await save();return frame;
 }
 const baselineOff=await capture('01-baseline-off',false,false);
 await page.getByRole('button',{name:'Opaque housing candidate',exact:true}).click();
 const candidateOff=await capture('02-candidate-off',true,false);
 const housingName='Headlights001_Glass_0';
 const protectedMeshes=frame=>frame.metrics.meshes.filter(m=>m.name!==housingName);
 assert.deepEqual(protectedMeshes(candidateOff),protectedMeshes(baselineOff),'Only the housing material may change in the OFF comparison');
 assert.deepEqual(candidateOff.metrics.camera,baselineOff.metrics.camera,'Identical camera');
 assert.deepEqual(candidateOff.metrics.position,baselineOff.metrics.position,'Identical vehicle position');
 assert.equal(candidateOff.metrics.scale,baselineOff.metrics.scale,'Identical scale');
 const housing=frame=>frame.metrics.meshes.find(m=>m.name===housingName);
 assert.equal(housing(candidateOff).geometry,housing(baselineOff).geometry,'Identical housing geometry');
 assert.deepEqual(housing(candidateOff).matrix,housing(baselineOff).matrix,'Identical housing transform');
 assert.equal(housing(candidateOff).materials[0].opacity,1);
 assert.equal(housing(candidateOff).materials[0].transparent,false);
 assert.notEqual(candidateOff.canvasSha256,baselineOff.canvasSha256,'Actual canvas responds to the material only');
 await page.getByRole('button',{name:'Lamps ON',exact:true}).click();
 const candidateOn=await capture('03-candidate-on',true,true);
 assert.deepEqual(housing(candidateOn).materials,housing(candidateOff).materials,'Housing never follows the lamp toggle');
 await page.getByRole('button',{name:'Baseline housing',exact:true}).click();
 const baselineOn=await capture('04-baseline-on',false,true);
 assert.deepEqual(protectedMeshes(candidateOn),protectedMeshes(baselineOn),'Only housing changes in ON comparison');
 await page.getByRole('button',{name:'Lamps OFF',exact:true}).click();
 const restored=await capture('05-baseline-restored',false,false);
 assert.deepEqual(restored.metrics.meshes,baselineOff.metrics.meshes,'All baseline material sharing and values restore exactly');
 assert.deepEqual(report.errors,[],'No page or console errors');
 report.result='passed';
}catch(error){report.result='failed';report.errors.push(String(error));process.exitCode=1;}
finally{await save();await browser?.close();server.kill('SIGTERM');}
console.log(JSON.stringify({result:report.result,errors:report.errors,frames:report.frames.map(f=>({name:f.name,canvasSha256:f.canvasSha256}))},null,2));
