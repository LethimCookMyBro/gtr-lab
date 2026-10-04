#!/usr/bin/env node
/**
 * Real, production-server environment QA. Camera input goes through the shipped
 * buttons and keyboard controls; there are no application/test camera hooks.
 *
 * ENVIRONMENT_QA_VIEWPORT=desktop-1440 node scripts/capture-environments.mjs
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
import { join } from "node:path";
import { chromium, expect } from "@playwright/test";

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
assert(
  !selected || Object.hasOwn(viewports, selected),
  `Unknown viewport: ${selected}`,
);
const plan = {
  viewports: selected ? { [selected]: viewports[selected] } : viewports,
  environments,
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
  schemaVersion: 1,
  commit: process.env.GITHUB_SHA || null,
  baseUrl,
  startedAt: new Date().toISOString(),
  status: "running",
  plan,
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
    status: "running",
    startedAt: new Date().toISOString(),
    checks: [],
    diagnostics: [],
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
  const dialog = page.getByRole("dialog");
  let currentStep = "initial-load";
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
    for (let step = 0; step < count; step++) await page.keyboard.press(key);
  }
  async function capture(item, shot, details = {}) {
    currentStep = `${item.id}/${shot}`;
    await settled();
    // All hashes have identical focus treatment. Otherwise a focus outline can
    // falsely look like camera movement or a failed reset.
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
    const file = `${String(item.images.length).padStart(2, "0")}-${shot}.png`;
    const bytes = await page.screenshot({
      path: join(directory, item.id, file),
      animations: "disabled",
      scale: "css",
      timeout: 45000,
    });
    const image = {
      name: shot,
      file: `${item.id}/${file}`,
      viewport,
      canvasBounds: bounds,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...details,
    };
    item.images.push(image);
    item.webgl = await graphicsHealth();
    await writeFile(
      join(directory, item.id, "report.json"),
      JSON.stringify(item, null, 2),
    );
    await persist();
    console.log(`[environment-preview] ${name} ${item.id} ${shot}`);
    return image.sha256;
  }

  try {
    await page.goto(`${baseUrl}/configurator/premium`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await expect(page).toHaveTitle(/GT-R LAB/);
    await settled();
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
    );

    for (const definition of environments) {
      const item = {
        ...definition,
        status: "running",
        checks: [],
        images: [],
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

    // Two complete round trips catch disposed/cached environment resources,
    // lights/shadow accumulation and selection regressions without reloads.
    for (let cycle = 1; cycle <= 2; cycle++) {
      for (const item of view.environments.filter(
        (e) => e.status === "passed",
      )) {
        try {
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
      environments.length,
      "Missing canonical environment images",
    );
    assert.equal(
      new Set(canonical).size,
      environments.length,
      "Two environments produced identical canonical images",
    );
    view.checks.push(
      "All five environments have distinct rendered canonical images",
    );
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
      item.diagnostics = view.diagnostics.filter((d) =>
        d.step.startsWith(`${item.id}/`),
      );
      item.errors.push(...item.diagnostics.filter(isFatal));
      if (item.images.length !== plan.views.length)
        item.errors.push({
          message: `Incomplete capture: ${item.images.length}/${plan.views.length} planned images`,
        });
      if (item.errors.length) item.status = "failed";
      await writeFile(
        join(directory, item.id, "report.json"),
        JSON.stringify(item, null, 2),
      );
    }
    view.status =
      view.errors.length ||
      view.environments.length !== environments.length ||
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
