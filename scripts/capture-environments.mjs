#!/usr/bin/env node
/**
 * Real, production-server environment QA. Camera input goes through the shipped
 * buttons and keyboard controls; there are no application/test camera hooks.
 *
 * ENVIRONMENT_QA_VIEWPORT=desktop-1440 node scripts/capture-environments.mjs
 * ENVIRONMENT_QA_ENVIRONMENT=studio ENVIRONMENT_QA_VIEWPORT=desktop-1920 node ...
 * PREVIEW_BASE_URL=https://... ENVIRONMENT_QA_VIEWPORT=mobile-390 node ...
 * node scripts/capture-environments.mjs --list  (no server/browser started)
 *
 * PNGs have consistent viewport dimensions and sortable names for contact
 * sheets. report.json and each environment/report.json describe every image,
 * assertion, browser diagnostic and limitation. Passing is not visual approval.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

// Use the PNG decoder already shipped by our lockfile-pinned Playwright. Decode
// the captured screenshot in Node rather than requesting a second GPU readback.
const { PNG } = createRequire(import.meta.url)(
  "playwright-core/lib/utilsBundle",
);

const viewports = {
  "desktop-1440": { width: 1440, height: 900 },
  "desktop-1920": { width: 1920, height: 1080 },
  "mobile-390": { width: 390, height: 844 },
};
const environments = [
  { id: "studio", label: "Pit garage" },
  { id: "gallery", label: "Gallery" },
  { id: "night", label: "After hours" },
  { id: "forest", label: "Test paddock" },
  { id: "coast", label: "Coastal road" },
];
const selected = process.env.ENVIRONMENT_QA_VIEWPORT;
const selectedEnvironment = process.env.ENVIRONMENT_QA_ENVIRONMENT;
assert(
  !selected || Object.hasOwn(viewports, selected),
  `Unknown viewport: ${selected}`,
);
assert(
  !selectedEnvironment ||
    environments.some((e) => e.id === selectedEnvironment),
  `Unknown environment: ${selectedEnvironment}`,
);
const captureTargets = selectedEnvironment
  ? environments.filter((e) => e.id === selectedEnvironment)
  : environments;
const plan = {
  viewports: selected ? { [selected]: viewports[selected] } : viewports,
  environments: captureTargets,
  selectorEnvironments: environments,
  // A single-target job still leaves and returns to the target twice. Use two
  // other genuine scenes, and keep their evidence outside the 22 target views.
  switchAwayEnvironments: selectedEnvironment
    ? [1, 2].map(
        (offset) =>
          environments[
            (environments.findIndex((e) => e.id === selectedEnvironment) +
              offset) %
              environments.length
          ],
      )
    : [],
  views: [
    "hero",
    "front",
    "rear",
    "side",
    "top",
    "low",
    "home-reset",
    ...Array.from({ length: 8 }, (_, i) => `orbit-${i + 1}`),
    "zoom-min",
    "zoom-min-clamped",
    "zoom-max",
    "zoom-max-clamped",
    "zoom-reset",
    "switch-return-1",
    "switch-return-2",
  ],
  paintEvidence: {
    night: [
      "jet-black-front-lamps-off",
      "jet-black-side-lamps-off",
      "jet-black-rear-lamps-off",
      "jet-black-front-lamps-on",
    ],
  },
  orbit: {
    key: "Shift+ArrowRight",
    presses: 40,
    checkpoints: 8,
    expectedRadiansPerPress: 0.16,
    expectedSweepDegrees: (40 * 0.16 * 180) / Math.PI,
  },
};
if (process.argv.includes("--list")) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const outputRoot =
  process.env.ENVIRONMENT_QA_OUTPUT || "environment-preview-results";
const baseUrl = (
  process.env.PREVIEW_BASE_URL || "http://127.0.0.1:4183"
).replace(/\/$/, "");
const report = {
  schemaVersion: 3,
  commit: process.env.GITHUB_SHA || null,
  baseUrl,
  startedAt: new Date().toISOString(),
  status: "running",
  plan,
  pixelComparison:
    "Exact RGBA SHA-256 of the canvas rectangle inset by 2 CSS pixels, excluding the browser focus outline. Full viewport PNGs and their independent file SHA-256 hashes are preserved.",
  limitations: [
    "SwiftShader checks rendering and interactions; this is not physical-GPU/mobile performance evidence.",
    "Screenshot differences and reset equality do not establish visual realism, composition or absence of clipping. Inspect the PNGs.",
    "The 40 keyboard increments cover 366.7 degrees using the shipped 0.16-radian shifted-arrow increment; this is a full turn, not an exact 360-degree reset.",
  ],
  viewports: [],
};
let browser;
let server;
await mkdir(outputRoot, { recursive: true });
const save = () =>
  writeFile(join(outputRoot, "report.json"), JSON.stringify(report, null, 2));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function canvasPixelHash(bytes, bounds) {
  const png = PNG.sync.read(bytes);
  // deviceScaleFactor and screenshot scale are both 1. Exclude only the proven
  // focus-outline false positive; do not blur, rescale, tolerate or mask changes
  // within the scene. Hash raw decoded pixels, not PNG compression bytes.
  const inset = 2;
  const x = Math.ceil(bounds.x + inset);
  const y = Math.ceil(bounds.y + inset);
  const right = Math.floor(bounds.x + bounds.width - inset);
  const bottom = Math.floor(bounds.y + bounds.height - inset);
  assert(
    x >= 0 && y >= 0 && right <= png.width && bottom <= png.height,
    "Canvas comparison region extends outside the captured viewport",
  );
  assert(right > x && bottom > y, "Canvas comparison region is empty");
  const hash = createHash("sha256");
  for (let row = y; row < bottom; row++) {
    const start = (row * png.width + x) * 4;
    hash.update(png.data.subarray(start, start + (right - x) * 4));
  }
  return {
    sha256: hash.digest("hex"),
    bounds: { x, y, width: right - x, height: bottom - y, insetPixels: inset },
  };
}

async function captureScreenshot(page, options, recovery) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const startedAt = new Date().toISOString();
    const started = performance.now();
    try {
      const bytes = await page.screenshot(options);
      await recovery.record({
        attempt,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        status: "passed",
      });
      return bytes;
    } catch (error) {
      // Only retry the screenshot operation's timeout. No assertion, selector,
      // input, navigation, page crash or graphics failure receives a retry.
      const screenshotTimeout =
        error.name === "TimeoutError" &&
        /^page\.screenshot: Timeout \d+ms exceeded\./.test(error.message) &&
        /fonts loaded/.test(error.message);
      const retry =
        screenshotTimeout && attempt === 1 && recovery.budget.remaining > 0;
      await recovery.record({
        attempt,
        startedAt,
        durationMs: Math.round(performance.now() - started),
        status: screenshotTimeout ? "timeout" : "failed",
        retryPlanned: retry,
        message: String(error),
      });
      if (!retry) throw error;
      recovery.budget.remaining--;
      // Revalidate the untouched scene before retrying once. No reload, camera
      // reset, delay, animation change or lower screenshot quality is allowed.
      await recovery.validate();
    }
  }
  throw new Error("Screenshot attempts exhausted");
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server && server.exitCode !== null)
      throw new Error(`Preview server exited: ${server.exitCode}`);
    if (
      await fetch(baseUrl, { signal: AbortSignal.timeout(2000) })
        .then((r) => r.ok)
        .catch(() => false)
    )
      return;
    await pause(150);
  }
  throw new Error(`Production preview did not become available: ${baseUrl}`);
}

async function runViewport(name, viewport) {
  const directory = join(outputRoot, name);
  await mkdir(directory, { recursive: true });
  const view = {
    name,
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    screenshotTimeoutMs: name === "desktop-1920" ? 90000 : 45000,
    status: "running",
    startedAt: new Date().toISOString(),
    checks: [],
    diagnostics: [],
    captureAttempts: [],
    environments: [],
    errors: [],
  };
  report.viewports.push(view);
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    ...(name.startsWith("mobile") ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const canvas = page.locator(".scene-stage canvas");
  let initialCanvas;
  const dialog = page.getByRole("dialog");
  let currentStep = "initial-load";
  // At most one extra screenshot across the entire viewport job, not one per
  // image. A second timeout stays a failure and cannot consume an open retry loop.
  const screenshotRecoveryBudget = { remaining: 1 };
  const diagnostic = (kind, message, details = {}) =>
    view.diagnostics.push({
      kind,
      message,
      step: currentStep,
      ...details,
    });
  page.on("pageerror", (e) => diagnostic("pageerror", e.message));
  page.on("crash", () => diagnostic("crash", "Page crashed"));
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()))
      diagnostic(m.type(), m.text(), { location: m.location() });
  });
  page.on("requestfailed", (request) =>
    diagnostic(
      "requestfailed",
      request.failure()?.errorText || "Request failed",
      { url: request.url() },
    ),
  );
  page.on("response", (response) => {
    if (response.status() >= 400)
      diagnostic("http-error", `HTTP ${response.status()}`, {
        url: response.url(),
      });
  });
  const persist = async () => {
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(view, null, 2),
    );
    await save();
  };
  async function settled() {
    await expect(canvas).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Ultimate Silver", exact: true }),
    ).toBeEnabled({ timeout: 90000 });
    await expect(
      page.locator(
        ".scene-loading, .scene-notice, .render-error, vite-error-overlay",
      ),
    ).toHaveCount(0);
    // OrbitControls temporarily lowers AdaptiveDpr. Never compare that temporary
    // render to a canonical full-resolution frame.
    await page.waitForFunction(
      () => {
        const c = document.querySelector(".scene-stage canvas");
        return (
          c &&
          c.clientWidth > 0 &&
          Math.abs(c.width / c.clientWidth - Math.min(devicePixelRatio, 1.75)) <
            0.02
        );
      },
      {},
      { timeout: 15000 },
    );
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 3;
          const next = () =>
            --frames ? requestAnimationFrame(next) : resolve();
          requestAnimationFrame(next);
        }),
    );
  }
  async function graphicsHealth() {
    const health = await canvas.evaluate((element) => {
      const gl = element.getContext("webgl2") || element.getContext("webgl");
      if (!gl) return { available: false };
      const extension = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        available: true,
        contextLost: gl.isContextLost(),
        error: gl.getError(),
        renderer: extension
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
      };
    });
    assert(health.available, "Viewer has no WebGL context");
    assert.equal(health.contextLost, false, "WebGL context lost");
    assert.equal(health.error, 0, `WebGL error ${health.error}`);
    return health;
  }
  async function camera(label) {
    await page.getByRole("button", { name: "Camera", exact: true }).click();
    await dialog.getByRole("button", { name: label, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await settled();
  }
  async function environment(item) {
    const trigger = page.getByRole("button", {
      name: "Environment",
      exact: true,
    });
    await trigger.click();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    const option = dialog.locator(".environment-choices button").filter({
      has: page.locator(`.environment-preview.${item.id}`),
    });
    await expect(option).toHaveCount(1);
    await expect(option).toHaveAccessibleName(
      new RegExp(`^${item.label}(?:\\s|$)`),
    );
    await expect(option).toBeEnabled();
    await option.click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("main.configurator")).toHaveClass(
      new RegExp(`(?:^|\\s)environment-${item.id}(?:\\s|$)`),
    );
    await settled();
    // Verify the actual selected control when reopening, not only a CSS theme.
    await trigger.press("Enter");
    await expect(option).toHaveClass(/(?:^|\s)selected(?:\s|$)/);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  async function press(key, count) {
    await canvas.focus();
    const shifted = key.startsWith("Shift+");
    const physicalKey = shifted ? key.slice("Shift+".length) : key;
    if (shifted) await page.keyboard.down("Shift");
    try {
      // Native held-key repetition: one initial keydown followed by queued
      // repeated keydowns. No DOM dispatch, synthetic camera hook, per-key
      // settling or interleaved modifier releases. Capture settles afterward.
      await page.keyboard.down(physicalKey);
      await Promise.all(
        Array.from({ length: count - 1 }, () =>
          page.keyboard.down(physicalKey),
        ),
      );
    } finally {
      await page.keyboard.up(physicalKey);
      if (shifted) await page.keyboard.up("Shift");
    }
  }
  async function capture(
    item,
    shot,
    details = {},
    { evidenceOnly = false, paintOnly = false } = {},
  ) {
    currentStep = `${item.id}/${shot}`;
    const captureStarted = performance.now();
    await settled();
    const settledAt = performance.now();
    assert(
      await canvas.evaluate(
        (element, initial) => element === initial,
        initialCanvas,
      ),
      "Environment or camera change replaced the original viewer canvas",
    );
    // Preserve the real focus state for visual/accessibility review. Keyboard
    // and mouse modality can draw different :focus-visible outlines despite
    // identical focus; canvasPixelHash excludes only that 2px perimeter.
    await canvas.focus();
    // Keep hover styling identical too, regardless of the last drawer option.
    await page.mouse.move(viewport.width - 2, viewport.height - 2);
    const bounds = await canvas.boundingBox();
    assert(
      bounds && bounds.width > 200 && bounds.height > 200,
      "Viewer is missing or collapsed",
    );
    const overflow = await page.evaluate(
      () =>
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) - innerWidth,
    );
    assert(overflow <= 1, `Horizontal page overflow: ${overflow}px`);
    const collection = paintOnly
      ? item.paintEvidence
      : evidenceOnly
        ? item.switchEvidence
        : item.images;
    const file = `${paintOnly ? "paint-" : evidenceOnly ? "evidence-" : ""}${String(collection.length).padStart(2, "0")}-${shot}.png`;
    const screenshotStarted = performance.now();
    const bytes = await captureScreenshot(
      page,
      {
        path: join(directory, item.id, file),
        animations: "disabled",
        scale: "css",
        timeout: view.screenshotTimeoutMs,
      },
      {
        budget: screenshotRecoveryBudget,
        record: async (attempt) => {
          view.captureAttempts.push({ step: currentStep, ...attempt });
          await persist();
        },
        validate: async () => {
          await settled();
          await graphicsHealth();
          assert(
            await canvas.evaluate(
              (element, initial) => element === initial,
              initialCanvas,
            ),
            "Cannot retry screenshot after the viewer canvas was replaced",
          );
          assert.deepEqual(
            await canvas.boundingBox(),
            bounds,
            "Cannot retry screenshot after the viewer layout changed",
          );
          assert(
            !view.diagnostics.some((d) =>
              ["pageerror", "error", "crash"].includes(d.kind),
            ),
            "Cannot retry screenshot after a runtime failure",
          );
        },
      },
    );
    const screenshotFinished = performance.now();
    const comparison = canvasPixelHash(bytes, bounds);
    const image = {
      name: shot,
      file: `${item.id}/${file}`,
      viewport,
      canvasBounds: bounds,
      selectedEnvironment: item.id,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      canvasSha256: comparison.sha256,
      comparisonBounds: comparison.bounds,
      timingMs: {
        settle: Math.round(settledAt - captureStarted),
        screenshot: Math.round(screenshotFinished - screenshotStarted),
        total: Math.round(performance.now() - captureStarted),
      },
      ...details,
    };
    collection.push(image);
    item.webgl = await graphicsHealth();
    await writeFile(
      join(directory, item.id, "report.json"),
      JSON.stringify(item, null, 2),
    );
    await persist();
    console.log(`[environment-preview] ${name} ${item.id} ${shot}`);
    return image.canvasSha256;
  }

  try {
    await page.goto(`${baseUrl}/configurator/premium`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await expect(page).toHaveTitle(/GT-R LAB/);
    await settled();
    initialCanvas = await canvas.elementHandle();
    assert(initialCanvas, "Initial viewer canvas is missing");
    await expect(canvas).toHaveAttribute("tabindex", "0");
    await expect(canvas).toHaveAttribute("role", "application");
    await expect(canvas).toHaveAccessibleName(/Interactive vehicle/);
    await expect(canvas).toHaveAttribute(
      "aria-keyshortcuts",
      /ArrowLeft.*ArrowRight.*Home/,
    );
    await canvas.focus();
    await expect(canvas).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(canvas).not.toBeFocused();
    const trigger = page.getByRole("button", {
      name: "Environment",
      exact: true,
    });
    await trigger.focus();
    await trigger.press("Enter");
    await expect(dialog).toBeFocused();
    const choices = dialog.locator(".environment-choices button");
    await expect(choices).toHaveCount(environments.length);
    for (const option of environments) {
      const choice = choices.filter({
        has: page.locator(`.environment-preview.${option.id}`),
      });
      await expect(choice).toHaveAccessibleName(
        new RegExp(`^${option.label}(?:\\s|$)`),
      );
      await expect(choice).toBeEnabled();
    }
    await page.keyboard.press("Shift+Tab");
    await expect(choices.last()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Close panel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    view.checks.push(
      "Viewer keyboard access and Tab exit",
      "Environment dialog keyboard open, focus trap, Escape and focus return",
      "All five environment selector options are enabled and correctly labelled",
    );

    for (const definition of captureTargets) {
      const item = {
        ...definition,
        status: "running",
        checks: [],
        images: [],
        switchEvidence: [],
        paintEvidence: [],
        errors: [],
      };
      view.environments.push(item);
      await mkdir(join(directory, item.id), { recursive: true });
      try {
        currentStep = `${item.id}/selection`;
        await environment(item);
        item.checks.push(
          "Accessible enabled environment selection and retained selected state",
        );
        await camera("Front ¾");
        item.canonical = await capture(item, "hero");
        for (const [shot, label] of [
          ["front", "Front"],
          ["rear", "Rear"],
          ["side", "Side"],
          ["top", "Top detail"],
        ]) {
          await camera(label);
          await capture(item, shot, { cameraPreset: label });
        }
        await camera("Front ¾");
        await press("Shift+ArrowDown", 12);
        const low = await capture(item, "low", {
          input: "12 × Shift+ArrowDown",
        });
        assert.notEqual(
          low,
          item.canonical,
          "Low orbit did not change rendered pixels",
        );
        await press("Home", 1);
        assert.equal(
          await capture(item, "home-reset"),
          item.canonical,
          "Home did not restore the canonical framing",
        );
        item.checks.push(
          "Front, rear, side, top and ground-level views",
          "Home restores exact canonical pixels",
        );

        let previous = item.canonical;
        for (
          let checkpoint = 1;
          checkpoint <= plan.orbit.checkpoints;
          checkpoint++
        ) {
          await press(
            plan.orbit.key,
            plan.orbit.presses / plan.orbit.checkpoints,
          );
          const hash = await capture(item, `orbit-${checkpoint}`, {
            input: `${checkpoint * 5} cumulative × ${plan.orbit.key}`,
            expectedSweepDegrees: (checkpoint * 5 * 0.16 * 180) / Math.PI,
          });
          assert.notEqual(
            hash,
            previous,
            "Orbit input did not change rendered pixels",
          );
          previous = hash;
        }
        item.checks.push(
          "Full-turn orbit through 40 real keyboard increments and 8 visible checkpoints",
        );

        await press("Home", 1);
        await settled();
        await press("+", 40);
        const near = await capture(item, "zoom-min", { input: "40 × +" });
        await press("+", 2);
        assert.equal(
          await capture(item, "zoom-min-clamped"),
          near,
          "Minimum zoom did not clamp",
        );
        await press("-", 50);
        const far = await capture(item, "zoom-max", { input: "50 × -" });
        await press("-", 2);
        assert.equal(
          await capture(item, "zoom-max-clamped"),
          far,
          "Maximum zoom did not clamp",
        );
        assert.notEqual(
          near,
          far,
          "Zoom inputs did not change rendered pixels",
        );
        await press("Home", 1);
        assert.equal(
          await capture(item, "zoom-reset"),
          item.canonical,
          "Zoom reset did not restore canonical pixels",
        );
        item.checks.push(
          "Minimum/maximum zoom visibly differ, both limits clamp, and Home restores framing",
        );
        item.status = "passed";
      } catch (error) {
        item.status = "failed";
        item.errors.push({
          step: currentStep,
          message: String(error),
          stack: error.stack,
        });
        // Preserve partial results and continue other environments when usable.
        await page.keyboard.press("Escape").catch(() => {});
        await page
          .screenshot({
            path: join(directory, item.id, "failure.png"),
            timeout: 15000,
          })
          .catch(() => {});
      }
      await writeFile(
        join(directory, item.id, "report.json"),
        JSON.stringify(item, null, 2),
      );
      await persist();
    }

    // Aggregate mode cycles all targets twice. Single-target jobs explicitly
    // visit another environment before each return, proving resources remain
    // reversible on the original canvas rather than merely reselecting a label.
    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const item of view.environments.filter(
        (e) => e.status === "passed",
      )) {
        try {
          const away = plan.switchAwayEnvironments[cycle - 1];
          if (away) {
            currentStep = `${item.id}/switch-away-${cycle}`;
            await environment(away);
            await camera("Front ¾");
            const awayHash = await capture(
              item,
              `switch-away-${cycle}`,
              {
                selectedEnvironment: away.id,
                environmentLabel: away.label,
              },
              { evidenceOnly: true },
            );
            assert.notEqual(
              awayHash,
              item.canonical,
              `Switching from ${item.id} to ${away.id} did not change the rendered scene`,
            );
          }
          currentStep = `${item.id}/switch-return-${cycle}`;
          await environment(item);
          await camera("Front ¾");
          assert.equal(
            await capture(item, `switch-return-${cycle}`),
            item.canonical,
            `Environment return ${cycle} changed canonical pixels`,
          );
          item.checks.push(
            `Repeated environment return ${cycle} restores exact canonical pixels`,
          );
          if (away)
            item.checks.push(
              `Switch-away ${cycle} to ${away.id} renders distinct pixels on the same canvas`,
            );
        } catch (error) {
          item.status = "failed";
          item.errors.push({
            step: currentStep,
            message: String(error),
            stack: error.stack,
          });
          await page.keyboard.press("Escape").catch(() => {});
        }
        await writeFile(
          join(directory, item.id, "report.json"),
          JSON.stringify(item, null, 2),
        );
      }
    }
    const canonical = view.environments.map((e) => e.canonical).filter(Boolean);
    assert.equal(
      canonical.length,
      captureTargets.length,
      "Missing canonical environment images",
    );
    if (selectedEnvironment) {
      const item = view.environments[0];
      assert.equal(
        item.switchEvidence.length,
        2,
        "Missing switch-away evidence",
      );
      assert.equal(
        new Set([
          item.canonical,
          ...item.switchEvidence.map((image) => image.canvasSha256),
        ]).size,
        3,
        "Target and switch-away environments did not produce three distinct rendered scenes",
      );
      view.checks.push(
        "Target and both switch-away environments render distinct pixels on the original canvas",
      );
    } else {
      assert.equal(
        new Set(canonical).size,
        environments.length,
        "Two environments produced identical canonical images",
      );
      view.checks.push(
        "All five environments have distinct rendered canonical images",
      );
    }
    // Separate legibility evidence after the complete 22-view/2-switch contract.
    // Vehicle lamps do not illuminate the entire venue, so inspect black paint
    // with them off from three sides, then demonstrate their actual on state.
    const night = view.environments.find(
      (item) => item.id === "night" && item.status === "passed",
    );
    if (night) {
      currentStep = "night/paint-evidence";
      await environment(night);
      const paintGroup = page.getByRole("group", {
        name: "Exterior paint",
        exact: true,
      });
      const originalPaint = await paintGroup
        .locator('button[aria-pressed="true"]')
        .getAttribute("aria-label");
      assert(originalPaint, "Original paint selection is missing");
      const lamps = page.getByRole("button", { name: "Lights", exact: true });
      const originalLamps = await lamps.getAttribute("aria-pressed");
      assert(
        ["true", "false"].includes(originalLamps),
        "Original lamp state is missing",
      );
      night.paintRestoration = {
        originalPaint,
        originalLamps: originalLamps === "true",
        restored: false,
      };
      const setLamps = async (enabled) => {
        await expect(lamps).toBeEnabled();
        if ((await lamps.getAttribute("aria-pressed")) !== String(enabled))
          await lamps.click();
        await expect(lamps).toHaveAttribute("aria-pressed", String(enabled));
      };
      try {
        await paintGroup
          .getByRole("button", { name: "Jet Black", exact: true })
          .click();
        await expect(
          paintGroup.getByRole("button", { name: "Jet Black", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await setLamps(false);
        let frontOff;
        for (const [shot, preset] of [
          ["front", "Front"],
          ["side", "Side"],
          ["rear", "Rear"],
        ]) {
          await camera(preset);
          const hash = await capture(
            night,
            `jet-black-${shot}-lamps-off`,
            {
              paint: "Jet Black",
              vehicleLamps: false,
              cameraPreset: preset,
            },
            { paintOnly: true },
          );
          if (shot === "front") frontOff = hash;
        }
        await setLamps(true);
        await camera("Front");
        const frontOn = await capture(
          night,
          "jet-black-front-lamps-on",
          {
            paint: "Jet Black",
            vehicleLamps: true,
            cameraPreset: "Front",
          },
          { paintOnly: true },
        );
        assert.notEqual(
          frontOn,
          frontOff,
          "Vehicle lamps did not change Jet Black front-view pixels",
        );
        night.checks.push(
          "Jet Black front/side/rear legibility with lamps off; front lamp-on state changes rendered pixels",
        );
      } catch (error) {
        night.status = "failed";
        night.errors.push({
          step: currentStep,
          message: String(error),
          stack: error.stack,
        });
      } finally {
        try {
          await paintGroup
            .getByRole("button", { name: originalPaint, exact: true })
            .click();
          await setLamps(originalLamps === "true");
          await camera("Front ¾");
          await expect(
            paintGroup.getByRole("button", {
              name: originalPaint,
              exact: true,
            }),
          ).toHaveAttribute("aria-pressed", "true");
          night.paintRestoration.restored = true;
        } catch (error) {
          night.status = "failed";
          night.errors.push({
            step: "night/paint-restoration",
            message: String(error),
            stack: error.stack,
          });
        }
        await writeFile(
          join(directory, night.id, "report.json"),
          JSON.stringify(night, null, 2),
        );
        await persist();
      }
    }
    await expect(canvas).toHaveCount(1);
    await graphicsHealth();
  } catch (error) {
    view.errors.push({
      step: currentStep,
      message: String(error),
      stack: error.stack,
    });
  } finally {
    // Warning-level WebGL failures must fail too. SwiftShader GPU-stall/perf
    // notices are preserved as diagnostics, not misreported as shader failures.
    const isFatal = (d) =>
      ["pageerror", "error", "crash", "http-error", "requestfailed"].includes(
        d.kind,
      ) ||
      /shader error|INVALID_|GL_OUT_OF_MEMORY|VALIDATE_STATUS|CONTEXT_LOST|context (?:was )?lost|GL_INVALID/i.test(
        d.message,
      );
    const fatal = view.diagnostics.filter(isFatal);
    view.errors.push(...fatal);
    for (const item of view.environments) {
      item.captureAttempts = view.captureAttempts.filter((attempt) =>
        attempt.step.startsWith(`${item.id}/`),
      );
      item.diagnostics = view.diagnostics.filter((d) =>
        d.step.startsWith(`${item.id}/`),
      );
      item.errors.push(...item.diagnostics.filter(isFatal));
      if (item.images.length !== plan.views.length)
        item.errors.push({
          message: `Incomplete capture: ${item.images.length}/${plan.views.length} planned images`,
        });
      if (
        item.id === "night" &&
        item.paintEvidence.length !== plan.paintEvidence.night.length
      )
        item.errors.push({
          message: `Incomplete night paint evidence: ${item.paintEvidence.length}/${plan.paintEvidence.night.length}`,
        });
      if (item.errors.length) item.status = "failed";
      await writeFile(
        join(directory, item.id, "report.json"),
        JSON.stringify(item, null, 2),
      );
    }
    view.status =
      view.errors.length ||
      view.environments.length !== captureTargets.length ||
      view.environments.some((e) => e.status !== "passed")
        ? "failed"
        : "passed";
    view.finishedAt = new Date().toISOString();
    view.durationSeconds =
      (Date.parse(view.finishedAt) - Date.parse(view.startedAt)) / 1000;
    await persist();
    await context.close();
  }
}

try {
  if (!process.env.PREVIEW_BASE_URL) {
    server = spawn(process.execPath, ["server.mjs"], {
      env: { ...process.env, PORT: "4183" },
      stdio: "inherit",
    });
    server.on("error", (error) => {
      report.serverError = String(error);
    });
  }
  await waitForServer();
  browser = await chromium.launch({
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
    ],
  });
  report.browser = {
    version: browser.version(),
    rendererRequested: "ANGLE SwiftShader",
  };
  for (const [name, viewport] of Object.entries(plan.viewports))
    await runViewport(name, viewport);
  report.status = report.viewports.every((v) => v.status === "passed")
    ? "passed"
    : "failed";
} catch (error) {
  report.status = "failed";
  report.error = { message: String(error), stack: error.stack };
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  await browser?.close();
  server?.kill("SIGTERM");
}
console.log(
  JSON.stringify({
    status: report.status,
    outputRoot,
    viewports: report.viewports.map((v) => ({
      name: v.name,
      status: v.status,
      durationSeconds: v.durationSeconds,
    })),
  }),
);
if (report.status !== "passed") process.exitCode = 1;
