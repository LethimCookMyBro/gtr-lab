import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";

const names = [
  "1969: PGC10 Skyline GT-R",
  "1989: R32 GT-R",
  "1999: R34 GT-R",
  "2007: R35 GT-R",
];
async function settle(page: Page) {
  await page.evaluate(async () => {
    let previous = scrollY,
      stable = 0;
    for (let i = 0; i < 240; i++) {
      await new Promise(requestAnimationFrame);
      stable = Math.abs(scrollY - previous) < 0.5 ? stable + 1 : 0;
      previous = scrollY;
      if (stable >= 8) return;
    }
    throw new Error("Native scroll did not settle");
  });
}
async function visit(page: Page, index: number) {
  await page.getByRole("button", { name: names[index], exact: true }).click();
  await settle(page);
  const chapter = page.locator(`[data-era-image="${index}"]`);
  await expect(chapter).toBeFocused();
  await chapter
    .locator(".home-timeline-image img")
    .evaluate((node: HTMLImageElement) => node.decode());
  return chapter;
}
async function geometry(chapter: Locator) {
  return chapter.evaluate((node) => {
    const panel = node.querySelector(".home-timeline-panel")!;
    const image = node.querySelector(".home-timeline-image")!;
    const copy = node.querySelector(".home-timeline-caption")!;
    const year = node.querySelector(".home-archive-year")!;
    const p = panel.getBoundingClientRect(),
      i = image.getBoundingClientRect(),
      c = copy.getBoundingClientRect(),
      y = year.getBoundingClientRect();
    return {
      side: panel.getAttribute("data-side"),
      panelCenter: p.left + p.width / 2,
      imageBottom: i.bottom,
      copyTop: c.top,
      yearCenter: y.left + y.width / 2,
      yearSize: parseFloat(getComputedStyle(year).fontSize),
      imageWidth: i.width,
      viewportWidth: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 1440, height: 600 },
]) {
  test(`sparse timeline keeps imagery, small axis years and accessible evidence at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await continueHomeWithout3D(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".home-archive-navigation")).toHaveCSS(
      "position",
      "static",
    );
    for (const index of [0, 1, 2, 3]) {
      const chapter = await visit(page, index);
      const shape = await geometry(chapter);
      expect(shape.overflow).toBe(false);
      expect(Math.abs(shape.yearCenter - viewport.width / 2)).toBeLessThan(2);
      expect(shape.yearSize).toBeLessThanOrEqual(16);
      expect(shape.copyTop).toBeGreaterThan(shape.imageBottom - 3);
      expect(shape.side).toBe(index % 2 ? "right" : "left");
      if (viewport.width > 700)
        expect(
          index % 2
            ? shape.panelCenter > viewport.width / 2
            : shape.panelCenter < viewport.width / 2,
        ).toBe(true);
      expect(shape.imageWidth).toBeGreaterThan(
        viewport.width < 701
          ? viewport.width * 0.75
          : Math.min(1440, viewport.width * 0.9) * 0.57,
      );
      await expect(chapter.locator(".home-timeline-image img")).toHaveCount(1);
      await expect(chapter.locator("details")).not.toHaveAttribute("open", "");
      await expect(chapter.getByRole("heading")).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`sparse-${index}-${viewport.width}.png`),
        scale: "css",
      });
    }
    const chapter = await visit(page, 1);
    const summary = chapter.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(chapter.locator("details")).toHaveAttribute("open", "");
    for (const photo of await chapter.locator("details figure").all()) {
      await photo.scrollIntoViewIfNeeded();
      await photo
        .locator("img")
        .evaluate((node: HTMLImageElement) => node.decode());
      await expect(photo.locator("img")).toHaveCSS("object-fit", "contain");
      await expect(photo.locator("figcaption")).toBeVisible();
      await expect(photo.locator("a")).toHaveAttribute("href", /^\/credits#/);
    }
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(chapter.locator("details")).not.toHaveAttribute("open", "");
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const image of await page.locator(".home-timeline-image").all()) {
      await expect(image).toHaveCSS("opacity", "1");
      await expect(image).toHaveCSS("filter", "none");
      await expect(image).toHaveCSS("transform", "none");
    }
  });
}

test("native forward and reverse scrolling restores the same timeline focus", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeWithout3D(page);
  const chapter = await visit(page, 1);
  const position = await page.evaluate(() => scrollY);
  const state = () =>
    chapter.evaluate((node) =>
      ["--timeline-opacity", "--timeline-blur", "--timeline-scale"].map(
        (name) => (node as HTMLElement).style.getPropertyValue(name),
      ),
    );
  const original = await state();
  await page.mouse.move(12, 400);
  await page.mouse.wheel(0, 600);
  await settle(page);
  expect(await state()).not.toEqual(original);
  await page.mouse.wheel(0, position - (await page.evaluate(() => scrollY)));
  await settle(page);
  expect(await state()).toEqual(original);
  await expect(page.locator("#home-heritage")).toHaveAttribute(
    "data-active-era",
    "1",
  );
  await page.screenshot({
    path: info.outputPath("sparse-native-reverse.png"),
    scale: "css",
  });
});
