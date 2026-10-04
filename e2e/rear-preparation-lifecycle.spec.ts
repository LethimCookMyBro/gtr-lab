import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const gate = (page: Page) => page.locator(".home-loading-gate");
const rear = (page: Page) => page.locator(".home-signature-runway");

test.beforeEach(async ({ page }) => {
  await page.route("https://media.flixel.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Film fixture</title>",
    }),
  );
  await page.addInitScript(() => {
    (window as any).__rearCompilation = {
      held: true,
      queries: 0,
      afterDetach: 0,
    };
    const nativeCompletion = new WeakMap<object, boolean>();
    const status = 0x91b1;
    for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
      const getExtension = type.prototype.getExtension;
      const getProgramParameter = type.prototype.getProgramParameter;
      type.prototype.getExtension = function (name: string) {
        const extension = Reflect.apply(getExtension, this, [name]);
        if (name !== "KHR_parallel_shader_compile") return extension;
        nativeCompletion.set(this, extension !== null);
        return extension ?? { COMPLETION_STATUS_KHR: status };
      };
      type.prototype.getProgramParameter = function (
        program: WebGLProgram,
        pname: number,
      ) {
        if (pname !== status)
          return getProgramParameter.call(this, program, pname);
        const state = (window as any).__rearCompilation;
        state.queries++;
        if (!(this.canvas as HTMLCanvasElement).isConnected)
          state.afterDetach++;
        if (state.held) return false;
        // Fault injection delays completion only. Release still requires real
        // native completion (or actual shader linkage if KHR is unavailable).
        return getProgramParameter.call(
          this,
          program,
          nativeCompletion.get(this) ? status : this.LINK_STATUS,
        );
      };
    }
  });
});

async function preparing(page: Page) {
  await expect(gate(page)).toHaveAttribute("data-load-phase", "preparing");
  await expect
    .poll(() => page.evaluate(() => (window as any).__rearCompilation.queries))
    .toBeGreaterThan(0);
  await expect(gate(page)).toBeVisible();
  await expect(rear(page)).not.toHaveAttribute("data-scene-state", "ready");
}
async function releaseAndReady(page: Page) {
  await page.evaluate(() => {
    (window as any).__rearCompilation.held = false;
  });
  await expect(rear(page)).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  await expect(gate(page)).not.toBeVisible();
}
async function assertStopped(page: Page) {
  await expect(page.locator(".home-signature-canvas canvas")).toHaveCount(0);
  const before = await page.evaluate(() => ({
    ...(window as any).__rearCompilation,
  }));
  // Observe many of Three's old 10 ms poll intervals, including after renderer
  // teardown. This is cancellation evidence, not an arbitrary readiness sleep.
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    ...(window as any).__rearCompilation,
  }));
  expect(after.queries).toBe(before.queries);
  expect(after.afterDetach).toBe(0);
}

test("skipping pending compilation cancels polling before disposal and reentry prepares a fresh scene", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await preparing(page);
  await gate(page).getByRole("button", { name: "Continue without 3D" }).click();
  await expect(rear(page)).toHaveAttribute("data-scene-state", "skipped");
  await assertStopped(page);
  await page
    .getByRole("link", { name: "Explore the models", exact: true })
    .click();
  await expect(page).toHaveURL(/\/models$/);
  await page.goBack();
  await preparing(page);
  await releaseAndReady(page);
  expect(errors).toEqual([]);
  await info.attach("skip-reentry-compilation-evidence", {
    body: JSON.stringify({
      errors,
      ...(await page.evaluate(() => (window as any).__rearCompilation)),
    }),
    contentType: "application/json",
  });
});

test("browser Back unmounts a preparing scene without a stale timer and Forward can finish", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/models", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("link", { name: "GT-R LAB home", exact: true })
    .first()
    .click();
  await preparing(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/models$/);
  await assertStopped(page);
  await page.goForward();
  await preparing(page);
  await releaseAndReady(page);
  expect(errors).toEqual([]);
});

test("context loss during pending compilation cancels the old attempt and retry completes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await preparing(page);
  await rear(page)
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      const extension = gl?.getExtension("WEBGL_lose_context");
      if (!extension) throw new Error("Missing context-loss test extension");
      extension.loseContext();
    });
  await expect(gate(page)).toHaveAttribute("data-state", "error");
  await assertStopped(page);
  await gate(page).getByRole("button", { name: "Retry 3D view" }).click();
  await preparing(page);
  await releaseAndReady(page);
  expect(errors).toEqual([]);
});
