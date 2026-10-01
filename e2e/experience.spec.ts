import { test, expect } from "@playwright/test";
const variants = ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"];
test("homepage to models to details and back", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/GT-R LAB/);
  await expect(
    page.getByRole("heading", { name: "Engineered to defy." }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    path: info.outputPath("homepage.png"),
    fullPage: false,
  });
  await page
    .getByRole("link", { name: "Explore the models", exact: true })
    .click();
  await expect(page).toHaveURL(/\/models$/);
  await expect(
    page.getByRole("heading", { name: "Choose your expression." }),
  ).toBeVisible();
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    path: info.outputPath("models.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("link", { name: "Explore GT-R Premium", exact: true })
    .click();
  await expect(page).toHaveURL(/\/configurator\/premium$/);
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    animations: "disabled",
    scale: "css",
    path: info.outputPath("configurator.png"),
  });
  await page.getByRole("button", { name: "Model detail", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2024 US specification");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "Back to models" }).click();
  await expect(page).toHaveURL(/\/models$/);
  expect(errors).toEqual([]);
});
for (const id of variants) {
  test(`${id} detail route fits without horizontal overflow`, async ({
    page,
  }, info) => {
    await page.goto("/configurator/" + id);
    await expect(page.locator("h1")).toBeVisible();
    await page
      .getByRole("button", { name: "Model detail", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    if (id === "gtr50") {
      const details = page.getByRole("dialog");
      await expect(
        details.getByText("2018 prototype specification"),
      ).toBeVisible();
      await expect(details.getByText("Estimated power")).toBeVisible();
      await expect(details.getByText("Estimated torque")).toBeVisible();
      await expect(details).toContainText("One-off anniversary prototype");
    }
    await page.screenshot({
      animations: "disabled",
      scale: "css",
      path: info.outputPath(id + "-details.png"),
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close panel", exact: true })
      .click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
  });
}
test("missing assets remain visibly honest and controls are disabled", async ({
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
    page.getByRole("button", { name: "Pearl White", exact: true }),
  ).toBeDisabled();
  await pending.click();
  await expect(page.getByRole("dialog")).toContainText(
    "photograph, not an interactive render",
  );
});
test("reduced motion preserves navigation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/configurator/premium");
  await expect(
    page.getByRole("button", { name: "Rotate", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Switch model", exact: true }).click();
  await page
    .getByRole("button", { name: "GT500 Motorsport without compromise." })
    .click();
  await expect(
    page.getByRole("heading", { name: "GT-R NISMO GT500" }),
  ).toBeVisible();
});

test("sound preference survives reload and can be turned off", async ({
  page,
}) => {
  await page.goto("/configurator/nismo");
  await page
    .getByRole("button", { name: "Turn sound on", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Turn sound off", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gtr-lab:sound")))
    .toBe("on");
  await page.reload();
  await page
    .getByRole("button", { name: "Turn sound off", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Turn sound on", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("gtr-lab:sound")))
    .toBe("off");
});

test("detail sheet reaches its sources and traps keyboard focus", async ({
  page,
}) => {
  await page.goto("/configurator/nismo");
  const trigger = page.getByRole("button", {
    name: "Model detail",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const source = dialog
    .getByRole("link", { name: /Manufacturer source/ })
    .last();
  await source.scrollIntoViewIfNeeded();
  await expect(source).toBeVisible();
  await source.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close panel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
