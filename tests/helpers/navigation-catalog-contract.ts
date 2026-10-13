// These five exact hunks are the complete e2e/experience.spec.ts delta in
// catalog commit 047bd284ac06ad2e42b693c42d09722e85337c04. Restore only these
// reviewed bytes before checking the unchanged 6ff2c1c navigation hash.
// Context is intentional: altered assertions/actions inside a hunk must fail,
// and every hunk must occur exactly once. Never strip tests by name or regex.
const reviewedCatalogChanges = [
  {
    name: "catalog hunk 1",
    before: String.raw`import { continueHomeWithout3D } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";
import { waitForVehicleInitialization } from "./helpers/vehicle-initialization";
const variants = ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"];
test("homepage to models to details and back", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
`,
    after: String.raw`import { continueHomeWithout3D } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";
import { waitForVehicleInitialization } from "./helpers/vehicle-initialization";
const variants = ["premium", "nismo", "tspec", "gtr50", "gt3", "formula-e"];
test("homepage to models to details and back", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
`,
  },
  {
    name: "catalog hunk 2",
    before: String.raw`test("missing assets remain visibly honest and controls are disabled", async ({
  page,
}) => {
  await page.goto("/configurator/gt500");
  await expect(
    page.getByRole("heading", { name: "GT-R NISMO GT500" }),
  ).toBeVisible();
  const pending = page.getByRole("button", {
    name: "Photo reference · 3D asset pending",
  });
  await expect(pending).toBeVisible();
  await expect(
`,
    after: String.raw`test("missing assets remain visibly honest and controls are disabled", async ({
  page,
}) => {
  await page.goto("/configurator/formula-e");
  await expect(
    page.getByRole("heading", { name: "Nissan e-4ORCE 05" }),
  ).toBeVisible();
  const pending = page.getByRole("button", {
    name: "Specifications only · 3D asset pending",
  });
  await expect(pending).toBeVisible();
  await expect(
`,
  },
  {
    name: "catalog hunk 3",
    before: String.raw`  ).toBeDisabled();
  await pending.click();
  await expect(page.getByRole("dialog")).toContainText(
    "photograph, not an interactive render",
  );
});
test("reduced motion preserves navigation", async ({ page }) => {
`,
    after: String.raw`  ).toBeDisabled();
  await pending.click();
  await expect(page.getByRole("dialog")).toContainText(
    "No rights-cleared reference image",
  );
});
test("reduced motion preserves navigation", async ({ page }) => {
`,
  },
  {
    name: "catalog hunk 4",
    before: String.raw`  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  await page
    .getByRole("button", { name: "GT500 Motorsport without compromise." })
    .click();
  await expect(
    page.getByRole("heading", { name: "GT-R NISMO GT500" }),
  ).toBeVisible();
});

`,
    after: String.raw`  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Formula E Electric racing, a different discipline.",
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nissan e-4ORCE 05" }),
  ).toBeVisible();
});

`,
  },
  {
    name: "catalog hunk 5",
    before: String.raw`  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
`,
    after: String.raw`  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("retired GT500 route explains the correction without a silent redirect", async ({
  page,
}) => {
  await page.goto("/configurator/gt500");
  await expect(
    page.getByRole("heading", {
      name: "GT500 is no longer in this collection.",
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/configurator\/gt500$/);
  await page.getByRole("link", { name: /Explore the collection/ }).click();
  await expect(page).toHaveURL(/\/models$/);
});
`,
  },
] as const;

export function restorePreCatalogNavigation(source: string): string {
  for (const { name, before, after } of reviewedCatalogChanges) {
    const occurrences = source.split(after).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `Expected exactly one reviewed ${name}; found ${occurrences}`,
      );
    }
    source = source.replace(after, before);
  }
  return source;
}
