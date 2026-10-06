import { expect, test } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";

// Geometry and keyboard acceptance only. Held provider navigation keeps the
// decoded campaign photograph stable; this does not certify hosted playback.
const viewports = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1920x900", width: 1920, height: 900 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1920x600-wide-short", width: 1920, height: 600 },
  { name: "1536x720-125pct", width: 1536, height: 720 },
  { name: "1093x614-125pct", width: 1093, height: 614 },
  { name: "390x844-mobile", width: 390, height: 844 },
  { name: "430x932-mobile", width: 430, height: 932 },
  { name: "390x568-mobile-short", width: 390, height: 568 },
];

for (const viewport of viewports) {
  test(`opening message fits without cropping the film: ${viewport.name}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.route("**/models/ciasny-r35.glb", (route) =>
      route.fulfill({ status: 503, body: "Explicit non-3D layout test" }),
    );
    await page.route("https://media.flixel.com/**", () => {});
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await continueHomeWithout3D(page);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await (
        document.querySelector(
          ".home-film--hero .home-film-backup",
        ) as HTMLImageElement
      ).decode();
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    const geometry = await page.evaluate(() => {
      const box = (selector: string) => {
        const node = document.querySelector(selector)!;
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
        };
      };
      const provider = document.querySelector(".home-film--hero iframe")!;
      const css = getComputedStyle(provider);
      return {
        title: box("#home-title"),
        support: box(".home-hero-support"),
        cta: box(".home-hero-support a"),
        header: box(".home-header"),
        film: box(".home-film--hero iframe"),
        poster: box(".home-film--hero .home-film-backup"),
        controls: box(".home-film--hero .home-film-controls"),
        panel: box(".home-hero-sticky"),
        provider: {
          transform: css.transform,
          clip: css.clipPath,
          mask: css.maskImage,
        },
        copyBottom: getComputedStyle(document.querySelector(".home-hero-copy")!)
          .bottom,
        viewport: { width: innerWidth, height: innerHeight },
      };
    });
    await info.attach("opening-geometry", {
      body: JSON.stringify(geometry, null, 2),
      contentType: "application/json",
    });
    await page.screenshot({
      path: info.outputPath(`opening-${viewport.name}.png`),
      scale: "css",
      animations: "disabled",
    });
    expect(geometry.film.left).toBeCloseTo(0, 1);
    expect(geometry.film.width).toBeCloseTo(geometry.viewport.width, 1);
    expect(geometry.film.width / geometry.film.height).toBeCloseTo(16 / 9, 3);
    expect(geometry.poster.width / geometry.poster.height).toBeCloseTo(
      16 / 9,
      3,
    );
    expect(geometry.provider).toEqual({
      transform: "none",
      clip: "none",
      mask: "none",
    });
    expect(geometry.controls.top).toBeGreaterThanOrEqual(geometry.film.bottom);
    if (viewport.width >= 768) {
      for (const box of [geometry.title, geometry.support, geometry.cta]) {
        expect(box.top).toBeGreaterThanOrEqual(geometry.header.bottom);
        expect(box.bottom).toBeLessThanOrEqual(viewport.height - 40);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(viewport.width);
      }
      expect(geometry.title.right + 20).toBeLessThanOrEqual(
        geometry.support.left,
      );
    } else {
      // This correction must not change the established phone composition.
      expect(geometry.copyBottom).toBe("164px");
      expect(geometry.film.top).toBe(88);
    }
    // Native keyboard traversal must reveal the lower controls when a complete
    // full-width player extends beyond the initial viewport.
    await page.locator(".home-film--hero .home-film-toggle").first().focus();
    await page.keyboard.press("Tab");
    const summary = page.locator(".home-film--hero .home-film-tools > summary");
    await expect(summary).toBeFocused();
    await expect(summary).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Space");
    await expect(
      page.locator(".home-film--hero .home-film-tools"),
    ).toHaveAttribute("open", "");
    await page.keyboard.press("Space");
    await expect(
      page.locator(".home-film--hero .home-film-tools"),
    ).not.toHaveAttribute("open");
    for (let step = 0; step < 3; step++) await page.keyboard.press("Tab");
    const cta = page.locator(".home-hero-support a");
    await expect(cta).toBeFocused();
    await expect(cta).toBeInViewport({ ratio: 1 });
  });
}
