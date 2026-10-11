import { afterEach, expect, test, vi } from 'vitest';
import { readFile, mkdtemp, rm, writeFile, readdir, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { prepareModels } from '../scripts/prepare-models.mjs';
// A plain callback seam: no real HTTP server is constructed and no socket can open.
vi.mock('node:http', () => ({ default: { createServer: handler => ({ handler }) } }));
import { createAppServer } from '../server.mjs';
const manifest = JSON.parse(await readFile('modeldata/manifest.json', 'utf8'));
const original = manifest.find(entry => entry.id === 'ciasny-r35');
const candidate = manifest.find(entry => entry.id === 'ciasny-r35-brake-index-e9425289');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const dirs = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'brake-asset-')); dirs.push(root);
  const options = { directory: resolve('modeldata'), publicDirectory: root, log: () => {} };
  const result = await prepareModels(manifest, options);
  return { root, options, result, originalPath: join(root, original.path), candidatePath: join(root, candidate.path) };
}
test('offline preparation emits both identities and repairs candidate corruption without touching the original URL', async () => {
  expect(candidate).toBeDefined();
  const f = await fixture();
  expect(f.result.map(row => row.status)).toEqual(['reconstructed', 'reconstructed']);
  const baseline = await readFile(f.originalPath), derivative = await readFile(f.candidatePath);
  expect(hash(baseline)).toBe(original.sha256); expect(hash(derivative)).toBe(candidate.sha256);
  const bad = Buffer.from(derivative); bad[bad.length - 1] ^= 1; await writeFile(f.candidatePath, bad);
  expect((await prepareModels(manifest, f.options)).map(row => row.status)).toEqual(['verified', 'reconstructed']);
  expect((await readFile(f.originalPath)).equals(baseline)).toBe(true); expect((await readFile(f.candidatePath)).equals(derivative)).toBe(true);
  expect((await readdir(join(f.root, 'models'))).sort()).toEqual(manifest.map(entry => entry.path.split('/').at(-1)).sort());
});
async function response(handler, method, url, headers = {}) {
  const res = new PassThrough(); const chunks = []; const outputHeaders = {};
  res.setHeader = (name, value) => { outputHeaders[name.toLowerCase()] = value; };
  res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [key, value] of Object.entries(values)) res.setHeader(key, value); res.headersSent = true; };
  res.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const finished = once(res, 'finish');
  await handler({ method, url, headers }, res); await finished;
  return { status: res.statusCode, headers: outputHeaders, bytes: Buffer.concat(chunks) };
}
test('the real file-serving handler exposes both immutable identities, binary MIME, ranges and missing-file 404 without sockets', async () => {
  expect(candidate).toBeDefined();
  const f = await fixture();
  const { handler } = createAppServer(f.root);
  for (const entry of manifest) {
    const get = await response(handler, 'GET', entry.path);
    expect(get.status).toBe(200); expect(get.bytes.length).toBe(entry.bytes); expect(hash(get.bytes)).toBe(entry.sha256);
    expect(get.headers['content-type']).toBe('model/gltf-binary'); expect(get.headers['content-length']).toBe(entry.bytes);
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    const head = await response(handler, 'HEAD', entry.path);
    expect(head.status).toBe(200); expect(head.bytes.length).toBe(0); expect(head.headers['content-length']).toBe(entry.bytes);
    const range = await response(handler, 'GET', entry.path, { range: 'bytes=0-19' });
    expect(range.status).toBe(206); expect(range.bytes).toEqual(get.bytes.subarray(0, 20)); expect(range.headers['content-range']).toBe(`bytes 0-19/${entry.bytes}`);
  }
  expect((await response(handler, 'GET', '/models/ciasny-r35-brake-index-unknown.glb')).status).toBe(404);
});


test.each(['corrupt', 'missing'])('rejects a %s derivative chunk before publication and preserves the historical model', async kind => {
  const f = await fixture();
  const historical = await readFile(f.originalPath);
  const directory = join(f.root, 'private-chunks');
  await cp(resolve('modeldata', candidate.id), join(directory, candidate.id), { recursive: true });
  await rm(f.candidatePath);
  const first = join(directory, candidate.chunks[0].path);
  if (kind === 'missing') await rm(first);
  else { const bytes = await readFile(first); bytes[0] ^= 1; await writeFile(first, bytes); }
  // Chunks cannot sit beneath public; use a disjoint output with the historical bytes.
  const publicDirectory = join(f.root, 'served');
  await cp(join(f.root, 'models'), join(publicDirectory, 'models'), { recursive: true });
  await expect(prepareModels([candidate], { directory, publicDirectory, log: () => {} })).rejects.toThrow(kind === 'missing' ? /Missing model file/ : /SHA-256 mismatch/);
  expect((await readdir(join(publicDirectory, 'models')))).toEqual([original.path.split('/').at(-1)]);
  expect((await readFile(join(publicDirectory, original.path))).equals(historical)).toBe(true);
});
