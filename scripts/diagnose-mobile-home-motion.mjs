import { chromium, devices } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const url = process.env.HOME_MOTION_URL || 'https://gtr-lab-production.up.railway.app/';
const output = process.env.HOME_MOTION_OUTPUT || 'mobile-home-motion-evidence';
const deliberateDemo = process.env.HOME_MOTION_DEMO === '1';
const allPlans = [
  { width: 390, height: 844 },
  { width: 390, height: 700 },
  { width: 430, height: 932 },
  { width: 430, height: 700 },
  { width: 390, height: 844, reduced: true },
];
const planName = plan => `${plan.width}x${plan.height}${plan.reduced ? '-reduced' : '-normal'}`;
const selectedPlan = process.env.HOME_MOTION_PLAN;
if (selectedPlan && !allPlans.some(plan => planName(plan) === selectedPlan)) {
  throw new Error(`Unknown HOME_MOTION_PLAN: ${selectedPlan}. Choose ${allPlans.map(planName).join(', ')}`);
}
const plans = allPlans.filter(plan => !selectedPlan || planName(plan) === selectedPlan);
await mkdir(output, { recursive: true });
const report = {
  url, startedAt: new Date().toISOString(),
  scrollPace: deliberateDemo ? 'Deliberate real input for an unretimed demonstration' : 'Diagnostic sweep',
  method: 'GitHub Chromium Android emulation using Pixel 7 user agent/touch settings and the stated CSS viewport. Real incremental mouse-wheel input, not native Android touch gestures. Video records the actual page while scrolling. No media or motion state is patched.',
  performanceScope: 'Unthrottled CI Chromium. RAF frame intervals and Long Tasks during wheel input are diagnostics, not physical-device performance certification.',
  filmScope: 'Host iframe mounting, declared lifecycle state and geometry only. An iframe load or embedded state does not prove provider video playback. External playback acceptance must be performed in a real browser on the public origin.',
  externalPlayback: { status: 'not-exercised', reason: 'This probe does not inspect or alter the cross-origin provider player.' },
  views: [],
};
const save = () => writeFile(path.join(output, 'observations.json'), JSON.stringify(report, null, 2));
const browser = await chromium.launch();
try {
  for (const plan of plans) {
    const name = planName(plan);
    const dir = path.join(output, name);
    await mkdir(dir, { recursive: true });
    const context = await browser.newContext({
      ...devices['Pixel 7'], viewport: { width: plan.width, height: plan.height },
      deviceScaleFactor: 1, reducedMotion: plan.reduced ? 'reduce' : 'no-preference',
      recordVideo: { dir, size: { width: plan.width, height: plan.height } },
    });
    const page = await context.newPage();
    const view = { name, requested: plan, checkpoints: [], errors: [], consoleErrors: [], status: 'running' };
    report.views.push(view);
    page.on('pageerror', error => view.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') view.consoleErrors.push(message.text()); });
    page.setDefaultTimeout(12000);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.getByRole('heading', { name: 'Engineered to defy.' }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        window.__motionProbe = { active: false, last: 0, frames: [], longTasks: [] };
        const probe = window.__motionProbe;
        const tick = time => {
          if (probe.active && probe.last) probe.frames.push(time - probe.last);
          probe.last = probe.active ? time : 0;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
          new PerformanceObserver(list => {
            if (probe.active) probe.longTasks.push(...list.getEntries().map(entry => ({ duration: entry.duration, start: entry.startTime })));
          }).observe({ type: 'longtask' });
        }
      });
      const measure = () => page.evaluate(() => {
        const selectors = ['.home-hero-runway', '.home-hero-sticky', '.home-hero-copy', '.home-film--hero .home-film-provider', '.home-editorial', '.home-editorial-copy--form', '.home-editorial-image--detail', '.home-editorial-image--cockpit', '.home-editorial-copy--control', '.home-expanding-runway', '.home-expanding-frame', '.home-archive-runway', '.home-archive-stage', '.home-archive-inline-copy', '.home-archive-achievement', '.home-archive-navigation', '.home-signature-runway', '.home-signature-canvas', '.home-signature-mark', '.home-signature-footer'];
        return {
          scrollY, width: innerWidth, height: innerHeight,
          visualViewport: { width: visualViewport.width, height: visualViewport.height },
          reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
          saveData: navigator.connection?.saveData ?? null,
          sequential: document.querySelector('.cinematic-home').dataset.sequentialMotion,
          overflow: document.documentElement.scrollWidth - innerWidth,
          nodes: selectors.flatMap(selector => {
            const element = document.querySelector(selector);
            if (!element) return [];
            const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
            return [{ selector, top: rect.top, left: rect.left, width: rect.width, height: rect.height,
              transform: style.transform, opacity: style.opacity, borderRadius: style.borderRadius,
              background: style.backgroundColor, position: style.position,
              progress: style.getPropertyValue('--progress'), activeEra: element.dataset.activeEra }];
          }),
          rearScene: { state: document.querySelector('.home-signature-runway')?.dataset.sceneState, canvasMounted: Boolean(document.querySelector('.home-signature-canvas canvas')), progress: document.querySelector('.home-signature-canvas canvas')?.dataset.rearProgress },
          films: [...document.querySelectorAll('.home-film')].map(holder => {
            const frame = holder.querySelector('iframe.home-film-provider');
            const rect = frame?.getBoundingClientRect();
            return {
              kind: holder.classList.contains('home-film--hero') ? 'hero' : 'detail',
              provider: holder.dataset.filmProvider,
              hostState: holder.dataset.filmState,
              iframeMounted: Boolean(frame),
              source: frame?.getAttribute('src') ?? null,
              title: frame?.getAttribute('title') ?? null,
              control: holder.querySelector('.home-film-toggle')?.getAttribute('aria-label') ?? null,
              frameGeometry: rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null,
              playback: 'not-observed',
            };
          }),
        };
      });
      const checkpoint = async label => {
        const state = await measure();
        view.checkpoints.push({ label, ...state });
        console.log(`[motion] ${view.plan || planName(plan)} ${label} scroll=${state.scrollY} rear=${state.rearScene.state}`);
        const screenshotStarted = Date.now();
        console.log(`[motion] ${name} screenshot-start ${label}`);
        await page.screenshot({ path: path.join(dir, `${label}.png`), animations: 'allow', timeout: 15000 });
        console.log(`[motion] ${name} screenshot-end ${label} elapsedMs=${Date.now() - screenshotStarted}`);
        await save();
      };
      const wheelTo = async (target, label) => {
        const started = Date.now();
        const sweep = { label, target, steps: 0, directionChanges: 0, reached: false, lastObservedScroll: null };
        let previousDirection = 0;
        console.log(`[motion] ${name} wheel-start ${label} target=${target}`);
        await page.evaluate(() => { window.__motionProbe.active = true; });
        for (let step = 0; step < (deliberateDemo ? 450 : 150); step++) {
          const current = await page.evaluate(() => scrollY);
          const remaining = target - current;
          sweep.lastObservedScroll = current;
          if (Math.abs(remaining) < 3) { sweep.reached = true; break; }
          const direction = Math.sign(remaining);
          if (previousDirection && direction !== previousDirection) sweep.directionChanges++;
          previousDirection = direction;
          const delta = direction * Math.min(deliberateDemo ? 24 : 75, Math.abs(remaining));
          const wheelStarted = Date.now();
          if (step % 10 === 0) console.log(`[motion] ${name} wheel-step-start ${label} step=${step} scroll=${current} remaining=${remaining} delta=${delta} elapsedMs=${wheelStarted - started}`);
          await page.mouse.wheel(0, delta);
          sweep.steps++;
          const wheelMs = Date.now() - wheelStarted;
          if (step % 10 === 0 || wheelMs > 1000) console.log(`[motion] ${name} wheel-step-end ${label} step=${step} wheelMs=${wheelMs} directionChanges=${sweep.directionChanges}`);
          await page.waitForTimeout(deliberateDemo ? 80 : 32);
        }
        await page.waitForTimeout(100);
        await page.evaluate(() => { window.__motionProbe.active = false; window.__motionProbe.last = 0; });
        sweep.elapsedMs = Date.now() - started;
        (view.wheelSweeps ||= []).push(sweep);
        console.log(`[motion] ${name} wheel-end ${label} ${JSON.stringify(sweep)}`);
      };
      await checkpoint('00-hero-entry');
      for (const kind of ['hero', 'editorial', 'expanding', 'heritage', 'signature']) {
        if (await page.locator(`[data-motion-section="${kind}"]`).count() === 0) {
          view.omittedSections ||= [];
          view.omittedSections.push({ kind, reason: 'Not mounted in the public homepage; prototype remains unapproved.' });
          await save();
          continue;
        }
        if (kind === 'heritage') {
          for (const chapter of await page.locator('.home-archive-chapter').all()) {
            const geometry = await chapter.evaluate(element => {
              const rect = element.getBoundingClientRect();
              const section = element.closest('.home-archive-runway');
              const railHeight = section.querySelector('.home-archive-stage').offsetHeight;
              const padding = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 88;
              const target = Math.max(0, scrollY + rect.top - padding - railHeight - 16);
              return { index: element.dataset.eraImage, target };
            });
            await wheelTo(Math.max(0, geometry.target), `heritage-chapter-${geometry.index}`);
            await checkpoint(`heritage-chapter-${geometry.index}`);
          }
          await page.mouse.wheel(0, -Math.round(plan.height * .35));
          await page.waitForTimeout(150);
          await checkpoint('heritage-reverse');
          continue;
        }
        const geometry = await page.locator(`[data-motion-section="${kind}"]`).evaluate(element => {
          const rect = element.getBoundingClientRect();
          return { top: scrollY + rect.top, height: rect.height, viewport: innerHeight };
        });
        const run = Math.max(0, geometry.height - geometry.viewport);
        const samples = kind === 'editorial' || run < 10
          ? [geometry.top - geometry.viewport * .55, geometry.top, geometry.top + geometry.height * .4]
          : [.1, .5, .9].map(progress => geometry.top + run * progress);
        for (const [index, target] of samples.entries()) {
          await wheelTo(Math.max(0, target), `${kind}-${index + 1}`);
          await checkpoint(`${kind}-${index + 1}`);
        }
      }
      // Reverse input records whether the staging follows scroll in both directions.
      await page.mouse.wheel(0, -Math.round(plan.height * .35));
      await page.waitForTimeout(150);
      await checkpoint('signature-reverse');
      view.performance = await page.evaluate(() => {
        const { frames, longTasks } = window.__motionProbe;
        const sorted = [...frames].sort((a, b) => a - b);
        const percentile = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
        return { frameSamples: frames.length, medianMs: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), framesOver34ms: frames.filter(time => time > 34).length, longTasks, maxLongTaskMs: Math.max(0, ...longTasks.map(task => task.duration)) };
      });
      view.status = 'observed';
    } catch (error) {
      view.status = 'failed'; view.errors.push(String(error));
    } finally {
      await context.close();
      view.video = await page.video()?.path();
      await save();
    }
  }
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  await save();
}
console.log(`Mobile motion evidence: ${output}/observations.json`);
if (report.views.some(view => view.status === 'failed')) process.exitCode = 1;
