import { createHash } from "node:crypto";
import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
import { paints } from "../src/data/configuration";

type Diagnostic = {
  kind: string;
  message: string;
  url?: string;
  expected?: boolean;
};
const diagnostics = new WeakMap<Page, Diagnostic[]>();
const sharedHdrPath = "/environments/kloofendal_48d_partly_cloudy_puresky_2k.hdr";

test.setTimeout(120000);
test.beforeEach(async ({ page }) => {
  const messages: Diagnostic[] = [];
  diagnostics.set(page, messages);
  page.on("pageerror", (error) =>
    messages.push({ kind: "pageerror", message: error.message }),
  );
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      messages.push({
        kind: message.type(),
        message: message.text(),
        url: message.location().url,
      });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
});
test.afterEach(async ({ page }, info) => {
  const messages = diagnostics.get(page) ?? [];
  const deliberateFailure =
    info.title ===
    "actual model load failure is recoverable under the production CSP";
  for (const entry of messages)
    entry.expected =
      deliberateFailure &&
      entry.kind === "error" &&
      /503/.test(entry.message) &&
      /\/models\/ciasny-r35\.glb(?:\?|$)/.test(entry.url ?? "");
  await info.attach("browser-diagnostics", {
    body: JSON.stringify(messages, null, 2),
    contentType: "application/json",
  });
  const unexpected = messages.filter(
    (entry) =>
      !entry.expected &&
      (entry.kind === "pageerror" ||
        entry.kind === "error" ||
        /shader error|VALIDATE_STATUS|INVALID_(?:ENUM|VALUE|OPERATION)|GL_OUT_OF_MEMORY/i.test(
          entry.message,
        )),
  );
  expect(
    unexpected,
    "Unexpected JavaScript, WebGL or shader errors; inspect browser-diagnostics",
  ).toEqual([]);
});

async function renderedFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function touchExplore(page: Page, mode: "drag" | "pinch") {
  const canvas = page.locator(".scene-stage canvas");
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const client = await page.context().newCDPSession(page);
  const point = (id: number, px: number, py: number) => ({
    id,
    x: px,
    y: py,
    radiusX: 4,
    radiusY: 4,
    force: 1,
  });
  const touches = (fraction: number) =>
    mode === "drag"
      ? [point(1, x + 65 * fraction, y - 20 * fraction)]
      : [
          point(1, x - 30 - 40 * fraction, y),
          point(2, x + 30 + 40 * fraction, y),
        ];
  try {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: touches(0),
    });
    for (let step = 1; step <= 6; step++) {
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: touches(step / 6),
      });
      await renderedFrames(page);
    }
  } finally {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await client.detach();
  }
}
async function stableResolution(page: Page) {
  await expect
    .poll(
      () =>
        page.locator(".scene-stage canvas").evaluate((element) => {
          const canvas = element as HTMLCanvasElement;
          return Math.abs(
            canvas.width / canvas.clientWidth -
              Math.min(devicePixelRatio, 1.75),
          );
        }),
      { timeout: 10000 },
    )
    .toBeLessThan(0.02);
  await renderedFrames(page);
}

