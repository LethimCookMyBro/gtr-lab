import { expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

// The real-vehicle suite has used this startup bound since 6025ad5 (2026-10-01).
// It is a software-renderer correctness allowance, not a loading-speed target.
export const VEHICLE_INITIALIZATION_TIMEOUT = 90_000;

export async function waitForVehicleInitialization(
  page: Page,
  info: TestInfo,
  entryStarted: number,
) {
  const originalTimeout = info.timeout;
  const started = performance.now();
  // Keep pre-entry operations on the original deadline. Borrow only during
  // initialization, then credit its actual elapsed time, not unused allowance.
  info.setTimeout(originalTimeout + VEHICLE_INITIALIZATION_TIMEOUT);
  let paintEnabledElapsedMs: number | null = null;
  let outcome: "ready" | "failed" = "failed";
  try {
    // Match vehicle.spec.ts ready(): only startup gets the longer wait. Its
    // canvas/loading/error postconditions retain the normal assertion deadline.
    await expect(
      page.getByRole("button", { name: "Ultimate Silver", exact: true }),
    ).toBeEnabled({ timeout: VEHICLE_INITIALIZATION_TIMEOUT });
    paintEnabledElapsedMs = performance.now() - started;
    await expect(page.locator(".scene-stage canvas")).toHaveCount(1);
    await expect(page.locator(".scene-loading")).toHaveCount(0);
    await expect(page.locator(".render-error")).toHaveCount(0);
    outcome = "ready";
  } finally {
    const waitDurationMs = performance.now() - started;
    info.setTimeout(originalTimeout + waitDurationMs);
    await info.attach("vehicle-initialization-timing", {
      contentType: "application/json",
      body: Buffer.from(
        JSON.stringify(
          {
            outcome,
            initializationBudgetMs: VEHICLE_INITIALIZATION_TIMEOUT,
            waitDurationMs,
            entryDurationMs: performance.now() - entryStarted,
            paintEnabledElapsedMs,
            formerImplicitAssertionMs: 5_000,
            paintEnabledWithinFormerDefault:
              paintEnabledElapsedMs !== null && paintEnabledElapsedMs <= 5_000
                ? "observed"
                : "not established",
            historicalColdStart: {
              commit: "6ff2c1c822c2eada5a64a1080da255e4b3b32112",
              runId: 38136396806,
              artifactId: 11701931090,
              outcome: "failed",
              timeoutMs: 5_000,
              attempts: 8,
              evidence:
                "https://github.com/LethimCookMyBro/gtr-lab/actions/runs/38136396806/artifacts/11701931090",
            },
            scope:
              "Application readiness observation; not native-frame timing or a fast-start claim. Subsequent interaction assertions retain their original deadlines.",
          },
          null,
          2,
        ),
      ),
    });
  }
}
