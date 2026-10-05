import { continueHomeWithout3D } from "./helpers/home-gate";
import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";

// Keep this layout suite independent of GPU/model transfer: explicitly continue
// without 3D after a deliberate asset failure. Loading/render acceptance is separate.
test.beforeEach(async ({ page }) => {
  await page.route("**/models/ciasny-r35.glb", (route) =>
    route.fulfill({
      status: 503,
      contentType: "text/plain",
      body: "Deliberate layout-suite asset failure",
    }),
  );
});

async function settleNativeScroll(page: Page, info: TestInfo, name: string) {
  const samples = await page.evaluate(async () => {
    const frames = [];
    let previous = scrollY;
    let stable = 0;
    for (let frame = 0; frame < 240; frame++) {
      await new Promise(requestAnimationFrame);
      const current = scrollY;
      frames.push({
        frame,
        scrollY: current,
        activeElement: document.activeElement?.tagName,
      });
      stable = Math.abs(current - previous) < 0.5 ? stable + 1 : 0;
      previous = current;
      if (stable >= 8) return frames;
    }
    throw new Error(
      "Native input scrolling did not become stationary before the independent geometry probe",
    );
  });
  await info.attach(name, {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
}

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

const archiveNames = [
  "1969: PGC10 Skyline GT-R",
  "1989: R32 GT-R",
  "1999: R34 GT-R",
  "2007: R35 GT-R",
];

function archiveChapter(page: Page, index: number) {
  return page.locator(`.home-archive-chapter[data-era-image="${index}"]`);
}

async function archiveChapterDestination(page: Page, index: number) {
  return archiveChapter(page, index).evaluate((chapter) => {
    const padding =
      Number.parseFloat(
        getComputedStyle(document.documentElement).scrollPaddingTop,
      ) || 88;
    return Math.max(
      0,
      scrollY + chapter.getBoundingClientRect().top - padding - 24,
    );
  });
}

async function scrollArchiveChapter(page: Page, index: number) {
  const top = await archiveChapterDestination(page, index);
  await page.evaluate(
    (target) => window.scrollTo({ top: target, behavior: "instant" }),
    top,
  );
  await expect(page.locator("#home-heritage")).toHaveAttribute(
    "data-active-era",
    String(index),
  );
  await expect(
    page.getByRole("button", { name: archiveNames[index], exact: true }),
  ).toHaveAttribute("aria-current", "step");
}

async function expectArchiveArrivalInView(page: Page, index: number) {
  const chapter = archiveChapter(page, index);
  const heading = chapter.locator(".home-timeline-caption h3");
  // The selected year and lead image arrive first. The caption remains native
  // document content and can be read below the photograph on short screens.
  await expect(chapter.locator(".home-archive-year")).toBeInViewport({
    ratio: 1,
  });
  await expect(chapter.locator(".home-timeline-image")).toBeInViewport();
  await expect(page.locator(".home-archive-navigation")).toHaveCSS(
    "position",
    "static",
  );
  await expect(page.locator(".home-archive-intro")).not.toHaveCSS(
    "position",
    "sticky",
  );
  await expect(chapter).toHaveCSS("position", "relative");
  await expect(chapter.locator(".home-timeline-panel")).toHaveCSS(
    "position",
    "relative",
  );
  await expect(page.locator("#home-heritage")).toHaveAttribute(
    "data-active-era",
    String(index),
  );
  await expectArchiveImagesDecoded(page, index);
  await heading.scrollIntoViewIfNeeded();
  await settleNativeScroll(
    page,
    test.info(),
    `archive-caption-settled-${index}`,
  );
  await expect(heading).toBeInViewport({ ratio: 1 });
  await expect(heading).toHaveCSS("opacity", "1");
  await expect(chapter.locator(".home-timeline-caption")).toHaveCSS(
    "opacity",
    "1",
  );
  const arrival = await heading.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return {
      top: box.top,
      bottom: box.bottom,
      uncovered: hit === node || node.contains(hit),
      scrollY,
    };
  });
  expect(
    arrival.uncovered,
    "the selected story heading must not be covered",
  ).toBe(true);
  await test.info().attach(`archive-readable-arrival-${index}`, {
    body: JSON.stringify({ index, arrival }, null, 2),
    contentType: "application/json",
  });
}

