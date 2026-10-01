import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

async function scrollProgress(
  page: Page,
  selector: string,
  progress: number,
  diagnostic?: { info: TestInfo; name: string },
) {
  const samples = await page.locator(selector).evaluate(
    async (element, { p, capture }) => {
      const rect = element.getBoundingClientRect();
      const stickyHeight =
        (element.firstElementChild as HTMLElement | null)?.offsetHeight ||
        window.innerHeight;
      window.scrollTo({
        top:
          window.scrollY +
          rect.top +
          Math.max(0, rect.height - stickyHeight) * p,
        behavior: "instant",
      });
      const frames = [];
      if (capture) {
        for (let frame = 0; frame < 14; frame++) {
          if (frame) await new Promise(requestAnimationFrame);
          const runway = element.getBoundingClientRect();
          frames.push({
            frame,
            scrollY,
            runwayTop: runway.top,
            runwayHeight: runway.height,
            stickyHeight: (element.firstElementChild as HTMLElement)
              .offsetHeight,
            filmHeight: element
              .querySelector(".home-expanding-frame")
              ?.getBoundingClientRect().height,
            activeElement: document.activeElement?.tagName,
            progress: (element as HTMLElement).style.getPropertyValue(
              "--progress",
            ),
          });
        }
      }
      return frames;
    },
    { p: progress, capture: Boolean(diagnostic) },
  );
  if (diagnostic) {
    await diagnostic.info.attach(diagnostic.name, {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    expect(
      Math.max(...samples.map((sample) => sample.scrollY)) -
        Math.min(...samples.map((sample) => sample.scrollY)),
    ).toBeLessThanOrEqual(2);
  }
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
    const credit = page.locator(".home-film--hero .home-film-credit");
    const creditBox = await credit.boundingBox();
    expect(creditBox!.height).toBeGreaterThanOrEqual(44);
    expect(creditBox!.x + creditBox!.width).toBeLessThanOrEqual(
      page.viewportSize()!.width - 20,
    );
    expect(
      await credit.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(11);
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
  if ((page.viewportSize()?.width || 0) <= 700) {
    const credit = page.locator(".home-film--detail .home-film-credit");
    const creditBox = await credit.boundingBox();
    const toggleBox = await page
      .locator(".home-film--detail .home-film-toggle")
      .boundingBox();
    expect(creditBox!.height).toBeGreaterThanOrEqual(44);
    expect(creditBox!.x).toBeGreaterThanOrEqual(
      toggleBox!.x + toggleBox!.width + 4,
    );
    expect(creditBox!.x + creditBox!.width).toBeLessThanOrEqual(
      initial!.x + initial!.width - 12,
    );
    expect(
      await credit.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).fontSize),
      ),
    ).toBeGreaterThanOrEqual(11);
  }
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
        .locator(".home-heritage-mobile-caption")
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
    [375, 560],
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

test("normal portrait phones keep gradual reversible staging with reachable controls", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  test.skip(
    info.project.name !== "home-desktop",
    "Single bounded portrait motion regression",
  );
  for (const [width, height] of [
    [375, 600],
    [375, 667],
    [390, 667],
    [390, 700],
    [430, 700],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.locator(".cinematic-home")).toHaveAttribute(
      "data-sequential-motion",
      "false",
    );
    const controls = page.locator(".home-film--hero .home-film-controls");
    const controlsBox = await controls.boundingBox();
    expect(controlsBox!.y).toBeGreaterThanOrEqual(0);
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(height);
    await scrollProgress(page, ".home-hero-runway", 0.2);
    const firstHero = await page
      .locator(".home-hero-copy")
      .evaluate((element) => getComputedStyle(element).transform);
    await scrollProgress(page, ".home-hero-runway", 0.55);
    expect(
      await page
        .locator(".home-hero-copy")
        .evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(firstHero);

    await page.locator(".home-editorial").evaluate((element) =>
      window.scrollTo({
        top: scrollY + element.getBoundingClientRect().top,
        behavior: "instant",
      }),
    );
    const detail = page.locator(".home-editorial-image--detail");
    await expect
      .poll(() =>
        detail.evaluate((element) =>
          Number(
            (element as HTMLElement).style.getPropertyValue("--item-progress"),
          ),
        ),
      )
      .toBeGreaterThan(0);
    const before = await detail.evaluate((element) => ({
      progress: Number(
        (element as HTMLElement).style.getPropertyValue("--item-progress"),
      ),
      transform: getComputedStyle(element).transform,
    }));
    expect(
      await detail.evaluate((element) => {
        const section = element.closest(".home-editorial");
        let current: HTMLElement | null = element as HTMLElement;
        while (current && current !== section)
          current = current.offsetParent as HTMLElement | null;
        return current === section;
      }),
    ).toBe(true);
    await page.mouse.wheel(0, 180);
    await expect
      .poll(() =>
        detail.evaluate((element) =>
          Number(
            (element as HTMLElement).style.getPropertyValue("--item-progress"),
          ),
        ),
      )
      .toBeGreaterThan(before.progress + 0.1);
    expect(
      await detail.evaluate((element) => getComputedStyle(element).transform),
    ).not.toBe(before.transform);
    const photoCredit = page.getByRole("link", {
      name: "2017 GT-R Premium Edition · Photography credits",
    });
    await photoCredit.focus();
    await expect(photoCredit).toBeFocused();
    await expect(photoCredit).toBeInViewport();
    expect(
      await page
        .locator(".home-editorial-image--cockpit")
        .evaluate((element) => getComputedStyle(element).clipPath),
    ).toBe("none");
    await photoCredit.blur();

    const filmBounds = [];
    for (const progress of [0.2, 0.5, 0.8]) {
      await scrollProgress(
        page,
        ".home-expanding-runway",
        progress,
        progress === 0.2
          ? { info, name: `film-scroll-stability-${width}x${height}` }
          : undefined,
      );
      filmBounds.push(
        (await page.locator(".home-expanding-frame").boundingBox())!,
      );
    }
    expect(filmBounds[0].width).toBeLessThan(filmBounds[1].width);
    expect(filmBounds[1].width).toBeLessThan(filmBounds[2].width);
    expect(filmBounds[0].height).toBeLessThan(filmBounds[2].height);

    const origins = [];
    const successors = [];
    for (const progress of [0.26, 0.33, 0.4]) {
      await scrollProgress(page, ".home-heritage-runway", progress);
      origins.push(
        await page
          .locator(".home-heritage-origin")
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      );
      successors.push(
        await page
          .locator(".home-heritage-r32")
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      );
      await expect(page.locator(".home-heritage-years span")).toHaveCount(1);
      if (progress === 0.33)
        expect(
          await page
            .locator(".home-heritage-years span")
            .evaluate((element) => Number(getComputedStyle(element).opacity)),
        ).toBeLessThan(0.05);
      if (
        (width === 390 && height === 700) ||
        (width === 430 && height === 932)
      ) {
        await page.screenshot({
          path: info.outputPath(
            `portrait-${width}x${height}-crossfade-${progress}.png`,
          ),
          scale: "css",
        });
      }
    }
    expect(origins[0]).toBeGreaterThan(origins[1]);
    expect(origins[1]).toBeGreaterThan(origins[2]);
    expect(successors[0]).toBeLessThan(successors[1]);
    expect(successors[1]).toBeLessThan(successors[2]);
    await scrollProgress(page, ".home-heritage-runway", 0.26);
    expect(
      await page
        .locator(".home-heritage-origin")
        .evaluate((element) => Number(getComputedStyle(element).opacity)),
    ).toBeCloseTo(origins[0], 2);
    const caption = await page
      .locator(".home-heritage-mobile-caption")
      .boundingBox();
    const heading = await page.locator("#heritage-title").boundingBox();
    const description = await page
      .locator(".home-era-description")
      .boundingBox();
    const timeline = await page.locator(".home-era-navigation").boundingBox();
    expect(caption!.y + caption!.height).toBeLessThanOrEqual(heading!.y - 16);
    expect(description!.y + description!.height).toBeLessThanOrEqual(
      timeline!.y - 8,
    );
    for (const control of await page
      .getByRole("navigation", { name: "GT-R eras" })
      .getByRole("button")
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(20);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 20);
      expect(box.y + box.height).toBeLessThanOrEqual(height - 52);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    for (const [index, name] of [
      "1969: Skyline GT-R",
      "1989: R32 GT-R",
      "2007: R35 GT-R",
    ].entries()) {
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.locator(".home-heritage-runway")).toHaveAttribute(
        "data-active-era",
        String(index),
      );
      await expect
        .poll(() =>
          page
            .locator(".home-heritage-runway")
            .evaluate((element) =>
              Number(
                (element as HTMLElement).style.getPropertyValue("--progress"),
              ),
            ),
        )
        .toBeCloseTo(index / 2, 1);
      expect(
        await page
          .locator(
            [
              ".home-heritage-origin",
              ".home-heritage-r32",
              ".home-heritage-r35",
            ][index],
          )
          .evaluate((element) => Number(getComputedStyle(element).opacity)),
      ).toBe(1);
      const copy = (await page.locator(".home-heritage-copy").boundingBox())!;
      const eraControls = (await page
        .locator(".home-era-navigation")
        .boundingBox())!;
      const archiveCredit = (await page
        .locator(".home-heritage-credit")
        .boundingBox())!;
      expect(copy.y + copy.height).toBeLessThanOrEqual(eraControls.y - 8);
      expect(eraControls.y + eraControls.height).toBeLessThanOrEqual(
        archiveCredit.y - 8,
      );
    }
    await page.screenshot({
      path: info.outputPath(`portrait-staging-${width}x${height}.png`),
      scale: "css",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".cinematic-home")).toHaveAttribute(
    "data-sequential-motion",
    "true",
  );
  expect(await page.locator(".home-heritage-years").isVisible()).toBe(false);
  for (const image of await page.locator(".home-editorial-image").all()) {
    expect(
      await image.evaluate((element) => getComputedStyle(element).clipPath),
    ).toBe("none");
    expect(
      await image.evaluate((element) => getComputedStyle(element).transform),
    ).toBe("none");
  }
});
