import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";

async function settle(page: Page) {
  await page.evaluate(async () => {
    let last = scrollY,
      stable = 0;
    for (let i = 0; i < 240; i++) {
      await new Promise(requestAnimationFrame);
      stable = Math.abs(scrollY - last) < 0.5 ? stable + 1 : 0;
      last = scrollY;
      if (stable >= 8) return;
    }
    throw new Error("Native scroll did not settle");
  });
}
async function wheelTo(page: Page, target: number) {
  await page.mouse.move(12, page.viewportSize()!.height * 0.7);
  const delta = target - (await page.evaluate(() => scrollY));
  const steps = Math.max(4, Math.ceil(Math.abs(delta) / 280));
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, delta / steps);
    await page.waitForTimeout(85);
  }
  await settle(page);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), scale: "css" });
}

// Genuine browser evidence. No intercepted assets, forced readiness, synthetic
// scroll animation, video retiming, CSS override or substituted canvas.
test("sparse timeline and quiet cards through native forward and reverse input", async ({
  page,
}, info) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Exercise the real explicit lightweight route; rear rendering has its own clip.
  await continueHomeWithout3D(page);
  await page.evaluate(() => document.fonts.ready);
  await capture(page, info, "01-first-viewport");
  const markers: Array<{ label: string; at: number }> = [];
  for (const index of [0, 1, 2, 3, 2, 1]) {
    const chapter = page.locator(`[data-era-image="${index}"]`);
    const target = await chapter.evaluate(
      (node) => scrollY + node.getBoundingClientRect().top - 112,
    );
    await wheelTo(page, target);
    await chapter
      .locator(".home-timeline-image img")
      .evaluate((image: HTMLImageElement) => image.decode());
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      String(index),
    );
    await expect(chapter.getByRole("heading")).toBeInViewport();
    await expect(chapter.locator("details")).not.toHaveAttribute("open", "");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    markers.push({ label: `era-${index}`, at: Date.now() });
    await capture(page, info, `02-timeline-${index}-${markers.length}`);
    await page.waitForTimeout(350);
  }
  const lineup = page.locator("#home-lineup");
  await wheelTo(
    page,
    await lineup.evaluate(
      (node) => scrollY + node.getBoundingClientRect().top - 80,
    ),
  );
  // Record the genuinely visible first row; do not wait on still-lazy lower cards.
  await lineup
    .locator(".home-model-invitation img")
    .first()
    .evaluate((node: HTMLImageElement) => node.decode());
  await expect(lineup.getByText("View in 3D", { exact: true })).toHaveCount(1);
  await expect(lineup.getByText("View photos", { exact: true })).toHaveCount(5);
  await expect(lineup.locator(".home-invitation-cursor")).toHaveCount(0);
  await capture(page, info, "03-quiet-model-cards");
  await page.waitForTimeout(600);
  await info.attach("capture-scope", {
    body: JSON.stringify(
      {
        markers,
        viewport: page.viewportSize(),
        scope:
          "Actual native browser wheel input, actual local images and application controls. Explicit Continue without 3D route; rear rendering separately recorded. Silent unretimed Playwright capture. External provider playback not certified.",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});

test("real satin rear lights and white studio reverse without recreating the canvas", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const rear = page.locator(".home-signature-runway");
  await expect(rear).toHaveAttribute("data-scene-state", "ready", {
    timeout: 120000,
  });
  await expect(page.locator(".home-loading-gate")).toHaveAttribute(
    "data-state",
    "resolved",
    { timeout: 30000 },
  );
  const canvas = rear.locator("canvas");
  const original = await canvas.elementHandle();
  for (const [name, p] of [
    ["lamps", 0.03],
    ["reveal", 0.46],
    ["satin", 1],
    ["reverse", 0.46],
    ["lamps-return", 0.03],
  ] as const) {
    const target = await rear.evaluate((node, p) => {
      const stage = node.querySelector<HTMLElement>(".home-signature-sticky")!;
      return (
        scrollY +
        node.getBoundingClientRect().top +
        (node.getBoundingClientRect().height - stage.offsetHeight) * p
      );
    }, p);
    await wheelTo(page, target);
    await expect(rear).toHaveAttribute("data-render-active", "true");
    const sequential =
      (await page
        .locator(".cinematic-home")
        .getAttribute("data-sequential-motion")) === "true";
    await expect
      .poll(async () =>
        Math.abs(
          Number(await canvas.getAttribute("data-rear-progress")) -
            (sequential ? 1 : p),
        ),
      )
      .toBeLessThan(0.03);
    await capture(page, info, `04-rear-${name}`);
    await page.waitForTimeout(500);
  }
  expect(
    await original!.evaluate(
      (node) =>
        node === document.querySelector(".home-signature-canvas canvas"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await info.attach("render-scope", {
    body: "Actual unchanged licensed Ciasny exterior, Chromium SwiftShader. Silent native-size browser recording; no physical-device GPU or speaker-output certification.",
    contentType: "text/plain",
  });
});
