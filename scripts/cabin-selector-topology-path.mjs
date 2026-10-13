/** Separate evidence paths; diagnostic success is never functional acceptance. */
import assert from 'node:assert/strict';
export async function collectSelectorViews(mode,{enterDriver,acceptance,diagnostic}) {
  assert.ok(['acceptance','diagnostic'].includes(mode),'Closed selector path');
  const driver=await enterDriver();
  return mode==='acceptance' ? acceptance() : diagnostic(driver);
}
export function assertCloseupFromDriver(driver,closeup) {
  assert.equal(driver.label,'driver');assert.equal(driver.seat,'driver');
  assert.equal(closeup.label,'shifter-top');assert.equal(closeup.seat,'driver');
  const before=driver.certificate,after=closeup.certificate;
  assert.equal(before.reusedUnchanged,false);assert.equal(after.reusedUnchanged,false);
  assert.equal(after.owner,before.owner,'Driver owner must remain resident');
  assert.ok(Number.isFinite(before.readyAt)&&after.armedAt>=before.readyAt,'Diagnostic arms only after completed Driver');
  assert.ok(after.mainDrawId>before.mainDrawId,'Diagnostic requires a new actual native main frame');
  assert.deepEqual(after.snapshot.pose.position,before.snapshot.pose.position,'Fixed Driver eye is unchanged');
  assert.deepEqual(after.snapshot.dimensions,before.snapshot.dimensions,'Diagnostic preserves native dimensions');
}
