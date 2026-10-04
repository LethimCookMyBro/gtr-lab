import { continueHomeWithout3D } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";

test("menu hover and keyboard focus share restrained movement, close reverses the links", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeWithout3D(page);
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
  await continueHomeWithout3D(page);
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
  await continueHomeWithout3D(page);
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

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`footer rows share a traveling underline and arrow cue for hover and keyboard at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await continueHomeWithout3D(page);
    const footer = page.locator(".home-footer");
    const road = footer.getByRole("navigation", { name: "Road models" });
    const link = road.getByRole("link", { name: "Premium", exact: true });
    await link.scrollIntoViewIfNeeded();
    const initial = await link.boundingBox();
    const column = await road.boundingBox();
    expect(initial!.width).toBeCloseTo(column!.width, 0);
    expect(initial!.height).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);

    const feedback = () =>
      link.evaluate((el) => {
        const underline = getComputedStyle(el, "::after");
        const arrow = el.querySelector("svg")!;
        const motion = new DOMMatrixReadOnly(getComputedStyle(arrow).transform);
        return {
          underlineScale: new DOMMatrixReadOnly(underline.transform).m11,
          underlineColor: underline.backgroundColor,
          arrowX: motion.m41,
          arrowY: motion.m42,
        };
      });

    await link.hover();
    await expect
      .poll(async () => (await feedback()).underlineScale)
      .toBeGreaterThan(0.99);
    await expect
      .poll(async () => (await feedback()).arrowX)
      .toBeGreaterThan(2.9);
    const hovered = await feedback();
    expect(hovered.arrowY).toBeLessThan(-2.9);
    expect(hovered.underlineColor).toBe("rgb(225, 40, 43)");
    const hoveredBounds = await link.boundingBox();
    expect(hoveredBounds!.x).toBeCloseTo(initial!.x, 2);
    expect(hoveredBounds!.width).toBeCloseTo(initial!.width, 2);
    await footer.screenshot({ path: info.outputPath("footer-hover.png") });

    await page.mouse.move(1, 1);
    await footer.getByRole("link", { name: "Find your expression" }).focus();
    await page.keyboard.press("Tab");
    await expect(link).toBeFocused();
    expect(await link.evaluate((el) => el.matches(":focus-visible"))).toBe(
      true,
    );
    await expect
      .poll(async () => (await feedback()).underlineScale)
      .toBeGreaterThan(0.99);
    await expect
      .poll(async () => (await feedback()).arrowX)
      .toBeGreaterThan(2.9);
    expect((await feedback()).underlineColor).toBe(hovered.underlineColor);
    await footer.screenshot({ path: info.outputPath("footer-keyboard.png") });
  });
}

test("footer reduced motion preserves an immediate static underline and keyboard feedback", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await continueHomeWithout3D(page);
  const footer = page.locator(".home-footer");
  const link = footer.getByRole("link", { name: "Premium", exact: true });
  await link.scrollIntoViewIfNeeded();
  await link.hover();
  const readFeedback = () =>
    link.evaluate((el) => {
      const underline = getComputedStyle(el, "::after");
      const arrow = getComputedStyle(el.querySelector("svg")!);
      return {
        transform: arrow.transform,
        arrowTransition: arrow.transitionDuration,
        underlineTransform: underline.transform,
        underlineOpacity: underline.opacity,
        underlineTransition: underline.transitionDuration,
        underlineColor: underline.backgroundColor,
      };
    });
  const expected = {
    transform: "none",
    arrowTransition: "0s",
    underlineTransform: "none",
    underlineOpacity: "1",
    underlineTransition: "0s",
    underlineColor: "rgb(225, 40, 43)",
  };
  expect(await readFeedback()).toEqual(expected);
  await page.mouse.move(1, 1);
  await footer.getByRole("link", { name: "Find your expression" }).focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  expect(await readFeedback()).toEqual(expected);
  await footer.screenshot({
    path: info.outputPath("footer-reduced-motion.png"),
  });
});
