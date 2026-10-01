/** Bounded public-UI audit. Reference failures never gate this app. No asset/source extraction. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';

const root = 'reference-audit-results';
await mkdir(root, { recursive: true });
const started = Date.now();
const result = {
  reference: 'https://everymatrix-porchelab.netlify.app/',
  capturedAt: new Date().toISOString(),
  method: 'Public DOM, real pointer/keyboard input, and optional screenshots in cloud Chromium/SwiftShader',
  budgetMs: 220000,
  status: 'running',
  views: [],
};
async function save() {
  await writeFile(`${root}/observations.json.tmp`, JSON.stringify(result, null, 2));
  await rename(`${root}/observations.json.tmp`, `${root}/observations.json`);
}
await save();
// Leave time for GitHub's four-minute step limit and preserve the last in-memory evidence
// even if the renderer stops answering. This guard never changes the reference runtime.
const hardStop = setTimeout(() => {
  result.status = 'budget-exhausted';
  result.elapsedMs = Date.now() - started;
  writeFileSync(`${root}/observations.json`, JSON.stringify(result, null, 2));
  process.exit(0);
}, result.budgetMs);
let browser;
try {
  browser = await chromium.launch({
    timeout: 20000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
  });
  for (const [name, viewport, budgetMs] of [
    ['desktop', { width: 1440, height: 900 }, 125000],
    ['mobile', { width: 390, height: 844 }, 75000],
  ]) {
    const remaining = result.budgetMs - (Date.now() - started) - 5000;
    if (remaining < 20000) {
      result.views.push({ name, viewport, status: 'unverified', reason: 'Insufficient remaining audit budget', events: [] });
      await save();
      break;
    }
    const context = await browser.newContext({ viewport, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}), deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(3000);
    const view = { name, viewport, status: 'running', events: [], errors: [], consoleErrors: [] };
    result.views.push(view);
    await save();
    const deadline = Date.now() + Math.min(budgetMs, remaining);
    let expired = false;
    const viewTimer = setTimeout(() => {
      expired = true;
      view.status = 'budget-exhausted';
      void context.close().catch(() => {});
    }, Math.min(budgetMs, remaining));
    page.on('pageerror', error => view.errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && view.consoleErrors.length < 30) view.consoleErrors.push(message.text().slice(0, 500));
    });
    const hasTime = (reserve = 0) => !expired && Date.now() < deadline - reserve;

    async function capture(label, { screenshot = true, ...details } = {}) {
      const event = { label, at: new Date().toISOString(), url: page.url(), ...details };
      view.events.push(event);
      // Persist the event and public DOM BEFORE asking the busy WebGL renderer for pixels.
      await save();
      try {
        Object.assign(event, await page.evaluate(() => {
          const visible = node => {
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
            for (let p = node; p; p = p.parentElement) {
              const style = getComputedStyle(p);
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
            }
            return true;
          };
          const text = node => (node.innerText || node.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180);
          return {
            title: document.title,
            bodyText: (document.body?.innerText || '').slice(0, 6000),
            visibleControls: [...document.querySelectorAll('button, [role="button"], input, select, [title], [aria-label], img[alt], li, label')]
              .filter(visible).slice(0, 120).map(node => ({
                tag: node.tagName, text: text(node), aria: node.getAttribute('aria-label'), title: node.getAttribute('title'),
                alt: node.getAttribute('alt'), type: node.getAttribute('type'), id: node.id || null,
                value: 'value' in node ? node.value : undefined,
                pressed: node.getAttribute('aria-pressed'), expanded: node.getAttribute('aria-expanded'),
                checked: 'checked' in node ? node.checked : undefined, disabled: 'disabled' in node ? node.disabled : undefined,
              })),
            headings: [...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(visible).map(text),
            dialogs: [...document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"]')].filter(visible).map(text),
            canvasCount: document.querySelectorAll('canvas').length,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          };
        }));
      } catch (error) { event.domError = String(error); }
      await save();
      if (!screenshot || !hasTime(4000)) {
        event.screenshot = { status: 'not-attempted', reason: screenshot ? 'Viewport time budget' : 'DOM-only checkpoint' };
      } else {
        const path = `${root}/${name}-${label}.png`;
        try {
          // Keep real animations intact: disabling CSS animations can distort reference transitions.
          await page.screenshot({ path, animations: 'allow', scale: 'css', timeout: 2500 });
          event.screenshot = { status: 'captured', path };
        } catch (error) {
          event.screenshot = { status: 'unavailable', error: String(error) };
        }
      }
      await save();
      return event;
    }

    async function perform(label, action, options = {}) {
      if (!hasTime(3500)) {
        view.events.push({ label, status: 'unverified', reason: 'Viewport time budget' });
        await save();
        return null;
      }
      let actionError;
      try {
        await action();
        // Give observed route/panel transitions a short settling window without freezing them.
        await page.waitForTimeout(450);
      } catch (error) { actionError = String(error); }
      return capture(label, { ...options, actionStatus: actionError ? 'failed' : 'performed', ...(actionError ? { actionError } : {}) });
    }

    async function findLabel(label) {
      const candidates = [
        page.getByRole('button', { name: label, exact: true }),
        page.getByText(label, { exact: true }), page.getByTitle(label, { exact: true }),
        page.getByLabel(label, { exact: true }), page.getByAltText(label, { exact: true }),
      ];
      for (const candidate of candidates) {
        for (let index = 0, count = Math.min(await candidate.count(), 6); index < count; index++) {
          const target = candidate.nth(index);
          if (!(await target.isVisible().catch(() => false))) continue;
          const displayed = await target.evaluate(node => {
            const rect = node.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth) return false;
            for (let p = node; p; p = p.parentElement) {
              const style = getComputedStyle(p);
              if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
            }
            return true;
          }).catch(() => false);
          if (displayed) return target;
        }
      }
      return null;
    }

    async function clickLabel(label, checkpoint, options = {}) {
      const target = await findLabel(label);
      if (!target) {
        view.events.push({ label: checkpoint, unverifiedControl: label, reason: 'No visible matching label discovered' });
        await save();
        return null;
      }
      const { expectURL, ...captureOptions } = options;
      return perform(checkpoint, async () => {
        await target.click({ timeout: 3000 });
        if (expectURL) await page.waitForURL(expectURL, { timeout: 5000 });
      }, { controlLabel: label, ...captureOptions });
    }

    async function exitPanel(label) {
      const afterEscape = await perform(`${label}-escape`, () => page.keyboard.press('Escape'), { screenshot: false });
      // Escape is only an attempted exit. Use a close control only if its label is actually present.
      const close = afterEscape?.visibleControls?.flatMap(c => [c.aria, c.title, c.text]).find(value => /^(close|close panel|close details|close model detail|close menu|×)$/i.test(value || ''));
      if (close) await clickLabel(close, `${label}-close`, { screenshot: false });
    }

    try {
      await page.goto(result.reference, { waitUntil: 'domcontentloaded', timeout: 25000 });
      await page.getByText('Explore in 3D', { exact: true }).first().waitFor({ state: 'visible', timeout: 12000 }).catch(() => {});
      await capture('home');
      const entry = await clickLabel('Explore in 3D', 'enter-configurator', { screenshot: false });
      if (entry?.actionStatus === 'performed') {
        await page.waitForURL('**/configurator', { timeout: 15000 }).catch(error => view.errors.push(`Route wait: ${error}`));
        await page.locator('canvas').first().waitFor({ state: 'visible', timeout: 12000 }).catch(error => view.errors.push(`Canvas wait: ${error}`));
        await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {});
        view.graphics = await page.locator('canvas').evaluateAll(canvases => canvases.map(canvas => {
          const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
          return { width: canvas.width, height: canvas.height, webgl: !!gl, lost: gl?.isContextLost(), renderer: gl?.getParameter(gl.RENDERER) };
        }));
        await capture('configurator', { screenshot: false });
        // The first configurator screenshot follows ordinary pointer input, which may stop
        // auto-rotation. It is not a claim that rotation stopped; compare actual artifacts.
        const canvas = page.locator('canvas').first();
        if (await canvas.isVisible().catch(() => false)) {
          await perform('manual-orbit', async () => {
            const box = await canvas.boundingBox();
            if (!box) throw new Error('Canvas has no visible bounds');
            await page.mouse.move(box.x + box.width * .46, box.y + box.height * .55);
            await page.mouse.down();
            try { await page.mouse.move(box.x + box.width * .64, box.y + box.height * .55, { steps: 8 }); }
            finally { await page.mouse.up(); }
          }, { input: 'mouse drag', verification: 'Input performed; camera response requires screenshot comparison' });
          if (name === 'desktop') await perform('manual-zoom', () => page.mouse.wheel(0, -220), { input: 'mouse wheel -220', verification: 'Input performed; zoom/clamps require screenshot comparison' });
        }
        const detail = await clickLabel('Model Detail', 'model-detail');
        if (detail?.actionStatus === 'performed') await exitPanel('model-detail');
        const swatch = page.locator('input[type="color"]').first();
        if (await swatch.isVisible().catch(() => false)) {
          const before = await swatch.inputValue();
          await perform('paint-change', () => swatch.fill('#991b2b'), { control: 'Visible input[type=color]', before, requested: '#991b2b', verification: 'Input value is DOM evidence; rendered paint response requires screenshot comparison' });
        } else {
          view.events.push({ label: 'paint-change', status: 'unverified', reason: 'No visible color input' });
          await save();
        }
        // Discover toolbar labels from the current public UI. Never guess icon meaning or
        // click an external link, positional icon, or a hard-coded hidden DOM target.
        const toolbar = await capture('toolbar-controls', { screenshot: false });
        const discovered = [...new Set((toolbar.visibleControls || []).flatMap(control => [control.aria, control.title, control.alt, control.text]).filter(Boolean))];
        for (const category of ['camera', 'environment', 'lights', 'sound']) {
          const word = category === 'lights' ? /\blights?\b/i : new RegExp(`\\b${category}\\b`, 'i');
          const label = discovered.find(value => value.length < 65 && word.test(value));
          if (!label) {
            view.events.push({ label: category, status: 'unverified', reason: 'No visible labeled toolbar control discovered' });
            await save();
            continue;
          }
          const opened = await clickLabel(label, category);
          if (opened?.actionStatus === 'performed') await exitPanel(category);
        }
        await clickLabel('Back', 'returned-home', { expectURL: result.reference });
      }
      view.status = hasTime() ? 'finished-observation-pass' : 'budget-exhausted';
    } catch (error) {
      view.errors.push(String(error));
      view.status = expired ? 'budget-exhausted' : 'interrupted';
      if (!expired) await capture('interrupted', { screenshot: false }).catch(() => {});
    } finally {
      clearTimeout(viewTimer);
      await save();
      await context.close().catch(error => view.errors.push(`Context close: ${error}`));
      await save();
    }
  }
  result.status = 'finished-observation-pass';
} catch (error) {
  result.status = 'interrupted';
  result.error = String(error);
} finally {
  result.elapsedMs = Date.now() - started;
  await save();
  await browser?.close();
  clearTimeout(hardStop);
}
console.log(`Reference audit saved ${result.views.length} viewport records. Review actionStatus, resulting DOM, screenshots and unverified controls; this is not an app test result.`);
