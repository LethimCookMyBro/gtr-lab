import { test, expect } from "@playwright/test";

test("rear stills use a bounded native-density buffer after scroll settles", async ({
  page,
}, info) => {
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<body>Application geometry check only; external playback not tested.</body>",
    }),
  );
  await page.goto("/");
  await expect(page.locator(".home-loading-gate")).toHaveAttribute(
    "data-state",
    "resolved",
    { timeout: 90000 },
  );
  const stage = page.locator(".home-signature-runway");
  const canvas = stage.locator("canvas");
  const samples = [];
  for (const progress of [0.08, 0.92]) {
    await stage.evaluate((section, p) => {
      const sticky = section.firstElementChild as HTMLElement;
      scrollTo({
        top:
          scrollY +
          section.getBoundingClientRect().top +
          (section.clientHeight - sticky.clientHeight) * p,
        behavior: "instant",
      });
    }, progress);
    await expect(stage).toHaveAttribute("data-render-active", "true");
    await expect
      .poll(async () =>
        Math.abs(
          Number(await canvas.getAttribute("data-rear-progress")) - progress,
        ),
      )
      .toBeLessThan(0.015);
    await expect(canvas).toHaveAttribute("data-rear-quality", "rest");
    await expect
      .poll(async () =>
        canvas.evaluate((element) => {
          const c = element as HTMLCanvasElement;
          const dpr = Math.min(
            devicePixelRatio,
            2,
            Math.sqrt(2_500_000 / (c.clientWidth * c.clientHeight)),
          );
          return Math.max(
            Math.abs(c.width - c.clientWidth * dpr),
            Math.abs(c.height - c.clientHeight * dpr),
          );
        }),
      )
      .toBeLessThan(1.1);
    const buffer = await canvas.evaluate((element) => {
      const c = element as HTMLCanvasElement;
      return {
        nativeDpr: devicePixelRatio,
        cssWidth: c.clientWidth,
        cssHeight: c.clientHeight,
        width: c.width,
        height: c.height,
        quality: c.dataset.rearQuality,
        dpr: c.dataset.rearDpr,
      };
    });
    expect(buffer.width * buffer.height).toBeLessThanOrEqual(2_500_000);
    if (buffer.cssWidth === 390 && buffer.nativeDpr >= 2)
      expect(buffer.width).toBe(780);
    samples.push({ progress, ...buffer });
    await canvas.screenshot({
      path: info.outputPath(`rear-buffer-${progress}.png`),
      scale: "device",
    });
    await page.screenshot({
      path: info.outputPath(`rear-composed-${progress}.png`),
      scale: "css",
    });
  }
  await info.attach("physical-buffer-evidence", {
    body: JSON.stringify(
      {
        samples,
        scope:
          "Actual WebGL buffer and images in Chromium/SwiftShader at emulated device DPR. Not a physical Android performance benchmark or improved source geometry.",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