async function expectArchivePanelLayout(page: Page, index: number) {
  const chapter = archiveChapter(page, index);
  const panel = chapter.locator(".home-timeline-panel");
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute(
    "data-side",
    index % 2 ? "right" : "left",
  );
  await expect(chapter.locator(".home-timeline-caption h3")).toHaveText(/\S/);
  await expect(chapter.locator(".home-timeline-caption > p")).toHaveCount(1);
  await expect(chapter.locator(".home-timeline-caption > p")).toHaveText(/\S/);
  await expect(chapter.locator(".home-timeline-image img")).toHaveCount(1);
  await expect(chapter.locator("figure:visible")).toHaveCount(1);
  await expect(chapter.locator(".home-timeline-details")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(chapter.locator(".home-timeline-evidence figure")).toHaveCount(
    3,
  );
  await expect(chapter.locator(".home-timeline-evidence")).not.toBeVisible();
  const geometry = await chapter.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const panel = element.querySelector<HTMLElement>(".home-timeline-panel")!;
    const panelBounds = panel.getBoundingClientRect();
    const image = element.querySelector<HTMLElement>(".home-timeline-image")!;
    const imageBounds = image.getBoundingClientRect();
    const caption = element.querySelector<HTMLElement>(
      ".home-timeline-caption",
    )!;
    const captionBounds = caption.getBoundingClientRect();
    const details = element.querySelector<HTMLElement>(
      ".home-timeline-details",
    )!;
    const year = element.querySelector<HTMLElement>(".home-archive-year")!;
    const yearBounds = year.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      panelLeft: panelBounds.left,
      panelRight: panelBounds.right,
      panelWidth: panelBounds.width,
      chapterWidth: bounds.width,
      chapterHeight: bounds.height,
      panelHeight: panelBounds.height,
      image: {
        left: imageBounds.left,
        right: imageBounds.right,
        top: imageBounds.top,
        bottom: imageBounds.bottom,
      },
      caption: {
        left: captionBounds.left,
        right: captionBounds.right,
        top: captionBounds.top,
        bottom: captionBounds.bottom,
      },
      detailsTop: details.getBoundingClientRect().top,
      yearCenter: yearBounds.left + yearBounds.width / 2,
      axisCenter: bounds.left + bounds.width / 2,
      yearFontSize: Number.parseFloat(getComputedStyle(year).fontSize),
      width: innerWidth,
    };
  });
  expect(geometry.yearCenter).toBeCloseTo(geometry.axisCenter, 0);
  expect(geometry.yearFontSize).toBeLessThanOrEqual(18);
  expect(geometry.yearFontSize).toBeGreaterThanOrEqual(12);
  expect(geometry.panelWidth / geometry.chapterWidth).toBeCloseTo(
    geometry.width <= 700 ? 0.95 : 0.59,
    2,
  );
  if (index % 2) expect(geometry.panelRight).toBeCloseTo(geometry.right, 0);
  else expect(geometry.panelLeft).toBeCloseTo(geometry.left, 0);
  for (const box of [geometry.image, geometry.caption]) {
    expect(box.right - box.left).toBeGreaterThan(0);
    expect(box.bottom - box.top).toBeGreaterThan(0);
    expect(box.left).toBeGreaterThanOrEqual(-1);
    expect(box.right).toBeLessThanOrEqual(geometry.width + 1);
    expect(box.top).toBeGreaterThanOrEqual(geometry.top);
    expect(box.bottom).toBeLessThanOrEqual(geometry.bottom);
  }
  expect(geometry.caption.top - geometry.image.bottom).toBeGreaterThanOrEqual(
    0,
  );
  expect(geometry.caption.top - geometry.image.bottom).toBeLessThanOrEqual(48);
  expect(geometry.detailsTop).toBeGreaterThanOrEqual(geometry.caption.bottom);
  // Only the factual year and modest breathing room precede/follow the panel.
  // A synthetic sticky runway would violate this natural content-height bound.
  expect(geometry.chapterHeight - geometry.panelHeight).toBeLessThanOrEqual(
    180,
  );
}

async function expectArchiveImagesDecoded(page: Page, index: number) {
  const image = archiveChapter(page, index).locator(".home-timeline-image img");
  await expect
    .poll(
      () =>
        image.evaluate((element) => {
          const img = element as HTMLImageElement;
          return img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
        }),
      { timeout: 15000 },
    )
    .toBe(true);
  await image.evaluate((element) => (element as HTMLImageElement).decode());
  // Bounded height with object-fit:contain preserves the entire original photo,
  // even when the element's box has a different ratio from its decoded source.
  await expect(image).toHaveCSS("object-fit", "contain");
  await expect(image).toHaveCSS("clip-path", "none");
  await expect(image).toHaveAttribute("alt", /\S/);
}

async function expectCompactArchiveFlow(page: Page) {
  const flow = await page.locator("#home-heritage").evaluate((section) => {
    const chapters = [...section.querySelectorAll(".home-archive-chapter")].map(
      (chapter) => chapter.getBoundingClientRect(),
    );
    return {
      extraHeight:
        section.getBoundingClientRect().height -
        chapters.reduce((sum, chapter) => sum + chapter.height, 0),
      gaps: chapters
        .slice(1)
        .map((chapter, index) => chapter.top - chapters[index].bottom),
    };
  });
  expect(flow.extraHeight).toBeGreaterThanOrEqual(0);
  expect(flow.extraHeight).toBeLessThanOrEqual(900);
  for (const gap of flow.gaps) {
    expect(gap).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(160);
  }
}

