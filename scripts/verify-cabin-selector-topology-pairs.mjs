/** Socket-free exact artifact replay. Diagnostic eligibility cannot promote acceptance. */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {assertMatchedPair,assertSourcePair,sha256,captureLabels,requestPath,baselineModel,candidateModel,inspectMaterialModel,verifyFilePins,helperPaths} from './cabin-selector-topology-policy.mjs';
const required=Object.freeze([['desktop','acceptance'],['mobile','acceptance'],['desktop','diagnostic']]);
export function summarizeAssessments(assessments) {
 assert.deepEqual(assessments.map(({viewport,mode})=>[viewport,mode]),required,'All three exact assessments required');
 for(const row of assessments)assert.ok(['passed','failed'].includes(row.result),'No partial evidence success');
 const acceptance=assessments.filter(row=>row.mode==='acceptance').every(row=>row.result==='passed')?'passed':'failed';
 const diagnostic=assessments.find(row=>row.mode==='diagnostic').result;
 return {result:acceptance==='passed'&&diagnostic==='passed'?'passed':'failed',acceptance,diagnostic,release:false,assessments,
  scope:'Matched evidence eligibility only. Both complete functional pairs and separate desktop diagnostic are required. Actual appearance is a separate image-review gate; this report never authorizes release.'};
}
/** Recompute proof from actual pinned raw/gzip assets, never artifact metadata. */
export async function inspectFrozenMaterials(harness) {
 const baselineGzip=await readFile(resolve(harness,'qa/cabin-preview/r35-contact-ao-static-faces-roughness-uv4.glb.gz'));
 const candidateGzip=await readFile(resolve(harness,'qa/cabin-preview/r35-cabin-selector-topology.glb.gz'));
 const rows={};let baseline;
 for(const [lane,gzip,model] of [['baseline',baselineGzip,baselineModel],['candidate',candidateGzip,candidateModel]]) {
  assert.equal(gzip.length,model.gzipBytes);assert.equal(sha256(gzip),model.gzipSha256);
  const bytes=gunzipSync(gzip,{maxOutputLength:model.bytes});if(lane==='baseline')baseline=bytes;
  rows[lane]=await inspectMaterialModel(bytes,model,lane,baseline);
 }
 return rows;
}
export function assertMaterialReceipts(rows,expected) {
 assert.deepEqual(rows.map(row=>row.lane),['baseline','candidate']);
 for(const row of rows)assert.deepEqual(row.material,expected[row.lane],'Reported material proof must match fresh independent inspection');
}
export async function verifyPairs(root,request) {
 assertSourcePair(request);assert.equal(request.allow,true);const assessments=[];
 const harness=fileURLToPath(new URL('..',import.meta.url));
 await verifyFilePins(harness,request.helperPins,helperPaths);
 const materialProof=await inspectFrozenMaterials(harness);
 for(const [viewport,mode] of required) {
  try {
   const rows=[];
   for(const lane of ['baseline','candidate']) {
    const directory=resolve(root,lane+'-'+viewport+'-'+mode),row=JSON.parse(await readFile(resolve(directory,'report.json')));
    assert.equal(row.viewport,viewport);assert.equal(row.mode,mode);assert.equal(row.requestSha256,sha256(JSON.stringify(request)));
    assert.deepEqual(row.captures.map(c=>c.label),captureLabels(viewport,mode));
    for(const capture of row.captures) {
     assert.equal(capture.file,capture.label+'.png');const bytes=await readFile(resolve(directory,capture.file));
     assert.equal(bytes.length,capture.bytes);assert.equal(sha256(bytes),capture.sha256);
     assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
     assert.equal(bytes.readUInt32BE(16),row.settings.viewport.width);assert.equal(bytes.readUInt32BE(20),row.settings.viewport.height);
    }
    rows.push(row);
   }
   assertMaterialReceipts(rows,materialProof);
   assessments.push({viewport,mode,result:'passed',evidence:assertMatchedPair(...rows,request)});
  } catch(error) { assessments.push({viewport,mode,result:'failed',error:String(error)}); }
 }
 const result=summarizeAssessments(assessments);await mkdir(root,{recursive:true});
 await writeFile(resolve(root,'paired-comparison.json'),JSON.stringify(result,null,2)+'\n');
 assert.equal(result.result,'passed','Both acceptance viewports and separate desktop diagnostic must be complete');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
 assert.equal(process.argv.length,3,'Only the artifact directory is an argument');
 const request=JSON.parse(await readFile(new URL('../'+requestPath,import.meta.url)));
 verifyPairs(resolve(process.argv[2]),request).catch(error=>{console.error(error);process.exitCode=1;});
}
