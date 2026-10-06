import { expect, test } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";

async function inspectHeader(page: Page, info: TestInfo, label: string) {
  const stage = page.locator(".home-signature-runway");
  const canvas = stage.locator("canvas");
  await stage.evaluate((section) => {
    const sticky = section.firstElementChild as HTMLElement;
    window.scrollTo({
      top:
        scrollY +
        section.getBoundingClientRect().top +
        (section.clientHeight - sticky.clientHeight) * 0.75,
      behavior: "instant",
    });
  });
  await expect(stage).toHaveAttribute("data-render-active", "true");
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-rear-progress")))
    .toBeGreaterThan(0.7);
  const bounds = await stage.evaluate((section) => {
    const box = (selector: string) => {
      const r = section.querySelector(selector)!.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        bottom: r.bottom,
      };
    };
    return {
      sticky: box(".home-signature-sticky"),
      header: box(".home-signature-identity"),
      nissan: box(".gtr-brand-nissan"),
      badge: box(".gtr-brand-badge-frame"),
      image: box(".gtr-brand-badge"),
      canvas: box("canvas"),
      caption: box(".home-signature-caption"),
      footer: box(".home-signature-footer"),
    };
  });
  const height = page.viewportSize()!.height;
  expect(bounds.header.bottom - bounds.sticky.y).toBeLessThanOrEqual(
    height * 0.28,
  );
  expect(bounds.badge.bottom).toBeLessThanOrEqual(bounds.header.bottom + 1);
  expect(bounds.nissan.width / bounds.nissan.height).toBeCloseTo(850 / 727, 2);
  expect(bounds.image.width / bounds.image.height).toBeCloseTo(1, 2);
  expect(bounds.badge.width / bounds.badge.height).toBeCloseTo(640 / 450, 2);
  expect(bounds.nissan.width).toBeLessThan(bounds.badge.width * 0.35);
  expect(bounds.badge.width).toBeLessThanOrEqual(80);
  if (bounds.canvas.width > 700 && height > 600)
    expect(bounds.header.bottom - bounds.sticky.y).toBeLessThanOrEqual(
      height * 0.14,
    );

  // Capture the actual rendered car without HTML overlays. This changes only
  // screenshot presentation and leaves the camera, scene and persistent UI intact.
  const carPixels = await canvas.screenshot({
    scale: "css",
    style:
      ".home-signature-identity, .home-signature-caption, .home-signature-footer, .home-signature-status { visibility: hidden !important; }",
  });
  const vehicle = await page.evaluate(async (png) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const sample = document.createElement("canvas");
    sample.width = image.width;
    sample.height = image.height;
    const context = sample.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, image.width, image.height);
    const left = Math.floor(image.width * 0.15);
    const right = Math.ceil(image.width * 0.85);
    const baseline = [data[0], data[1], data[2]];
    let consecutive = 0;
    let roof: number | null = null;
    // The enlarged rear starts higher in the canvas; scan the actual roof
    // from above its new band instead of assuming the old, smaller car position.
    for (let y = Math.floor(image.height * 0.08); y < image.height * 0.5; y++) {
      let foreground = 0;
      for (let x = left; x < right; x++) {
        const offset = (y * image.width + x) * 4;
        if (
          Math.max(
            ...baseline.map((value, channel) => data[offset + channel] - value),
          ) > 15
        )
          foreground++;
      }
      // A short contiguous run distinguishes a visible roof edge from isolated
      // antialiasing noise; a full-width studio-floor gradient is not a roof.
      consecutive =
        foreground >= 3 && foreground < (right - left) * 0.85
          ? consecutive + 1
          : 0;
      if (consecutive === 3) {
        roof = y - 2;
        break;
      }
    }
    // Compare each lower row with its own far-side floor pixels, not the
    // black sky. This excludes the studio's vertical floor gradient and most
    // soft contact shadow while retaining the dark, hard-edged tires.
    let bottom: number | null = null;
    consecutive = 0;
    for (
      let y = Math.floor(image.height * 0.45);
      y < image.height * 0.85;
      y++
    ) {
      const leftOffset = (y * image.width + Math.floor(image.width * 0.04)) * 4;
      const rightOffset =
        (y * image.width + Math.floor(image.width * 0.96)) * 4;
      const floor = [0, 1, 2].map(
        (channel) =>
          (data[leftOffset + channel] + data[rightOffset + channel]) / 2,
      );
      let foreground = 0;
      for (let x = left; x < right; x++) {
        const offset = (y * image.width + x) * 4;
        if (
          Math.max(
            ...floor.map((value, channel) =>
              Math.abs(data[offset + channel] - value),
            ),
          ) > 18
        )
          foreground++;
      }
      consecutive =
        foreground >= 3 && foreground < (right - left) * 0.85
          ? consecutive + 1
          : 0;
      if (consecutive >= 3) bottom = y;
    }
    return { roof, bottom };
  }, carPixels.toString("base64"));
  expect(
    vehicle.roof,
    "A visible vehicle roof must be found in the actual canvas capture",
  ).not.toBeNull();
  expect(
    bounds.header.bottom - bounds.sticky.y,
    "Identity must finish above the rendered roof",
  ).toBeLessThan(vehicle.roof! + bounds.canvas.y - bounds.sticky.y - 12);
  expect(
    vehicle.bottom,
    "Actual lower vehicle pixels must be detected",
  ).not.toBeNull();
  expect(
    bounds.caption.y,
    "Caption must not paint over the tires or exhaust",
  ).toBeGreaterThanOrEqual(bounds.canvas.y + vehicle.bottom! + 8);
  expect(
    bounds.caption.bottom,
    "Caption must clear both footer links",
  ).toBeLessThanOrEqual(bounds.footer.y - 8);
  if (label === "short-portrait") {
    const aspect = bounds.canvas.width / bounds.canvas.height;
    const progress = Number(await canvas.getAttribute("data-rear-progress"));
    const distance = Math.max(
      5.3,
      2.12 / (2 * Math.tan(Math.PI / 12) * aspect * 0.86),
    );
    const camera = new PerspectiveCamera(30, aspect, 0.05, 70);
    camera.position.set(0, 0.96, -2.35 - distance * (0.9 + 0.1 * progress));
    camera.lookAt(0, 0.66, -1.6);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const bottom =
      ((1 - new Vector3(0, 0, -2.35).project(camera).y) *
        bounds.canvas.height) /
      2;
    expect(bounds.caption.y).toBeGreaterThanOrEqual(
      bounds.canvas.y + bottom + 12,
    );
  }
  await info.attach(`${label}-vehicle-pixels`, {
    body: carPixels,
    contentType: "image/png",
  });
  await expect(stage.locator(".home-signature-caption p")).toHaveText(
    "Four lights. One unmistakable signature.",
  );
  await expect(stage.locator(".home-signature-caption > span")).toHaveText(
    "From racing instinct to a presence all its own.",
  );
  await page.screenshot({
    path: info.outputPath(`${label}-composed.png`),
    scale: "css",
  });
  await info.attach(`${label}-header-and-roof`, {
    body: JSON.stringify({
      bounds,
      vehicleRoofY: vehicle.roof,
      vehicleBottomY: vehicle.bottom,
      viewport: page.viewportSize(),
    }),
    contentType: "application/json",
  });
  const family = stage.getByRole("link", { name: "Meet the family" });
  await expect(family).toHaveAttribute("href", "#home-lineup");
  await family.focus();
  await expect(family).toBeFocused();
}

