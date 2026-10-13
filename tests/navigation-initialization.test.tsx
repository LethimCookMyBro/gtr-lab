// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { restorePreCatalogNavigation } from "./helpers/navigation-catalog-contract";
import {
  waitForVehicleInitialization,
  VEHICLE_INITIALIZATION_TIMEOUT,
} from "../e2e/helpers/vehicle-initialization";
import type { Page, TestInfo } from "@playwright/test";
const host = vi.hoisted(() => ({
  calls: [] as { kind: string; timeout: number }[],
}));
vi.mock("@playwright/test", () => ({
  expect: (read: () => Element[]) => {
    const poll = async (
      kind: string,
      predicate: () => boolean,
      opts: { timeout: number } = { timeout: 5000 },
    ) => {
      host.calls.push({ kind, timeout: opts.timeout });
      const end = performance.now() + opts.timeout;
      while (!predicate()) {
        if (performance.now() >= end) throw new Error(kind + " timed out");
        await new Promise((r) =>
          setTimeout(r, Math.min(100, end - performance.now())),
        );
      }
    };
    return {
      toBeEnabled: (opts?: { timeout: number }) =>
        poll(
          "enabled",
          () =>
            read().length === 1 && !(read()[0] as HTMLButtonElement).disabled,
          opts,
        ),
      toHaveCount: (count: number, opts?: { timeout: number }) =>
        poll("count " + count, () => read().length === count, opts),
    };
  },
}));
const page = {
  getByRole: () => () =>
    Array.from(document.querySelectorAll('[aria-label="Ultimate Silver"]')),
  locator: (selector: string) => () =>
    Array.from(document.querySelectorAll(selector)),
} as unknown as Page;
function fixture() {
  const attachments: { name: string; value: any }[] = [];
  const budgets: { timeout: number; at: number }[] = [];
  const info = {
    timeout: 30_000,
    setTimeout(timeout: number) {
      info.timeout = timeout;
      budgets.push({ timeout, at: performance.now() });
    },
    attach: async (name: string, { body }: { body: Buffer }) => {
      attachments.push({ name, value: JSON.parse(body.toString()) });
    },
  } as unknown as TestInfo;
  return { info, attachments, budgets };
}
function ready() {
  (document.querySelector("button") as HTMLButtonElement).disabled = false;
  document.querySelector(".scene-loading")?.remove();
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  host.calls = [];
  document.body.innerHTML =
    '<button aria-label="Ultimate Silver" disabled></button><div class="scene-stage"><canvas></canvas></div><div class="scene-loading"></div>';
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});
it("waits for genuine delayed startup and records both original failure evidence and slow current duration", async () => {
  const f = fixture();
  let done = false;
  const p = waitForVehicleInitialization(page, f.info, 0).then(
    () => (done = true),
  );
  setTimeout(ready, 8000);
  await vi.advanceTimersByTimeAsync(5000);
  expect(done).toBe(false);
  await vi.advanceTimersByTimeAsync(3000);
  await p;
  expect(done).toBe(true);
  expect(host.calls).toHaveLength(4);
  expect(f.attachments).toHaveLength(1);
  const timing = f.attachments[0].value;
  expect(timing).toMatchObject({
    outcome: "ready",
    initializationBudgetMs: 90000,
    formerImplicitAssertionMs: 5000,
    paintEnabledWithinFormerDefault: "not established",
  });
  expect(timing.waitDurationMs).toBe(8000);
  expect(timing.paintEnabledElapsedMs).toBe(8000);
  expect(timing.historicalColdStart).toMatchObject({
    runId: 38136396806,
    commit: "6ff2c1c822c2eada5a64a1080da255e4b3b32112",
    outcome: "failed",
    timeoutMs: 5000,
    attempts: 8,
  });
});
it.each([
  "disabled paint",
  "missing canvas",
  "loading overlay",
  "render error",
])(
  "rejects %s without widening the established stage deadline",
  async (kind) => {
    const f = fixture();
    if (kind !== "disabled paint") ready();
    if (kind === "missing canvas") document.querySelector("canvas")!.remove();
    if (kind === "loading overlay")
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="scene-loading"></div>',
      );
    if (kind === "render error")
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div class="render-error"></div>',
      );
    const p = waitForVehicleInitialization(page, f.info, 0);
    const rejected = expect(p).rejects.toThrow(/timed out/);
    const budget = kind === "disabled paint" ? 90000 : 5000;
    await vi.advanceTimersByTimeAsync(budget);
    await rejected;
    expect(f.attachments[0].value).toMatchObject({
      outcome: "failed",
      waitDurationMs: budget,
    });
    expect(host.calls.at(-1)?.timeout).toBe(budget);
    expect(f.budgets.at(-1)?.timeout).toBe(30_000 + budget);
  },
);
it("does not widen postconditions after the initial paint wait", async () => {
  const f = fixture();
  document.querySelector("canvas")!.remove();
  const p = waitForVehicleInitialization(page, f.info, 0);
  const rejected = expect(p).rejects.toThrow(/timed out/);
  setTimeout(ready, 80000);
  await vi.advanceTimersByTimeAsync(85000);
  await rejected;
  expect(host.calls).toEqual([
    { kind: "enabled", timeout: 90000 },
    { kind: "count 1", timeout: 5000 },
  ]);
  expect(f.attachments[0].value.waitDurationMs).toBe(85000);
});
it("does not mislabel late overlay removal as failure of the original paint-ready threshold", async () => {
  const f = fixture();
  (document.querySelector("button") as HTMLButtonElement).disabled = false;
  setTimeout(() => document.querySelector("canvas")?.remove(), 100);
  document.querySelector("canvas")!.remove();
  setTimeout(
    () =>
      document
        .querySelector(".scene-stage")!
        .insertAdjacentHTML("beforeend", "<canvas></canvas>"),
    4000,
  );
  setTimeout(() => document.querySelector(".scene-loading")?.remove(), 7000);
  const p = waitForVehicleInitialization(page, f.info, 0);
  await vi.advanceTimersByTimeAsync(7000);
  await p;
  expect(f.attachments[0].value).toMatchObject({
    outcome: "ready",
    paintEnabledElapsedMs: 0,
    waitDurationMs: 7000,
    paintEnabledWithinFormerDefault: "observed",
  });
});
it("retains the established 90 second initialization constant", () =>
  expect(VEHICLE_INITIALIZATION_TIMEOUT).toBe(90000));