test("cinematic layout, real scroll geometry, menu and six destinations", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await continueHomeWithout3D(page);
  await expect(page).toHaveTitle(/GT-R LAB/);
  await expect(
    page.getByRole("heading", { name: "Engineered to defy." }),
  ).toBeVisible();
  if ((page.viewportSize()?.width || 0) <= 700) {
    const media = await page
      .locator(".home-film--hero .home-film-provider")
      .boundingBox();
    expect(media!.width).toBeCloseTo(page.viewportSize()!.width, 0);
    expect(media!.height).toBeCloseTo((page.viewportSize()!.width * 9) / 16, 0);
    expect(media!.y).toBeGreaterThanOrEqual(70);
    const copy = (await page.locator(".home-hero-copy").boundingBox())!;
    expect(copy.y).toBeGreaterThanOrEqual(0);
    expect(copy.y + copy.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
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
  } else if (page.viewportSize()!.width >= 768) {
    const media = (await page
      .locator(".home-film--hero iframe")
      .boundingBox())!;
    expect(media.x).toBeGreaterThanOrEqual(-1);
    expect(media.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(media.x + media.width).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
    expect(media.height).toBeCloseTo((media.width * 9) / 16, 0);
    expect(media.y).toBeGreaterThanOrEqual(0);
    expect(media.y + media.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    const copy = (await page.locator(".home-hero-copy").boundingBox())!;
    expect(copy.x).toBeGreaterThan(20);
    expect(copy.y + copy.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  }
  await expect(page.locator(".home-film--hero .home-film-provider")).toHaveCSS(
    "opacity",
    "1",
  );
  await expect(
    page.locator(".home-film--hero .home-film-controls"),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.locator(".home-film--hero .home-film-toggle:not(.home-film-retry)"),
  ).toBeInViewport({ ratio: 1 });
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
    expect(cockpit!.y - (detail!.y + detail!.height)).toBeGreaterThanOrEqual(
      24,
    );
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
    const film = page.locator(".home-film--detail");
    const stop = film.getByRole("button", {
      name: "Stop detail film",
      exact: true,
    });
    const retry = film.getByRole("button", {
      name: "Retry detail film",
      exact: true,
    });
    await expect(stop).toBeVisible();
    await expect(retry).toBeVisible();
    const controlBoxes = [
      creditBox!,
      (await stop.boundingBox())!,
      (await retry.boundingBox())!,
    ];
    for (const [index, box] of controlBoxes.entries()) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(initial!.x + 12);
      expect(box.x + box.width).toBeLessThanOrEqual(
        initial!.x + initial!.width - 12,
      );
      expect(box.y).toBeGreaterThanOrEqual(initial!.y);
      expect(box.y + box.height).toBeLessThanOrEqual(
        initial!.y + initial!.height,
      );
      for (const other of controlBoxes.slice(index + 1)) {
        const overlapX =
          Math.min(box.x + box.width, other.x + other.width) -
          Math.max(box.x, other.x);
        const overlapY =
          Math.min(box.y + box.height, other.y + other.height) -
          Math.max(box.y, other.y);
        expect(
          overlapX > 1 && overlapY > 1,
          "film actions and credits do not overlap in either row",
        ).toBe(false);
      }
    }
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
  if (page.viewportSize()!.width <= 767) {
    expect(expanded!.height).toBeCloseTo((expanded!.width * 9) / 16 + 132, 0);
    const player = await page
      .locator(".home-film--detail iframe")
      .boundingBox();
    expect(player!.height).toBeCloseTo((player!.width * 9) / 16, 0);
    const controls = await page
      .locator(".home-film--detail .home-film-controls")
      .boundingBox();
    // The recovery footer now reserves its own status line above the actions.
    // Validate the actual controls within that footer instead of the old 32px gap.
    expect(controls!.y).toBeGreaterThanOrEqual(player!.y + player!.height);
    expect(controls!.y + controls!.height).toBeLessThanOrEqual(
      expanded!.y + expanded!.height + 1,
    );
    const status = page.locator(".home-film--detail .home-film-status");
    if (await status.count()) {
      const statusBox = (await status.boundingBox())!;
      expect(statusBox.y).toBeGreaterThanOrEqual(player!.y + player!.height);
      expect(statusBox.y + statusBox.height).toBeLessThanOrEqual(controls!.y);
    }
  } else {
    expect(expanded!.height).toBeCloseTo((expanded!.width * 9) / 16 + 64, 0);
    const player = (await page
      .locator(".home-film--detail iframe")
      .boundingBox())!;
    expect(player.height).toBeCloseTo((player.width * 9) / 16, 0);
    await expect(
      page.getByRole("button", { name: "Enlarge driving film" }),
    ).toContainText("Expand film");
  }
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("06-film-fullscreen.png"),
    scale: "css",
  });
  await expect(page.locator(".home-archive-chapter")).toHaveCount(4);
  const headlines: string[] = [];
  for (const index of [0, 1, 2, 3]) {
    await scrollArchiveChapter(page, index);
    await expectArchiveImagesDecoded(page, index);
    await expectArchiveArrivalInView(page, index);
    await expectArchivePanelLayout(page, index);
    const image = archiveChapter(page, index).locator(".home-timeline-image");
    const bounds = (await image.boundingBox())!;
    // The timeline has a bounded reading width on wide displays.
    const chapterBounds = (await archiveChapter(page, index).boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(
      page.viewportSize()!.width <= 700
        ? page.viewportSize()!.width * 0.7
        : chapterBounds.width * 0.3,
    );
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
    expect(
      await page
        .locator("#home-heritage")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe("rgb(11, 13, 14)");
    headlines.push(
      await archiveChapter(page, index)
        .locator(".home-timeline-caption h3")
        .innerText(),
    );
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`07-archive-chapter-${index}.png`),
      scale: "css",
    });
  }
  expect(new Set(headlines).size).toBe(4);
  await expectCompactArchiveFlow(page);
  for (const index of [2, 1, 0]) {
    await scrollArchiveChapter(page, index);
    await expect(
      archiveChapter(page, index).locator(".home-timeline-caption h3"),
    ).toHaveText(headlines[index], { useInnerText: true });
    await expectArchiveArrivalInView(page, index);
  }
  const timeline = page.getByRole("navigation", { name: "GT-R eras" });
  await expect(timeline.getByRole("button")).toHaveCount(4);
  for (const button of await timeline.getByRole("button").all()) {
    const rect = (await button.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(
      page.viewportSize()!.width + 1,
    );
  }
  await page
    .getByRole("button", { name: archiveNames[3], exact: true })
    .click();
  await expect(page.locator(".home-archive-runway")).toHaveAttribute(
    "data-active-era",
    "3",
  );
  await settleNativeScroll(page, info, "archive-last-button-arrival");
  await expectArchiveArrivalInView(page, 3);
  await expect(archiveChapter(page, 3)).toBeFocused();
  await page
    .getByRole("button", { name: archiveNames[0], exact: true })
    .click();
  await settleNativeScroll(page, info, "archive-first-button-arrival");
  await expect(page.locator(".home-archive-runway")).toHaveAttribute(
    "data-active-era",
    "0",
  );
  await expectArchiveArrivalInView(page, 0);
  await expect(archiveChapter(page, 0)).toBeFocused();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("07-home-heritage.png"),
    scale: "css",
  });
  await page.locator(".home-invitations").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page.locator(".home-model-invitation img").evaluateAll((nodes) =>
        nodes
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > 0 && r.top < innerHeight;
          })
          .every(
            (el) =>
              (el as HTMLImageElement).complete &&
              (el as HTMLImageElement).naturalWidth > 0,
          ),
      ),
    )
    .toBe(true);
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
        .getByRole("link", {
          name: `Explore ${name}: ${id === "premium" ? "View in 3D" : "View photos"}`,
          exact: true,
        }),
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
  await continueHomeWithout3D(page);
  await expect(page.locator(".cinematic-home")).toHaveAttribute(
    "data-reduced-motion",
    "true",
  );
  expect(
    await page
      .locator(".home-hero-sticky")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("relative");
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.keyboard.press("Escape");
  await page.locator(".home-archive-runway").scrollIntoViewIfNeeded();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("10-reduced-heritage.png"),
    scale: "css",
  });
  expect(
    await page
      .locator(".home-archive-navigation")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("static");
  for (const image of await page.locator(".home-timeline-image").all()) {
    await expect(image).toHaveCSS("opacity", "1");
    await expect(image).toHaveCSS("filter", "none");
    await expect(image).toHaveCSS("transform", "none");
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

// These acceptance cases inspect the real provider's rendered video, without
// downloading it or modifying the provider document/player. Other layout tests
// remain separate from this external playback evidence.
async function hostedPlayback(page: Page, kind: "hero" | "detail") {
  const player = page
    .frameLocator(`.home-film--${kind} iframe`)
    .locator("video");
  await expect
    .poll(
      () =>
        player.evaluate((v) => ({
          duration: (v as HTMLVideoElement).duration,
          ready: (v as HTMLVideoElement).readyState,
          paused: (v as HTMLVideoElement).paused,
        })),
      { timeout: 45000 },
    )
    .toMatchObject({ ready: 4, paused: false });
  const start = await player.evaluate(
    (v) => (v as HTMLVideoElement).currentTime,
  );
  await expect
    .poll(
      () =>
        player.evaluate(
          (v, initial) =>
            Math.abs((v as HTMLVideoElement).currentTime - initial),
          start,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.3);
  return player;
}
test("real films advance, stop by unloading and stop offscreen", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  test.skip(
    process.env.REQUIRE_HOME_FILMS !== "1",
    "Requires actual publisher playback",
  );
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");
  await continueHomeWithout3D(page);
  await expect(page.locator(".home-film--hero iframe")).toHaveAttribute(
    "src",
    "https://media.flixel.com/cinemagraph/7x5domma49p8pb7z8k1l?hd=true",
  );
  const frames: object[] = [];
  const hero = await hostedPlayback(page, "hero");
  frames.push(
    await hero.evaluate((v) => ({
      film: "hero",
      time: (v as HTMLVideoElement).currentTime,
      duration: (v as HTMLVideoElement).duration,
      muted: (v as HTMLVideoElement).muted,
      paused: (v as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    path: info.outputPath("11-actual-hero-early.png"),
    scale: "css",
  });
  await expect
    .poll(
      () =>
        hero.evaluate(
          (v) =>
            (v as HTMLVideoElement).currentTime /
            (v as HTMLVideoElement).duration,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.6);
  await page.screenshot({
    path: info.outputPath("12-actual-hero-late.png"),
    scale: "css",
  });
  await page.getByRole("button", { name: "Stop opening film" }).click();
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Play opening film" }).click();
  await hostedPlayback(page, "hero");
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  await expect(page.locator(".home-film--hero iframe")).toHaveCount(0);
  await expect(page.locator(".home-film--detail iframe")).toHaveAttribute(
    "src",
    "https://media.flixel.com/cinemagraph/t53p8d1vu4miy763a938?hd=true",
  );
  const detail = await hostedPlayback(page, "detail");
  frames.push(
    await detail.evaluate((v) => ({
      film: "detail",
      time: (v as HTMLVideoElement).currentTime,
      duration: (v as HTMLVideoElement).duration,
      muted: (v as HTMLVideoElement).muted,
      paused: (v as HTMLVideoElement).paused,
    })),
  );
  await page.screenshot({
    path: info.outputPath("13-actual-detail-early.png"),
    scale: "css",
  });
  await scrollProgress(page, ".home-expanding-runway", 1);
  await expect
    .poll(
      () =>
        detail.evaluate(
          (v) =>
            (v as HTMLVideoElement).currentTime /
            (v as HTMLVideoElement).duration,
        ),
      { timeout: 15000 },
    )
    .toBeGreaterThan(0.6);
  await page.screenshot({
    path: info.outputPath("14-actual-detail-late.png"),
    scale: "css",
  });
  await page.getByRole("button", { name: "Stop detail film" }).click();
  await expect(page.locator(".home-film--detail iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Play detail film" }).click();
  await hostedPlayback(page, "detail");
  await page.locator(".home-footer").scrollIntoViewIfNeeded();
  await expect(page.locator(".home-film iframe")).toHaveCount(0);
  expect(
    requests.some((url) => /\/films\/gtr-(hero|detail)\.mp4/.test(url)),
  ).toBe(false);
  await info.attach("actual-hosted-film-evidence", {
    body: JSON.stringify({ frames, requests }, null, 2),
    contentType: "application/json",
  });
});
for (const policy of ["reduced-motion", "save-data"] as const) {
  test(`${policy} keeps both hosted films unloaded until explicit play and unloads them offscreen`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    test.skip(
      process.env.REQUIRE_HOME_FILMS !== "1",
      "Requires actual publisher playback",
    );
    const providerRequests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("media.flixel.com")) providerRequests.push(r.url());
    });
    if (policy === "reduced-motion")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else
      await page.addInitScript(() => {
        const connection = new EventTarget();
        Object.defineProperty(connection, "saveData", { value: true });
        Object.defineProperty(navigator, "connection", {
          configurable: true,
          value: connection,
        });
      });
    await page.goto("/");
    await continueHomeWithout3D(page);
    await expect(page.locator(".home-film iframe")).toHaveCount(0);
    expect(providerRequests).toEqual([]);
    await page.getByRole("button", { name: "Play opening film" }).click();
    await hostedPlayback(page, "hero");
    await page.locator(".home-expanding-frame").scrollIntoViewIfNeeded();
    await expect(page.locator(".home-film iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Play detail film" }).click();
    await hostedPlayback(page, "detail");
    await page.locator(".home-footer").scrollIntoViewIfNeeded();
    await expect(page.locator(".home-film iframe")).toHaveCount(0);
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
    [1920, 900],
    [1600, 900],
    [1366, 768],
    [768, 1024],
    [430, 932],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await continueHomeWithout3D(page);
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
    await page
      .getByRole("navigation", { name: "GT-R eras" })
      .scrollIntoViewIfNeeded();
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
  await continueHomeWithout3D(page);
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
    await continueHomeWithout3D(page);
    await expect(page.locator(".cinematic-home")).toHaveAttribute(
      "data-sequential-motion",
      "true",
    );
    await expect(page.locator(".cinematic-home")).toHaveAttribute(
      "data-reduced-motion",
      "false",
    );
    const playback = await page
      .locator(".home-film--hero .home-film-toggle:not(.home-film-retry)")
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
        .locator(".home-archive-navigation")
        .evaluate((element) => getComputedStyle(element).position),
    ).toBe("static");
    const era = page.getByRole("button", { name: "2007: R35 GT-R" });
    await era.scrollIntoViewIfNeeded();
    await era.click();
    await expect(era).toHaveAttribute("aria-current", "step");
    await expect(
      page.locator('.home-archive-chapter[data-era-image="3"]'),
    ).toBeInViewport();
    await settleNativeScroll(
      page,
      info,
      `short-era-arrival-${width}x${height}`,
    );
    await expectArchiveArrivalInView(page, 3);
    await expect(archiveChapter(page, 3)).toBeFocused();
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
    await continueHomeWithout3D(page);
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

    await page.evaluate(() => document.fonts.ready);
    const detail = page.locator(".home-editorial-image--detail");
    // Sample the designed entrance, rather than placing the section at the top
    // after its image has already entered the deliberately stationary reading hold.
    await detail.evaluate((element) => {
      let top = 0;
      let current: HTMLElement | null = element as HTMLElement;
      while (current) {
        top += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      }
      window.scrollTo({ top: top - innerHeight * 0.78, behavior: "instant" });
    });
    await settleNativeScroll(page, info, `entrance-settled-${width}x${height}`);
    const readDetail = () =>
      detail.evaluate((element) => {
        const node = element as HTMLElement;
        const styles = getComputedStyle(node);
        const matrix = new DOMMatrixReadOnly(
          styles.transform === "none" ? undefined : styles.transform,
        );
        return {
          scrollY,
          progress: Number(node.style.getPropertyValue("--item-progress")),
          reveal: Number(node.style.getPropertyValue("--item-reveal")),
          opacity: Number(styles.opacity),
          lift: matrix.m42,
        };
      });
    const before = await readDetail();
    expect(before.reveal).toBeGreaterThan(0);
    expect(before.reveal).toBeLessThan(0.5);
    expect(before.opacity).toBeLessThan(1);
    expect(before.lift).toBeGreaterThan(0);
    expect(
      await detail.evaluate((element) => {
        const section = element.closest(".home-editorial");
        let current: HTMLElement | null = element as HTMLElement;
        while (current && current !== section)
          current = current.offsetParent as HTMLElement | null;
        return current === section;
      }),
    ).toBe(true);
    // Both directions use native input; no motion variables are injected.
    await page.mouse.move(width / 2, height - 20);
    await page.mouse.wheel(0, height * 0.12);
    await settleNativeScroll(page, info, `entrance-forward-${width}x${height}`);
    const forward = await readDetail();
    expect(forward.scrollY).toBeGreaterThan(before.scrollY);
    expect(forward.progress).toBeGreaterThan(before.progress);
    expect(forward.reveal).toBeGreaterThan(0.65);
    expect(forward.reveal).toBeLessThan(1);
    expect(forward.opacity).toBeGreaterThan(before.opacity);
    expect(forward.lift).toBeLessThan(before.lift);
    expect(forward.lift).toBeGreaterThan(0);
    await page.mouse.wheel(0, -height * 0.12);
    await settleNativeScroll(page, info, `entrance-reverse-${width}x${height}`);
    const reversed = await readDetail();
    expect(reversed.scrollY).toBeLessThan(forward.scrollY);
    expect(reversed.progress).toBeCloseTo(before.progress, 2);
    expect(reversed.reveal).toBeCloseTo(before.reveal, 2);
    expect(reversed.opacity).toBeCloseTo(before.opacity, 2);
    expect(reversed.lift).toBeCloseTo(before.lift, 0);

    // Motion completes before the reading area, then stays still while the
    // document keeps moving. This intentionally rejects continuous parallax.
    await page.mouse.wheel(0, height * 0.4);
    await settleNativeScroll(page, info, `reading-hold-${width}x${height}`);
    const hold = await readDetail();
    expect(hold.reveal).toBe(1);
    expect(hold.opacity).toBe(1);
    expect(hold.lift).toBe(0);
    await page.mouse.wheel(0, height * 0.1);
    await settleNativeScroll(
      page,
      info,
      `reading-hold-forward-${width}x${height}`,
    );
    const held = await readDetail();
    expect(held.scrollY).toBeGreaterThan(hold.scrollY);
    expect(held.progress).toBeGreaterThan(hold.progress);
    expect(held.reveal).toBe(1);
    expect(held.opacity).toBe(1);
    expect(held.lift).toBe(0);
    await info.attach(`editorial-phases-${width}x${height}`, {
      body: JSON.stringify({ before, forward, reversed, hold, held }, null, 2),
      contentType: "application/json",
    });
    const photoCredit = page.getByRole("link", {
      name: "2017 GT-R Premium Edition · Photography credits",
    });
    await photoCredit.focus();
    await settleNativeScroll(page, info, `focus-settled-${width}x${height}`);
    await expect(photoCredit).toBeFocused();
    await expect(photoCredit).toBeInViewport();
    expect(
      await page
        .locator(".home-editorial-image--cockpit")
        .evaluate((element) => getComputedStyle(element).clipPath),
    ).toBe("none");
    await photoCredit.blur();
    await settleNativeScroll(page, info, `blur-settled-${width}x${height}`);

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

    const headlines: string[] = [];
    for (const index of [0, 1, 2, 3]) {
      await scrollArchiveChapter(page, index);
      await expectArchiveArrivalInView(page, index);
      await expectArchivePanelLayout(page, index);
      const chapter = archiveChapter(page, index);
      const bounds = (await chapter
        .locator(".home-timeline-image")
        .boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(width * 0.7);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      const caption = (await chapter
        .locator(".home-timeline-caption")
        .boundingBox())!;
      expect(caption.y - bounds.y - bounds.height).toBeGreaterThanOrEqual(0);
      expect(caption.y - bounds.y - bounds.height).toBeLessThanOrEqual(48);
      headlines.push(
        await chapter.locator(".home-timeline-caption h3").innerText(),
      );
    }
    expect(new Set(headlines).size).toBe(4);
    await expectCompactArchiveFlow(page);
    await scrollArchiveChapter(page, 1);
    await expect(
      archiveChapter(page, 1).locator(".home-timeline-caption h3"),
    ).toHaveText(headlines[1], { useInnerText: true });
    for (const [index, name] of archiveNames.entries()) {
      const button = page.getByRole("button", { name, exact: true });
      const bounds = (await button.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
      await button.click();
      await expect(page.locator(".home-archive-runway")).toHaveAttribute(
        "data-active-era",
        String(index),
      );
      await settleNativeScroll(
        page,
        info,
        `archive-button-${width}x${height}-${index}`,
      );
      await expectArchiveArrivalInView(page, index);
      await expect(archiveChapter(page, index)).toBeFocused();
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
  expect(
    await page
      .locator(".home-archive-navigation")
      .evaluate((element) => getComputedStyle(element).position),
  ).toBe("static");
  for (const chapter of await page.locator(".home-archive-chapter").all()) {
    await expect(chapter.getByRole("heading")).toBeVisible();
    await expect(chapter.locator(".home-timeline-image")).toHaveCSS(
      "transform",
      "none",
    );
    await expect(chapter.locator(".home-timeline-image")).toHaveCSS(
      "filter",
      "none",
    );
    await expect(chapter.locator(".home-timeline-image")).toHaveCSS(
      "opacity",
      "1",
    );
  }
  for (const image of await page.locator(".home-editorial-image").all()) {
    expect(
      await image.evaluate((element) => getComputedStyle(element).clipPath),
    ).toBe("none");
    expect(
      await image.evaluate((element) => getComputedStyle(element).transform),
    ).toBe("none");
  }
});

test("archive chapters follow native forward and reverse wheel input", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeWithout3D(page);
  await scrollArchiveChapter(page, 0);
  const headline = await archiveChapter(page, 0)
    .locator(".home-timeline-caption h3")
    .innerText();
  for (const index of [1, 2, 3, 2, 1, 0]) {
    const distance =
      (await archiveChapterDestination(page, index)) -
      (await page.evaluate(() => scrollY));
    await page.mouse.move(10, Math.round(page.viewportSize()!.height / 2));
    await page.mouse.wheel(0, distance);
    await settleNativeScroll(
      page,
      info,
      `archive-wheel-${index}-${distance > 0 ? "forward" : "reverse"}`,
    );
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      String(index),
    );
    await expect(
      page.getByRole("button", { name: archiveNames[index], exact: true }),
    ).toHaveAttribute("aria-current", "step");
    await expectArchiveArrivalInView(page, index);
  }
  await expect(
    archiveChapter(page, 0).locator(".home-timeline-caption h3"),
  ).toHaveText(headline);
});

test("enlarged driving film preserves focus, scroll and one-player lifecycle", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeWithout3D(page);
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  const trigger = page.getByRole("button", {
    name: "Enlarge driving film",
    exact: true,
  });
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await settleNativeScroll(page, info, "dialog-before-open");
  const before = await page.evaluate(() => scrollY);
  for (const closeMethod of ["escape", "button"] as const) {
    if (closeMethod === "escape") await trigger.click();
    else await trigger.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: "GT-R driving film",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", {
      name: "Close driving film",
      exact: true,
    });
    await expect(close).toBeFocused();
    await expect(dialog.locator("iframe")).toHaveCount(1);
    await expect(dialog.locator("iframe")).toHaveAttribute(
      "src",
      "https://media.flixel.com/cinemagraph/t53p8d1vu4miy763a938?hd=true",
    );
    await expect(page.locator(".home-film--detail iframe")).toHaveCount(0);
    for (const element of [dialog, close, dialog.locator("iframe")]) {
      const bounds = (await element.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(-1);
      expect(bounds.y).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(
        page.viewportSize()!.width + 1,
      );
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(
        page.viewportSize()!.height + 1,
      );
    }
    await close.focus();
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`enlarged-driving-film-${closeMethod}.png`),
      scale: "css",
    });
    if (closeMethod === "escape") await page.keyboard.press("Escape");
    else await close.click();
    await expect(dialog).not.toBeVisible();
    await expect(dialog.locator("iframe")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(
      Math.abs((await page.evaluate(() => scrollY)) - before),
    ).toBeLessThanOrEqual(2);
  }
});

