import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "home-gate-helper.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 25000,
  // Match the existing exhibition suite; neither helper budget is enlarged.
  expect: { timeout: 10000 },
  outputDir: "test-results/home-gate-helper",
  reporter: "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "gate-wide", use: { viewport: { width: 1920, height: 1080 } } },
    {
      name: "gate-mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
