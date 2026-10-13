import assert from 'node:assert/strict';

export function observeCabinRequests(page) {
  const requests = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (/^\/models\/r35-cabin-[^/]+\.glb(?:\.gz)?$/.test(path)) requests.push(path);
  });
  return requests;
}

/** Current direct-entry disclosure audit; opening the drawer must neither enter nor fetch again. */
export async function auditPreparedCabinAvailability({page, open, close, cabinRequests, cabinUrl, screenshotPath}) {
  let explanation;
  const before = [...cabinRequests];
  try {
    await open('Camera');
    assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-preparation'), 'ready', 'Route preparation must be ready before Interior is available');
    assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-model-url'), cabinUrl, 'Current route model identity must match the request');
    assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-entry-requested-at'), null, 'Availability inspection must not enter the cabin');
    assert.deepEqual(before, [cabinUrl], 'Prepared route must have exactly one request for its current cabin model');
    const dialog = page.getByRole('dialog');
    const interior = dialog.getByRole('button', {name: 'Interior', exact: true});
    assert.equal(await interior.isDisabled(), false, 'Prepared Interior must be enabled');
    assert.equal(await interior.getAttribute('aria-describedby'), 'cabin-preview-note');
    explanation = (await dialog.locator('#cabin-preview-note').innerText()).replace(/\s+/g, ' ');
    for (const required of [/original authored cabin/i, /still in progress/i, /prepared with the vehicle/i, /opens directly when ready/i, /not a verified factory interior/i, /displays and dial faces are static illustrations/i]) assert.match(explanation, required);
    assert.deepEqual(cabinRequests, before, 'Opening Camera must not fetch the prepared cabin again');
    await page.screenshot({path: screenshotPath});
  } finally {
    await close();
  }
  assert.deepEqual(cabinRequests, before, 'Inspecting and closing Camera must not fetch the cabin again');
  assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-preparation'), 'ready', 'Disclosure inspection must preserve prepared residency');
  assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-model-url'), cabinUrl, 'Closing the disclosure must preserve current model identity');
  assert.equal(await page.locator('main.configurator').getAttribute('data-cabin-entry-requested-at'), null, 'Closing the disclosure must not enter the cabin');
  return {available: true, prepared: true, requestsAdded: cabinRequests.length - before.length, explanation, cabinRequests: [...cabinRequests]};
}
