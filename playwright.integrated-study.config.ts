import { defineConfig, devices } from "@playwright/test";
import vehicle from "./playwright.vehicle.config";
// @ts-expect-error Node-only exact source preflight is a JavaScript module.
import { verifyIntegratedStudySource } from "./scripts/integrated-study-readiness.mjs";
await verifyIntegratedStudySource(process.cwd(), process.env);
export default defineConfig({
  ...vehicle,
  testMatch: "integrated-r35-study.spec.ts",
  retries: 0,
  outputDir: "test-results/integrated-study",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "playwright-integrated-study-report", open: "never" },
    ],
  ],
  use: {
    ...vehicle.use,
    reducedMotion: "no-preference",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "desktop-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "node server.mjs",
    url: "http://127.0.0.1:4173",
    env: { PORT: "4173" },
    reuseExistingServer: false,
    timeout: 180000,
  },
});
