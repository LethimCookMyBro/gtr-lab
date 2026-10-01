/** Home-only public UI/motion evidence. No reference source or media files are extracted. */
import { chromium } from '@playwright/test';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const round = value => Math.round(value * 1000) / 1000;
export function compareVideoSamples(before, after) {
  return (after.videos || []).flatMap(video => {
    const prior = before.videos?.find(item => item.key === video.key);
    if (!prior || !Number.isFinite(prior.currentTime) || !Number.isFinite(video.currentTime)) return [];
    const wrapped = video.currentTime < prior.currentTime && video.loop && Number.isFinite(video.duration);
    const delta = video.currentTime - prior.currentTime + (wrapped ? video.duration : 0);
    const wallDelta = (after.atMs - before.atMs) / 1000;
    return [{ key: video.key, before: prior.currentTime, after: video.currentTime,
      mediaDeltaSeconds: round(delta), wallDeltaSeconds: round(wallDelta), advancing: delta > .05,
      wrapped, multipleLoopsPossible: Boolean(video.loop && Number.isFinite(video.duration) && video.duration > 0 && wallDelta >= video.duration),
      pausedBefore: prior.paused, pausedAfter: video.paused,
      note: 'Sampled media-clock movement, not a rendered-frame or frame-rate measurement' }];
  });
}
export function compareScrollSamples(before, after) {
  const delta = (after.scroll?.y || 0) - (before.scroll?.y || 0);
  return (after.tracked || []).flatMap(node => {
    const prior = before.tracked?.find(item => item.key === node.key);
    if (!prior) return [];
    const screenDelta = node.rect.y - prior.rect.y;
    const transformChanged = prior.style.transform !== node.style.transform;
    const opacityChanged = prior.style.opacity !== node.style.opacity;
    const filterChanged = prior.style.filter !== node.style.filter;
    if (!transformChanged && !opacityChanged && !filterChanged && Math.abs(delta) < 1) return [];
    return [{ key: node.key, label: node.label, scrollDelta: round(delta), screenDeltaY: round(screenDelta),
      stationaryWhileScrolling: Math.abs(delta) > 20 && Math.abs(screenDelta) < 5,
      transformChanged, opacityChanged, filterChanged,
      before: { rect: prior.rect, style: prior.style }, after: { rect: node.rect, style: node.style } }];
  });
}

