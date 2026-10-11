/** Evidence utilities only; no browser, server, socket or GL execution. */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { hostname, platform, release, arch, cpus, totalmem } from 'node:os';
export function runnerIdentity(env) {
  return { runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT, job: env.GITHUB_JOB,
    name: env.RUNNER_NAME, image: env.ImageOS, imageVersion: env.ImageVersion,
    hostname: hostname(), platform: platform(), release: release(), arch: arch(),
    cpuModels: [...new Set(cpus().map(c => c.model))], cpuCount: cpus().length, totalmem: totalmem(), node: process.version };
}
export function backendIdentity(gpu) {
  assert(gpu?.devices?.length); const a = gpu.auxAttributes ?? {};
  return { devices: gpu.devices, glRenderer: a.glRenderer, glVendor: a.glVendor, glVersion: a.glVersion,
    displayType: a.displayType, passthroughCmdDecoder: a.passthroughCmdDecoder };
}
export async function collectDistAssets(root) {
  const entries = [];
  const walk = async (relative = '') => {
    for (const entry of (await readdir(resolve(root, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      assert(!entry.isSymbolicLink(), 'Dist identity cannot follow symlinks');
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) entries.push([`/${name}`, createHash('sha256').update(await readFile(resolve(root, name))).digest('hex')]);
    }
  };
  await walk(); return new Map(entries);
}
export function sharedAssetBodies(rows) {
  const assets = new Map();
  for (const r of rows) {
    assert(!r.error && r.status === 200 && /^[a-f0-9]{64}$/.test(r.sha256 ?? ''), 'Incomplete runtime asset identity');
    if (r.path === '/index.html' || r.path.endsWith('.js')) continue;
    const value = { path: r.path, bytes: r.bytes, sha256: r.sha256 };
    if (assets.has(r.path)) assert.deepEqual(assets.get(r.path), value, 'Runtime body changed within a trial');
    assets.set(r.path, value);
  }
  return [...assets.values()].sort((a, b) => a.path.localeCompare(b.path));
}
