/** Capture readiness is deliberately separate from production control readiness. */
export async function waitForCabinWindowReady(page, { timeout = 90_000 } = {}) {
  await page.waitForFunction(() => {
    const status = document.querySelector('.cabin-window-status');
    const text = status?.textContent?.trim();
    if (text === 'Window view unavailable') throw new Error('Window proxy failed before the ready exterior baseline');
    return status?.getAttribute('role') === 'status'
      && text === 'Window view ready · Simplified cabin';
  }, null, { timeout, polling: 100 });
}
