/** Deterministic transformation of the one approved raw GLB preimage. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inspectPinnedBaseline, decodeGlb, NORMAL_TARGETS, vectorOffset, readVector, analyticNormal, normalExtrema, verifyCapNormalCandidate } from './verify-cap-normals.mjs';

export function gzipWithBaselineCodec(raw) {
  const gzip=execFileSync('python',[fileURLToPath(new URL('./deterministic-gzip.py',import.meta.url))],{input:raw,maxBuffer:32*1024*1024});
  assert.equal(gzip.readUInt32LE(4),0,'deterministic gzip mtime');
  return gzip;
}

export function buildCapNormalCandidate(baselineRaw) {
  inspectPinnedBaseline(baselineRaw);
  const source=decodeGlb(baselineRaw),bin=Buffer.from(source.bin);
  const candidate={...source,bin};
  let jsonText=source.jsonText;
  for(const t of NORMAL_TARGETS){
    for(const row of t.rows){
      const normal=analyticNormal(readVector(source,t.position,row)[0]);
      const offset=vectorOffset(source,t.normal,row);
      normal.forEach((value,k)=>bin.writeFloatLE(value,offset+4*k));
    }
    const original=source.json.accessors[t.normal];
    const changed={...original,...normalExtrema(candidate,t.normal)};
    const oldToken=JSON.stringify(original);
    assert.ok(jsonText.includes(oldToken),'exact original accessor JSON token');
    assert.equal(jsonText.indexOf(oldToken),jsonText.lastIndexOf(oldToken),'unique original accessor JSON token');
    jsonText=jsonText.replace(oldToken,JSON.stringify(changed));
  }
  const text=Buffer.from(jsonText,'utf8');
  const json=Buffer.concat([text,Buffer.alloc((4-text.length%4)%4,0x20)]);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);
  header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binaryHeader=Buffer.alloc(8);binaryHeader.writeUInt32LE(bin.length);binaryHeader.writeUInt32LE(0x004e4942,4);
  const raw=Buffer.concat([header,json,binaryHeader,bin]);
  const report=verifyCapNormalCandidate(baselineRaw,raw);
  // The accepted baseline used Python zlib 1.3.2. Node's alternate zlib stream
  // is deterministic but adds ~470 KB, so preserve the proven original codec.
  const gzip=gzipWithBaselineCodec(raw);
  return {raw,gzip,report};
}
