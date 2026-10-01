import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

async function scrollProgress(page: Page, selector: string, progress: number) {
  await page.locator(selector).evaluate((element, p) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo({
      top:
        window.scrollY +
        rect.top +
        Math.max(0, rect.height - window.innerHeight) * p,
      behavior: "instant",
    });
  }, progress);
  await expect
    .poll(() =>
      page
        .locator(selector)
        .evaluate((element) =>
          Number((element as HTMLElement).style.getPropertyValue("--progress")),
        ),
    )
    .toBeCloseTo(progress, 1);
}

test("cinematic layout, real scroll geometry, menu and six destinations", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/GT-R LAB/);
  await expect(
    page.getByRole("heading", { name: "Engineered to defy." }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("01-home-hero.png"),
    scale: "css",
  });
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const menu = page.getByRole("dialog", { name: "Explore GT-R LAB" });
  await expect(menu).toBeVisible();
  await menu.getByRole("link", { name: "Credits & sources" }).focus();
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("button", { name: "Close menu" })).toBeFocused();
  await page.screenshot({
    path: info.outputPath("02-home-menu.png"),
    scale: "css",
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await scrollProgress(page, ".home-hero-runway", 0.7);
  expect(
    await page
      .locator(".home-hero-copy")
      .evaluate((element) => Number(getComputedStyle(element).opacity)),
  ).toBeLessThan(0.5);
  await page.locator(".home-editorial").evaluate((element) =>
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top + 160,
      behavior: "instant",
    }),
  );
  await page.screenshot({
    path: info.outputPath("03-home-editorial.png"),
    scale: "css",
  });
  if ((page.viewportSize()?.width || 0) > 700) {
    const detail = await page
      .locator(".home-editorial-image--detail")
      .boundingBox();
    const cockpit = await page
      .locator(".home-editorial-image--cockpit")
      .boundingBox();
    expect(cockpit!.x + cockpit!.width).toBeGreaterThan(detail!.x);
    expect(cockpit!.y).toBeLessThan(detail!.y + detail!.height);
  }
  await scrollProgress(page, ".home-expanding-runway", 0);
  const initial = await page.locator(".home-expanding-frame").boundingBox();
  await page.screenshot({
    path: info.outputPath("04-film-inset.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  const middle = await page.locator(".home-expanding-frame").boundingBox();
  await page.screenshot({
    path: info.outputPath("05-film-expanding.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-expanding-runway", 1);
  const expanded = await page.locator(".home-expanding-frame").boundingBox();
  expect(middle!.width).toBeGreaterThan(initial!.width);
  expect(expanded!.width).toBeGreaterThan(middle!.width);
  expect(expanded!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  expect(expanded!.height).toBeCloseTo(page.viewportSize()!.height, 0);
  await page.screenshot({
    path: info.outputPath("06-film-fullscreen.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-heritage-runway", 0.1);
  const copyBefore = await page.locator(".home-heritage-copy").boundingBox();
  const planeBefore = await page.locator(".home-heritage-origin").boundingBox();
  await scrollProgress(page, ".home-heritage-runway", 0.6);
  const copyAfter = await page.locator(".home-heritage-copy").boundingBox();
  const planeAfter = await page.locator(".home-heritage-origin").boundingBox();
  expect(copyAfter!.y).toBeCloseTo(copyBefore!.y, 0);
  expect(Math.abs(planeAfter!.y - planeBefore!.y)).toBeGreaterThan(25);
  await page.screenshot({
    path: info.outputPath("07-home-heritage.png"),
    scale: "css",
  });
  await page.getByRole("button", { name: "2007: R35 GT-R" }).click();
  await expect(
    page.getByRole("button", { name: "2007: R35 GT-R" }),
  ).toHaveAttribute("aria-current", "step");
  await expect
    .poll(() =>
      page
        .locator(".home-heritage-runway")
        .evaluate((element) =>
          Number((element as HTMLElement).style.getPropertyValue("--progress")),
        ),
    )
    .toBeGreaterThan(0.9);
  await page.locator(".home-invitations").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("08-home-invitations.png"),
    scale: "css",
  });
  for (const [id, name] of [
    ["premium", "Premium"],
    ["nismo", "NISMO"],
    ["tspec", "T-spec"],
    ["gtr50", "GT-R50"],
    ["gt3", "GT3"],
    ["gt500", "GT500"],
  ]) {
    await expect(
      page
        .getByRole("navigation", { name: "Explore all six models" })
        .getByRole("link", { name: `Explore ${name}`, exact: true }),
    ).toHaveAttribute("href", `/configurator/${id}`);
  }
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("09-home-footer.png"),
    scale: "css",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Back to top" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(3);
  expect(errors).toEqual([]);
});

test("reduced motion stays sequential and permits explicit film playback", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator(".cinematic-home")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  expect(
    await page
      .locator(".home-hero-sticky")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("relative");
  expect(
    await page
      .locator(".home-film--hero video")
      .evaluate((video) => (video as HTMLVideoElement).paused),
  ).toBe(true);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".home-heritage-runway").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("10-reduced-heritage.png"),
    scale: "css",
  });
  expect(
    await page
      .locator(".home-heritage-sticky")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("relative");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("real films advance, pause offscreen and respond to native controls", async ({
  page,
}) => {
  test.skip(
    process.env.REQUIRE_HOME_FILMS !== "1",
    "Real-film acceptance enabled by REQUIRE_HOME_FILMS=1 after the media quality gate",
  );
  await page.goto("/");
  const hero = page.locator(".home-film--hero video");
  await expect
    .poll(() => hero.evaluate((video) => (video as HTMLVideoElement).duration))
    .toBeGreaterThan(1);
  await expect(
    page.getByRole("button", { name: "Pause opening film" }),
  ).toBeVisible();
  const start = await hero.evaluate(
    (video) => (video as HTMLVideoElement).currentTime,
  );
  await expect
    .poll(() =>
      hero.evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(start + 0.3);
  await page.getByRole("button", { name: "Pause opening film" }).click();
  expect(
    await hero.evaluate((video) => (video as HTMLVideoElement).paused),
  ).toBe(true);
  await page.getByRole("button", { name: "Play opening film" }).click();
  await expect(
    page.getByRole("button", { name: "Pause opening film" }),
  ).toBeVisible();
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  await expect
    .poll(() => hero.evaluate((video) => (video as HTMLVideoElement).paused))
    .toBe(true);
  const detail = page.locator(".home-film--detail video");
  await expect
    .poll(() =>
      detail.evaluate((video) => (video as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0.3);
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await expect
    .poll(() => detail.evaluate((video) => (video as HTMLVideoElement).paused))
    .toBe(true);
  for (const video of [hero, detail])
    expect(
      await video.evaluate((node) => (node as HTMLVideoElement).muted),
    ).toBe(true);
});
