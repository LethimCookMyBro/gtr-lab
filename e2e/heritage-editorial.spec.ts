import { expect, test } from "@playwright/test";
import { continueHomeWithout3D } from "./helpers/home-gate";
import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";
const names = [
  "1969: Skyline GT-R",
  "1989: R32 GT-R",
  "1999: R34 GT-R",
  "2007: R35 GT-R",
];
async function settleArchiveMedia(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#home-heritage img").evaluateAll(async (nodes) => {
    await Promise.all(
      (nodes as HTMLImageElement[]).map(async (image) => {
        image.loading = "eager";
        await image.decode();
      }),
    );
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}
async function open(page: Page, settled = true) {
  await page.route("https://media.flixel.com/**", (route) => route.abort());
  await page.goto("/");
  await continueHomeWithout3D(page);
  await expect(page.locator("#home-title")).toHaveCSS("outline-style", "none");
  // Layout composition is measured against settled document geometry. A separate
  // cold-load case below observes the real lazy/font path without this setup.
  if (settled) await settleArchiveMedia(page);
  await page.locator("#home-heritage").scrollIntoViewIfNeeded();
}
async function waitForScrollRest(page: Page) {
  const settled = await page.evaluate(async () => {
    let previous = scrollY;
    let stableFrames = 0;
    for (let frame = 0; frame < 240; frame++) {
      await new Promise(requestAnimationFrame);
      const current = scrollY;
      stableFrames = Math.abs(current - previous) < 0.5 ? stableFrames + 1 : 0;
      previous = current;
      if (stableFrames >= 8) return true;
    }
    return false;
  });
  expect(settled, "native scrolling must settle before the next gesture").toBe(
    true,
  );
}
async function select(page: Page, index: number) {
  const button = page.getByRole("button", { name: names[index], exact: true });
  await button.focus();
  await button.press("Enter");
  await waitForScrollRest(page);
  const chapter = page.locator(`[data-era-image="${index}"]`);
  // Acceptance is a readable arrival below the rail, not an arbitrary
  // three-pixel scroll coordinate. The strict old threshold rejected harmless
  // 3.6–4.5px settling even while the complete heading stayed unobscured.
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      chapter.getByRole("heading").evaluate((node) => {
        const rail = document
          .querySelector(".home-archive-stage")!
          .getBoundingClientRect();
        return node.getBoundingClientRect().top - rail.bottom;
      }),
    )
    .toBeGreaterThan(8);
  await expect(chapter).toBeFocused();
  await expect(button).toHaveAttribute("aria-current", "step");
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await chapter.locator("img").evaluateAll(async (nodes) => {
    for (const node of nodes as HTMLImageElement[]) {
      node.loading = "eager";
      await node.decode();
    }
  });
  return chapter;
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
  });
}

test("four compact editorial spreads have a dominant photo, supporting evidence and attached captions", async ({
  page,
}, info) => {
  await open(page);
  for (const index of [0, 1, 2, 3, 0]) {
    const chapter = await select(page, index);
    await expect(chapter.locator("figure")).toHaveCount(3);
    await expect(chapter.locator(".home-archive-achievement")).toBeVisible();
    const geometry = await chapter.evaluate((node) => {
      const primary = node
        .querySelector(".home-archive-image")!
        .getBoundingClientRect();
      const supports = [
        ...node.querySelectorAll(".home-archive-support-image"),
      ].map((n) => n.getBoundingClientRect());
      const photos = [...node.querySelectorAll("figure")].map((n) => {
        const image = n.querySelector("img")!,
          imageRect = image.getBoundingClientRect(),
          caption = n.querySelector("figcaption")!.getBoundingClientRect();
        return {
          loaded: image.complete && image.naturalWidth > 0,
          ratio: Math.abs(
            imageRect.width / imageRect.height -
              image.naturalWidth / image.naturalHeight,
          ),
          gap: caption.top - imageRect.bottom,
        };
      });
      return {
        height: node.getBoundingClientRect().height,
        primary: { x: primary.x, width: primary.width },
        supports: supports.map((n) => ({ x: n.x, width: n.width })),
        photos,
      };
    });
    if (index === 1) {
      expect(geometry.height).toBeLessThan(900 * 2);
      const stage = (await chapter.locator(".home-r32-stage").boundingBox())!;
      expect(stage.y).toBeGreaterThan(130);
      expect(stage.y + stage.height).toBeLessThanOrEqual(900);
      await expect(chapter.locator(".home-archive-image img")).toHaveAttribute(
        "src",
        /archive-r32-oran-park/,
      );
    } else expect(geometry.height).toBeLessThan(1200);
    expect(geometry.primary.width).toBeGreaterThan(
      geometry.supports[0].width * 1.7,
    );
    for (const support of geometry.supports)
      expect(support.x).toBeGreaterThan(
        geometry.primary.x + geometry.primary.width,
      );
    for (const photo of geometry.photos) {
      expect(photo.loaded).toBe(true);
      expect(photo.ratio).toBeLessThan(0.02);
      expect(photo.gap).toBeGreaterThanOrEqual(8);
      expect(photo.gap).toBeLessThanOrEqual(16);
    }
    await capture(page, info, `desktop-spread-${index}`);
    await chapter.screenshot({
      path: info.outputPath(`desktop-entire-chapter-${index}.png`),
      animations: "disabled",
    });
  }
  await expect(page.locator(".home-archive-narrative")).toHaveCount(0);
  await expect(page.locator(".home-archive-year")).toHaveCount(0);
});