test("compact rear identity clears the enlarged real vehicle and preserves authentic loader proportions", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/models/ciasny-r35.glb"))
      requests.push(request.url());
  });
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Document readiness only.</body></html>",
    }),
  );
  let releaseModel!: () => void;
  const holdModel = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  await page.route("**/models/ciasny-r35.glb", async (route) => {
    await holdModel;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Measure the real visible loader before releasing the same one model request.
  // The opening has its own circular treatment; rear sizing remains independent.
  await expect(page.locator(".home-loading-gate")).toBeVisible();
  const loader = await page
    .locator(".home-loading-gate .gtr-brand-badge-frame")
    .boundingBox();
  const openingRing = await page
    .locator(".home-loading-gate .home-opening-emblem")
    .boundingBox();
  expect(openingRing).not.toBeNull();
  expect(loader!.width / openingRing!.width).toBeCloseTo(0.62, 2);
  expect(openingRing!.width).toBeCloseTo(openingRing!.height, 1);
  releaseModel();
  await expect(page.locator(".home-loading-gate")).toHaveAttribute(
    "data-state",
    "resolved",
    { timeout: 90000 },
  );
  await expect(page.locator(".home-signature-runway")).toHaveAttribute(
    "data-scene-state",
    "ready",
  );
  await inspectHeader(page, info, "native");
  if (page.viewportSize()!.width < 701) {
    // One additional bounded height case, reusing the already prepared scene.
    await page.setViewportSize({ width: 390, height: 600 });
    await inspectHeader(page, info, "short-portrait");
  }
  expect(requests).toHaveLength(1);
});
