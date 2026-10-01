import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "home-motion.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-home-report", open: "never" }],
  ],
  outputDir: "test-results/home-motion",
  use: {
    baseURL: process.env.HOME_QA_URL || "http://127.0.0.1:4173",
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "home-wide",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: "home-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "home-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: process.env.HOME_QA_URL
    ? undefined
    : {
        command: "npm run build && npm start",
        url: "http://127.0.0.1:4173",
        env: { PORT: "4173" },
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      },
});
