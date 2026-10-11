/** Pure, closed staged-only UI acceptance contract. No browser or socket imports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
export const baselineCommit = '38f9f8c5e90619b961e70315d1683618cec92b88';
export const contract = 'ui-optimization-native-choreography-v1';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const viewports = Object.freeze({
  desktop: { viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' },
  mobile: { viewport: { width: 390, height: 844 }, reducedMotion: 'no-preference' },
  short: { viewport: { width: 390, height: 568 }, reducedMotion: 'no-preference' },
  narrow: { viewport: { width: 320, height: 568 }, reducedMotion: 'no-preference' },
  reduced: { viewport: { width: 390, height: 568 }, reducedMotion: 'reduce' },
});
export async function sourceIdentity(root) {
  const paths = [];
  async function walk(dir) {
    for (const entry of (await readdir(resolve(root, dir), { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `Source symlink is not accepted: ${path}`);
      if (entry.isDirectory()) await walk(path); else if (entry.isFile()) paths.push(path);
    }
  }
  await walk('src'); paths.push('index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'server.mjs');
  const files = [];
  for (const path of paths.sort()) files.push({path, sha256:sha256(await readFile(resolve(root, path)))});
  return {contract:'r35-production-source-v2-with-index', sha256:sha256(JSON.stringify(files)), files};
}
export function validateRequest(request, env) {
  assert.deepEqual(Object.keys(request).sort(), ['allow','baselineCommit','baselineTree','candidateTree','contract','version'].sort());
  assert.equal(request.version, 1); assert.equal(request.allow, true); assert.equal(request.contract, contract);
  assert.equal(request.baselineCommit, baselineCommit);
  for (const field of ['baselineTree','candidateTree']) assert.match(request[field] ?? '', /^[a-f0-9]{64}$/);
  assert.notEqual(request.baselineTree, request.candidateTree);
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.GITHUB_REPOSITORY, 'LethimCookMyBro/gtr-lab');
  assert.equal(env.GITHUB_REF, 'refs/heads/main'); assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.match(env.GITHUB_SHA ?? '', /^[a-f0-9]{40}$/); assert.notEqual(env.GITHUB_SHA, baselineCommit);
  assert.equal(env.R35_ALLOW_UI_OPTIMIZATION_QA, '1');
  assert.ok(env.R35_UI_COMMIT_MESSAGE?.includes('[stage-ui-optimization]'));
  assert.ok(!env.R35_UI_COMMIT_MESSAGE?.includes('[release-'));
  assert.ok(Object.hasOwn(viewports, env.R35_UI_VIEWPORT));
  for (const name of ['R35_UI_URL','R35_UI_ROOT','R35_SOURCE_SHA','HOME_QA_URL']) assert.equal(env[name], undefined, `No target override allowed: ${name}`);
  return {...viewports[env.R35_UI_VIEWPORT], name:env.R35_UI_VIEWPORT, origin:'http://127.0.0.1:4189'};
}
export function summarizeTrace(events) {
  const names = ['Layout','UpdateLayoutTree','Paint','PrePaint','CompositeLayers','DrawFrame','DroppedFrame','FireAnimationFrame'];
  return Object.fromEntries(names.map(name => {
    const selected = events.filter(event => event.name === name);
    const durationMs = selected.filter(event => event.ph === 'X' && Number.isFinite(event.dur)).reduce((sum,event)=>sum+event.dur/1000,0);
    return [name,{count:selected.length,durationMs}];
  }));
}
export function compareSnapshots(before, after, tolerance=1.1) {
  const failures=[];
  const validSnapshot=(snapshot,label)=>{
    if(!snapshot||!Number.isFinite(snapshot.input)||!Number.isFinite(snapshot.y)||!Number.isFinite(snapshot.height)||snapshot.height<=0||typeof snapshot.overflow!=='boolean'||typeof snapshot.activeEra!=='string'||!Array.isArray(snapshot.nodes)||snapshot.nodes.length===0) {
      failures.push(`${label}: invalid checkpoint fields`);return false;
    }
    const keys=new Set();
    for(const node of snapshot.nodes) {
      if(typeof node?.key!=='string'||keys.has(node.key)||!node.rect||!node.style) {failures.push(`${label}: invalid node identity`);return false;}
      keys.add(node.key);
      if(['x','y','width','height'].some(field=>!Number.isFinite(node.rect[field]))) {failures.push(`${label} ${node.key}: nonfinite geometry`);return false;}
      if(['opacity','transform','objectFit','objectPosition','clipPath'].some(field=>typeof node.style[field]!=='string')) {failures.push(`${label} ${node.key}: missing computed style`);return false;}
    }
    return true;
  };
  if(!Array.isArray(before)||!Array.isArray(after)||!before.length||!after.length)return ['Missing native scroll checkpoints'];
  if (before.length !== after.length) failures.push('Different number of native scroll checkpoints');
  for(let i=0;i<Math.min(before.length,after.length);i++) {
    const a=before[i], b=after[i];
    if(!validSnapshot(a,`Baseline ${i}`)||!validSnapshot(b,`Candidate ${i}`))continue;
    if(a.input!==b.input || Math.abs(a.y-b.y)>tolerance || Math.abs(a.height-b.height)>tolerance) failures.push(`Checkpoint ${i}: native input or document geometry differs`);
    if(a.activeEra!==b.activeEra)failures.push(`Checkpoint ${i}: active era differs`);
    if(a.overflow!==b.overflow)failures.push(`Checkpoint ${i}: horizontal overflow differs`);
    if(a.nodes.length!==b.nodes.length) { failures.push(`Checkpoint ${i}: target count differs`);continue; }
    for(let j=0;j<a.nodes.length;j++) {
      const x=a.nodes[j], y=b.nodes[j];
      if(x.key!==y.key) { failures.push(`Checkpoint ${i}: target identity differs`);continue; }
      for(const field of ['x','y','width','height']) if(Math.abs(x.rect[field]-y.rect[field])>tolerance) failures.push(`Checkpoint ${i} ${x.key}: ${field} differs`);
      for(const field of ['opacity','transform','objectFit','objectPosition','clipPath']) if(x.style[field]!==y.style[field]) failures.push(`Checkpoint ${i} ${x.key}: ${field} differs`);
    }
  }
  return failures;
}
