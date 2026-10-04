/** Await the selected venue's rendered readiness, not a fixed asset-delivery delay. */
export async function waitForEnvironmentReady(
  page,
  environment,
  { timeout = 90000 } = {},
) {
  await page.waitForFunction(
    (requested) => {
      const failure = document.querySelector(".scene-notice, .render-error");
      if (failure)
        throw new Error(
          `${requested} environment failed: ${failure.textContent?.trim() || failure.className}`,
        );
      const scene = document.querySelector("main.configurator");
      const paint = document.querySelector(
        'button[aria-label="Ultimate Silver"]',
      );
      const lights = document.querySelector(
        '.config-toolbar button[aria-label="Lights"]',
      );
      return Boolean(
        scene?.classList.contains(`environment-${requested}`) &&
        scene.classList.contains("is-scene-ready") &&
        paint &&
        !paint.disabled &&
        lights &&
        !lights.disabled &&
        document.querySelectorAll(".scene-stage canvas").length === 1 &&
        !document.querySelector(".scene-loading"),
      );
    },
    environment,
    { timeout, polling: 100 },
  );
}
