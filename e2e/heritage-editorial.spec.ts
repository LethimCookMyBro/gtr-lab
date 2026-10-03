import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
const names = [
  "1969: Skyline GT-R",
  "1989: R32 GT-R",
  "1999: R34 GT-R",
  "2007: R35 GT-R",
];
async function open(page: Page) {
  await page.route("https://media.flixel.com/**", (route) => route.abort());
  await page.goto("/");
  await page.locator("#home-heritage").scrollIntoViewIfNeeded();
}
async function select(page: Page, index: number) {
  const button = page.getByRole("button", { name: names[index], exact: true });
  await button.focus();
  await button.press("Enter");
  const chapter = page.locator(`[data-era-image="${index}"]`);
  await expect
    .poll(() =>
      chapter.evaluate((node) => {
        const rail = document.querySelector<HTMLElement>(
          ".home-archive-stage",
        )!;
        return Math.abs(
          node.getBoundingClientRect().top -
            parseFloat(
              getComputedStyle(document.documentElement).scrollPaddingTop,
            ) -
            rail.offsetHeight -
            16,
        );
      }),
    )
    .toBeLessThan(3);
  await expect(chapter).toBeFocused();
  await expect(button).toHaveAttribute("aria-current", "step");
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await chapter.locator("img").evaluateAll(async (nodes) => {
    for (const node of nodes as HTMLImageElement[]) {
      node.loading = "eager";
      await node.decode();
    }
  });
  return chapter;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
  });
}

test("four compact editorial spreads have a dominant photo, supporting evidence and attached captions", async ({
  page,
}, info) => {
  await open(page);
  for (const index of [0, 1, 2, 3, 0]) {
    const chapter = await select(page, index);
    await expect(chapter.locator("figure")).toHaveCount(3);
    await expect(chapter.locator(".home-archive-achievement")).toBeVisible();
    const geometry = await chapter.evaluate((node) => {
      const primary = node
        .querySelector(".home-archive-image")!
        .getBoundingClientRect();
      const supports = [
        ...node.querySelectorAll(".home-archive-support-image"),
      ].map((n) => n.getBoundingClientRect());
      const photos = [...node.querySelectorAll("figure")].map((n) => {
        const image = n.querySelector("img")!,
          imageRect = image.getBoundingClientRect(),
          caption = n.querySelector("figcaption")!.getBoundingClientRect();
        return {
          loaded: image.complete && image.naturalWidth > 0,
          ratio: Math.abs(
            imageRect.width / imageRect.height -
              image.naturalWidth / image.naturalHeight,
          ),
          gap: caption.top - imageRect.bottom,
        };
      });
      return {
        height: node.getBoundingClientRect().height,
        primary: { x: primary.x, width: primary.width },
        supports: supports.map((n) => ({ x: n.x, width: n.width })),
        photos,
      };
    });
    expect(geometry.height).toBeLessThan(1200);
    expect(geometry.primary.width).toBeGreaterThan(
      geometry.supports[0].width * 1.7,
    );
    for (const support of geometry.supports)
      expect(support.x).toBeGreaterThan(
        geometry.primary.x + geometry.primary.width,
      );
    for (const photo of geometry.photos) {
      expect(photo.loaded).toBe(true);
      expect(photo.ratio).toBeLessThan(0.02);
      expect(photo.gap).toBeGreaterThanOrEqual(8);
      expect(photo.gap).toBeLessThanOrEqual(16);
    }
    await capture(page, info, `desktop-spread-${index}`);
    await chapter.screenshot({
      path: info.outputPath(`desktop-entire-chapter-${index}.png`),
      animations: "disabled",
    });
  }
  await expect(page.locator(".home-archive-narrative")).toHaveCount(0);
  await expect(page.locator(".home-archive-year")).toHaveCount(0);
});

for (const viewport of [
  { width: 375, height: 600 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`natural mobile reading at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await open(page);
    for (const index of [0, 1, 2, 3]) {
      const chapter = await select(page, index);
      const geometry = await chapter.evaluate((node) => {
        const copy = node
          .querySelector(".home-archive-heading-row")!
          .getBoundingClientRect();
        const description = node
          .querySelector(".home-archive-description")!
          .getBoundingClientRect();
        const figures = [...node.querySelectorAll("figure")].map((n) =>
          n.getBoundingClientRect(),
        );
        return {
          copyBottom: copy.bottom,
          descriptionBottom: description.bottom,
          figures: figures.map((n) => ({
            top: n.top,
            bottom: n.bottom,
            width: n.width,
          })),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.overflow).toBe(false);
      expect(geometry.copyBottom).toBeLessThan(geometry.figures[0].top);
      expect(geometry.descriptionBottom).toBeLessThan(geometry.figures[1].top);
      expect(geometry.figures[1].bottom).toBeLessThan(geometry.figures[2].top);
      expect(geometry.figures[2].top - geometry.figures[1].bottom).toBeLessThan(
        40,
      );
      for (const figure of geometry.figures)
        expect(figure.width).toBeGreaterThan(viewport.width * 0.85);
      await capture(
        page,
        info,
        `mobile-${viewport.width}x${viewport.height}-heading-${index}`,
      );
      await chapter.screenshot({
        path: info.outputPath(
          `mobile-${viewport.width}x${viewport.height}-entire-${index}.png`,
        ),
        animations: "disabled",
      });
    }
  });
}

for (const mode of ["reduced", "short"] as const) {
  test(`${mode} layout keeps natural chapters and keyboard rail`, async ({
    page,
  }, info) => {
    if (mode === "reduced")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.setViewportSize({ width: 1440, height: 600 });
    await open(page);
    for (const index of [3, 0, 2]) {
      const chapter = await select(page, index);
      await expect(chapter.locator(".home-archive-spread")).toHaveCSS(
        "transform",
        "none",
      );
    }
    await capture(page, info, `${mode}-archive`);
  });
}

test("native forward and reverse wheel scrolling tracks the chapter at the reading line", async ({
  page,
}, info) => {
  await open(page);
  await select(page, 0);
  const frames = [];
  for (const index of [1, 2, 3, 2, 1, 0]) {
    const target = await page
      .locator(`[data-era-image="${index}"]`)
      .evaluate((node) => scrollY + node.getBoundingClientRect().top - 190);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, target - before);
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      String(index),
    );
    await expect(
      page.getByRole("button", { name: names[index], exact: true }),
    ).toHaveAttribute("aria-current", "step");
    frames.push({ index, scrollY: await page.evaluate(() => scrollY) });
  }
  await info.attach("native-forward-reverse", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  });
});
