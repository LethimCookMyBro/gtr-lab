import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

test('compressed original cabin expands byte-exactly to the recovered original candidate', async () => {
  const compressed = await readFile(new URL('../r35-original-cabin-lod0.glb.gz', import.meta.url)), bytes = gunzipSync(compressed);
  assert.equal(bytes.length, 13309484);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'c1ae509893528c3b91e77417382fe7edbce10bc02e65243bf1149b80e884c5eb');
  assert.equal(createHash('sha256').update(compressed).digest('hex'), '860370df2e88d07c4cd3fe83f84d50700abf04cc8f13adbec033ca53cbd029dd');
});
