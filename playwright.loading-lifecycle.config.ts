import { defineConfig } from "@playwright/test";
import loading from "./playwright.loading.config";
export default defineConfig({
  ...loading,
  testMatch: "rear-preparation-lifecycle.spec.ts",
  retries: 0,
  outputDir: "test-results/loading-lifecycle",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "playwright-loading-lifecycle-report", open: "never" },
    ],
  ],
  projects: [
    {
      name: "lifecycle-desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "lifecycle-mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "lifecycle-mobile-430",
      use: {
        viewport: { width: 430, height: 932 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