test("stalled enlarged driving film shows recovery and permits an explicit retry", async ({
  page,
}, info) => {
  // Hold only the external document request. This establishes app recovery,
  // not provider availability or playback.
  await page.route(
    "https://media.flixel.com/cinemagraph/t53p8d1vu4miy763a938?hd=true",
    () => {},
  );
  await page.goto("/");
  await continueHomeWithout3D(page);
  await scrollProgress(page, ".home-expanding-runway", 0.5);
  await page.clock.install();
  await page
    .getByRole("button", { name: "Enlarge driving film", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "GT-R driving film",
    exact: true,
  });
  await expect(dialog.getByRole("status")).toHaveText(
    "Loading the publisher’s player…",
  );
  await page.clock.fastForward(20001);
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await expect(dialog.getByRole("status")).toHaveText(
    "The embedded film could not load.",
  );
  const retry = dialog.getByRole("button", {
    name: "Retry driving film",
    exact: true,
  });
  const original = dialog.getByRole("link", {
    name: "Watch original on Flixel",
    exact: true,
  });
  await expect(retry).toBeVisible();
  await expect(original).toHaveAttribute(
    "href",
    "https://flixel.com/cinemagraph/t53p8d1vu4miy763a938",
  );
  for (const element of [retry, original, dialog.getByRole("status")]) {
    const bounds = (await element.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  }
  await page.screenshot({
    path: info.outputPath("enlarged-film-recovery.png"),
    scale: "css",
  });
  if (info.project.name === "home-desktop") {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      for (const element of [retry, original, dialog.getByRole("status")]) {
        await expect(element).toBeVisible();
        const bounds = (await element.boundingBox())!;
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.y).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      }
      const controls = (await original.boundingBox())!;
      const status = (await dialog.getByRole("status").boundingBox())!;
      expect(controls.y + controls.height).toBeLessThanOrEqual(status.y);
      await page.screenshot({
        path: info.outputPath(`enlarged-film-recovery-${viewport.width}.png`),
        scale: "css",
      });
    }
  }
  await retry.focus();
  await retry.press("Enter");
  await expect(dialog.locator("iframe")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "Close driving film", exact: true }),
  ).toBeFocused();
  await expect(dialog.getByRole("status")).toHaveText(
    "Loading the publisher’s player…",
  );
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(dialog.locator("iframe")).toHaveCount(0);
});

