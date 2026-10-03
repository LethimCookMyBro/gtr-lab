import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const model = "**/models/ciasny-r35.glb";
const gate = (page: Page) => page.locator(".home-loading-gate");
const rear = (page: Page) => page.locator(".home-signature-runway");
async function ready(page: Page) {
  await expect(rear(page)).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  await expect(gate(page)).toHaveAttribute("data-state", "resolved");
  await expect(gate(page)).not.toBeVisible();
}
async function jumpToRear(page: Page) {
  await rear(page).evaluate((section) => {
    const sticky = section.firstElementChild as HTMLElement;
    window.scrollTo({
      top:
        section.getBoundingClientRect().top +
        scrollY +
        (section.clientHeight - sticky.clientHeight) * 0.75,
      behavior: "instant",
    });
  });
}
test.beforeEach(async ({ page }) => {
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Hosted document ready; playback is not asserted.</body></html>",
    }),
  );
});

test("film-ready model-pending gate releases only into an already prepared reusable rear scene", async ({
  page,
}, info) => {
  let requests = 0;
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(model, async (route) => {
    requests++;
    await hold;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => requests).toBe(1);
  await expect(page.locator(".home-film--hero")).toHaveAttribute(
    "data-film-state",
    "embedded",
  );
  await expect(gate(page)).toBeVisible();
  await expect(gate(page)).toHaveAttribute("data-load-phase", "downloading");
  const bounds = await gate(page).boundingBox();
  expect(bounds?.x).toBe(0);
  expect(bounds?.y).toBe(0);
  expect(bounds?.width).toBe(page.viewportSize()!.width);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  await expect(page.locator(".cinematic-home")).toHaveAttribute("inert", "");
  const y = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, 1400);
  await page.keyboard.press("PageDown");
  expect(await page.evaluate(() => scrollY)).toBe(y);
  await page.keyboard.press("Tab");
  expect(
    await gate(page).evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("initial-film-ready-model-stalled.png"),
  });
  release();
  await ready(page);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(
    "home-title",
  );
  await page.evaluate(() => {
    (window as any).__rearCanvas = document.querySelector(
      ".home-signature-canvas canvas",
    );
  });
  await jumpToRear(page);
  await expect(rear(page)).toHaveAttribute("data-scene-state", "ready");
  await expect(rear(page)).toHaveAttribute("data-render-active", "true");
  await expect(rear(page).locator(".home-signature-status")).toHaveCount(0);
  await expect
    .poll(async () =>
      Number(
        await rear(page).locator("canvas").getAttribute("data-rear-progress"),
      ),
    )
    .toBeGreaterThan(0.65);
  await page.screenshot({
    path: info.outputPath("first-jump-prepared-rear.png"),
  });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(rear(page)).toHaveAttribute("data-render-active", "false");
  expect(
    await page.evaluate(
      () =>
        (window as any).__rearCanvas ===
        document.querySelector(".home-signature-canvas canvas"),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    window.scrollTo({ top: 0, behavior: "instant" });
  });
  await expect(rear(page)).toHaveAttribute("data-render-active", "false");
  await jumpToRear(page);
  await expect(rear(page)).toHaveAttribute("data-render-active", "true");
  expect(
    await page.evaluate(
      () =>
        (window as any).__rearCanvas ===
        document.querySelector(".home-signature-canvas canvas"),
    ),
  ).toBe(true);
  expect(requests).toBe(1);
  await info.attach("scene-lifetime-evidence", {
    body: JSON.stringify({
      requests,
      sameCanvas: true,
      filmReadyDuringBlockedModel: true,
      readyBeforeFirstJump: true,
    }),
    contentType: "application/json",
  });
});

test("completed download and decoded geometry do not bypass pending GPU compilation", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.includes("mobile"),
    "GPU barrier runs once on desktop; mobile readiness is exercised above",
  );
  await page.addInitScript(() => {
    (window as any).__holdRearShaders = true;
    (window as any).__shaderWaits = 0;
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const original = type.prototype.getProgramParameter;
      type.prototype.getProgramParameter = function (
        program: WebGLProgram,
        pname: number,
      ) {
        if (pname === 0x91b1 && (window as any).__holdRearShaders) {
          (window as any).__shaderWaits++;
          return false;
        }
        return original.call(this, program, pname);
      };
    }
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-load-phase", "preparing");
  await expect
    .poll(() => page.evaluate(() => (window as any).__shaderWaits))
    .toBeGreaterThan(0);
  await expect(gate(page)).toBeVisible();
  await expect(gate(page).getByRole("status")).toHaveText(
    "Preparing the 3D render",
  );
  await page.screenshot({
    path: info.outputPath("decoded-but-render-pending.png"),
  });
  await page.evaluate(() => {
    (window as any).__holdRearShaders = false;
  });
  await ready(page);
});

