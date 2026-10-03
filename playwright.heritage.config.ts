import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "heritage-editorial.spec.ts",
  workers: 1,
  reporter: "list",
  outputDir: "test-results/heritage-editorial",
  use: {
    baseURL: "http://127.0.0.1:4175",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : undefined,
    screenshot: "only-on-failure",
    video: { mode: "on", size: { width: 1440, height: 900 } },
  },
  webServer: {
    command: "npm run build && node server.mjs",
    env: { PORT: "4175" },
    timeout: 120000,
    url: "http://127.0.0.1:4175",
    reuseExistingServer: !process.env.CI,
  },
});