test("model invitations keep all six cards separated and keyboard reachable", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "home-desktop",
    "One bounded responsive card sweep",
  );
  const models = [
    ["premium", "Premium"],
    ["nismo", "NISMO"],
    ["tspec", "T-spec"],
    ["gtr50", "GT-R50"],
    ["gt3", "GT3"],
    ["gt500", "GT500"],
  ];
  for (const [width, height] of [
    [390, 844],
    [430, 932],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await continueHomeWithout3D(page);
    const cards = page.locator(".home-model-invitation");
    await expect(cards).toHaveCount(6);
    const gaps = await cards.evaluateAll((nodes) =>
      nodes.slice(1).map((node, index) => {
        const current = node.getBoundingClientRect(),
          previous = nodes[index].getBoundingClientRect();
        if (Math.abs(current.top - previous.top) < 2)
          return current.left - previous.right;
        const above =
          nodes[index + 1 - (innerWidth > 700 ? 2 : 1)].getBoundingClientRect();
        return current.top - above.bottom;
      }),
    );
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(18);
    await cards.first().focus();
    for (let index = 0; index < models.length; index++) {
      const [id, name] = models[index];
      const card = cards.nth(index);
      await expect(card).toBeFocused();
      await expect(card).toHaveAttribute("href", `/configurator/${id}`);
      await expect(card).toHaveAccessibleName(
        `Explore ${name}: ${id === "premium" ? "View in 3D" : "View photos"}`,
      );
      await card.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          card
            .locator("img")
            .evaluate(
              (node) =>
                (node as HTMLImageElement).complete &&
                (node as HTMLImageElement).naturalWidth > 0,
            ),
        )
        .toBe(true);
      const box = (await card.boundingBox())!;
      const title = (await card.locator("h3").boundingBox())!;
      const cta = (await card.locator(".home-invitation-cta").boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(width <= 700 ? 14 : 24);
      expect(box.x + box.width).toBeLessThanOrEqual(
        width - (width <= 700 ? 14 : 24),
      );
      expect(box.height).toBeGreaterThanOrEqual(240);
      expect(title.x).toBeGreaterThanOrEqual(box.x + 12);
      expect(title.x + title.width).toBeLessThanOrEqual(box.x + box.width - 12);
      expect(cta.x + cta.width).toBeLessThanOrEqual(box.x + box.width - 12);
      expect(cta.y + cta.height).toBeLessThanOrEqual(box.y + box.height - 8);
      expect(
        await card.evaluate((node) => getComputedStyle(node).outlineStyle),
      ).not.toBe("none");
      if (width <= 700) {
        expect(cta.y - title.y - title.height).toBeGreaterThanOrEqual(6);
        expect(
          Number.parseFloat(
            await card.evaluate((node) => getComputedStyle(node).borderRadius),
          ),
        ).toBeGreaterThanOrEqual(12);
      } else {
        expect(box.height).toBeGreaterThanOrEqual(390);
        expect(cta.y - title.y - title.height).toBeGreaterThanOrEqual(20);
      }
      await card.screenshot({
        path: info.outputPath(`model-card-${width}-${id}.png`),
        animations: "disabled",
        scale: "css",
      });
      if (index < models.length - 1) await page.keyboard.press("Tab");
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("desktop timeline keeps readable captions, native navigation and reversible photo focus", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "home-desktop",
    "One focused user-height collision sweep",
  );
  test.setTimeout(60000);
  for (const [width, height] of [
    [1920, 900],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await continueHomeWithout3D(page);
    const navigation = page.getByRole("navigation", { name: "GT-R eras" });
    await navigation.scrollIntoViewIfNeeded();
    await expect(navigation).toBeInViewport({ ratio: 1 });
    await expect(navigation).toHaveCSS("position", "static");
    const hitTargets = await navigation
      .locator("button")
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          );
          return hit !== null && (hit === button || button.contains(hit));
        }),
      );
    expect(hitTargets).toEqual([true, true, true, true]);
    for (const index of [0, 1, 2, 3]) {
      const destination = await archiveChapterDestination(page, index);
      for (const offset of [0, 0.22, 0.44]) {
        await page.evaluate(
          (y) => window.scrollTo({ top: y, behavior: "instant" }),
          destination + height * offset,
        );
        await settleNativeScroll(
          page,
          info,
          `timeline-flow-${width}-${index}-${offset}`,
        );
        await expectArchivePanelLayout(page, index);
        if (index > 0 || offset > 0)
          await expect(navigation).not.toBeInViewport();
      }
    }
    const chapter = archiveChapter(page, 1);
    await chapter.evaluate((element) =>
      window.scrollTo({
        top: scrollY + element.getBoundingClientRect().top - innerHeight * 0.7,
        behavior: "instant",
      }),
    );
    await settleNativeScroll(page, info, `timeline-focus-before-${width}`);
    const readFocus = () =>
      chapter.evaluate((element) => {
        const style = getComputedStyle(element);
        const image = getComputedStyle(
          element.querySelector(".home-timeline-image")!,
        );
        return {
          scrollY,
          opacity: Number(style.getPropertyValue("--timeline-opacity")),
          blur: Number.parseFloat(style.getPropertyValue("--timeline-blur")),
          scale: Number(style.getPropertyValue("--timeline-scale")),
          renderedOpacity: Number(image.opacity),
          renderedBlur: Number.parseFloat(image.filter.replace("blur(", "")),
        };
      });
    const before = await readFocus();
    await page.mouse.move(10, height / 2);
    await page.mouse.wheel(0, height * 0.45);
    await settleNativeScroll(page, info, `timeline-focus-forward-${width}`);
    const forward = await readFocus();
    expect(forward.scrollY).toBeGreaterThan(before.scrollY);
    expect(forward.opacity).toBeGreaterThan(before.opacity);
    expect(forward.blur).toBeLessThan(before.blur);
    expect(forward.scale).toBeGreaterThan(before.scale);
    expect(forward.renderedOpacity).toBeCloseTo(forward.opacity, 3);
    expect(forward.renderedBlur).toBeCloseTo(forward.blur, 2);
    await page.mouse.wheel(0, -height * 0.45);
    await settleNativeScroll(page, info, `timeline-focus-reverse-${width}`);
    const reversed = await readFocus();
    expect(reversed.scrollY).toBeCloseTo(before.scrollY, 0);
    expect(reversed.opacity).toBeCloseTo(before.opacity, 2);
    expect(reversed.blur).toBeCloseTo(before.blur, 2);
    expect(reversed.scale).toBeCloseTo(before.scale, 3);
    await info.attach(`timeline-focus-${width}`, {
      body: JSON.stringify({ before, forward, reversed }, null, 2),
      contentType: "application/json",
    });
    await scrollArchiveChapter(page, 1);
    await expectArchiveArrivalInView(page, 1);
    const heading = chapter.locator(".home-timeline-caption h3");
    const stableTitle = await heading.innerText();
    for (const [index, delta] of [12, -12, 12, -12].entries()) {
      await page.mouse.wheel(0, delta);
      await settleNativeScroll(page, info, `stable-title-${width}-${index}`);
      await expect(heading).toHaveText(stableTitle, { useInnerText: true });
      await expect(heading).toBeInViewport({ ratio: 1 });
      await expect(heading).toHaveCSS("opacity", "1");
      await expect(chapter.locator(".home-timeline-caption")).toHaveCSS(
        "opacity",
        "1",
      );
    }
    await page.screenshot({
      path: info.outputPath(`timeline-readable-${width}x${height}.png`),
      scale: "css",
    });
  }
});