it("adds only an initialization stage and leaves every existing navigation/action statement unchanged", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  // Frozen navigation contract at 6ff2c1c. Only the exact reviewed catalog
  // delta is restored first; the historical hash and initialization checks stay.
  const beforeHash =
    "43292f6f82c8d3b2a76e5bbc223923a94d7dfa4fc532a29893378b1778332b6c";
  const after = await readFile("e2e/experience.spec.ts", "utf8");
  const restored = restorePreCatalogNavigation(after)
    .replace(
      'import { waitForVehicleInitialization } from "./helpers/vehicle-initialization";\n',
      "",
    )
    .replace("  const vehicleEntryStarted = performance.now();\n", "")
    .replace(
      '  await test.step("Initialize the real 3D viewer", () =>\n    waitForVehicleInitialization(page, info, vehicleEntryStarted));\n',
      "",
    );
  expect(createHash("sha256").update(restored).digest("hex")).toBe(beforeHash);
  const helper = await readFile(
    "e2e/helpers/vehicle-initialization.ts",
    "utf8",
  );
  expect(helper.match(/timeout:/g)).toHaveLength(1);
  expect(after).not.toContain("setTimeout");
});

it("temporarily extends only initialization and preserves the original remaining non-startup budget", async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(29_000);
  expect(f.info.timeout).toBe(30_000);
  const p = waitForVehicleInitialization(page, f.info, 29_000);
  setTimeout(ready, 1000);
  await vi.advanceTimersByTimeAsync(1000);
  await p;
  expect(f.budgets).toEqual([
    { timeout: 120_000, at: 29_000 },
    { timeout: 31_000, at: 30_000 },
  ]);
  expect(f.info.timeout - performance.now()).toBe(1000);
  await vi.advanceTimersByTimeAsync(1001);
  expect(performance.now()).toBeGreaterThan(f.info.timeout);
});
it("credits actual slow initialization without granting its unused allowance to later actions", async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(20_000);
  const p = waitForVehicleInitialization(page, f.info, 20_000);
  setTimeout(ready, 80_000);
  await vi.advanceTimersByTimeAsync(80_000);
  await p;
  expect(f.budgets).toEqual([
    { timeout: 120_000, at: 20_000 },
    { timeout: 110_000, at: 100_000 },
  ]);
  expect(f.info.timeout - performance.now()).toBe(10_000);
});