test("a failed model request retries a fresh real scene and Continue without 3D remains a keyboard escape", async ({
  page,
}, info) => {
  let requests = 0;
  await page.route(model, (route) => {
    requests++;
    if (requests === 1)
      return route.fulfill({
        status: 503,
        body: "Model temporarily unavailable",
      });
    if (requests === 3) return; // Hold the next visit so keyboard skip cannot race readiness.
    return route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await expect(gate(page)).toContainText("HTTP 503");
  await page.screenshot({ path: info.outputPath("model-failure-retry.png") });
  await gate(page).getByRole("button", { name: "Retry 3D view" }).click();
  await ready(page);
  expect(requests).toBe(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  // Exercise the explicit keyboard opt-out even when real preparation is in flight.
  const skip = gate(page).getByRole("button", { name: "Continue without 3D" });
  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(gate(page)).not.toBeVisible();
  await expect(rear(page)).toHaveAttribute("data-scene-state", "skipped");
  await expect(rear(page).locator("canvas")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe(
    "home-title",
  );
});

test("reduced motion still prepares 3D while Save-Data waits for an explicit load", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let requests = 0;
  await page.route(model, (route) => {
    requests++;
    return route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  expect(requests).toBe(1);
  await page.addInitScript(() => {
    const connection = new EventTarget();
    Object.defineProperty(connection, "saveData", { value: true });
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: connection,
    });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(gate(page)).not.toBeVisible();
  await expect(rear(page)).toHaveAttribute("data-scene-state", "deferred");
  await expect(rear(page).locator("canvas")).toHaveCount(0);
  expect(requests).toBe(1);
  await rear(page)
    .getByRole("button", { name: "Load 3D view · 8.3 MB" })
    .click();
  await expect(rear(page)).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  expect(requests).toBe(2);
  await page.screenshot({
    path: info.outputPath("save-data-opt-in-ready.png"),
  });
});

test("fetch and scene-chunk stalls expose bounded recovery instead of endless progress", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.includes("mobile"),
    "Timeout recovery runs once on desktop",
  );
  await page.clock.install();
  await page.route(model, () => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-load-phase", "downloading");
  await page.clock.fastForward(45001);
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await expect(gate(page)).toContainText("model took too long");
  await expect(
    gate(page).getByRole("button", { name: "Retry 3D view" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("bounded-model-timeout.png") });
  await page.unroute(model);
  await page.route(/\/assets\/RearVehicleScene-[^/]+\.js(?:\?.*)?$/, () => {});
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-load-phase", "module");
  await page.clock.fastForward(20001);
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await expect(
    gate(page).getByRole("button", { name: "Reload page" }),
  ).toBeVisible();
  await gate(page).getByRole("button", { name: "Continue without 3D" }).click();
  await expect(gate(page)).not.toBeVisible();
});

test("corrupt GLB and lost graphics context each recover with a fresh owned scene", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.includes("mobile"),
    "Corrupt model/context recovery runs once on desktop",
  );
  let requests = 0;
  await page.route(model, (route) =>
    ++requests === 1
      ? route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Not a GLB</title>",
        })
      : route.continue(),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await expect(gate(page)).toContainText("not a valid binary glTF");
  await gate(page).getByRole("button", { name: "Retry 3D view" }).click();
  await ready(page);
  await jumpToRear(page);
  await rear(page)
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      (window as any).__oldRearCanvas = canvas;
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const lose = gl?.getExtension("WEBGL_lose_context");
      if (!lose)
        throw new Error("Test browser did not expose context-loss extension");
      lose.loseContext();
    });
  await expect(rear(page)).toHaveAttribute("data-scene-state", "error");
  await rear(page).getByRole("button", { name: "Retry 3D view" }).click();
  await ready(page);
  expect(
    await page.evaluate(
      () =>
        (window as any).__oldRearCanvas !==
        document.querySelector(".home-signature-canvas canvas"),
    ),
  ).toBe(true);
  expect(requests).toBe(3);
  await page.screenshot({
    path: info.outputPath("context-restored-fresh-scene.png"),
  });
});

test("unsupported WebGL exposes explicit recovery and a usable non-3D route", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.includes("mobile"),
    "Unsupported graphics policy runs once on desktop",
  );
  let requests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/models/ciasny-r35.glb")) requests++;
  });
  await page.addInitScript(() =>
    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: undefined,
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await expect(gate(page)).toContainText("needs WebGL");
  await gate(page).getByRole("button", { name: "Continue without 3D" }).click();
  await expect(gate(page)).not.toBeVisible();
  await expect(rear(page)).toHaveAttribute("data-scene-state", "skipped");
  await expect(
    page.getByRole("link", { name: "Explore the models", exact: true }),
  ).toBeVisible();
  expect(requests).toBe(0);
});
