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
    animations: "disabled",
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
    animations: "disabled",
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
    animations: "disabled",
    path: info.outputPath("03-home-editorial.png"),
    scale: "css",
  });
  {
    const detail = await page
      .locator(".home-editorial-image--detail")
      .boundingBox();
    const cockpit = await page
      .locator(".home-editorial-image--cockpit")
      .boundingBox();
    expect(cockpit!.x + cockpit!.width).toBeGreaterThan(detail!.x);
    expect(cockpit!.y).toBeLessThan(detail!.y + detail!.height - 20);
  }
  if ((page.viewportSize()?.width || 0) <= 700) {
    await page
      .locator(".home-editorial")
      .evaluate((element) =>
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().top,
          behavior: "instant",
        }),
      );
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("03a-mobile-editorial-entry.png"),
      scale: "css",
    });
    await page
      .locator(".home-editorial-copy--control")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("03b-mobile-editorial-control.png"),
      scale: "css",
    });
  }
  await scrollProgress(page, ".home-expanding-runway", 0);
  const initial = await page.locator(".home-expanding-frame").boundingBox();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("04-film-inset.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  const middle = await page.locator(".home-expanding-frame").boundingBox();
  await page.screenshot({
    animations: "disabled",
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
    animations: "disabled",
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
  if ((page.viewportSize()?.width || 0) <= 700) {
    const timeline = page.getByRole("navigation", { name: "GT-R eras" });
    const bounds = await timeline.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(20);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width - 20,
    );
    expect(
      await timeline.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe("rgb(7, 8, 9)");
    for (const button of await timeline.getByRole("button").all()) {
      const rect = await button.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(
        bounds!.x + bounds!.width + 1,
      );
    }
  }
  await page.screenshot({
    animations: "disabled",
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
    animations: "disabled",
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
    animations: "disabled",
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
    animations: "disabled",
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

for (const policy of ["reduced-motion", "save-data"] as const) {
  test(`${policy} keeps both real films paused until explicit play and pauses them offscreen`, async ({
    page,
  }) => {
    test.skip(
      process.env.REQUIRE_HOME_FILMS !== "1",
      "Real-film acceptance enabled only after final media passes its quality gate",
    );
    if (policy === "reduced-motion") {
      await page.emulateMedia({ reducedMotion: "reduce" });
    } else {
      await page.addInitScript(() => {
        const connection = new EventTarget();
        Object.defineProperty(connection, "saveData", { value: true });
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        });
      });
    }
    await page.goto("/");
    const hero = page.locator(".home-film--hero video");
    const detail = page.locator(".home-film--detail video");
    for (const film of [hero, detail]) {
      expect(
        await film.evaluate((element) => ({
          paused: (element as HTMLVideoElement).paused,
          muted: (element as HTMLVideoElement).muted,
          time: (element as HTMLVideoElement).currentTime,
          preload: (element as HTMLVideoElement).preload,
          autoplay: (element as HTMLVideoElement).autoplay,
        })),
      ).toEqual({
        paused: true,
        muted: true,
        time: 0,
        preload: "none",
        autoplay: false,
      });
    }
    await page.getByRole("button", { name: "Play opening film" }).click();
    await expect(
      page.getByRole("button", { name: "Pause opening film" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        hero.evaluate((element) => (element as HTMLVideoElement).duration),
      )
      .toBeGreaterThan(1);
    await expect
      .poll(() =>
        hero.evaluate((element) => (element as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.35);
    await page.locator(".home-expanding-frame").scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        hero.evaluate((element) => (element as HTMLVideoElement).paused),
      )
      .toBe(true);
    expect(
      await detail.evaluate((element) => (element as HTMLVideoElement).paused),
    ).toBe(true);
    await page.getByRole("button", { name: "Play detail film" }).click();
    await expect(
      page.getByRole("button", { name: "Pause detail film" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        detail.evaluate((element) => (element as HTMLVideoElement).duration),
      )
      .toBeGreaterThan(1);
    await expect
      .poll(() =>
        detail.evaluate((element) => (element as HTMLVideoElement).currentTime),
      )
      .toBeGreaterThan(0.35);
    await page.locator(".home-footer").scrollIntoViewIfNeeded();
    for (const film of [hero, detail]) {
      await expect
        .poll(() =>
          film.evaluate((element) => (element as HTMLVideoElement).paused),
        )
        .toBe(true);
    }
    const before = await page.locator("video").evaluateAll((videos) =>
      videos.map((video) => ({
        time: (video as HTMLVideoElement).currentTime,
        muted: (video as HTMLVideoElement).muted,
      })),
    );
    await page.waitForTimeout(450);
    const after = await page.locator("video").evaluateAll((videos) =>
      videos.map((video) => ({
        time: (video as HTMLVideoElement).currentTime,
        muted: (video as HTMLVideoElement).muted,
      })),
    );
    expect(after).toEqual(before);
    expect(after.every((film) => film.muted)).toBe(true);
  });
}
