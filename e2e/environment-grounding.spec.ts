import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import type { Page, TestInfo } from "@playwright/test";

type ObservedCanvas = HTMLCanvasElement & {
  __qaGraphics?: { draws: number; triangles: number };
};

const variant = "candidate";
const skyPath = "/environments/kloofendal_43d_clear_puresky_1k.hdr";
const surfacePaths = [
  "garage_floor",
  "concrete_wall_008",
  "asphalt_pit_lane",
  "aerial_rocks_02",
].flatMap((id) =>
  ["diff", "rough", "nor_gl"].map((map) => `/environments/${id}_${map}_1k.jpg`),
);
const venues = [
  ["studio", "Pit garage"],
  ["gallery", "Gallery"],
  ["night", "After hours"],
  ["forest", "Test paddock"],
  ["coast", "Coastal road"],
] as const;

async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function ready(page: Page, allowFallbackNotice = false) {
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await expect(
    page.locator(
      allowFallbackNotice
        ? ".scene-loading, .render-error, vite-error-overlay"
        : ".scene-loading, .scene-notice, .render-error, vite-error-overlay",
    ),
  ).toHaveCount(0);
  await expect(page.locator(".scene-stage canvas")).toHaveCount(1);
  await expect
    .poll(() =>
      page.locator(".scene-stage canvas").evaluate((element) => {
        const c = element as HTMLCanvasElement;
        return Math.abs(
          c.width / c.clientWidth - Math.min(devicePixelRatio, 1.75),
        );
      }),
    )
    .toBeLessThan(0.02);
  await frames(page);
}
async function canvasHash(page: Page, allowFallbackNotice = false) {
  // The keyboard focus ring is not part of the rendered scene.
  await page
    .locator(".scene-stage canvas")
    .evaluate((element) => (element as HTMLCanvasElement).blur());
  await ready(page, allowFallbackNotice);
  return createHash("sha256")
    .update(await page.locator(".scene-stage canvas").screenshot())
    .digest("hex");
}
async function graphicsEvidence(page: Page) {
  return page.locator(".scene-stage canvas").evaluate((element) => {
    const canvas = element as ObservedCanvas;
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    return {
      contextAvailable: Boolean(gl),
      contextLost: gl?.isContextLost() ?? true,
      error: gl?.getError() ?? -1,
      draws: canvas.__qaGraphics?.draws ?? 0,
      triangles: canvas.__qaGraphics?.triangles ?? 0,
      drawingBuffer: [canvas.width, canvas.height],
    };
  });
}
async function capture(page: Page, info: TestInfo, name: string) {
  await ready(page);
  const evidence = await graphicsEvidence(page);
  expect(evidence.contextAvailable).toBe(true);
  expect(evidence.contextLost).toBe(false);
  expect(evidence.error).toBe(0);
  expect(evidence.draws).toBeGreaterThan(0);
  expect(evidence.triangles).toBeGreaterThan(0);
  await info.attach(`${name}-graphics`, {
    body: JSON.stringify(evidence, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
    scale: "css",
  });
}
async function camera(page: Page, name: string) {
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await ready(page);
}
async function environment(page: Page, id: string, name: string) {
  // Count real GPU work following each selection, independently of venue topology.
  await page.locator(".scene-stage canvas").evaluate((element) => {
    (element as ObservedCanvas).__qaGraphics = { draws: 0, triangles: 0 };
  });
  await page.getByRole("button", { name: "Environment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name: new RegExp(`^${name}(?:\\s|$)`),
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main.configurator")).toHaveClass(
    new RegExp(`(?:^|\\s)environment-${id}(?:\\s|$)`),
  );
  await ready(page);
  await expect
    .poll(async () => (await graphicsEvidence(page)).triangles, {
      timeout: 90000,
    })
    .toBeGreaterThan(0);
}

test("geometry venues render through every exterior camera angle, zoom and environment switch", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const assets = new Map<string, number>();
  const assetFailures: string[] = [];
  const assetPaths = new Set([...surfacePaths, skyPath]);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (["warning", "warn"].includes(m.type())) warnings.push(m.text());
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (assetPaths.has(path)) {
      assets.set(path, response.status());
      if (!response.ok())
        assetFailures.push(`${path}: HTTP ${response.status()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const path = new URL(request.url()).pathname;
    if (assetPaths.has(path))
      assetFailures.push(`${path}: ${request.failure()?.errorText}`);
  });
  await page.addInitScript(() => {
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      for (const method of ["drawElements", "drawArrays"] as const) {
        const original = prototype[method] as (...args: number[]) => void;
        (prototype as unknown as Record<string, unknown>)[method] = function (
          this: WebGLRenderingContext | WebGL2RenderingContext,
          ...args: number[]
        ) {
          original.apply(this, args);
          const canvas = this.canvas;
          if (!(canvas instanceof HTMLCanvasElement)) return;
          const count = method === "drawElements" ? args[1] : args[2];
          const triangles =
            args[0] === this.TRIANGLES
              ? Math.floor(count / 3)
              : args[0] === this.TRIANGLE_STRIP || args[0] === this.TRIANGLE_FAN
                ? Math.max(0, count - 2)
                : 0;
          // Keep per-draw counters in memory, not DOM attributes: large scenes
          // issue thousands of draws and instrumentation must not cause layout work.
          const observed = canvas as ObservedCanvas;
          const counters = (observed.__qaGraphics ??= {
            draws: 0,
            triangles: 0,
          });
          counters.draws++;
          counters.triangles += triangles;
        };
      }
    }
  });
  await page.goto("/configurator/premium");
  await expect(page).toHaveTitle(/GT-R LAB/);
  await expect(
    page.getByRole("heading", { name: "GT-R R35", exact: true }),
  ).toBeVisible();
  await ready(page);
  // Readiness comes from rendered scene frames; successful local texture fetches
  // and GPU triangle calls add evidence beyond a selected UI label. The venue
  // geometry/material structure is covered separately by the scene unit tests.
  await expect
    .poll(() => surfacePaths.every((path) => assets.get(path) === 200), {
      timeout: 90000,
    })
    .toBe(true);
  const canvas = page.locator(".scene-stage canvas");
  const canonical = new Map<string, string>();
  for (const [id, label] of venues) {
    if (id !== "studio") await environment(page, id, label);
    await camera(page, "Front ¾");
    if (id === "forest" || id === "coast")
      await expect
        .poll(() => assets.get(skyPath), { timeout: 90000 })
        .toBe(200);
    await capture(page, info, `${id}-hero`);
    canonical.set(id, await canvasHash(page));
    await canvas.focus();
    for (let quarter = 1; quarter <= 4; quarter++) {
      for (let step = 0; step < 10; step++)
        await canvas.press("Shift+ArrowRight");
      await capture(page, info, `${id}-azimuth-${quarter}`);
    }
    for (let step = 0; step < 25; step++) await canvas.press("+");
    await capture(page, info, `${id}-minimum-zoom`);
    await canvas.press("Home");
    await capture(page, info, `${id}-manual-reset`);
    expect(
      await canvasHash(page),
      `${id} Home restores canonical framing`,
    ).toBe(canonical.get(id));
    for (const [name, suffix] of [
      ["Front", "front"],
      ["Rear ¾", "rear-three-quarter"],
      ["Rear", "rear"],
      ["Side", "side"],
      ["Top detail", "top"],
      ["Wheel detail", "wheel"],
    ]) {
      await camera(page, name);
      await capture(page, info, `${id}-${suffix}`);
    }
    await camera(page, "Front ¾");
    await canvas.focus();
    for (let i = 0; i < 25; i++) await canvas.press("-");
    await capture(page, info, `${id}-maximum-zoom`);
    await canvas.press("Home");
    for (let i = 0; i < 15; i++) await canvas.press("ArrowDown");
    await capture(page, info, `${id}-low-orbit`);
  }
  expect(
    new Set(canonical.values()).size,
    "All five venues produce distinct rendered scenes",
  ).toBe(venues.length);
  // Revisit every venue after other venue materials, lighting and geometry have mounted.
  for (const [id, label] of venues) {
    await environment(page, id, label);
    await camera(page, "Front ¾");
    await capture(page, info, `${id}-return`);
    expect(
      await canvasHash(page),
      `Returning to ${label} restores framing and lighting`,
    ).toBe(canonical.get(id));
  }
  await info.attach("browser-diagnostics", {
    body: JSON.stringify(
      {
        variant,
        assets: Object.fromEntries(assets),
        assetFailures,
        errors,
        warnings,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(assetFailures).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    warnings.filter((m) =>
      /shader error|INVALID_|GL_OUT_OF_MEMORY|VALIDATE_STATUS/i.test(m),
    ),
  ).toEqual([]);
});

test("a missing studio surface keeps the vehicle interactive and retries the same venue", async ({
  page,
}, info) => {
  const failedPath = "/environments/garage_floor_diff_1k.jpg";
  let blockSurface = true;
  let recovering = false;
  let blockedRequests = 0;
  const simulatedFailureDiagnostics: {
    type: string;
    text: string;
    url?: string;
  }[] = [];
  const unexpectedErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    const url = message.location().url;
    // The deliberately aborted texture and its React boundary report are expected.
    // Do not suppress arbitrary failures, even while exercising the fallback.
    if (
      !recovering &&
      (url?.endsWith(failedPath) ||
        text.includes(failedPath) ||
        /above error occurred in the <StudioLighting>|React will try to recreate this component tree/.test(
          text,
        ))
    ) {
      simulatedFailureDiagnostics.push({ type: "console", text, url });
    } else unexpectedErrors.push(text);
  });
  page.on("pageerror", (error) => {
    if (!recovering && error.message.includes(failedPath))
      simulatedFailureDiagnostics.push({
        type: "pageerror",
        text: error.message,
      });
    else unexpectedErrors.push(error.message);
  });
  await page.route(`**${failedPath}`, async (route) => {
    if (blockSurface) {
      blockedRequests++;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.goto("/configurator/premium");
  await expect(page.locator(".scene-notice")).toContainText(
    "Switched to a basic studio",
    {
      timeout: 90000,
    },
  );
  await expect(page.locator(".scene-notice")).toContainText(
    "Select the environment again to retry",
  );
  await ready(page, true);
  expect(blockedRequests).toBeGreaterThan(0);
  const canvas = page.locator(".scene-stage canvas");
  await canvas.evaluate((element) => {
    (element as HTMLCanvasElement).dataset.recoveryIdentity = "original-canvas";
  });
  const fallbackHash = await canvasHash(page, true);
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await expect.poll(() => canvasHash(page, true)).not.toBe(fallbackHash);
  await canvas.press("Home");
  await page.screenshot({
    path: info.outputPath("studio-surface-fallback.png"),
    animations: "disabled",
    scale: "css",
  });

  blockSurface = false;
  recovering = true;
  const retriedSurface = page.waitForResponse(
    (response) => new URL(response.url()).pathname === failedPath,
  );
  await page.getByRole("button", { name: "Environment", exact: true }).click();
  const pitGarage = page
    .getByRole("dialog")
    .getByRole("button", { name: /^Pit garage(?:\s|$)/ });
  await expect(pitGarage).toHaveClass(/(?:^|\s)selected(?:\s|$)/);
  await pitGarage.click();
  const response = await retriedSurface;
  expect(response.ok()).toBe(true);
  await response.finished();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await ready(page);
  await expect(canvas).toHaveAttribute(
    "data-recovery-identity",
    "original-canvas",
  );
  const health = await graphicsEvidence(page);
  expect(health.contextAvailable).toBe(true);
  expect(health.contextLost).toBe(false);
  expect(health.error).toBe(0);
  expect(
    await canvasHash(page),
    "Verified texture retry restores the full venue rather than the fallback plane",
  ).not.toBe(fallbackHash);
  await page.screenshot({
    path: info.outputPath("studio-surface-recovered.png"),
    animations: "disabled",
    scale: "css",
  });
  await info.attach("surface-recovery-diagnostics", {
    body: JSON.stringify(
      {
        blockedRequests,
        retriedStatus: response.status(),
        simulatedFailureDiagnostics,
        unexpectedErrors,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(unexpectedErrors).toEqual([]);
});
