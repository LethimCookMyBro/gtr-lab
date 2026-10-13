import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {aggregateReports} from '../../scripts/current-render-cost-compare.mjs';
test('missing and duplicate cell reports stay explicitly insufficient instead of being filtered',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'render-cost-aggregate-'));await mkdir(join(dir,'one'));await writeFile(join(dir,'one','report.json'),JSON.stringify({cell:'studio-standard',status:'failed',steps:[{id:'top',status:'failed',failure:{raw:{lastBatch:{previous:null,status:0x911b}}}}]}));
 let result=await aggregateReports(dir);assert.ok(result,'Missing aggregate');assert.equal(result.cells.length,4);assert.equal(result.cells.filter(x=>x.status==='missing').length,3);assert.equal(result.pairs.length,2);assert.equal(result.status,'insufficient');assert.equal(result.cells[0].report.steps[0].failure.raw.lastBatch.status,0x911b);
 await mkdir(join(dir,'two'));await writeFile(join(dir,'two','report.json'),JSON.stringify({cell:'studio-standard',status:'passed'}));result=await aggregateReports(dir);assert.equal(result.cells[0].status,'duplicate');assert.equal(result.cells[0].reports.length,2);
});
test('missing setup results still produce the four-cell comparison artifact at a new output directory',async()=>{
 const {execFileSync}=await import('node:child_process');const {readFile}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'render-cost-missing-'));const output=join(root,'new','comparison.json');
 execFileSync(process.execPath,[new URL('../../scripts/current-render-cost-compare.mjs',import.meta.url).pathname,join(root,'absent'),output]);
 const result=JSON.parse(await readFile(output));assert.equal(result.status,'insufficient');assert.equal(result.cells.length,4);assert.ok(result.cells.every(c=>c.status==='missing'));
});