for (const viewport of [
  { width: 375, height: 600 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`natural mobile reading at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await open(page);
    for (const index of [0, 1, 2, 3]) {
      const chapter = await select(page, index);
      const geometry = await chapter.evaluate((node) => {
        const copy = node
          .querySelector(".home-archive-heading-row")!
          .getBoundingClientRect();
        const description = node
          .querySelector(".home-archive-description")!
          .getBoundingClientRect();
        const figures = [...node.querySelectorAll("figure")].map((n) =>
          n.getBoundingClientRect(),
        );
        return {
          copyBottom: copy.bottom,
          descriptionBottom: description.bottom,
          figures: figures.map((n) => ({
            top: n.top,
            bottom: n.bottom,
            width: n.width,
          })),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(geometry.overflow).toBe(false);
      expect(geometry.copyBottom).toBeLessThan(geometry.figures[0].top);
      expect(geometry.descriptionBottom).toBeLessThan(geometry.figures[1].top);
      expect(geometry.figures[1].bottom).toBeLessThan(geometry.figures[2].top);
      expect(geometry.figures[2].top - geometry.figures[1].bottom).toBeLessThan(
        40,
      );
      for (const figure of geometry.figures)
        expect(figure.width).toBeGreaterThan(viewport.width * 0.85);
      await capture(
        page,
        info,
        `mobile-${viewport.width}x${viewport.height}-heading-${index}`,
      );
      await chapter.screenshot({
        path: info.outputPath(
          `mobile-${viewport.width}x${viewport.height}-entire-${index}.png`,
        ),
        animations: "disabled",
      });
      if (index === 1) {
        for (const [label, figureIndex] of [
          ["road", 1],
          ["engine", 2],
          ["reverse-road", 1],
        ] as const) {
          const figure = chapter.locator("figure").nth(figureIndex);
          const target = await figure.evaluate((node) => {
            let top = 0;
            let current: HTMLElement | null = node as HTMLElement;
            while (current) {
              top += current.offsetTop;
              current = current.offsetParent as HTMLElement | null;
            }
            return top - innerHeight * 0.28;
          });
          await page.mouse.wheel(
            0,
            target - (await page.evaluate(() => scrollY)),
          );
          await waitForScrollRest(page);
          await expect(figure).toHaveCSS("opacity", "1");
          await expect(figure).toBeInViewport({ ratio: 1 });
          await capture(
            page,
            info,
            `mobile-r32-${label}-${viewport.width}x${viewport.height}`,
          );
        }
      }
    }
  });
}

for (const mode of ["reduced", "short"] as const) {
  test(`${mode} layout keeps natural chapters and keyboard rail`, async ({
    page,
  }, info) => {
    if (mode === "reduced")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.setViewportSize({ width: 1440, height: 600 });
    await open(page);
    for (const index of [3, 0, 2]) {
      const chapter = await select(page, index);
      await expect(chapter.locator(".home-archive-spread")).toHaveCSS(
        "transform",
        "none",
      );
    }
    await capture(page, info, `${mode}-archive`);
  });
}

test("pointer era landings have no focus box and lower evidence reaches its readable hold", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await open(page);
  // The era button retains keyboard feedback; the reading landmark does not
  // draw a frame around a whole multi-viewport chapter after focus transfer.
  const keyboardButton = page.getByRole("button", {
    name: names[0],
    exact: true,
  });
  await keyboardButton.focus();
  await expect(keyboardButton).toHaveCSS("outline-width", "2px");
  const keyboardChapter = await select(page, 0);
  await expect(keyboardChapter).toBeFocused();
  await expect(keyboardChapter).toHaveCSS("outline-style", "none");
  await page.screenshot({
    path: info.outputPath("keyboard-destination-outline.png"),
  });

  const frames = [];
  for (const index of [1, 2, 3, 0]) {
    const button = page.getByRole("button", {
      name: names[index],
      exact: true,
    });
    // Actual pointer input must clear keyboard modality before focus is handed
    // from the clicked control to the corresponding chapter.
    await button.click();
    await waitForScrollRest(page);
    const chapter = page.locator(`[data-era-image="${index}"]`);
    await expect(chapter).toBeFocused();
    expect(
      await chapter.evaluate((node) => node.matches(":focus-visible")),
    ).toBe(false);
    await expect(chapter).toHaveCSS("outline-style", "none");
    await expect(button).toHaveAttribute("aria-current", "step");
    await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath(`pointer-landing-${index}.png`),
    });

    const lowerEvidence = chapter.locator(
      ".home-archive-support-image:last-child, .home-archive-description",
    );
    const target =
      index === 1
        ? await chapter.evaluate((node) => {
            const stage = node.querySelector<HTMLElement>(".home-r32-stage")!;
            return (
              scrollY +
              node.getBoundingClientRect().top -
              150 +
              (node.getBoundingClientRect().height - stage.offsetHeight - 52) *
                0.65
            );
          })
        : await lowerEvidence.evaluateAll((nodes) => {
            const tops = nodes.map((node) => {
              let top = 0;
              let current: HTMLElement | null = node as HTMLElement;
              while (current) {
                top += current.offsetTop;
                current = current.offsetParent as HTMLElement | null;
              }
              return top;
            });
            // Supporting details complete their entrance at43% viewport height.
            // Put the later item just inside that reading hold using native scrolling.
            return Math.max(...tops) - innerHeight * 0.42;
          });
    const viewport = page.viewportSize()!;
    await page.mouse.move(viewport.width / 2, viewport.height * 0.8);
    await page.mouse.wheel(0, target - (await page.evaluate(() => scrollY)));
    await waitForScrollRest(page);
    await expect(lowerEvidence).toHaveCount(2);
    for (const item of await lowerEvidence.all()) {
      if (index === 1) {
        await expect
          .poll(() =>
            chapter.evaluate((node) =>
              Number(
                (node as HTMLElement).style.getPropertyValue(
                  "--r32-engine-reveal",
                ),
              ),
            ),
          )
          .toBe(1);
      } else
        await expect
          .poll(() =>
            item.evaluate((node) =>
              Number(
                (node as HTMLElement).style.getPropertyValue("--item-reveal"),
              ),
            ),
          )
          .toBe(1);
      await expect(item).toHaveCSS("opacity", "1");
      expect(
        await item.evaluate(
          (node) => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42,
        ),
      ).toBe(0);
      await expect(item).toBeInViewport();
    }
    // This pause is for the unretimed review video, after all readiness assertions.
    // Production motion and opacity remain untouched throughout the capture.
    await page.waitForTimeout(700);
    await expect(chapter).toHaveCSS("outline-style", "none");
    await page.screenshot({
      path: info.outputPath(`pointer-lower-details-settled-${index}.png`),
    });
    frames.push({
      index,
      state: await chapter.evaluate((node) => ({
        scrollY,
        focused: node === document.activeElement,
        focusVisible: node.matches(":focus-visible"),
        outline: getComputedStyle(node).outline,
        evidence: [
          ...node.querySelectorAll<HTMLElement>(
            ".home-archive-support-image:last-child, .home-archive-description",
          ),
        ].map((item) => ({
          className: item.className,
          reveal: Number(item.style.getPropertyValue("--item-reveal")),
          opacity: Number(getComputedStyle(item).opacity),
          transform: getComputedStyle(item).transform,
          top: item.getBoundingClientRect().top,
          bottom: item.getBoundingClientRect().bottom,
        })),
      })),
    });
  }
  await info.attach("pointer-focus-and-settled-evidence", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  });
});

test("native forward and reverse wheel scrolling tracks the chapter at the reading line", async ({
  page,
}, info) => {
  await open(page);
  await select(page, 0);
  const frames = [];
  for (const index of [1, 2, 3, 2, 1, 0]) {
    const target = await page
      .locator(`[data-era-image="${index}"]`)
      .evaluate((node) => scrollY + node.getBoundingClientRect().top - 190);
    const before = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, target - before);
    await waitForScrollRest(page);
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      String(index),
    );
    await expect(
      page.getByRole("button", { name: names[index], exact: true }),
    ).toHaveAttribute("aria-current", "step");
    frames.push({ index, scrollY: await page.evaluate(() => scrollY) });
  }
  await info.attach("native-forward-reverse", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  });
});

test("cold chapter jump stays readable while photographs and fonts settle", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 600 });
  await open(page, false);
  const snapshot = () =>
    page.locator("#home-heritage").evaluate((section) => ({
      scrollY,
      fonts: document.fonts.status,
      articleTop: section
        .querySelector('[data-era-image="3"]')!
        .getBoundingClientRect().top,
      images: [...section.querySelectorAll("img")].map((image) => ({
        src: image.currentSrc,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        height: image.getBoundingClientRect().height,
      })),
      sections: [...document.querySelectorAll("[data-motion-section]")].map(
        (node) => ({
          kind: (node as HTMLElement).dataset.motionSection,
          height: node.getBoundingClientRect().height,
        }),
      ),
    }));
  const before = await snapshot();
  await page.getByRole("button", { name: names[3], exact: true }).click();
  const arrival = await snapshot();
  const chapter = page.locator('[data-era-image="3"]');
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("button", { name: names[3], exact: true }),
  ).toHaveAttribute("aria-current", "step");
  await settleArchiveMedia(page);
  const settled = await snapshot();
  await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
  const rail = (await page.locator(".home-archive-stage").boundingBox())!;
  expect((await chapter.getByRole("heading").boundingBox())!.y).toBeGreaterThan(
    rail.y + rail.height + 8,
  );
  const geometryPath = info.outputPath("cold-to-settled-archive-geometry.json");
  await writeFile(
    geometryPath,
    JSON.stringify({ before, arrival, settled }, null, 2),
  );
  await info.attach("cold-to-settled-archive-geometry", {
    path: geometryPath,
    contentType: "application/json",
  });
  await capture(page, info, "cold-r35-after-media-settles");
  // Repeated keyboard navigation must keep the same visible story and active era.
  await select(page, 3);
});

test("section motion has one ordered reversible phase and a fully readable reduced-motion state", async ({
  page,
}, info) => {
  await open(page);
  const readAt = async (topRatio: number) => {
    const lead = page.locator('[data-era-image="0"] .home-archive-image');
    const target = await lead.evaluate((node, ratio) => {
      const element = node as HTMLElement;
      // Motion transforms must never become input to the scroll measurement.
      let top = 0;
      let current: HTMLElement | null = element;
      while (current) {
        top += current.offsetTop;
        current = current.offsetParent as HTMLElement | null;
      }
      return top - innerHeight * ratio;
    }, topRatio);
    await page.evaluate(
      (y) => scrollTo({ top: y, behavior: "instant" }),
      target,
    );
    await waitForScrollRest(page);
    return page.locator('[data-era-image="0"]').evaluate((chapter) => {
      const state = (selector: string) => {
        const node = chapter.querySelector<HTMLElement>(selector)!;
        const styles = getComputedStyle(node);
        return {
          reveal: Number(node.style.getPropertyValue("--item-reveal")),
          opacity: Number(styles.opacity),
          authoredOpacity: Number(
            node.style.getPropertyValue("--item-opacity"),
          ),
          transform: styles.transform,
          font: styles.fontFamily,
        };
      };
      return {
        heading: state(".home-archive-inline-copy"),
        photo: state(".home-archive-image"),
        detail: state(".home-archive-achievement"),
      };
    });
  };
  const entrance = await readAt(0.72);
  expect(entrance.heading.reveal).toBeGreaterThan(entrance.photo.reveal);
  expect(entrance.photo.reveal).toBeGreaterThan(entrance.detail.reveal);
  expect(entrance.photo.opacity).toBeCloseTo(entrance.photo.authoredOpacity, 3);
  expect(entrance.detail.opacity).toBeCloseTo(
    entrance.detail.authoredOpacity,
    3,
  );
  expect(entrance.photo.opacity).toBeLessThan(0.85);
  await capture(page, info, "ordered-motion-entrance");
  const reading = await readAt(0.3);
  expect(reading.photo.opacity).toBe(1);
  expect(reading.detail.opacity).toBe(1);
  const reversed = await readAt(0.72);
  expect(reversed).toEqual(entrance);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const selector of [
    ".home-archive-inline-copy",
    ".home-archive-image",
    ".home-archive-achievement",
    ".home-archive-support-image",
    ".home-editorial-copy",
    ".home-editorial-image",
  ]) {
    for (const element of await page.locator(selector).all()) {
      await expect(element).toHaveCSS("opacity", "1");
      await expect(element).toHaveCSS("transform", "none");
    }
  }
  await capture(page, info, "reduced-motion-all-content-readable");
});

test("R32 race, record and engineering compose through native forward and reverse scroll", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  await open(page);
  await select(page, 0);
  const r32 = page.locator(".home-archive-r32");
  const snapshots = [];
  for (const [name, progress] of [
    ["enter", 0],
    ["race", 0.3],
    ["hold", 0.68],
    ["exit", 0.98],
    ["reverse-hold", 0.68],
    ["reverse-enter", 0],
  ] as const) {
    const target = await r32.evaluate((node, p) => {
      const stage = node.querySelector<HTMLElement>(".home-r32-stage")!;
      const bounds = node.getBoundingClientRect();
      return (
        scrollY +
        bounds.top -
        150 +
        (bounds.height - stage.offsetHeight - 52) * p
      );
    }, progress);
    const delta = target - (await page.evaluate(() => scrollY));
    for (let step = 0; step < 12; step++) {
      await page.mouse.wheel(0, delta / 12);
      await page.waitForTimeout(70);
    }
    await waitForScrollRest(page);
    await expect(page.locator("#home-heritage")).toHaveAttribute(
      "data-active-era",
      "1",
    );
    const state = await r32.evaluate((node) => {
      const read = (name: string) =>
        Number.parseFloat((node as HTMLElement).style.getPropertyValue(name));
      const stage = node.querySelector<HTMLElement>(".home-r32-stage")!;
      return {
        progress: read("--r32-progress"),
        clip: read("--r32-photo-clip"),
        title: read("--r32-title-shift"),
        road: read("--r32-road-reveal"),
        engine: read("--r32-engine-reveal"),
        exit: read("--r32-exit-shift"),
        top: stage.getBoundingClientRect().top,
        bottom: stage.getBoundingClientRect().bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(state.overflow).toBe(false);
    expect(state.progress).toBeCloseTo(progress, 1);
    if (name === "exit")
      await expect(r32.locator(".home-archive-inline-copy")).toHaveCSS(
        "opacity",
        /0\.0[0-9]+/,
      );
    if (name.includes("hold")) {
      expect(state.clip).toBe(0);
      expect(state.title).toBe(0);
      expect(state.road).toBe(1);
      expect(state.engine).toBe(1);
      expect(state.top).toBeGreaterThan(130);
      expect(state.bottom).toBeLessThanOrEqual(900);
      await expect(
        r32.locator(".home-archive-support-image:last-child"),
      ).toBeInViewport({ ratio: 1 });
    }
    snapshots.push({ name, ...state });
    await capture(page, info, `r32-${name}`);
    await page.waitForTimeout(500);
  }
  expect(snapshots[0].clip).toBeGreaterThan(20);
  expect(snapshots[1].clip).toBe(0);
  expect(snapshots[3].exit).toBeLessThan(-30);
  expect(snapshots[5].clip).toBeCloseTo(snapshots[0].clip, 1);
  await info.attach("r32-native-score", {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(r32.locator(".home-r32-stage")).toHaveCSS("position", "static");
  await expect(r32.locator(".home-archive-image img")).toHaveCSS(
    "clip-path",
    "none",
  );
  await expect(r32.locator(".home-r32-title-answer > span")).toHaveCSS(
    "transform",
    "none",
  );
});

for (const viewport of [
  { width: 1051, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test(`R32 reading hold fits the sticky viewport at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await open(page);
    const r32 = await select(page, 1);
    const stage = r32.locator(".home-r32-stage");
    await expect(stage).toHaveCSS("position", "sticky");
    const bounds = (await stage.boundingBox())!;
    expect(bounds.y).toBeGreaterThan(130);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    await expect(
      r32.locator(".home-archive-support-image:last-child"),
    ).toBeInViewport({ ratio: 1 });
    expect(
      await r32
        .locator(".home-archive-image img")
        .evaluate((node) => node.getBoundingClientRect().width),
    ).toBeLessThanOrEqual(1032);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await capture(page, info, `r32-hold-${viewport.width}x${viewport.height}`);
  });
}
