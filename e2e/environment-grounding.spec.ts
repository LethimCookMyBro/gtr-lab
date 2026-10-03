import { test, expect } from "@playwright/test";
import type { Page, TestInfo } from "@playwright/test";
const variant = process.env.ENVIRONMENT_QA_VARIANT || "candidate";
async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect
    .poll(() =>
      page.locator(".scene-stage canvas").evaluate((element) => {
        const c = element as HTMLCanvasElement;
        return Math.abs(
          c.width / c.clientWidth - Math.min(devicePixelRatio, 1.75),
        );
      }),
    )
    .toBeLessThan(0.02);
  await frames(page);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    animations: "disabled",
    scale: "css",
  });
}
async function camera(page: Page, name: string) {
  await page.getByRole("button", { name: "Camera", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name, exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await frames(page);
}
const fetchedOutdoor = new WeakMap<Page, Set<string>>();
async function environment(page: Page, id: string, name: string) {
  const outdoor = id === "forest" || id === "coast";
  const fetched = fetchedOutdoor.get(page) ?? new Set<string>();
  fetchedOutdoor.set(page, fetched);
  const response =
    outdoor && !fetched.has(id)
      ? page.waitForResponse(
          (r) =>
            r
              .url()
              .includes(
                `/environments/${id === "forest" ? "tief_etz" : "victoria_curve_01"}`,
              ) && r.url().endsWith(".hdr"),
        )
      : null;
  if (outdoor)
    await page.locator(".scene-stage canvas").evaluate((c) => {
      (c as HTMLCanvasElement).dataset.outdoorDraws = "0";
    });
  await page.getByRole("button", { name: "Environment", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: new RegExp("^" + name) })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("main.configurator")).toHaveClass(
    new RegExp("environment-" + id),
  );
  if (response) {
    const loaded = await response;
    expect(loaded.ok()).toBe(true);
    await loaded.finished();
    fetched.add(id);
  }
  if (outdoor) {
    // Instrumented real draw calls prove that HDR decode completed and the
    // backdrop reached WebGL, rather than merely trusting the selected UI label.
    await expect
      .poll(
        () =>
          page
            .locator(".scene-stage canvas")
            .getAttribute("data-outdoor-draws"),
        { timeout: 90000 },
      )
      .not.toBe("0");
  }
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await expect(page.locator(".scene-loading")).toHaveCount(0);
  await expect(page.locator(".scene-notice")).toHaveCount(0);
  await frames(page);
}

test("photographic environments remain grounded through camera and environment changes", async ({
  page,
}, info) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (["warning", "warn"].includes(m.type())) warnings.push(m.text());
  });
  await page.addInitScript(() => {
    for (const prototype of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ]) {
      for (const method of ["drawElements", "drawArrays"] as const) {
        const original = prototype[method] as (...args: any[]) => void;
        (prototype as any)[method] = function (...args: any[]) {
          const count = method === "drawElements" ? args[1] : args[2];
          if (count === 17340 || count === 195072) {
            this.canvas.dataset.outdoorDraws = String(
              Number(this.canvas.dataset.outdoorDraws || 0) + 1,
            );
          }
          return original.apply(this, args);
        };
      }
    }
  });
  await page.goto("/configurator/premium");
  await expect(page).toHaveTitle(/GT-R LAB/);
  await expect(
    page.getByRole("heading", { name: "GT-R R35", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ultimate Silver", exact: true }),
  ).toBeEnabled({ timeout: 90000 });
  await expect(page.locator(".scene-loading")).toHaveCount(0);
  await capture(page, info, "studio-hero");
  const canvas = page.locator(".scene-stage canvas");
  for (const [id, label] of [
    ["forest", "Forest road"],
    ["coast", "Coastal road"],
  ]) {
    await environment(page, id, label);
    await camera(page, "Front ¾");
    await capture(page, info, `${id}-hero`);
    await camera(page, "Rear ¾");
    await capture(page, info, `${id}-rear`);
    await canvas.focus();
    for (let i = 0; i < 12; i++) await canvas.press("-");
    await capture(page, info, `${id}-zoom-out`);
    await camera(page, "Top detail");
    await capture(page, info, `${id}-top`);
    await camera(page, "Front ¾");
    await canvas.focus();
    for (let i = 0; i < 15; i++) await canvas.press("ArrowDown");
    await capture(page, info, `${id}-low-orbit`);
    await camera(page, "Wheel detail");
    await capture(page, info, `${id}-wheel`);
  }
  await environment(page, "gallery", "Gallery");
  await camera(page, "Rear");
  await capture(page, info, "gallery-rear");
  await environment(page, "night", "After hours");
  await capture(page, info, "night-rear");
  await environment(page, "forest", "Forest road");
  await camera(page, "Front ¾");
  await capture(page, info, "forest-return");
  await environment(page, "studio", "Studio");
  await capture(page, info, "studio-return");
  await expect(canvas).toHaveCount(1);
  await expect(page.locator(".render-error, vite-error-overlay")).toHaveCount(
    0,
  );
  await info.attach("browser-diagnostics", {
    body: JSON.stringify({ variant, errors, warnings }, null, 2),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
  expect(
    warnings.filter((m) =>
      /shader error|INVALID_|GL_OUT_OF_MEMORY|VALIDATE_STATUS/i.test(m),
    ),
  ).toEqual([]);
});
