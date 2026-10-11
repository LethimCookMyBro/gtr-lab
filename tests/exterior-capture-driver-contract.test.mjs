import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
const source = file => readFile(new URL(`../scripts/${file}`, import.meta.url), 'utf8');
it.each(['capture-vehicle.mjs', 'diagnose-configurator-controls.mjs', 'capture-environments.mjs'])('%s opts in before navigation and verifies every quantified capture', async file => {
  const text = await source(file);
  expect(text).toMatch(/context\.addInitScript\(installFunctionalCaptureObserver\)[\s\S]*page\.goto/);
  expect(text).toMatch(/waitForExteriorCapture\(page,\s*\{[^}]*timeout:\s*15000\s*\}/);
  expect(text).toContain('verifyFunctionalCapture(page)');
  expect(text).toContain('cameraRequest:');
  expect(text).not.toContain('requestAnimationFrame(() => requestAnimationFrame');
  expect(text).not.toContain('waitForFullResolutionFrames');
});
it('physical environment input arms before held-key work and retains exact reset/clamp/pixel assertions', async () => {
  const text = await source('capture-environments.mjs');
  const press = text.slice(text.indexOf('async function press('),text.indexOf('async function capture('));
  expect(press).toMatch(/armCapture\([\s\S]*keyboard\.down\(physicalKey\)/);
  expect(press).toContain('allowUnchanged: ["+", "-"].includes(key)');
  for (const assertion of ['Home did not restore the canonical framing','Minimum zoom did not clamp','Maximum zoom did not clamp','Zoom reset did not restore canonical pixels','Environment return ${cycle} changed canonical pixels']) expect(text).toContain(assertion);
  expect(text).toMatch(/revalidated\.readiness\[key\], resolution\.readiness\[key\]/);
  expect(text).toContain('timeout: 90000');
  expect(text).toContain('screenshotTimeoutMs: name === "desktop-1920" ? 90000 : 45000');
});
it('control audit retains exact canonical reset, distinct controls, screenshot retry and rotation-stop assertions', async () => {
  const text = await source('diagnose-configurator-controls.mjs');
  expect(text).toContain("assert.equal(restored, canonical, 'Reselecting a camera must restore its exact canonical perspective after manual orbit')");
  expect(text).toContain('assert.notEqual(after, before)');
  expect(text).toContain('assert.notEqual(on, off)');
  expect(text).toContain('captureWithTimeoutRetry(async () =>');
  expect(text).toContain("button.click({ timeout: 60000 })");
  expect(text).toContain('timeout: 45000, clip: bounds');
});
it('vehicle smoke preserves exact restoration and shared-HDR/cache assertions', async () => {
  const text = await source('capture-vehicle.mjs');
  expect(text).toContain('manual === canonical || restored !== canonical');
  expect(text).toContain('after === before');
  expect(text).toContain('hdrRequests.length !== 1 || hdrRequests[0] !== sharedHdrPath');
  expect(text).toContain('await waitForEnvironmentReady(page, environment)');
});
it.each(['diagnose-mobile-home-motion.mjs','audit-home-motion.mjs','diagnose-render-backpressure-lifecycle.mjs','render-backpressure-lifecycle-fixture.mjs'])('%s remains outside functional observation', async file => {
  expect(await source(file)).not.toMatch(/installFunctionalCaptureObserver|waitForExteriorCapture|armFunctionalCapture|verifyFunctionalCapture/);
});
