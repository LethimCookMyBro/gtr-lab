import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Layout/interaction suites explicitly take the user's non-3D path.
 * Actual model loading and first-render acceptance live in home-loading.spec.ts.
 * If readiness wins the click race, the resolved gate is the only accepted result.
 */
export async function continueHomeWithout3D(page: Page) {
  const gate = page.locator(".home-loading-gate");
  await expect(gate).toBeAttached();
  let clickFailure: unknown;
  if ((await gate.getAttribute("data-state")) !== "resolved") {
    try {
      await gate
        .getByRole("button", { name: "Continue without 3D", exact: true })
        .click({ timeout: 5000 });
    } catch (error) {
      clickFailure = error;
    }
  }
  try {
    // Scene readiness reaches the parent gate in a later React effect. A
    // one-shot read here can reject the frame immediately before resolution.
    // Use the existing bounded postcondition, preserving native click failure
    // when the gate genuinely never resolves.
    await expect(gate).toHaveAttribute("data-state", "resolved");
  } catch (error) {
    throw clickFailure ?? error;
  }
  await expect(gate).not.toBeVisible();
}