test("archive disclosures retain original photo evidence and credits with keyboard access", async ({
  page,
}, info) => {
  await page.goto("/");
  await continueHomeWithout3D(page);
  for (const index of [0, 1, 2, 3]) {
    const chapter = archiveChapter(page, index);
    const details = chapter.locator(".home-timeline-details");
    const summary = details.locator("summary");
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await expect(summary).toBeFocused();
    await expect(details).not.toHaveAttribute("open", "");
    await summary.press("Space");
    await expect(details).toHaveAttribute("open", "");
    const figures = details.locator("figure");
    await expect(figures).toHaveCount(3);
    await expect(
      details.getByRole("link", {
        name: "Lead photograph credit",
        exact: true,
      }),
    ).toHaveAttribute("href", /^\/credits#/);
    await expect(
      details.getByRole("link", { name: "Historical source", exact: true }),
    ).toHaveAttribute("href", /^https:\/\//);
    for (const figure of await figures.all()) {
      await figure.scrollIntoViewIfNeeded();
      const image = figure.locator("img");
      await expect(image).toBeVisible();
      await expect(image).toHaveCSS("object-fit", "contain");
      await expect(image).toHaveAttribute("alt", /\S/);
      await image.evaluate((node) => (node as HTMLImageElement).decode());
      await expect(figure.locator("figcaption")).toHaveText(/\S/);
      await expect(
        figure.getByRole("link", { name: /^Photo credit:/ }),
      ).toHaveAttribute("href", /^\/credits#/);
    }
    await summary.scrollIntoViewIfNeeded();
    await summary.focus();
    await summary.press("Enter");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details.locator(".home-timeline-evidence")).not.toBeVisible();
    await expect(chapter.locator("figure:visible")).toHaveCount(1);
    await settleNativeScroll(page, info, `archive-disclosure-closed-${index}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("layered menu opens and closes with real motion and retains focus", async ({
  browser,
}, info) => {
  test.skip(
    info.project.name !== "home-desktop",
    "One bounded recorded menu interaction",
  );
  const context = await browser.newContext({
    baseURL: process.env.HOME_QA_URL || "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    recordVideo: {
      dir: info.outputPath("menu-video"),
      size: { width: 1440, height: 900 },
    },
  });
  const page = await context.newPage();
  await page.goto("/");
  await continueHomeWithout3D(page);
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Explore GT-R LAB" }),
    first = dialog.getByRole("link", { name: "Models", exact: true });
  const early = await first.evaluate((el) =>
    Number(getComputedStyle(el).opacity),
  );
  await page.screenshot({
    path: info.outputPath("menu-opening.png"),
    animations: "allow",
    scale: "css",
  });
  await expect
    .poll(() => first.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.99);
  expect(early).toBeLessThan(0.99);
  await page.screenshot({
    path: info.outputPath("menu-open.png"),
    animations: "allow",
    scale: "css",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "Close menu" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  expect(await first.evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await context.close();
});
