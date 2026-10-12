import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { buildCapNormalCandidate, gzipWithBaselineCodec } from './export-cap-normals.mjs';
import { sha256 } from './verify-cap-normals.mjs';

const [sourcePath,outPath]=process.argv.slice(2);
if(!sourcePath||!outPath)throw new Error('Usage: node build.mjs BASELINE.glb.gz PRIVATE_OUTPUT_DIRECTORY');
const gzipSource=readFileSync(sourcePath),baseline=gunzipSync(gzipSource);
assert.ok(gzipWithBaselineCodec(baseline).equals(gzipSource),'the source gzip must exactly reproduce with the original codec');
const {raw,gzip,report}=buildCapNormalCandidate(baseline);
const name=`r35-cabin-shifter-cap-normals-${sha256(raw).slice(0,8)}.glb`;
const output=resolve(outPath);mkdirSync(output,{recursive:true});
writeFileSync(join(output,name),raw);writeFileSync(join(output,name+'.gz'),gzip);
const manifest={
  status:'PRIVATE CPU-VERIFIED CANDIDATE; visual/native qualification still required',
  source:{gzipBytes:gzipSource.length,gzipSha256:sha256(gzipSource),rawBytes:baseline.length,rawSha256:sha256(baseline)},
  artifact:{file:name,bytes:raw.length,sha256:sha256(raw),gzipFile:name+'.gz',gzipBytes:gzip.length,gzipSha256:sha256(gzip)},
  compression:{level:9,strategy:'Python gzip.compress',mtime:0,node:process.version,zlib:'1.3.2',baselineRecompressedExactly:true},
  report:{...report,costs:{...report.costs,gzipByteDelta:gzip.length-gzipSource.length}},
  provenance:{equation:'Y = intercept + 0.46*Z - 1.7*X^2; analytic normal normalize(3.4*X,1,-0.46)',selection:'abs(Y-equation) < 0.000040 metres, exact pinned row lists and SHA only',sourceStatus:'Recovered source ZIPs are transcript reconstructions; cap equation independently corroborated by exact pinned GLB. No factory dimensions or photo pixels claimed.',scope:'Only existing NORMAL rows and necessary extrema; original bevel/side/bottom normals preserved. No added geometry, materials, textures, images, passes, or TANGENT.'}
};
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({artifact:manifest.artifact,costs:manifest.report.costs,metadataChanges:report.metadataChanges,changedBinaryBytes:report.changedBinaryBytes},null,2));
