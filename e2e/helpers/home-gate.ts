import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Layout/interaction suites release the opening without cancelling rear preparation.
 * Actual model loading and first-render acceptance live in home-loading.spec.ts.
 * If readiness wins the click race, the resolved gate is the only accepted result.
 */
export async function continueHomeBrowsing(page: Page) {
  const gate = page.locator(".home-loading-gate");
  await expect(gate).toBeAttached();
  let clickFailure: unknown;
  if ((await gate.getAttribute("data-state")) !== "resolved") {
    try {
      await gate
        .getByRole("button", { name: "Continue browsing", exact: true })
        .click({ timeout: 5000 });
    } catch (error) {
      clickFailure = error;
    }
  }
  try {
    // Decoded-poster readiness reaches the parent gate in a later React effect. A
    // one-shot read here can reject the frame immediately before resolution.
    // Use the existing bounded postcondition, preserving native click failure
    // when the gate genuinely never resolves.
    await expect(gate).toHaveAttribute("data-state", "resolved");
  } catch (error) {
    throw clickFailure ?? error;
  }
  await expect(gate).not.toBeVisible();
}

/** @deprecated Source-pinned contract compatibility only. Use continueHomeBrowsing
 * for current suites. This alias releases entry and does not skip rear preparation.
 */
export const continueHomeWithout3D = continueHomeBrowsing;
