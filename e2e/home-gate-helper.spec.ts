import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { continueHomeBrowsing } from "./helpers/home-gate";

// Helper-contract fixtures only. No model, provider playback or application
// readiness is simulated as acceptance evidence for the production homepage.
async function gateFixture(page: Page, blockedClick = false) {
  await page.setContent(`<!doctype html>
    <style>
      dialog { width: 280px; padding: 40px; }
      button { min-height: 48px; }
    </style>
    <dialog class="home-loading-gate" data-state="loading">
      <button ${blockedClick ? "disabled" : ""}>Continue browsing</button>
    </dialog>
    <script>
      const gate = document.querySelector('dialog');
      gate.dataset.clicks = '0';
      gate.querySelector('button').onclick = () => {
        gate.dataset.clicks = String(Number(gate.dataset.clicks) + 1);
        gate.dataset.state = 'resolved';
        gate.close();
      };
      gate.showModal();
    </script>`);
}

test("a native Continue click resolves and closes the gate", async ({
  page,
}) => {
  await gateFixture(page);
  await continueHomeBrowsing(page);
  await expect(page.locator("dialog")).toHaveAttribute("data-clicks", "1");
  await expect(page.locator("dialog")).not.toBeVisible();
});

test("accepts only real resolution after the native click times out", async ({
  page,
}) => {
  await gateFixture(page, true);
  // A disabled fixture control guarantees that native actionability times out,
  // without introducing animation sampling races into the helper regression.
  // This fixture deliberately resolves after the unchanged 5s click deadline.
  // The production helper must wait on state, never sleep or force a click.
  await page.evaluate(() => {
    window.setTimeout(() => {
      const gate = document.querySelector("dialog")!;
      gate.dataset.state = "resolved";
      gate.close();
    }, 6500);
  });
  const started = Date.now();
  await continueHomeBrowsing(page);
  expect(Date.now() - started).toBeGreaterThanOrEqual(5000);
  await expect(page.locator("dialog")).toHaveAttribute("data-clicks", "0");
  await expect(page.locator("dialog")).toHaveAttribute(
    "data-state",
    "resolved",
  );
  await expect(page.locator("dialog")).not.toBeVisible();
});

test("an unresolved gate still rejects with the original native click failure", async ({
  page,
}) => {
  await gateFixture(page, true);
  await expect(continueHomeBrowsing(page)).rejects.toThrow(
    /Timeout 5000ms exceeded/,
  );
  await expect(page.locator("dialog")).toHaveAttribute("data-state", "loading");
  await expect(page.locator("dialog")).toHaveAttribute("data-clicks", "0");
  await expect(page.locator("dialog")).toBeVisible();
});

test("resolved state cannot pass while the modal remains visible", async ({
  page,
}) => {
  await gateFixture(page);
  await page.locator("dialog").evaluate((gate) => {
    gate.setAttribute("data-state", "resolved");
  });
  await expect(continueHomeBrowsing(page)).rejects.toThrow(/toBeVisible/);
  await expect(page.locator("dialog")).toHaveAttribute("data-clicks", "0");
  await expect(page.locator("dialog")).toBeVisible();
});
