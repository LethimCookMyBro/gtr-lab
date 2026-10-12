/** Socket-free artifact replay. A failed/missing lane never acquires a matched visual claim. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertMatchedPair, sha256 } from './cabin-leather-comparison-policy.mjs';
export async function verifyPairs(root, request) {
  const result={result:'running',scope:'Matched evidence eligibility only; screenshots still require visual review.',pairs:[],errors:[]};
  for(const viewport of ['desktop','mobile']){
    try{
      const rows=[];
      for(const lane of ['baseline','candidate']){
        const directory=resolve(root,lane+'-'+viewport),row=JSON.parse(await readFile(resolve(directory,'report.json')));
        assert.equal(row.viewport,viewport);assert.equal(row.requestSha256,sha256(JSON.stringify(request)));
        assert.deepEqual(row.captures.map(c=>c.label),['initial','driver','passenger','exterior-restored','driver-repeat']);
        for(const c of row.captures){assert.equal(c.file,c.label+'.png');const bytes=await readFile(resolve(directory,c.file));assert.equal(bytes.length,c.bytes);assert.equal(sha256(bytes),c.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),row.settings.viewport.width);assert.equal(bytes.readUInt32BE(20),row.settings.viewport.height);}
        rows.push(row);
      }
      result.pairs.push(assertMatchedPair(...rows,request));
    }catch(error){result.errors.push({viewport,error:String(error)});}
  }
  result.result=result.errors.length?'failed':'passed';await mkdir(root,{recursive:true});await writeFile(resolve(root,'paired-comparison.json'),JSON.stringify(result,null,2)+'\n');
  assert.equal(result.result,'passed','Both independent viewports require complete matched pairs');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const request=JSON.parse(await readFile(new URL('../qa/cabin-leather-comparison-request.json',import.meta.url)));verifyPairs(resolve(process.argv[2]??'cabin-leather-artifacts'),request).catch(error=>{console.error(error);process.exitCode=1;});}
