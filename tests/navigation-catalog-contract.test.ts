import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { restorePreCatalogNavigation } from "./helpers/navigation-catalog-contract";

const historical = readFileSync(
  "tests/fixtures/navigation-experience-before-formula-e.txt",
  "utf8",
);
const reviewed = readFileSync("e2e/experience.spec.ts", "utf8");

it("reverses exactly the reviewed catalog delta to the unchanged historical navigation fixture", () => {
  expect(restorePreCatalogNavigation(reviewed)).toBe(historical);
});

// A mutation must be rejected either by an exact reviewed-hunk check or by the
// unchanged historical contract. Catalog normalization must not swallow actions.
function preservesHistoricalNavigation(source: string): boolean {
  try {
    return restorePreCatalogNavigation(source) === historical;
  } catch {
    return false;
  }
}

it.each([
  [
    "changed original destination",
    '  await page.goto("/");',
    '  await page.goto("/models");',
  ],
  [
    "removed original navigation click",
    '  await page.getByRole("link", { name: "Back to models" }).click();\n',
    "",
  ],
  [
    "weakened original assertion",
    "  expect(errors).toEqual([]);",
    "  expect(errors).toBeDefined();",
  ],
  [
    "changed catalog route",
    '  await page.goto("/configurator/formula-e");',
    '  await page.goto("/configurator/nismo");',
  ],
  [
    "weakened catalog paint-disabled assertion",
    '    page.getByRole("button", { name: "Pearl White", exact: true }),\n  ).toBeDisabled();',
    '    page.getByRole("button", { name: "Pearl White", exact: true }),\n  ).toBeVisible();',
  ],
  [
    "changed catalog heading",
    '    page.getByRole("heading", { name: "Nissan e-4ORCE 05" }),',
    '    page.getByRole("heading", { name: "Unexpected vehicle" }),',
  ],
  [
    "changed reduced-motion action",
    'name: "Switch model", exact: true',
    'name: "Model detail", exact: true',
  ],
  [
    "removed reduced-motion setting",
    '  await page.emulateMedia({ reducedMotion: "reduce" });\n',
    "",
  ],
  [
    "removed catalog switch click",
    '      name: "Formula E Electric racing, a different discipline.",\n    })\n    .click();',
    '      name: "Formula E Electric racing, a different discipline.",\n    });',
  ],
  [
    "weakened retired-route URL assertion",
    "  await expect(page).toHaveURL(/\\/configurator\\/gt500$/);",
    "  await expect(page).toHaveURL(/configurator/);",
  ],
  [
    "removed retired-route navigation click",
    '  await page.getByRole("link", { name: /Explore the collection/ }).click();\n',
    "",
  ],
  [
    "extra action inside retired-route test",
    "  await expect(page).toHaveURL(/\\/configurator\\/gt500$/);",
    '  await expect(page).toHaveURL(/\\/configurator\\/gt500$/);\n  await page.goto("/configurator/premium");',
  ],
])(
  "rejects %s rather than hiding it as a catalog substitution",
  (_name, before, after) => {
    expect(reviewed).toContain(before);
    const changed = reviewed.replace(before, after);
    expect(changed).not.toBe(reviewed);
    expect(preservesHistoricalNavigation(changed)).toBe(false);
  },
);

it("rejects unreviewed appended navigation", () => {
  expect(
    preservesHistoricalNavigation(
      reviewed +
        '\ntest("unreviewed", async ({ page }) => { await page.goto("/"); });\n',
    ),
  ).toBe(false);
});

it("rejects duplicate reviewed substitutions", () => {
  expect(
    preservesHistoricalNavigation(
      reviewed +
        '\nconst variants = ["premium", "nismo", "tspec", "gtr50", "gt3", "formula-e"];\n',
    ),
  ).toBe(false);
});
