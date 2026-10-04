// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForEnvironmentReady } from "../scripts/vehicle-preview-readiness.mjs";

function scene({ environment = "coast", ready = false } = {}) {
  document.body.innerHTML = `
    <main class="configurator environment-${environment}${ready ? " is-scene-ready" : ""}">
      <div class="scene-stage"><canvas></canvas></div>
      <button aria-label="Ultimate Silver"${ready ? "" : " disabled"}></button>
      <div class="config-toolbar"><button aria-label="Lights"${ready ? "" : " disabled"}></button></div>
      ${ready ? "" : '<div class="scene-loading">Preparing the renderer 99%</div>'}
    </main>`;
}

// Execute the real browser predicate against a DOM while controlling elapsed time.
// No Playwright import, browser, network, or renderer is required by this test.
function fakePage() {
  return {
    waitForFunction: vi.fn(async (predicate, arg, { timeout, polling }) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (predicate(arg)) return true;
        await new Promise((resolve) => setTimeout(resolve, polling));
      }
      throw new Error(`Environment readiness timed out after ${timeout}ms`);
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  scene();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("production smoke environment readiness", () => {
  it("waits for coastal assets taking longer than the old 24-frame delay", async () => {
    const page = fakePage();
    let settled = false;
    const waiting = waitForEnvironmentReady(page, "coast").then(() => {
      settled = true;
    });
    setTimeout(() => scene({ ready: true }), 1200);
    await vi.advanceTimersByTimeAsync(24 * 16);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1200 - 24 * 16);
    await waiting;
    expect(settled).toBe(true);
    expect(page.waitForFunction).toHaveBeenCalledTimes(1);
    expect(page.waitForFunction.mock.calls[0].slice(1)).toEqual([
      "coast",
      { timeout: 90000, polling: 100 },
    ]);
  });

  it("does not mistake a ready previous environment for the requested one", async () => {
    scene({ environment: "forest", ready: true });
    const page = fakePage();
    let settled = false;
    const waiting = waitForEnvironmentReady(page, "coast").then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(settled).toBe(false);
    scene({ ready: true });
    await vi.advanceTimersByTimeAsync(100);
    await waiting;
    expect(settled).toBe(true);
  });

  it.each([
    [
      "loading overlay",
      () =>
        document
          .querySelector("main")
          .insertAdjacentHTML(
            "beforeend",
            '<div class="scene-loading">99%</div>',
          ),
    ],
    [
      "missing scene-ready state",
      () => document.querySelector("main").classList.remove("is-scene-ready"),
    ],
    [
      "locked paint control",
      () => {
        document.querySelector('[aria-label="Ultimate Silver"]').disabled =
          true;
      },
    ],
    [
      "locked lamp control",
      () => {
        document.querySelector('[aria-label="Lights"]').disabled = true;
      },
    ],
    ["missing canvas", () => document.querySelector("canvas").remove()],
    [
      "duplicate canvas",
      () =>
        document
          .querySelector(".scene-stage")
          .append(document.createElement("canvas")),
    ],
  ])(
    "fails within the deadline for a stuck %s",
    async (_name, blockReadiness) => {
      scene({ ready: true });
      blockReadiness();
      const page = fakePage();
      const waiting = waitForEnvironmentReady(page, "coast", { timeout: 500 });
      const rejected = expect(waiting).rejects.toThrow(/timed out after 500ms/);
      await vi.advanceTimersByTimeAsync(500);
      await rejected;
      expect(page.waitForFunction).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["scene-notice", "render-error"])(
    "fails immediately on %s instead of accepting a fallback",
    async (className) => {
      scene({ ready: true });
      document
        .querySelector("main")
        .insertAdjacentHTML(
          "beforeend",
          `<div class="${className}">Rock assets failed</div>`,
        );
      const page = fakePage();
      await expect(waitForEnvironmentReady(page, "coast")).rejects.toThrow(
        /coast.*Rock assets failed/,
      );
      expect(page.waitForFunction).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("propagates an error appearing while delayed assets are still loading", async () => {
    const page = fakePage();
    const waiting = waitForEnvironmentReady(page, "coast");
    const rejected = expect(waiting).rejects.toThrow(
      /coast.*Rock assets failed/,
    );
    setTimeout(
      () =>
        document
          .querySelector("main")
          .insertAdjacentHTML(
            "beforeend",
            '<div class="scene-notice">Rock assets failed</div>',
          ),
      800,
    );
    await vi.advanceTimersByTimeAsync(800);
    await rejected;
    expect(page.waitForFunction).toHaveBeenCalledTimes(1);
  });

  it("waits for readiness before preserving frame, pixel and shared-HDR checks", async () => {
    const source = await readFile(
      "scripts/capture-vehicle.mjs",
      "utf8",
    );
    expect(source).toMatch(
      /await waitForEnvironmentReady\(page, environment\);[\s\S]*remaining=24[\s\S]*after === before[\s\S]*hdrRequests\.length !== 1/,
    );
  });
});
