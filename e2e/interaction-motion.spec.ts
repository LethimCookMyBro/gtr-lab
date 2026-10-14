import { continueHomeBrowsing } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

declare global {
  interface Window {
    __drawerRotationMotion: {
      entries: Set<Animation>;
      exits: Set<Animation>;
      starts: string[];
    };
  }
}

async function observeDrawerMotion(page: Page) {
  await page.addInitScript(() => {
    window.__drawerRotationMotion = {
      entries: new Set(),
      exits: new Set(),
      starts: [],
    };
    document.addEventListener("animationstart", (event) => {
      const element = event.target;
      if (!(element instanceof Element) || !element.matches(".drawer")) return;
      const state = window.__drawerRotationMotion;
      state.starts.push(event.animationName);
      for (const animation of element.getAnimations()) {
        if (!(animation instanceof CSSAnimation)) continue;
        const target =
          animation.animationName === "drawer-in" ? state.entries : state.exits;
        target.add(animation);
      }
    });
  });
}

async function drawerMotion(dialog: Locator) {
  return dialog.evaluate((element) => {
    // Reading computed style flushes the resize. Keep real Animation identities,
    // including a replacement that exists before its animationstart is delivered.
    const style = getComputedStyle(element);
    const animations = element.getAnimations();
    const state = window.__drawerRotationMotion;
    for (const animation of animations) {
      if (!(animation instanceof CSSAnimation)) continue;
      const target =
        element.getAttribute("data-phase") === "open"
          ? state.entries
          : state.exits;
      target.add(animation);
    }
    const bounds = element.getBoundingClientRect();
    return {
      entries: state.entries.size,
      exits: state.exits.size,
      starts: [...state.starts],
      running: animations.filter(
        (animation) => animation.playState === "running",
      ).length,
      name: style.animationName,
      duration: style.animationDuration,
      easing: style.animationTimingFunction,
      opacity: style.opacity,
      bounds: {
        x: bounds.x,
        y: bounds.y,
        right: bounds.right,
        bottom: bounds.bottom,
      },
    };
  });
}

