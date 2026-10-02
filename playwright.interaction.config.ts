import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "interaction-motion.spec.ts",
  outputDir: "interaction-test-results",
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-interaction-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.INTERACTION_URL || "http://127.0.0.1:4173",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "on",
  },
  webServer: process.env.INTERACTION_URL ? undefined : {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:4173",
    env: { PORT: "4173" },
    reuseExistingServer: false,
    timeout: 180000,
  },
});
