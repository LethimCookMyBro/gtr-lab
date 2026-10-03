import { continueHomeWithout3D } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";

test("opening keeps authentic identity visible until real scene readiness or explicit skip", async ({
  page,
}, info) => {
  let release: Route | undefined;
  await page.route("https://media.flixel.com/**", (route) => {
    release = route;
  });
  await page.route("**/models/ciasny-r35.glb", () => {});
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const opening = page.locator(".home-opening");
  await expect(opening).toHaveAttribute("data-state", "loading");
  await expect(opening.getByRole("img", { name: "Nissan GT-R" })).toBeVisible();
  await expect(
    opening.getByRole("button", { name: "Continue without 3D" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const identity = await opening.locator("img").evaluateAll(async (nodes) => {
    await Promise.all(nodes.map((node) => (node as HTMLImageElement).decode()));
    return nodes.map((node) => {
      const image = node as HTMLImageElement;
      const box = image.getBoundingClientRect();
      return {
        src: image.getAttribute("src"),
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        width: box.width,
        height: box.height,
      };
    });
  });
  expect(identity.map((image) => image.src)).toEqual([
    "/brand/nissan-2001.svg",
    "/brand/gtr-stacked-badge.png",
  ]);
  for (const image of identity)
    expect(image.width / image.height).toBeCloseTo(
      image.naturalWidth / image.naturalHeight,
      3,
    );
  expect(identity[1].width).toBeGreaterThanOrEqual(220);
  expect(identity[1].width).toBeLessThanOrEqual(280);
  expect(identity[0].width).toBeLessThan(identity[1].width / 3);
  expect(
    await page.evaluate(() =>
      document.fonts.check('700 32px "Barlow Condensed"'),
    ),
  ).toBe(true);
  await expect(
    opening.getByRole("button", { name: "Continue without 3D" }),
  ).toBeInViewport({ ratio: 1 });
  await info.attach("authentic-brand-geometry", {
    body: JSON.stringify(identity, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: info.outputPath("opening-loader.png"),
    scale: "css",
  });
  await expect.poll(() => Boolean(release)).toBe(true);
  // This is deliberately an iframe document, not a video or playback simulation.
  await release!.fulfill({
    contentType: "text/html",
    body: "<html><body>Hosted document loaded; playback not tested.</body></html>",
  });
  // Film document readiness alone must never claim the rear model is ready.
  await expect(opening).toHaveAttribute("data-state", "loading");
  await continueHomeWithout3D(page);
  await expect(page.locator(".home-signature-runway")).toHaveAttribute(
    "data-scene-state",
    "skipped",
  );
  await expect(page.locator(".home-film--hero")).toHaveAttribute(
    "data-film-state",
    "embedded",
  );
  await expect(
    page.getByRole("button", { name: "Continue without 3D" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Stop opening film" }).click();
  await expect(
    page.locator(".home-film--hero .home-film-backup"),
  ).toBeVisible();
});

test("six model cards preserve truthful actions and fit the viewport", async ({
  page,
  isMobile,
}, info) => {
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Document only</body></html>",
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await continueHomeWithout3D(page);
  const lineup = page.getByRole("navigation", {
    name: "Explore all six models",
  });
  await expect(lineup.getByRole("link")).toHaveCount(6);
  await expect(lineup.getByText("View in 3D", { exact: true })).toHaveCount(1);
  await expect(lineup.getByText("Explore model", { exact: true })).toHaveCount(
    5,
  );
  for (const id of ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"]) {
    await expect(lineup.locator(`a[href="/configurator/${id}"]`)).toHaveCount(
      1,
    );
  }
  const premium = lineup.getByRole("link", {
    name: "Explore Premium",
    exact: true,
  });
  await premium.scrollIntoViewIfNeeded();
  await expect(premium.getByText("Artist-built R35")).toBeVisible();
  if (!isMobile) {
    const bounds = (await premium.boundingBox())!;
    await premium.hover({
      position: { x: bounds.width * 0.7, y: bounds.height * 0.33 },
    });
    await expect(premium).toHaveAttribute("data-pointer-active", "true");
    const cue = premium.locator(".home-invitation-cursor");
    await expect(cue).toHaveCSS("opacity", "1");
    await expect(premium.locator("img")).not.toHaveCSS("transform", "none");
    const firstX = await premium.evaluate((el) =>
      (el as HTMLElement).style.getPropertyValue("--card-pointer-x"),
    );
    await premium.hover({
      position: { x: bounds.width * 0.3, y: bounds.height * 0.33 },
    });
    // Same-page WebGL/trace capture can delay a locator read in CI even
    // after the pointer style has updated. Keep checking actual pointer movement.
    await expect
      .poll(
        () =>
          premium.evaluate((el) =>
            (el as HTMLElement).style.getPropertyValue("--card-pointer-x"),
          ),
        { timeout: 15_000 },
      )
      .not.toBe(firstX);
    await page.screenshot({
      path: info.outputPath("cards-pointer.png"),
      scale: "css",
    });
    await page.mouse.move(0, 0);
    await expect(premium).not.toHaveAttribute("data-pointer-active", "true");
    await premium.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(premium).toBeFocused();
    await expect(cue).toHaveCSS("opacity", "1");
    await page.screenshot({
      path: info.outputPath("cards-keyboard.png"),
      scale: "css",
    });
  } else {
    await expect(premium.locator(".home-invitation-cursor")).toHaveCSS(
      "display",
      "none",
    );
    await page.screenshot({
      path: info.outputPath("cards-mobile.png"),
      scale: "css",
    });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await premium.click();
  await expect(page).toHaveURL(/\/configurator\/premium$/);
});

test("reduced motion keeps the gate static and preserves model card actions", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await continueHomeWithout3D(page);
  await expect(page.locator(".home-opening")).toHaveAttribute(
    "data-state",
    "resolved",
  );
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Play opening film" }),
  ).toBeVisible();
  const premium = page.getByRole("link", {
    name: "Explore Premium",
    exact: true,
  });
  await premium.scrollIntoViewIfNeeded();
  await premium.hover();
  await expect(premium).not.toHaveAttribute("data-pointer-active", "true");
  await expect(premium.locator(".home-invitation-cursor")).toHaveCSS(
    "display",
    "none",
  );
  await expect(premium.locator("img")).toHaveCSS("transform", "none");
  await expect(premium.getByText("View in 3D", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("cards-reduced-motion.png"),
    scale: "css",
  });
});

test("model card borders stay inside their grid tracks without overlapping", async ({
  page,
}, info) => {
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body>Document only</body></html>",
    }),
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await continueHomeWithout3D(page);
  const lineup = page.getByRole("navigation", {
    name: "Explore all six models",
  });
  await lineup.locator("a").first().scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready);
  await lineup.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map((image) => (image as HTMLImageElement).decode()),
    );
  });
  // Freeze only reveal translation so this measures the layout box, not scroll progress.
  await page.addStyleTag({
    content: ".home-model-invitation { --item-reveal: 1 !important; }",
  });
  const geometry = await lineup.evaluate((nav) => {
    const style = getComputedStyle(nav);
    const box = nav.getBoundingClientRect();
    const left = box.left + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.paddingRight);
    const tracks = style.gridTemplateColumns.split(" ").map(parseFloat);
    const cards = [
      ...nav.querySelectorAll<HTMLElement>(".home-model-invitation"),
    ].map((card) => {
      const rect = card.getBoundingClientRect();
      const text = [
        ...card.querySelectorAll<HTMLElement>(
          ".home-invitation-copy, .home-invitation-cta, .home-invitation-meta",
        ),
      ].map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          text: element.textContent,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      });
      return {
        label: card.getAttribute("aria-label"),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        text,
      };
    });
    return {
      left,
      right,
      tracks,
      cards,
      documentWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  await info.attach("card-grid-geometry", {
    body: JSON.stringify(geometry, null, 2),
    contentType: "application/json",
  });
  await page.screenshot({
    path: info.outputPath("cards-grid-bounds.png"),
    scale: "css",
  });
  for (const [index, card] of geometry.cards.entries()) {
    expect
      .soft(card.width, `${card.label} fits its grid track`)
      .toBeLessThanOrEqual(geometry.tracks[index % geometry.tracks.length] + 1);
    expect
      .soft(card.left, `${card.label} left border`)
      .toBeGreaterThanOrEqual(geometry.left - 1);
    expect
      .soft(card.right, `${card.label} right border`)
      .toBeLessThanOrEqual(geometry.right + 1);
    for (const text of card.text) {
      expect
        .soft(text.left, `${card.label}: ${text.text} left`)
        .toBeGreaterThanOrEqual(card.left);
      expect
        .soft(text.right, `${card.label}: ${text.text} right`)
        .toBeLessThanOrEqual(card.right);
      expect
        .soft(text.top, `${card.label}: ${text.text} top`)
        .toBeGreaterThanOrEqual(card.top);
      expect
        .soft(text.bottom, `${card.label}: ${text.text} bottom`)
        .toBeLessThanOrEqual(card.bottom);
      expect
        .soft(text.scrollWidth, `${card.label}: ${text.text} text overflow`)
        .toBeLessThanOrEqual(text.clientWidth + 1);
    }
    for (const other of geometry.cards.slice(index + 1)) {
      const overlapX =
        Math.min(card.right, other.right) - Math.max(card.left, other.left);
      const overlapY =
        Math.min(card.bottom, other.bottom) - Math.max(card.top, other.top);
      expect
        .soft(
          overlapX > 1 && overlapY > 1,
          `${card.label} overlaps ${other.label}`,
        )
        .toBe(false);
    }
  }
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.documentWidth + 1);
});
