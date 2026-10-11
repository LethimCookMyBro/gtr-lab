/** Closed selectable-quality source binding. Historical native policy is unchanged. */
import assert from 'node:assert/strict';
import * as historical from './dpr-motion-policy.mjs';
export * from './dpr-motion-policy.mjs';
export const qualityContract = 'selectable-render-quality-standard-2m-reduced-1m-msaa-v1';
export const qualityTree = '6c1bdd3ee8c4819a3d81f9e8044b3e460ed27846efebe8bdaf9cedb67b09a3fb';
export const historicalTree = 'd37a85b85db277453e836dddec2ff0472235aec791a54e1bbdb4124c9eb575b6';
export const historicalContract = 'camera-terminal-orientation-2m-msaa-v1';
const legacy = env => ({ ...env, R35_EXPECTED_APP_TREE: historicalTree, R35_DPR_GEOMETRY_CONTRACT: historicalContract });
export function validateMotionEnvironment(env) {
  assert.equal(env.R35_EXPECTED_APP_TREE, qualityTree, 'Only the reviewed selectable-quality runtime is admitted');
  assert.equal(env.R35_DPR_GEOMETRY_CONTRACT, qualityContract, 'New explicit selectable-quality contract required');
  assert.equal(env.R35_DPR_MODE, 'fixed');
  assert.ok((env.R35_DPR_COMMIT_MESSAGE ?? '').includes('[stage-selectable-quality]'), 'Explicit staged selector request required');
  const target = historical.validateMotionEnvironment(legacy(env));
  return { ...target, geometryContract: qualityContract, geometry: { ...target.geometry, name: qualityContract, sourceTree: qualityTree } };
}
export function resolveQualityRequest(request, env) {
  assert.deepEqual(Object.keys(request).sort(), ['allow', 'geometryContract', 'mode', 'sourceSha', 'sourceTree', 'version'].sort());
  assert.equal(request.version, 2); assert.equal(request.allow, true); assert.equal(request.mode, 'fixed');
  assert.equal(request.sourceSha, 'current'); assert.equal(request.sourceTree, qualityTree); assert.equal(request.geometryContract, qualityContract);
  const resolved = historical.resolveMotionRequest({ ...request, sourceTree: historicalTree, geometryContract: historicalContract }, env);
  const result = { ...resolved, R35_EXPECTED_APP_TREE: qualityTree, R35_DPR_GEOMETRY_CONTRACT: qualityContract };
  validateMotionEnvironment({ ...env, ...result }); return result;
}
export function assessMotionEvidence(value) {
  assert.equal(value.sourceTree, qualityTree); assert.equal(value.geometryContract, qualityContract);
  // The original thirteen-capture, unchanged Standard geometry/motion verdict remains independently binding.
  return historical.assessMotionEvidence({ ...value, sourceTree: historicalTree, geometryContract: historicalContract });
}
export function qualityDimensions({ renderWidth, renderHeight, nativeDpr }, quality) {
  assert.ok(['standard', 'reduced'].includes(quality));
  for (const value of [renderWidth, renderHeight, nativeDpr]) assert.ok(Number.isFinite(value) && value > 0);
  const pixelRatio = Math.min(nativeDpr, 1.5, Math.sqrt((quality === 'reduced' ? 1_000_000 : 2_000_000) / Math.max(1, renderWidth * renderHeight)));
  return { pixelRatio, width: Math.floor(renderWidth * pixelRatio), height: Math.floor(renderHeight * pixelRatio) };
}
