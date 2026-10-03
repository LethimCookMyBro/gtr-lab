import { test, expect } from "@playwright/test";
import type { Route } from "@playwright/test";

test("opening resolves on document readiness without making a playback claim", async ({
  page,
}, info) => {
  let release: Route | undefined;
  await page.route("https://media.flixel.com/**", (route) => {
    release = route;
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const opening = page.locator(".home-opening");
  await expect(opening).toHaveAttribute("data-state", "loading");
  await expect(opening.getByRole("img", { name: "Nissan GT-R" })).toBeVisible();
  await expect(
    opening.getByRole("button", { name: "Continue to page" }),
  ).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
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
  await expect(opening).toHaveAttribute("data-state", "resolved");
  await expect(opening).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".home-film--hero")).toHaveAttribute(
    "data-film-state",
    "embedded",
  );
  await expect(
    page.getByRole("button", { name: "Continue to page" }),
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
    await expect
      .poll(() =>
        premium.evaluate((el) =>
          (el as HTMLElement).style.getPropertyValue("--card-pointer-x"),
        ),
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

test("reduced motion bypasses the opening and pointer effects without losing actions", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/", { waitUntil: "domcontentloaded" });
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
