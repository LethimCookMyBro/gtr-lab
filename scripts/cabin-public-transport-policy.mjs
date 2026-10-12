/** Closed, read-only six-transfer diagnostic. Never qualifies native desktop acceptance. */
import assert from 'node:assert/strict';
export const origin='https://gtr-lab-production.up.railway.app';
export const fixedRelease='04b8422dbb447552db231c75dc700f87183df10d';
export const sourceTree='7632e86545bdd559e38cac1133245b5b284b5bbb1b97d2fc6100ad66d021011b';
export const contract='r35-fixed-public-transport-v1';
export const token='[diagnose-cabin-public-transport]';
export const transferBudget=30000;
const exterior={path:'/models/ciasny-r35.glb',decodedBytes:8296356,decodedSha256:'fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d'};
const fine={path:'/models/r35-cabin-fine-roughness-ed88ad0e.glb',decodedBytes:20196108,decodedSha256:'ed88ad0eeff561e9c0f36f004fcdd4c3a31601f57865ce335268896e3219f5c0'};
export const plan=Object.freeze(['http/1.1','h2'].flatMap((protocol,i)=>[
 {...exterior,protocol,index:i*3+1,encoding:'identity',wireBytes:exterior.decodedBytes,wireSha256:exterior.decodedSha256},
 {...fine,protocol,index:i*3+2,encoding:'identity',wireBytes:fine.decodedBytes,wireSha256:fine.decodedSha256},
 {...fine,protocol,index:i*3+3,encoding:'gzip',wireBytes:10194113,wireSha256:'b16da8f79721b7d1016542f0d8af0ab018fa7dbdfecedea44c4ce1301ec0c5e5'},
]).map(Object.freeze));
export function validateInvocation(env){
 for(const [key,value]of Object.entries({CI:'true',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'LethimCookMyBro/gtr-lab',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'push',R35_ALLOW_TRANSPORT_PROBE:'1',GITHUB_RUN_ATTEMPT:'1'}))assert.equal(env[key],value,key);
 assert.match(env.GITHUB_SHA??'',/^[a-f0-9]{40}$/);assert.notEqual(env.GITHUB_SHA,fixedRelease);assert.match(env.GITHUB_RUN_ID??'',/^[1-9][0-9]{0,19}$/);
 assert.ok(env.R35_TRANSPORT_COMMIT_MESSAGE?.includes(token));assert.equal(env.R35_TRANSPORT_COMMIT_MESSAGE.includes('[release-'),false);
 for(const key of Object.keys(env).filter(k=>k.startsWith('R35_')))assert.ok(['R35_ALLOW_TRANSPORT_PROBE','R35_TRANSPORT_COMMIT_MESSAGE'].includes(key),'Unreviewed override '+key);
}
export function userAgent(env,spec){validateInvocation(env);assert.ok(plan.some(p=>p.index===spec.index&&p.protocol===spec.protocol));return `gtr-public-transport/1 run/${env.GITHUB_RUN_ID} protocol/${spec.protocol==='h2'?'h2':'http1'} transfer/${spec.index}`;}
export const requestPath='qa/cabin-public-transport-request.json';
export const selectedPaths=Object.freeze(['scripts/cabin-public-transport-policy.mjs','scripts/cabin-public-transport.mjs','tests/cabin-public-transport.node.mjs','.github/workflows/cabin-public-transport.yml',requestPath]);
export const comparisonPath='qa/cabin-fine-roughness-comparison-request.json';
export const comparisonFileSha256='53add7d9533c6f2216675bfc1b2e6b19b09130a2d9693d41e374755434ab8c52';
export const helperPaths=Object.freeze([...selectedPaths.filter(p=>p!==requestPath),'scripts/diagnose-dpr-motion.mjs','scripts/dpr-motion-policy.mjs','scripts/dpr-motion-observer.mjs','scripts/verify-release-assets.mjs','scripts/wait-railway.mjs',comparisonPath]);
export function validateRequest(request,env){validateInvocation(env);assert.deepEqual(Object.keys(request).sort(),['version','allow','contract','release','sourceTree','comparisonFileSha256','helperPins'].sort());assert.deepEqual({...request,helperPins:undefined},{version:1,allow:true,contract,release:fixedRelease,sourceTree,comparisonFileSha256,helperPins:undefined});assert.deepEqual(Object.keys(request.helperPins).sort(),[...helperPaths].sort());for(const hash of Object.values(request.helperPins))assert.match(hash,/^[a-f0-9]{64}$/);}
export function validateCheckout(row,env){validateInvocation(env);assert.equal(row.harnessCommit,env.GITHUB_SHA);assert.equal(row.appCommit,fixedRelease);assert.equal(row.harnessMessage.trim(),env.R35_TRANSPORT_COMMIT_MESSAGE.trim());assert.equal(row.harnessStatus,'');assert.equal(row.appStatus,'');assert.equal(row.releaseIsAncestor,true);assert.deepEqual([...row.changedFiles].sort(),[...selectedPaths].sort(),'Only the exact five diagnostic QA paths may differ from release');}