test.describe("drawer orientation without animation replay", () => {
  test.use({ hasTouch: true, isMobile: true, actionTimeout: 5_000 });
  for (const initial of [
    { width: 320, height: 740 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 820, height: 1180 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`settled entry and interrupted exit retain their instances at ${initial.width}px`, async ({
      page,
    }, info) => {
      test.setTimeout(30_000);
      await page.setViewportSize(initial);
      await observeDrawerMotion(page);
      // Real reference route isolates drawer behavior from Premium renderer cost.
      // These are Chromium touch-emulation checks, not physical-device evidence.
      await page.goto("/configurator/nismo");
      const trigger = page.getByRole("button", {
        name: "Model detail",
        exact: true,
      });
      await trigger.focus();
      await trigger.tap();
      const dialog = page.getByRole("dialog");
      const deadline = performance.now() + 5_000;
      const remaining = () => {
        const value = deadline - performance.now();
        if (value <= 0)
          throw new Error("Original five-second drawer deadline exceeded");
        return value;
      };
      await expect(dialog).toHaveAttribute("data-phase", "open", {
        timeout: remaining(),
      });
      await expect
        .poll(async () => (await drawerMotion(dialog)).running, {
          timeout: remaining(),
        })
        .toBe(0);
      const opened = await drawerMotion(dialog);
      expect(opened.entries).toBe(1);
      expect(opened.starts).toEqual(["drawer-in"]);
      expect(opened.opacity).toBe("1");
      const rotated = { width: initial.height, height: initial.width };
      const observations = [{ viewport: initial, ...opened }];
      for (const viewport of [rotated, initial]) {
        await page.setViewportSize(viewport);
        const resized = await drawerMotion(dialog);
        observations.push({ viewport, ...resized });
        // No settling wait here: a new entry instance or replay is the defect.
        expect(resized.entries).toBe(1);
        expect(resized.running).toBe(0);
        expect(resized.starts).toEqual(["drawer-in"]);
        expect(resized.name).toBe("drawer-in");
        expect(resized.duration).toBe("0.3s");
        expect(resized.easing).toBe("cubic-bezier(0.2, 0.7, 0.2, 1)");
        expect(resized.opacity).toBe("1");
        expect(resized.bounds.x).toBeGreaterThanOrEqual(-1);
        expect(resized.bounds.y).toBeGreaterThanOrEqual(-1);
        expect(resized.bounds.right).toBeLessThanOrEqual(viewport.width + 1);
        expect(resized.bounds.bottom).toBeLessThanOrEqual(viewport.height + 1);
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveAttribute("data-phase", "closing");
      const closing = await drawerMotion(dialog);
      expect(closing.exits).toBe(1);
      expect(closing.name).toBe("drawer-out");
      expect(closing.duration).toBe("0.28s");
      await page.setViewportSize(rotated);
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      const closed = await page.evaluate(() => ({
        entries: window.__drawerRotationMotion.entries.size,
        exits: window.__drawerRotationMotion.exits.size,
        starts: window.__drawerRotationMotion.starts,
        inert: document.querySelectorAll("[inert]").length,
        bodyStyle: document.body.getAttribute("style"),
        htmlStyle: document.documentElement.getAttribute("style"),
      }));
      expect(closed.entries).toBe(1);
      expect(closed.exits).toBe(1);
      expect(closed.starts).toEqual(["drawer-in", "drawer-out"]);
      expect(closed.inert).toBe(0);
      expect(closed.bodyStyle).toBeNull();
      expect(closed.htmlStyle).toBeNull();
      // A real second opening must still animate after the previous one unmounts.
      await trigger.tap();
      await expect
        .poll(async () => (await drawerMotion(dialog)).entries, {
          timeout: 5_000,
        })
        .toBe(2);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await info.attach("drawer-orientation-instances", {
        contentType: "application/json",
        body: Buffer.from(
          JSON.stringify(
            {
              physicalDevice: false,
              route: "/configurator/nismo",
              initial,
              observations,
              closing,
              closed,
            },
            null,
            2,
          ),
        ),
      });
    });
  }
});

test("menu hover and keyboard focus share restrained movement, close reverses the links", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeBrowsing(page);
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
  const detail = page.getByRole("button", { name: "Model detail", exact: true });
  await detail.click();
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
  await expect(detail).toBeFocused();
  for (const name of ["Switch model", "Model detail", "Switch model"]) {
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
  await continueHomeBrowsing(page);
  const card = page.getByRole("link", {
    name: "Explore Premium: View in 3D",
    exact: true,
  });
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
  await continueHomeBrowsing(page);
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
  await page.getByRole("button", { name: "Model detail", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`footer rows share a traveling underline and arrow cue for hover and keyboard at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await continueHomeBrowsing(page);
    const footer = page.locator(".home-footer");
    const navigation = footer.getByRole("navigation", {
      name: "Footer navigation",
    });
    const link = navigation.getByRole("link", {
      name: "All models",
      exact: true,
    });
    await expect(footer.getByRole("link")).toHaveCount(4);
    await expect(
      footer.getByText(/independent digital exhibition/i),
    ).toHaveCount(0);
    await link.scrollIntoViewIfNeeded();
    const initial = await link.boundingBox();
    const column = await navigation.boundingBox();
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
    await footer.getByRole("link", { name: "GT-R LAB home" }).focus();
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
  await continueHomeBrowsing(page);
  const footer = page.locator(".home-footer");
  const link = footer.getByRole("link", { name: "All models", exact: true });
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
  await footer.getByRole("link", { name: "GT-R LAB home" }).focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  expect(await readFeedback()).toEqual(expected);
  await footer.screenshot({
    path: info.outputPath("footer-reduced-motion.png"),
  });
});
