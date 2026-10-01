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

async function seekPlayingFilm(page: Page, selector: string) {
  await page.locator(selector).evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        const video = element as HTMLVideoElement;
        video.addEventListener("seeked", () => resolve(), { once: true });
        video.currentTime = 0.5;
      }),
  );
  await expect
    .poll(() =>
      page
        .locator(selector)
        .evaluate((element) => (element as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0.6);
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
  if ((page.viewportSize()?.width || 0) <= 700) {
    const media = await page
      .locator(".home-film--hero .home-film-backup")
      .boundingBox();
    expect(media!.width).toBeCloseTo(page.viewportSize()!.width, 0);
    expect(media!.height).toBeCloseTo(page.viewportSize()!.height, 0);
    expect(media!.y).toBeCloseTo(0, 0);
  }
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
    await page.locator(".home-editorial").evaluate((element) =>
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
    for (const progress of [0.35, 0.6]) {
      await scrollProgress(page, ".home-heritage-runway", progress);
      const photo = await page.locator(".home-heritage-r32").boundingBox();
      const caption = await page
        .locator(".home-heritage-r32 figcaption")
        .boundingBox();
      const heading = await page.locator("#heritage-title").boundingBox();
      expect(photo!.x).toBeGreaterThanOrEqual(20);
      expect(photo!.x + photo!.width).toBeLessThanOrEqual(
        page.viewportSize()!.width - 19,
      );
      expect(caption!.y + caption!.height).toBeLessThanOrEqual(heading!.y - 16);
    }
    const credits = page.getByRole("link", {
      name: "Archive photography & sources",
    });
    const creditsBox = await credits.boundingBox();
    expect(creditsBox!.height).toBeGreaterThanOrEqual(44);
    expect(
      await credits.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(12);
    expect(
      await credits.evaluate(
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
}, info) => {
  test.setTimeout(60000);
  const frames: Array<{
    film: string;
    phase: string;
    time: number;
    duration: number;
    paused: boolean;
  }> = [];
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
  await seekPlayingFilm(page, ".home-film--hero video");
  frames.push(
    await hero.evaluate((video) => ({
      film: "hero",
      phase: "early",
      time: (video as HTMLVideoElement).currentTime,
      duration: (video as HTMLVideoElement).duration,
      paused: (video as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("11-actual-hero-early.png"),
    scale: "css",
  });
  await expect
    .poll(
      () =>
        hero.evaluate(
          (video) =>
            (video as HTMLVideoElement).currentTime /
            (video as HTMLVideoElement).duration,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.6);
  frames.push(
    await hero.evaluate((video) => ({
      film: "hero",
      phase: "late",
      time: (video as HTMLVideoElement).currentTime,
      duration: (video as HTMLVideoElement).duration,
      paused: (video as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("12-actual-hero-late.png"),
    scale: "css",
  });
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
  await seekPlayingFilm(page, ".home-film--detail video");
  frames.push(
    await detail.evaluate((video) => ({
      film: "detail",
      phase: "early",
      time: (video as HTMLVideoElement).currentTime,
      duration: (video as HTMLVideoElement).duration,
      paused: (video as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("13-actual-detail-early.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-expanding-runway", 1);
  await expect
    .poll(
      () =>
        detail.evaluate(
          (video) =>
            (video as HTMLVideoElement).currentTime /
            (video as HTMLVideoElement).duration,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.6);
  frames.push(
    await detail.evaluate((video) => ({
      film: "detail",
      phase: "late",
      time: (video as HTMLVideoElement).currentTime,
      duration: (video as HTMLVideoElement).duration,
      paused: (video as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("14-actual-detail-late.png"),
    scale: "css",
  });
  await info.attach("actual-film-frame-times", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  });
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

test("additional viewport sanity stays within bounds with usable navigation", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "home-desktop",
    "Bounded viewport sweep runs once, not once per full media project",
  );
  test.setTimeout(60000);
  for (const [width, height] of [
    [1600, 900],
    [1366, 768],
    [768, 1024],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const menu = page.getByRole("button", { name: "Open menu" });
    const primary = page.getByRole("link", {
      name: "Explore the models",
      exact: true,
    });
    await expect(menu).toBeVisible();
    await expect(primary).toBeVisible();
    for (const control of [menu, primary]) {
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`sanity-${width}x${height}-hero.png`),
      scale: "css",
    });
    await menu.click();
    await expect(
      page.getByRole("dialog", { name: "Explore GT-R LAB" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await scrollProgress(page, ".home-heritage-runway", 0.5);
    for (const button of await page
      .getByRole("navigation", { name: "GT-R eras" })
      .getByRole("button")
      .all()) {
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
    }
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`sanity-${width}x${height}-heritage.png`),
      scale: "css",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("hero fading preserves existing keyboard focus and suppresses invisible idle interaction", async ({
  page,
}) => {
  await page.goto("/");
  const action = page.getByRole("link", {
    name: "Explore the models",
    exact: true,
  });
  await action.focus();
  await scrollProgress(page, ".home-hero-runway", 0.96);
  await expect(action).toBeFocused();
  expect(
    await page
      .locator(".home-hero-copy")
      .evaluate((element) => getComputedStyle(element).opacity),
  ).toBe("1");
  await action.evaluate((element) => (element as HTMLElement).blur());
  await expect(action).toHaveAttribute("tabindex", "-1");
  expect(
    await page
      .locator(".home-hero-support")
      .evaluate((element) => getComputedStyle(element).pointerEvents),
  ).toBe("none");
  await scrollProgress(page, ".home-hero-runway", 0);
  await expect(action).toHaveAttribute("tabindex", "0");
});

test("short viewports use reachable sequential targets and keep playback controls in view", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "home-desktop",
    "Single bounded short-viewport regression",
  );
  for (const [width, height] of [
    [844, 390],
    [375, 667],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".cinematic-home")).toHaveAttribute(
      "data-sequential-motion",
      "true",
    );
    await expect(page.locator(".cinematic-home")).toHaveAttribute(
      "data-reduced-motion",
      "false",
    );
    const playback = await page
      .locator(".home-film--hero .home-film-toggle")
      .boundingBox();
    expect(playback!.y).toBeGreaterThanOrEqual(0);
    expect(playback!.y + playback!.height).toBeLessThanOrEqual(height + 1);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`short-${width}x${height}-hero.png`),
      scale: "css",
    });
    expect(
      await page
        .locator(".home-heritage-sticky")
        .evaluate((element) => getComputedStyle(element).position),
    ).toBe("relative");
    const era = page.getByRole("button", { name: "2007: R35 GT-R" });
    await era.scrollIntoViewIfNeeded();
    await era.click();
    await expect(era).toHaveAttribute("aria-current", "step");
    const target = await page.locator('[data-era-image="2"]').boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(-1);
    expect(target!.y + target!.height).toBeLessThanOrEqual(height + 1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`short-${width}x${height}-era.png`),
      scale: "css",
    });
  }
});
