import { test, expect } from "@playwright/test";

test("menu hover and keyboard focus share restrained movement, close reverses the links", async ({
  page,
}, info) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open menu", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Explore GT-R LAB" });
  const models = dialog.getByRole("link", { name: "Models", exact: true });
  await expect
    .poll(() => models.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.99);
  await models.hover();
  await expect
    .poll(() =>
      models
        .locator(":scope > span")
        .evaluate(
          (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
        ),
    )
    .toBeGreaterThan(5);
  await page.screenshot({ path: info.outputPath("menu-link-hover.png") });
  await page.mouse.move(1, 1);
  // Enter keyboard modality and traverse the actual close → brand → first-link order.
  await dialog.getByRole("button", { name: "Close menu" }).focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(models).toBeFocused();
  await expect
    .poll(() =>
      models
        .locator(":scope > span")
        .evaluate(
          (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41,
        ),
    )
    .toBeGreaterThan(5);
  const close = dialog.getByRole("button", { name: "Close menu" });
  await close.hover();
  await expect
    .poll(() =>
      close
        .locator("svg")
        .evaluate((el) =>
          Math.abs(new DOMMatrixReadOnly(getComputedStyle(el).transform).m12),
        ),
    )
    .toBeGreaterThan(0.9);
  await close.click();
  await expect(dialog).toHaveAttribute("data-phase", "closing");
  expect(
    await models.evaluate((el) => getComputedStyle(el).animationName),
  ).toContain("menu-link-out");
  await page.screenshot({ path: info.outputPath("menu-closing.png") });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("configurator drawer exits before unmounting and repeated panels remain usable", async ({
  page,
}, info) => {
  await page.goto("/configurator/nismo");
  const camera = page.getByRole("button", { name: "Camera", exact: true });
  await camera.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close panel", exact: true })
    .click();
  await expect(dialog).toHaveAttribute("data-phase", "closing");
  expect(
    await dialog.evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("drawer-out");
  await page.screenshot({
    path: info.outputPath("configurator-panel-exit.png"),
  });
  await expect(dialog).toHaveCount(0);
  await expect(camera).toBeFocused();
  for (const name of ["Environment", "Camera", "Model detail"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect(dialog).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});

test("model invitation hover stays subtle and preserves card layout", async ({
  page,
}, info) => {
  await page.goto("/");
  const card = page.getByRole("link", { name: "Explore Premium", exact: true });
  await card.scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  await card.hover();
  const picture = card.locator("img");
  await expect
    .poll(() =>
      picture.evaluate(
        (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11,
      ),
    )
    .toBeGreaterThan(1.02);
  const scale = await picture.evaluate(
    (el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11,
  );
  expect(scale).toBeLessThanOrEqual(1.04);
  const after = await card.boundingBox();
  expect(after!.width).toBeCloseTo(before!.width, 3);
  expect(after!.height).toBeCloseTo(before!.height, 3);
  await page.screenshot({ path: info.outputPath("model-card-hover.png") });
});

test("reduced motion removes hover transforms and dismisses immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Explore GT-R LAB" });
  const models = dialog.getByRole("link", { name: "Models", exact: true });
  await models.hover();
  expect(
    await models
      .locator(":scope > span")
      .evaluate((el) => getComputedStyle(el).transform),
  ).toBe("none");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(dialog).toHaveCount(0);
  await page.goto("/configurator/nismo");
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
