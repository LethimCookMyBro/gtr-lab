import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Locator, Page, TestInfo } from "@playwright/test";

const eras = ["1969", "1989", "1999", "2007"];

async function scrollRest(page: Page) {
  expect(
    await page.evaluate(async () => {
      let previous = scrollY;
      let stable = 0;
      for (let frame = 0; frame < 240; frame++) {
        await new Promise(requestAnimationFrame);
        stable = Math.abs(scrollY - previous) < 0.5 ? stable + 1 : 0;
        previous = scrollY;
        if (stable >= 8) return true;
      }
      return false;
    }),
    "browser wheel scrolling settles",
  ).toBe(true);
}

async function wheelTo(page: Page, destination: number) {
  const viewport = page.viewportSize()!;
  await page.mouse.move(viewport.width / 2, viewport.height * 0.82);
  const target = await page.evaluate(
    (y) =>
      Math.max(
        0,
        Math.min(y, document.documentElement.scrollHeight - innerHeight),
      ),
    destination,
  );
  const delta = target - (await page.evaluate(() => scrollY));
  const steps = Math.max(
    8,
    Math.ceil(Math.abs(delta) / Math.min(320, viewport.height * 0.4)),
  );
  for (let step = 0; step < steps; step++) {
    await page.mouse.wheel(0, delta / steps);
    await page.waitForTimeout(65);
  }
  await scrollRest(page);
  expect(Math.abs((await page.evaluate(() => scrollY)) - target)).toBeLessThan(
    4,
  );
}

async function archiveTarget(chapter: Locator, progress = 0.65) {
  return chapter.evaluate((node, p) => {
    const stage = node.querySelector<HTMLElement>(".home-archive-exhibition")!;
    const style = getComputedStyle(stage);
    const top = scrollY + node.getBoundingClientRect().top;
    if (style.position === "sticky")
      return (
        top -
        Number.parseFloat(style.top) +
        (node.getBoundingClientRect().height - stage.offsetHeight - 52) * p
      );
    const rail = document.querySelector<HTMLElement>(".home-archive-stage")!;
    return (
      top -
      (Number.parseFloat(getComputedStyle(rail).top) || 0) -
      rail.offsetHeight -
      18
    );
  }, progress);
}

async function rearTarget(rear: Locator, progress: number) {
  return rear.evaluate((node, p) => {
    const stage = node.querySelector<HTMLElement>(".home-signature-sticky")!;
    return (
      scrollY +
      node.getBoundingClientRect().top +
      (node.getBoundingClientRect().height - stage.offsetHeight) * p
    );
  }, progress);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: "css" });
}

async function centeredYear(chapter: Locator) {
  expect(
    await chapter.locator(".home-archive-year").evaluate((year) => {
      const range = document.createRange();
      range.selectNodeContents(year);
      const bounds = range.getBoundingClientRect();
      return Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2);
    }),
  ).toBeLessThan(8);
}

