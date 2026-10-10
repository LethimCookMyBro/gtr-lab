import { test } from 'vitest';
import assert from 'node:assert/strict';
import { cabinResourceCohort, assertCabinResourcesReleased } from '../scripts/cabin-resource-assertions.mjs';
const images = [{name:'new-map', sha256:'abc'}];
const snapshot = () => ({issues:[],pendingBitmapDecodes:0,pendingIdentities:0, contexts:[{id:1,lostEvents:0}],
 bitmaps:[{id:1,requestedSequence:3,sourceSha256:'abc',sourceName:'new-map',closeCalls:0}],
 textures:[{id:2,contextId:1,bitmapIds:[1],uploadCalls:1,deleteCalls:0,deletedWhileLive:false}], sequence:8});

test('active cohort contains exact candidate bitmap and linked GPU texture IDs',()=>{
 assert.deepEqual(cabinResourceCohort({sequence:2},snapshot(),images),{bitmapIds:[1],textureIds:[2],contextIds:[1],uploadedImageNames:['new-map'],decodedButNotUploaded:[]});
});
test('cohort rejects a missing or prematurely closed candidate bitmap',()=>{
 let snap=snapshot();snap.bitmaps=[];assert.throws(()=>cabinResourceCohort({sequence:2},snap,images),/decoded exactly once/);
 snap=snapshot();snap.bitmaps[0].closeCalls=1;assert.throws(()=>cabinResourceCohort({sequence:2},snap,images),/still open/);
});
test('release rejects leaked bitmap, leaked texture, duplicate close, and context-loss-only deletion',()=>{
 const cohort=cabinResourceCohort({sequence:2},snapshot(),images);
 assert.throws(()=>assertCabinResourcesReleased(cohort,snapshot()),/closed exactly once/);
 let snap=snapshot();snap.bitmaps[0].closeCalls=1;assert.throws(()=>assertCabinResourcesReleased(cohort,snap),/deleted exactly once/);
 snap.textures[0].deleteCalls=1;assert.throws(()=>assertCabinResourcesReleased(cohort,snap),/live-context/);
 snap.textures[0].deletedWhileLive=true;assert.doesNotThrow(()=>assertCabinResourcesReleased(cohort,snap));
 snap.bitmaps[0].closeCalls=2;assert.throws(()=>assertCabinResourcesReleased(cohort,snap),/closed exactly once/);
});
