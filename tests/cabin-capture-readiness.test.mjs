// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForCabinWindowReady } from '../scripts/cabin-capture-readiness.mjs';

function scene(text = 'Loading window view…') {
  document.body.innerHTML = `<main><div class="scene-stage"><canvas></canvas></div>
    <button aria-label="Ultimate Silver"></button><button aria-label="Lights"></button><button aria-label="Camera"></button>
    <button class="provenance"><span class="cabin-window-status" role="status">${text}</span></button></main>`;
}
function fakePage() {
  return {
    waitForFunction: vi.fn(async (predicate, arg, { timeout, polling }) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate(arg)) return true;
        await new Promise(resolve => setTimeout(resolve, polling));
      }
      throw new Error(`Window readiness timed out after ${timeout}ms`);
    }),
  };
}
beforeEach(() => { vi.useFakeTimers(); scene(); });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('window-ready exterior capture baseline', () => {
  it('waits for a delayed proxy even while all exterior controls are already available', async () => {
    const page = fakePage(); let ready = false;
    const waiting = waitForCabinWindowReady(page).then(() => { ready = true; });
    setTimeout(() => scene('Window view ready · Simplified cabin'), 1200);
    await vi.advanceTimersByTimeAsync(500);
    expect(ready).toBe(false);
    for (const name of ['Ultimate Silver', 'Lights', 'Camera']) expect(document.querySelector(`[aria-label="${name}"]`).disabled).toBe(false);
    await vi.advanceTimersByTimeAsync(700); await waiting;
    expect(ready).toBe(true);
    expect(page.waitForFunction.mock.calls[0].slice(1)).toEqual([null, { timeout: 90000, polling: 100 }]);
  });
  it.each(['missing', 'wrong status role', 'still loading', 'unrecognized copy'])(
    'never accepts %s as a ready proxy baseline', async state => {
      if (state === 'missing') document.querySelector('.cabin-window-status').remove();
      if (state === 'wrong status role') { scene('Window view ready · Simplified cabin'); document.querySelector('.cabin-window-status').removeAttribute('role'); }
      if (state === 'unrecognized copy') scene('Cabin ready');
      const waiting = waitForCabinWindowReady(fakePage(), { timeout: 500 });
      const rejected = expect(waiting).rejects.toThrow(/timed out after 500ms/);
      await vi.advanceTimersByTimeAsync(500); await rejected;
    },
  );
  it('fails immediately for an unavailable proxy without accepting the fallback as the ready baseline', async () => {
    scene('Window view unavailable');
    await expect(waitForCabinWindowReady(fakePage())).rejects.toThrow(/failed before the ready exterior baseline/);
  });
  it('propagates proxy failure after controls are ready rather than timing out', async () => {
    const waiting = waitForCabinWindowReady(fakePage());
    const rejected = expect(waiting).rejects.toThrow(/failed before the ready exterior baseline/);
    setTimeout(() => scene('Window view unavailable'), 300);
    await vi.advanceTimersByTimeAsync(300); await rejected;
  });
  it('keeps the driver opted-in, exact-pixel, full-image cleanup and both arrival-order proofs', async () => {
    const source = await readFile('scripts/capture-cabin-preview.mjs', 'utf8');
    expect(source).toContain('const target = resolveCabinTarget(process.env)');
    expect(source).toMatch(/if \(window\) \{\s*await waitForCabinWindowReady\(page\)/);
    expect(source).toMatch(/await waitForCabinWindowReady\(page\);[\s\S]*const exteriorBefore = await capture\('exterior-before'\)/);
    expect(source).toContain('comparison.changedPixels === 0');
    expect(source).toContain('page.evaluate(measureCabinWindowLayout)');
    expect(source).toContain('assertCabinWindowLayout(windowStatus)');
    const lateProxy = source.slice(source.indexOf("await check('Full cabin arrives before proxy"), source.indexOf("await check('Proxy arrives while full cabin"));
    expect(lateProxy.match(/await expect\(page.locator\('\.cabin-window-status'\)\).toBeHidden\(\)/g)).toHaveLength(2);
    expect(lateProxy).toContain("await comparePixels(fullBefore, await capture('full-after-late-proxy')");
    expect(source).toContain("bitmap.closeCalls, 1, 'Every completed candidate load remains closed exactly once at final hygiene'");
    for (const proof of [
      'Full cabin arrives before proxy and late proxy remains hidden',
      'Proxy arrives while full cabin is in-flight and cancellation restores it',
      'In-flight window proxy model switch cancels without late resurrection',
      'In-flight window proxy context-loss cancel and explicit viewer retry',
      'Missing window proxy is nonblocking and a fresh Premium entry retries it',
      'window-front-side', 'window-rear-side', 'window-opposite-side',
    ]) expect(source).toContain(proof);
  });
});
