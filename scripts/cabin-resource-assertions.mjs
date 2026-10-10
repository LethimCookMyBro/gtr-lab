import assert from 'node:assert/strict';

function healthy(snapshot) {
  assert.deepEqual(snapshot.issues, [], 'The browser observer has complete coverage');
  assert.equal(snapshot.pendingBitmapDecodes, 0, 'No bitmap decode remains pending');
  assert.equal(snapshot.pendingIdentities, 0, 'All image hashes have settled');
}

/** Call after activeCabin plus an existing rendered capture, before any teardown. */
export function cabinResourceCohort(mark, snapshot, expectedImages) {
  healthy(snapshot);
  const decoded = snapshot.bitmaps.filter(item => item.requestedSequence > mark.sequence);
  const owned = expectedImages.flatMap(image => {
    const matches = decoded.filter(item => item.sourceSha256 === image.sha256);
    assert.equal(matches.length, 1, `${image.name} decoded exactly once in this cabin attempt`);
    assert.equal(matches[0].closeCalls, 0, `${image.name} is still open while the cabin is active`);
    return matches;
  });
  const bitmapIds = owned.map(item => item.id);
  const uploaded = snapshot.textures.filter(item => item.bitmapIds.some(id => bitmapIds.includes(id)));
  assert.ok(uploaded.length > 0, 'Actual candidate bitmaps reached WebGL textures');
  for (const texture of uploaded) assert.equal(texture.deleteCalls, 0, `Active texture ${texture.id} remains allocated`);
  const uploadedIds = new Set(uploaded.flatMap(item => item.bitmapIds));
  return {
    bitmapIds, textureIds: uploaded.map(item => item.id), contextIds: [...new Set(uploaded.map(item => item.contextId))],
    uploadedImageNames: owned.filter(item => uploadedIds.has(item.id)).map(item => item.sourceName),
    decodedButNotUploaded: owned.filter(item => !uploadedIds.has(item.id)).map(item => item.sourceName),
  };
}

/** Run after UI teardown + existing frames/capture. Suitable for 5s expect.poll. */
export function assertCabinResourcesReleased(cohort, snapshot) {
  healthy(snapshot);
  for (const id of cohort.bitmapIds) {
    const bitmap = snapshot.bitmaps.find(item => item.id === id);
    assert.ok(bitmap, `Tracked bitmap ${id} remains in observer evidence`);
    assert.equal(bitmap.closeCalls, 1, `Candidate bitmap ${id} closed exactly once`);
  }
  // Include textures first uploaded after the initial active snapshot, such as a
  // rear-seat-only image. The observer never drops these scalar records.
  const textures = snapshot.textures.filter(item => item.bitmapIds.some(id => cohort.bitmapIds.includes(id)));
  for (const id of cohort.textureIds) assert.ok(textures.some(item => item.id === id), `Tracked texture ${id} remains in evidence`);
  for (const texture of textures) {
    assert.equal(texture.deleteCalls, 1, `Candidate texture ${texture.id} deleted exactly once`);
    assert.equal(texture.deletedWhileLive, true, `Candidate texture ${texture.id} had a live-context delete`);
  }
  return { closedBitmapIds: [...cohort.bitmapIds], deletedTextureIds: textures.map(item => item.id) };
}