async function ready(page: Page) {
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await expect(page.locator(".scene-stage canvas")).toHaveCount(1);
  await expect(page.locator(".scene-loading")).toHaveCount(0);
  await expect(page.locator(".render-error")).toHaveCount(0);
  await renderedFrames(page);
}
async function openVehicle(page: Page) {
  await page.goto("/configurator/premium");
  await ready(page);
  await expect(
    page.getByText("Original R35 study · View limitations", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText(/SYNTHETIC GEOMETRY/)).toHaveCount(0);
}
async function capture(page: Page, info: TestInfo, name: string) {
  await renderedFrames(page);
  const path = info.outputPath(name + ".png");
  await page.screenshot({ path, animations: "disabled", scale: "css" });
  await info.attach(name, { path, contentType: "image/png" });
}
async function chooseCamera(page: Page, name: string) {
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await renderedFrames(page);
}
async function chooseEnvironment(page: Page, name: string, className: string) {
  await page.getByRole("button", { name: "Environment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await expect(page.locator("main.configurator")).toHaveClass(
    new RegExp("environment-" + className),
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await renderedFrames(page);
}

test("licensed production asset loads and all nine paints change rendered pixels, including mobile rail end", async ({
  page,
}, info) => {
  const assetResponse = page.waitForResponse(
    (response) =>
      /\/models\/ciasny-r35\.glb(?:\?|$)/.test(response.url()) && response.ok(),
  );
  await openVehicle(page);
  const response = await assetResponse;
  const bytes = await response.body();
  expect(bytes.subarray(0, 4).toString()).toBe("glTF");
  expect(response.url()).toContain("/models/ciasny-r35.glb");
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "fa889f70cd9c35d6831d7c81b9e647382dc1c59cd71a77bca2030c87a8dc308d",
  );
  await info.attach("licensed-asset-response", {
    body: JSON.stringify(
      { url: response.url(), bytes: bytes.byteLength },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await capture(page, info, "vehicle-hero-silver");
  const canvas = page.locator(".scene-stage canvas");
  if (info.project.name === "mobile-390") {
    const bounds = (await canvas.boundingBox())!;
    const header = page.locator(".config-information-header");
    const headerBounds = (await header.boundingBox())!;
    expect(headerBounds.y).toBe(0);
    expect(headerBounds.height).toBe(210);
    expect(bounds.y).toBe(210);
    expect(headerBounds.y + headerBounds.height).toBe(bounds.y);
    expect(bounds.y + bounds.height).toBe(602);
    for (const selector of [".config-header", ".config-title"])
      await expect(header.locator(selector)).toHaveCSS("position", "static");
    for (const selector of [
      ".config-header",
      ".config-title",
      ".study-disclosure",
    ]) {
      const content = (await header.locator(selector).boundingBox())!;
      expect(
        content.x,
        selector + " stays inside the header",
      ).toBeGreaterThanOrEqual(headerBounds.x);
      expect(
        content.y,
        selector + " stays inside the header",
      ).toBeGreaterThanOrEqual(headerBounds.y);
      expect(
        content.x + content.width,
        selector + " stays inside the header",
      ).toBeLessThanOrEqual(headerBounds.x + headerBounds.width);
      expect(
        content.y + content.height,
        selector + " stays above the canvas",
      ).toBeLessThanOrEqual(bounds.y);
    }
  }
  const hintContrast = await page
    .locator(".interaction-hint")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      const rgba = (value: string) => value.match(/[\d.]+/g)!.map(Number);
      const foreground = rgba(style.color);
      const background = rgba(style.backgroundColor);
      const alpha = background[3] ?? 1;
      // White is the worst-case scene backdrop for light text on a dark backing.
      const composite = background
        .slice(0, 3)
        .map((channel) => channel * alpha + 255 * (1 - alpha));
      const luminance = (channels: number[]) =>
        channels.slice(0, 3).reduce((total, channel, index) => {
          const value = channel / 255;
          return (
            total +
            (value <= 0.04045
              ? value / 12.92
              : ((value + 0.055) / 1.055) ** 2.4) *
              [0.2126, 0.7152, 0.0722][index]
          );
        }, 0);
      return (luminance(foreground) + 0.05) / (luminance(composite) + 0.05);
    });
  expect(hintContrast).toBeGreaterThanOrEqual(4.5);
  const rail = page.getByRole("group", { name: "Exterior paint", exact: true });
  let previous = (await canvas.screenshot()).toString("base64");
  for (const [index, paint] of paints.entries()) {
    if (info.project.name === "mobile-390" && index >= paints.length - 2) {
      await rail.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      await expect
        .poll(() => rail.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    }
    const swatch = rail.getByRole("button", { name: paint.name, exact: true });
    await swatch.scrollIntoViewIfNeeded();
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-pressed", "true");
    await renderedFrames(page);
    if (index > 0)
      await expect
        .poll(async () => (await canvas.screenshot()).toString("base64"))
        .not.toBe(previous);
    previous = (await canvas.screenshot()).toString("base64");
    if (index >= paints.length - 2 || paint.id === "red")
      await capture(page, info, "vehicle-paint-" + paint.id);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("actual exterior cameras render and unsupported cabin remains visibly disabled", async ({
  page,
}, info) => {
  await openVehicle(page);
  for (const [name, file] of [
    ["Front ¾", "hero"],
    ["Front", "front"],
    ["Side", "side"],
    ["Rear ¾", "rear-quarter"],
    ["Rear", "rear"],
    ["Wheel detail", "wheel"],
    ["Top detail", "top"],
  ]) {
    await chooseCamera(page, name);
    await capture(page, info, "vehicle-camera-" + file);
  }
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  const interior = page
    .getByRole("dialog")
    .getByRole("button", { name: /Interior/ });
  await expect(interior).toBeDisabled();
  await expect(interior).toContainText("Detailed cabin required");
  await capture(page, info, "vehicle-cabin-unavailable");
});

test("separate lamps and real environments affect the licensed vehicle", async ({
  page,
}, info) => {
  const hdrRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (/^\/environments\/.*\.hdr$/.test(path)) hdrRequests.push(path);
  });
  await openVehicle(page);
  await chooseCamera(page, "Front");
  const canvas = page.locator(".scene-stage canvas");
  const lights = page.getByRole("button", { name: "Lights", exact: true });
  await expect(lights).toBeEnabled();
  await expect(lights).toHaveAttribute("aria-pressed", "false");
  await capture(page, info, "vehicle-lights-off");
  const offPixels = (await canvas.screenshot()).toString("base64");
  await lights.click();
  await expect(lights).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await canvas.screenshot()).toString("base64"))
    .not.toBe(offPixels);
  await capture(page, info, "vehicle-lights-on");
  await chooseCamera(page, "Front ¾");
  await stableResolution(page);
  const studioPixels = (await canvas.screenshot()).toString("base64");
  const [forest] = await Promise.all([
    page.waitForResponse(
      (response) => new URL(response.url()).pathname === sharedHdrPath,
    ),
    chooseEnvironment(page, "Test paddock", "forest"),
  ]);
  expect(forest.ok()).toBe(true);
  expect(await forest.finished()).toBeNull();
  const hdrBytes = await forest.body();
  expect(hdrBytes.subarray(0, 16).toString()).toMatch(
    /^#\?(?:RADIANCE|RGBE)\s/,
  );
  const settleEnvironment = async () => {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let frames = 24;
          const frame = () =>
            --frames <= 0 ? resolve() : requestAnimationFrame(frame);
          requestAnimationFrame(frame);
        }),
    );
    await ready(page);
    await stableResolution(page);
    await expect(page.locator(".scene-notice")).toHaveCount(0);
  };
  await settleEnvironment();
  const forestPixels = (await canvas.screenshot()).toString("base64");
  expect(forestPixels).not.toBe(studioPixels);
  expect(hdrRequests).toEqual([sharedHdrPath]);
  await capture(page, info, "vehicle-environment-forest");
  // Coast uses the same cached sky. A second response wait would never resolve.
  await chooseEnvironment(page, "Coastal road", "coast");
  await settleEnvironment();
  const coastPixels = (await canvas.screenshot()).toString("base64");
  expect(coastPixels).not.toBe(forestPixels);
  expect(coastPixels).not.toBe(studioPixels);
  expect(
    hdrRequests,
    "Coast must reuse the already loaded sky texture",
  ).toEqual([sharedHdrPath]);
  await capture(page, info, "vehicle-environment-coast");
  await info.attach("shared-environment-hdr", {
    body: JSON.stringify(
      {
        url: forest.url(),
        httpStatus: forest.status(),
        bytes: hdrBytes.byteLength,
        hdrRequests,
        coastUsesCachedSky: true,
        pixelHashes: Object.fromEntries(
          Object.entries({
            studio: studioPixels,
            forest: forestPixels,
            coast: coastPixels,
          }).map(([environment, pixels]) => [
            environment,
            createHash("sha256")
              .update(Buffer.from(pixels, "base64"))
              .digest("hex"),
          ]),
        ),
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  await chooseEnvironment(page, "After hours", "night");
  await capture(page, info, "vehicle-environment-night");
  await chooseEnvironment(page, "Pit garage", "studio");
  await capture(page, info, "vehicle-environment-studio");
});

test("automatic rotation changes real vehicle pixels", async ({
  page,
}, info) => {
  await openVehicle(page);
  await stableResolution(page);
  const canvas = page.locator(".scene-stage canvas");
  // Capture a settled baseline before continuous software rendering starts.
  const before = await canvas.screenshot();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const rotate = page.getByRole("button", { name: "Rotate", exact: true });
  await expect(rotate).toBeEnabled();
  await rotate.click();
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let remaining = 24;
        const advance = () => {
          if (--remaining === 0) resolve();
          else requestAnimationFrame(advance);
        };
        requestAnimationFrame(advance);
      }),
  );
  await rotate.click();
  await expect(rotate).toHaveAttribute("aria-pressed", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stableResolution(page);
  // Both PNGs use the original DPR, with rotation stopped. PNG readback during
  // continuous SwiftShader rendering exceeded the original polling deadline.
  const after = await canvas.screenshot();
  expect(after.toString("base64")).not.toBe(before.toString("base64"));
  await info.attach("vehicle-before-automatic-rotation", {
    body: before,
    contentType: "image/png",
  });
  await info.attach("vehicle-after-automatic-rotation", {
    body: after,
    contentType: "image/png",
  });
});

test("manual keyboard or touch input cancels showcase and preserves exploration", async ({
  page,
}, info) => {
  await openVehicle(page);
  await stableResolution(page);
  const canvas = page.locator(".scene-stage canvas");
  const before = await canvas.screenshot();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const rotate = page.getByRole("button", { name: "Rotate", exact: true });
  await expect(rotate).toBeEnabled();
  await rotate.click();
  await expect(rotate).toHaveAttribute("aria-pressed", "true");
  if (info.project.name === "mobile-390") await touchExplore(page, "drag");
  else {
    await canvas.focus();
    await canvas.press("ArrowLeft");
  }
  await expect(rotate).toHaveAttribute("aria-pressed", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stableResolution(page);
  const after = await canvas.screenshot();
  expect(after.toString("base64")).not.toBe(before.toString("base64"));
  await info.attach("vehicle-after-manual-exploration", {
    body: after,
    contentType: "image/png",
  });
  if (info.project.name === "mobile-390") {
    await touchExplore(page, "pinch");
    await stableResolution(page);
    const pinched = await canvas.screenshot();
    expect(pinched.toString("base64")).not.toBe(after.toString("base64"));
    await info.attach("vehicle-mobile-after-pinch", {
      body: pinched,
      contentType: "image/png",
    });
  }
});

test("variant switching never reuses the licensed mesh under NISMO and restores Premium", async ({
  page,
}, info) => {
  await openVehicle(page);
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: "NISMO Precision under pressure.",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/\/configurator\/nismo$/);
  await expect(page.locator(".scene-stage canvas")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Photo reference · 3D asset pending",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeDisabled();
  await capture(page, info, "nismo-remains-photo-reference");
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Premium The icon, distilled.", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurator\/premium$/);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Rotate", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("actual model load failure is recoverable under the production CSP", async ({
  page,
}, info) => {
  let failed = false;
  await page.route(/\/models\/[^/?]+\.glb(?:\?.*)?$/, async (route) => {
    if (!failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        contentType: "text/plain",
        body: "Deliberate asset-error regression test",
      });
    } else await route.continue();
  });
  await page.goto("/configurator/premium");
  await expect(page.getByRole("alert")).toContainText("HTTP 503");
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeDisabled();
  await capture(page, info, "vehicle-recoverable-load-error");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await ready(page);
  await capture(page, info, "vehicle-after-retry");
});