// DOM/computed styles only. No JS framework state, source retrieval, asset URLs, or runtime patching.
function readHomeDOM() {
  const clean = value => String(value || '').trim().replace(/\s+/g, ' ').slice(0, 180);
  const rectOf = node => {
    const r = node.getBoundingClientRect();
    return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'right', 'bottom', 'left'].map(key => [key, Math.round(r[key] * 100) / 100]));
  };
  const keyOf = node => {
    const parts = [];
    for (let current = node; current && current !== document.body && parts.length < 7; current = current.parentElement) {
      const siblings = [...(current.parentElement?.children || [])].filter(sibling => sibling.tagName === current.tagName);
      parts.unshift(`${current.tagName.toLowerCase()}:${siblings.indexOf(current)}`);
    }
    return parts.join('/');
  };
  const labelOf = node => clean(node.getAttribute('aria-label') || node.getAttribute('alt') || node.getAttribute('title') || (/^H[1-6]$/.test(node.tagName) ? node.innerText : ''));
  const displayed = node => {
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
    for (let p = node; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    }
    return true;
  };
  const styleOf = node => {
    const s = getComputedStyle(node);
    return Object.fromEntries(['position', 'top', 'left', 'transform', 'opacity', 'filter', 'clipPath', 'objectFit', 'zIndex', 'overflow', 'borderRadius', 'backgroundColor'].map(key => [key, s[key]]));
  };
  const basic = node => ({ key: keyOf(node), tag: node.tagName, label: labelOf(node), rect: rectOf(node), visible: displayed(node), style: styleOf(node) });
  const targets = new Set(document.querySelectorAll('h1,h2,h3,video,img,header,main,section,footer,#smooth-wrapper,#smooth-content,[class*="pin-spacer"]'));
  for (const node of [...targets]) {
    for (let p = node.parentElement, depth = 0; p && p !== document.body && depth < 3; p = p.parentElement, depth++) targets.add(p);
  }
  const videos = [...document.querySelectorAll('video')].map((video, index) => ({
    ...basic(video), key: `video:${index}`, currentTime: video.currentTime,
    duration: Number.isFinite(video.duration) ? video.duration : null,
    paused: video.paused, ended: video.ended, muted: video.muted, autoplay: video.autoplay,
    loop: video.loop, playsInline: video.playsInline, controls: video.controls,
    readyState: video.readyState, networkState: video.networkState, playbackRate: video.playbackRate,
    videoWidth: video.videoWidth, videoHeight: video.videoHeight, hasPoster: Boolean(video.poster),
    error: video.error ? { code: video.error.code, message: video.error.message } : null,
  }));
  const active = document.activeElement;
  return {
    atMs: Date.now(), title: document.title, url: location.href,
    scroll: { x: scrollX, y: scrollY, documentHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    bodyText: (document.body?.innerText || '').slice(0, 5000),
    videos, tracked: [...targets].slice(0, 160).map(basic),
    headings: [...document.querySelectorAll('h1,h2,h3')].filter(displayed).map(node => ({ text: clean(node.innerText), rect: rectOf(node) })),
    visibleCopy: [...document.querySelectorAll('h1,h2,h3,p,figcaption')].filter(displayed).map(node => ({ text: clean(node.innerText), rect: rectOf(node) })),
    controls: [...document.querySelectorAll('button,a,[role="button"],[tabindex],input,[title],[aria-label]')].filter(displayed).slice(0, 70).map(node => ({
      ...basic(node), text: clean(node.innerText), aria: node.getAttribute('aria-label'), title: node.getAttribute('title'),
      role: node.getAttribute('role'), tabIndex: node.tabIndex, expanded: node.getAttribute('aria-expanded'),
      // Navigation destinations are public UI evidence; media URLs are deliberately omitted.
      href: node.tagName === 'A' ? node.getAttribute('href') : null,
    })),
    images: [...document.images].map(image => ({ key: keyOf(image), alt: image.alt, visible: displayed(image), rect: rectOf(image),
      complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight })),
    activeElement: active ? { key: keyOf(active), tag: active.tagName, label: labelOf(active), text: clean(active.innerText), rect: rectOf(active) } : null,
  };
}

