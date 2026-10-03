import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const eraNames = [
  "1969: Skyline GT-R",
  "1989: R32 GT-R",
  "1999: R34 GT-R",
  "2007: R35 GT-R",
];

async function openHeritage(page: Page) {
  // The archive's local images and motion remain real; remote films are unrelated to this layout test.
  await page.route("https://media.flixel.com/**", (route) => route.abort());
  await page.goto("/");
  await page.locator("#home-heritage").scrollIntoViewIfNeeded();
}

async function selectEra(page: Page, index: number) {
  const button = page.getByRole("button", {
    name: eraNames[index],
    exact: true,
  });
  await button.focus();
  await button.press("Enter");
  await expect(page.locator("#home-heritage")).toHaveAttribute(
    "data-active-era",
    String(index),
  );
  await expect(button).toHaveAttribute("aria-current", "step");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const section = document.querySelector("#home-heritage")!;
        const image = section
          .querySelector(
            `[data-era-image="${section.getAttribute("data-active-era")}"] .home-archive-image`,
          )!
          .getBoundingClientRect();
        return Math.abs(
          image.top +
            image.height / 2 -
            innerHeight * (innerWidth <= 700 ? 0.59 : 0.5),
        );
      }),
    )
    .toBeLessThan(20);
}

test("four alternating images pass a stable centered narrative and keyboard timeline", async ({
  page,
}, info) => {
  await openHeritage(page);
  for (const index of [0, 1, 2, 3, 0]) {
    await selectEra(page, index);
    const narrative = (await page
      .locator(".home-archive-narrative")
      .boundingBox())!;
    const image = (await page
      .locator(`[data-era-image="${index}"] .home-archive-image`)
      .boundingBox())!;
    expect(Math.abs(narrative.x + narrative.width / 2 - 720)).toBeLessThan(3);
    expect(narrative.width).toBeLessThan(460);
    expect(image.width).toBeLessThan(650);
    expect(index % 2 ? image.x : 1440 - image.x - image.width).toBeGreaterThan(
      700,
    );
    await expect(page.locator(".home-archive-navigation")).toBeInViewport({
      ratio: 1,
    });
    await expect(page.locator(".home-archive-description")).toBeInViewport({
      ratio: 1,
    });
    await page.screenshot({
      path: info.outputPath(`desktop-heritage-${index}.png`),
      animations: "disabled",
    });
  }
});

for (const viewport of [
  { width: 390, height: 600 },
  { width: 390, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`portrait ${viewport.width}×${viewport.height} keeps copy and captions separate`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await openHeritage(page);
    for (const index of [0, 1, 2, 3]) {
      await selectEra(page, index);
      const copy = (await page
        .locator(".home-archive-narrative")
        .boundingBox())!;
      const image = (await page
        .locator(`[data-era-image="${index}"] .home-archive-image`)
        .boundingBox())!;
      const timeline = (await page
        .locator(".home-archive-navigation")
        .boundingBox())!;
      expect(copy.y + copy.height).toBeLessThan(image.y);
      expect(image.y + image.height).toBeLessThan(timeline.y);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`portrait-heritage-${index}.png`),
        animations: "disabled",
      });
    }
  });
}

for (const mode of ["reduced", "short"] as const) {
  test(`${mode} fallback presents every story and timeline jumps to the story heading`, async ({
    page,
  }, info) => {
    if (mode === "reduced")
      await page.emulateMedia({ reducedMotion: "reduce" });
    else await page.setViewportSize({ width: 1440, height: 600 });
    await openHeritage(page);
    await expect(page.locator(".home-archive-narrative")).toBeHidden();
    for (const index of [0, 1, 2, 3]) {
      const chapter = page.locator(`[data-era-image="${index}"]`);
      await expect(chapter.getByRole("heading")).toBeVisible();
      await expect(chapter.getByRole("img")).toHaveAttribute("alt", /.+/);
    }
    const button = page.getByRole("button", { name: eraNames[3], exact: true });
    await button.focus();
    await button.press("Enter");
    const chapter = page.locator('[data-era-image="3"]');
    await expect(chapter.getByRole("heading")).toBeInViewport({ ratio: 1 });
    await expect(chapter).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`${mode}-heritage.png`),
      animations: "disabled",
    });
    await expect(
      page.getByRole("link", { name: "Archive photography & sources" }),
    ).toBeVisible();
  });
}

test("forward and reverse native scrolling evolves the centered story", async ({
  page,
}, info) => {
  await openHeritage(page);
  await selectEra(page, 0);
  const travel = await page
    .locator("#home-heritage")
    .evaluate(
      (section) =>
        section.getBoundingClientRect().height -
        section.querySelector<HTMLElement>(".home-archive-stage")!.offsetHeight,
    );
  const frames: {
    direction: number;
    scrollY: number;
    era: string | null;
    centerX: number;
    centerY: number;
  }[] = [];
  for (const direction of [1, -1]) {
    for (let step = 0; step < 28; step++) {
      await page.mouse.wheel(0, (direction * travel) / 28);
      await page.waitForTimeout(120);
      frames.push(
        await page.locator("#home-heritage").evaluate((section, direction) => {
          const narrative = section
            .querySelector(".home-archive-narrative")!
            .getBoundingClientRect();
          return {
            direction,
            scrollY,
            era: section.getAttribute("data-active-era"),
            centerX: narrative.x + narrative.width / 2,
            centerY: narrative.y + narrative.height / 2,
          };
        }, direction),
      );
    }
  }
  await info.attach("native-scroll-frames", {
    body: JSON.stringify(frames, null, 2),
    contentType: "application/json",
  });
  for (const direction of [1, -1]) {
    expect(
      [
        ...new Set(
          frames
            .filter((frame) => frame.direction === direction)
            .map((frame) => frame.era),
        ),
      ].sort(),
    ).toEqual(["0", "1", "2", "3"]);
  }
  for (const frame of frames) {
    expect(Math.abs(frame.centerX - 720)).toBeLessThan(3);
    expect(Math.abs(frame.centerY - 450)).toBeLessThan(4);
  }
});