async function archiveState(chapter: Locator) {
  return chapter.evaluate((node) => ({
    scrollY,
    progress: (node as HTMLElement).style.getPropertyValue(
      "--exhibition-progress",
    ),
    yearShift: (node as HTMLElement).style.getPropertyValue(
      "--exhibition-year-shift",
    ),
    photographs: [...node.querySelectorAll("img")].map((image) => ({
      src: image.currentSrc,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      objectFit: getComputedStyle(image).objectFit,
    })),
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
}

/** An end-to-end evidence recording, deliberately separate from fault-injection
 * and isolated layout tests. No intercepted assets, forced readiness, scrollTo,
 * animation disabling, CSS overrides, or fake canvas are permitted here. */
test("real loading gate, four centered eras and rear-light reveal through native forward and reverse input", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const models: string[] = [];
  const audioRequests: string[] = [];
  const phases: Array<{
    phase: string | null;
    state: string | null;
    at: number;
  }> = [];
  const archive: Array<unknown> = [];
  const rearFrames: Array<{ name: string; progress: number; hash: string }> =
    [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/audio/"))
      audioRequests.push(request.url());
    if (new URL(request.url()).pathname.endsWith(".glb"))
      models.push(request.url());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/GT.?R/i);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  const gate = page.locator(".home-loading-gate");
  const rear = page.locator(".home-signature-runway");
  const canvas = rear.locator("canvas");
  await expect(gate).toBeAttached();
  // Capture the real initial state immediately. On very fast machines this can
  // already be resolved; the recording and phase metadata retain that fact.
  phases.push({
    phase: await gate.getAttribute("data-load-phase"),
    state: await gate.getAttribute("data-state"),
    at: Date.now(),
  });
  await capture(page, info, "00-real-opening-state");
  await expect(rear).toHaveAttribute("data-scene-state", "ready", {
    timeout: 120000,
  });
  await expect(gate).toHaveAttribute("data-state", "resolved", {
    timeout: 30000,
  });
  await expect(gate).not.toBeVisible();
  await expect(page.locator(".cinematic-home")).not.toHaveAttribute(
    "inert",
    "",
  );
  phases.push({
    phase: await gate.getAttribute("data-load-phase"),
    state: await gate.getAttribute("data-state"),
    at: Date.now(),
  });
  await expect(canvas).toHaveCount(1);
  const originalCanvas = await canvas.elementHandle();
  await expect(page.locator("#home-title")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await capture(page, info, "01-opening-ready-real-scene-prepared");
  // Pauses preserve real-time review pacing only. They do not change app state.
  await page.waitForTimeout(650);

  for (const index of [0, 1, 2, 3]) {
    const chapter = page.locator(`[data-era-image="${index}"]`);
    const pinned = await chapter
      .locator(".home-archive-exhibition")
      .evaluate((node) => getComputedStyle(node).position === "sticky");
    for (const [name, progress] of pinned
      ? ([
          ["enter", 0],
          ["reveal", 0.3],
          ["hold", 0.65],
        ] as const)
      : ([["reading", 0.65]] as const)) {
      await wheelTo(page, await archiveTarget(chapter, progress));
      await expect(page.locator("#home-heritage")).toHaveAttribute(
        "data-active-era",
        String(index),
      );
      await expect(chapter.locator(".home-archive-year")).toHaveText(
        eras[index],
      );
      await centeredYear(chapter);
      if (name === "hold" || !pinned)
        await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
      if (name === "hold") {
        await expect
          .poll(async () =>
            (await archiveState(chapter)).photographs.every(
              (photo) => photo.complete && photo.naturalWidth > 0,
            ),
          )
          .toBe(true);
      }
      const state = await archiveState(chapter);
      expect(state.overflow).toBe(false);
      archive.push({ year: eras[index], direction: "forward", name, ...state });
      await capture(page, info, `02-archive-${eras[index]}-${name}`);
      await page.waitForTimeout(name === "hold" ? 600 : 200);
    }
    if (!pinned) {
      for (const [photoIndex, figure] of (
        await chapter.locator("figure").all()
      ).entries()) {
        const destination = await figure.evaluate(
          (node) => scrollY + node.getBoundingClientRect().top - 145,
        );
        await wheelTo(page, destination);
        await expect(figure).toBeInViewport();
        await expect
          .poll(() =>
            figure
              .locator("img")
              .evaluate(
                (node) =>
                  (node as HTMLImageElement).complete &&
                  (node as HTMLImageElement).naturalWidth > 0,
              ),
          )
          .toBe(true);
        await expect(figure.locator("img")).toHaveCSS("object-fit", "contain");
        await expect(figure.locator("figcaption")).toBeVisible();
        await capture(
          page,
          info,
          `02-archive-${eras[index]}-photo-${photoIndex}`,
        );
      }
    } else {
      await expect
        .poll(async () =>
          (await archiveState(chapter)).photographs.every(
            (photo) => photo.complete && photo.naturalWidth > 0,
          ),
        )
        .toBe(true);
    }
  }

  const staticRear =
    (await page
      .locator(".cinematic-home")
      .getAttribute("data-sequential-motion")) === "true";
  for (const [name, progress] of [
    ["taillamps", 0.03],
    ["reveal", 0.46],
    ["hold", 0.76],
    ["reverse-reveal", 0.46],
    ["reverse-taillamps", 0.03],
  ] as const) {
    await wheelTo(page, await rearTarget(rear, progress));
    await expect(rear).toHaveAttribute("data-scene-state", "ready");
    await expect(rear).toHaveAttribute("data-render-active", "true");
    await expect
      .poll(
        async () =>
          Math.abs(
            Number(await canvas.getAttribute("data-rear-progress")) -
              (staticRear ? 1 : progress),
          ),
        { timeout: 15000 },
      )
      .toBeLessThan(0.02);
    const bytes = await canvas.screenshot({
      path: info.outputPath(`03-canvas-${name}.png`),
      scale: "css",
    });
    rearFrames.push({
      name,
      progress: Number(await canvas.getAttribute("data-rear-progress")),
      hash: createHash("sha256").update(bytes).digest("hex"),
    });
    await capture(page, info, `03-rear-${name}`);
    await page.waitForTimeout(650);
  }
  if (!staticRear) {
    expect(rearFrames[0].hash).not.toBe(rearFrames[1].hash);
    expect(rearFrames[1].hash).not.toBe(rearFrames[2].hash);
  }

  // Playwright video has no audio track. This records the standalone listening
  // controls, never synchronizes the recording with rear-scene movement.
  const audio = page.locator(".r35-sound-preview");
  const audioEvidence: Record<string, unknown> = {
    offered: (await audio.count()) > 0,
  };
  if (await audio.count()) {
    expect(audioRequests).toEqual([]);
    await wheelTo(
      page,
      await audio.evaluate(
        (node) => scrollY + node.getBoundingClientRect().top - 160,
      ),
    );
    await expect(audio).toHaveAttribute("data-audio-phase", "idle");
    await audio
      .getByRole("button", { name: "Hear the R35", exact: true })
      .click();
    await expect(audio).toHaveAttribute("data-audio-phase", "playing", {
      timeout: 15000,
    });
    audioEvidence.activated = true;
    await capture(page, info, "04-hear-control-active");
    await expect(audio).toHaveAttribute("data-audio-phase", "idle", {
      timeout: 12000,
    });
    audioEvidence.naturalEnd = true;
    await audio
      .getByRole("button", { name: "Hear the R35", exact: true })
      .click();
    await expect(audio).toHaveAttribute("data-audio-phase", "playing");
    await audio
      .getByRole("button", { name: "Mute sample", exact: true })
      .click();
    await expect(
      audio.getByRole("button", { name: "Unmute sample", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(audio).toHaveAttribute("data-audio-phase", "idle");
    await expect(
      audio.getByRole("button", { name: "Hear the R35", exact: true }),
    ).toBeDisabled();
    audioEvidence.muted = true;
    await capture(page, info, "04-hear-control-muted");
  }
  await wheelTo(page, await rearTarget(rear, 0.76));
  const family = rear.getByRole("link", {
    name: "Meet the family",
    exact: true,
  });
  await expect(family).toHaveAttribute("href", "#home-lineup");
  await family.click();
  await scrollRest(page);
  await expect(page.locator("#home-models-title")).toBeInViewport();
  await capture(page, info, "05-family-link-destination");

  for (const index of [3, 2, 1, 0]) {
    const chapter = page.locator(`[data-era-image="${index}"]`);
    await wheelTo(page, await archiveTarget(chapter));
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      String(index),
    );
    await centeredYear(chapter);
    await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
    archive.push({
      year: eras[index],
      direction: "reverse",
      ...(await archiveState(chapter)),
    });
    await capture(page, info, `06-reverse-archive-${eras[index]}`);
    await page.waitForTimeout(450);
  }
  expect(
    await originalCanvas!.evaluate(
      (element) =>
        element === document.querySelector(".home-signature-canvas canvas"),
    ),
  ).toBe(true);
  expect(models).toHaveLength(1);
  expect(new URL(models[0]).pathname).toBe("/models/ciasny-r35.glb");
  expect(errors).toEqual([]);
  await info.attach("genuine-exhibition-preview-evidence", {
    body: JSON.stringify(
      {
        viewport: page.viewportSize(),
        phases,
        models,
        archive,
        rearFrames,
        audioEvidence,
        audioRequests,
        errors,
        filmStates: await page
          .locator("[data-film-state]")
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              className: node.className,
              state: node.getAttribute("data-film-state"),
            })),
          ),
        scope:
          "Unmodified production assets and readiness; native browser wheel input; normal Playwright video at viewport size. SwiftShader rendering is not physical-device GPU certification. External provider playback, audible output, and non-Chromium/older Safari Ogg support are not certified by this silent recording.",
        staticRear,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