async function main() {
  const choice = process.argv.find(arg => arg.startsWith('--viewport='))?.split('=')[1] || 'both';
  if (!['both', 'desktop', 'mobile'].includes(choice)) throw new Error('Use --viewport=desktop, --viewport=mobile, or --viewport=both');
  const root = 'home-motion-audit-results';
  const suffix = choice === 'both' ? '' : `-${choice}`;
  const reportPath = `${root}/observations${suffix}.json`;
  await mkdir(root, { recursive: true });
  const plans = [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]].filter(([name]) => choice === 'both' || choice === name);
  const started = Date.now();
  const result = {
    reference: 'https://everymatrix-porchelab.netlify.app/', capturedAt: new Date().toISOString(),
    flow: 'Home hero media → menu → real wheel-scroll editorial/film/heritage/model sections → model hover/focus → route intent only',
    method: 'Authorized GitHub Chromium; public DOM/computed styles, real input, 40-second screenshot timeout; animations/video are not paused or patched',
    perViewportBudgetMs: 295000, status: 'running', views: [],
  };
  async function save() {
    await writeFile(`${reportPath}.tmp`, JSON.stringify(result, null, 2));
    await rename(`${reportPath}.tmp`, reportPath);
  }
  await save();
  const hardStop = setTimeout(() => {
    result.status = 'budget-exhausted'; result.elapsedMs = Date.now() - started;
    writeFileSync(reportPath, JSON.stringify(result, null, 2)); process.exit(0);
  }, plans.length * 300000 + 25000);
  let browser;
  try {
    browser = await chromium.launch({ timeout: 20000 });
    for (const [name, viewport] of plans) {
      const start = Date.now();
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}) });
      const page = await context.newPage(); page.setDefaultTimeout(6000);
      const view = { name, viewport, status: 'running', events: [], errors: [], consoleErrors: [], screenshotFailures: 0 };
      result.views.push(view); await save();
      let expired = false, previous, screenshotCount = 0;
      const seenVideo = new Set(), screenshotSections = new Set();
      const hasTime = reserve => !expired && Date.now() - start < result.perViewportBudgetMs - reserve;
      const timer = setTimeout(() => {
        expired = true; view.status = 'budget-exhausted'; void context.close().catch(() => {});
      }, result.perViewportBudgetMs);
      page.on('pageerror', error => view.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error' && view.consoleErrors.length < 30) view.consoleErrors.push(message.text().slice(0, 500)); });
      async function checkpoint(label, detail = {}) {
        const event = { label, at: new Date().toISOString(), ...detail };
        view.events.push(event); await save();
        try {
          const snapshot = await page.evaluate(readHomeDOM);
          Object.assign(event, snapshot);
          if (previous) {
            event.motionDelta = compareScrollSamples(previous, snapshot);
            event.videoDelta = compareVideoSamples(previous, snapshot);
          }
          previous = snapshot;
        } catch (error) { event.domError = String(error); }
        await save(); return event;
      }
      async function screenshot(event, priority = false) {
        // Two full 40s failures already establish capture blockage. Preserve time for actual UI work.
        if (view.screenshotFailures >= 2 || screenshotCount >= 9 || !hasTime(priority ? 45000 : 100000)) {
          event.screenshot = { status: 'not-attempted', reason: 'Bounded screenshot budget; DOM evidence retained' };
        } else {
          screenshotCount++;
          const path = `${root}/${name}-${event.label}.png`;
          event.screenshot = { status: 'attempting', path, timeoutMs: 40000 }; await save();
          try {
            // Wait for layout to settle while video and scroll-driven animation remain untouched.
            let lastLayout, stableSamples = 0, samples = 0;
            const settlingStarted = Date.now();
            for (; samples < 8 && stableSamples < 2; samples++) {
              const layout = await page.evaluate(() => [scrollY, ...[...document.querySelectorAll('h1,h2,h3,video,img')].slice(0, 40).flatMap(node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })]);
              stableSamples = lastLayout?.length === layout.length && layout.every((value, index) => Math.abs(value - lastLayout[index]) < 1) ? stableSamples + 1 : 0;
              lastLayout = layout;
              if (stableSamples < 2) await page.waitForTimeout(250);
            }
            event.screenshot.layoutSettling = { stable: stableSamples >= 2, samples, elapsedMs: Date.now() - settlingStarted };
            event.screenshot.startedAt = new Date().toISOString(); await save();
            await page.screenshot({ path, fullPage: false, animations: 'allow', scale: 'css', timeout: 40000 });
            event.screenshot.status = 'captured'; event.screenshot.finishedAt = new Date().toISOString();
          } catch (error) { view.screenshotFailures++; event.screenshot = { ...event.screenshot, status: 'unavailable', error: String(error), timeoutMs: 40000, finishedAt: new Date().toISOString() }; }
        }
        await save();
      }
      async function sampleVideo(label) {
        const before = await checkpoint(`${label}-before`);
        await page.waitForTimeout(1500);
        const after = await checkpoint(`${label}-after`);
        after.playbackSample = compareVideoSamples(before, after); await save(); return after;
      }
      async function action(label, run, settle = 600) {
        if (!hasTime(12000)) return checkpoint(label, { actionStatus: 'unverified', reason: 'Viewport budget' });
        let actionError;
        try { await run(); if (settle) await page.waitForTimeout(settle); } catch (error) { actionError = String(error); }
        return checkpoint(label, { actionStatus: actionError ? 'failed' : 'performed', ...(actionError ? { actionError } : {}) });
      }
      async function labelTarget(label) {
        for (const locator of [page.getByRole('button', { name: label, exact: true }), page.getByText(label, { exact: true }), page.getByLabel(label, { exact: true })]) {
          for (let i = 0, n = Math.min(await locator.count(), 5); i < n; i++) {
            const candidate = locator.nth(i);
            if (!(await candidate.isVisible().catch(() => false))) continue;
            if (await candidate.evaluate(node => {
              const r = node.getBoundingClientRect();
              if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
              for (let p = node; p; p = p.parentElement) { const s = getComputedStyle(p); if (Number(s.opacity) === 0 || s.visibility === 'hidden' || s.display === 'none') return false; }
              return true;
            }).catch(() => false)) return candidate;
          }
        }
        return null;
      }
      async function clickLabel(label, eventLabel) {
        const target = await labelTarget(label);
        return target ? action(eventLabel, () => target.click({ timeout: 6000 })) : checkpoint(eventLabel, { actionStatus: 'unverified', reason: `No visible label: ${label}` });
      }
      try {
        await page.goto(result.reference, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.getByText('Explore in 3D', { exact: true }).first().waitFor({ state: 'visible', timeout: 18000 }).catch(() => {});
        await page.waitForTimeout(1800);
        const hero = await sampleVideo('hero-playback');
        await screenshot(hero, true);
        const initial = hero.controls || [];
        const menuName = initial.flatMap(item => [item.aria, item.text]).find(value => /^(open navigation menu|menu)$/i.test(value || ''));
        if (menuName) {
          const menu = await clickLabel(menuName, 'menu-open');
          await screenshot(menu);
          for (const label of ['Vehicle Purchase', 'Services', 'Experience']) {
            if (await labelTarget(label)) await clickLabel(label, `menu-${label.toLowerCase().replaceAll(' ', '-')}`);
          }
          const close = await labelTarget('Close Menu');
          if (close) await action('menu-close', () => close.click({ timeout: 6000 }));
          else await action('menu-escape', () => page.keyboard.press('Escape'));
        } else await checkpoint('menu-unverified', { reason: 'No visible menu label discovered' });

        // Small real wheel steps preserve scroll-trigger choreography; never seek via scrollTo or app state.
        let stalled = 0, lastScroll = previous?.scroll?.y || 0;
        for (let step = 1; step <= 38 && hasTime(70000); step++) {
          const wheel = Math.round(viewport.height * (step <= 5 ? .62 : .88));
          const event = await action(`scroll-${String(step).padStart(2, '0')}`, () => page.mouse.wheel(0, wheel), 800);
          event.input = { type: 'wheel', deltaY: wheel }; await save();
          for (const video of event.videos || []) {
            if (video.visible && !seenVideo.has(video.key)) {
              seenVideo.add(video.key);
              const sampled = await sampleVideo(`scroll-video-${video.key.replace(':', '-')}`);
              if (video.key !== 'video:0') await screenshot(sampled);
            }
          }
          const headings = (event.headings || []).map(item => item.text).join(' ');
          const visibleImages = (event.images || []).filter(item => item.visible);
          const section = /Design Beyond Time/i.test(headings) ? 'design'
            : /Engineering Without Limits/i.test(headings) ? 'engineering'
            : (event.visibleCopy || []).some(item => /The Visionary Engineer|The Modern Vision/i.test(item.text)) ? 'heritage'
            : visibleImages.some(item => /^(911|718|918|taycan|panamera|cayenne)$/i.test(item.alt)) ? 'models' : null;
          // Heritage captions are not necessarily headings: screenshot a later long-scroll checkpoint too.
          const fallbackHeritage = step === 12 ? 'scroll-story' : null;
          const shotKey = section || fallbackHeritage;
          if (shotKey && !screenshotSections.has(shotKey)) { screenshotSections.add(shotKey); await screenshot(event); }
          const scroll = event.scroll;
          if (scroll) {
            stalled = Math.abs(scroll.y - lastScroll) < 2 ? stalled + 1 : 0; lastScroll = scroll.y;
            if (scroll.y + scroll.viewportHeight >= scroll.documentHeight - 4 || stalled >= 3) break;
          }
        }
        // One reverse input distinguishes reversible choreography from a one-time arrival snapshot.
        if (hasTime(55000)) await action('scroll-reverse', () => page.mouse.wheel(0, -Math.round(viewport.height * .8)), 800);
        const modelSnapshot = await checkpoint('model-discovery');
        const models = (modelSnapshot.images || []).filter(item => /^(911|718|918|taycan|panamera|cayenne)$/i.test(item.alt));
        const chosen = models.find(item => item.visible) || models[0];
        if (chosen && hasTime(35000)) {
          const model = page.getByAltText(chosen.alt, { exact: true }).first();
          const before = await checkpoint('model-hover-before', { modelLabel: chosen.alt });
          const hovered = await action('model-hover-after', () => model.hover({ timeout: 8000 }), 700);
          hovered.modelLabel = chosen.alt;
          hovered.hoverDelta = compareScrollSamples(before, hovered);
          await screenshot(hovered, true);
          const focusInfo = await model.evaluate(node => {
            const target = node.closest('a[href],button,[tabindex]');
            return { nativeFocusableAncestor: Boolean(target && target.tabIndex >= 0), tag: target?.tagName || null, tabIndex: target?.tabIndex ?? null,
              label: target?.getAttribute('aria-label') || null };
          });
          await checkpoint('model-focusability', { modelLabel: chosen.alt, focusInfo, note: 'Ancestor semantics alone do not prove keyboard access' });
          // Real Tab input, never element.focus() or synthetic activation. Record where focus actually goes.
          for (let press = 1; press <= 8 && hasTime(25000); press++) await action(`keyboard-tab-${press}`, () => page.keyboard.press('Tab'), 100);
          if (hasTime(15000)) {
            const intent = { label: 'model-route-intent', at: new Date().toISOString(), modelLabel: chosen.alt,
              beforeUrl: page.url(), status: 'attempting', scope: 'Stop at route change; configurator rendering is not audited' };
            view.events.push(intent); await save();
            try {
              await Promise.all([
                page.waitForURL('**/configurator', { timeout: 12000, waitUntil: 'commit' }),
                model.click({ timeout: 8000 }),
              ]);
              intent.status = 'route-observed'; intent.afterUrl = page.url();
            } catch (error) { intent.status = 'unverified'; intent.error = String(error); intent.afterUrl = page.url(); }
            await save();
            // Do not wait for a canvas/model or capture the heavy configurator.
            await page.close({ runBeforeUnload: false });
          }
        } else await checkpoint('model-interaction-unverified', { reason: chosen ? 'Viewport budget' : 'No recognized model image label discovered' });
        view.status = expired ? 'budget-exhausted' : 'finished-observation-pass';
      } catch (error) { view.status = expired ? 'budget-exhausted' : 'interrupted'; view.errors.push(String(error)); }
      finally {
        view.elapsedMs = Date.now() - start; await save();
        await Promise.race([context.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
        clearTimeout(timer); await save();
      }
    }
    result.status = 'finished-observation-pass';
  } catch (error) { result.status = 'interrupted'; result.error = String(error); }
  finally {
    result.elapsedMs = Date.now() - started; await save();
    await Promise.race([browser?.close().catch(() => {}), new Promise(resolve => setTimeout(resolve, 3000))]);
    clearTimeout(hardStop);
  }
  console.log(`Home motion audit: ${reportPath}. Review actual video clocks, DOM deltas, screenshots, and failed/unverified actions; script completion is not behavior proof.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
