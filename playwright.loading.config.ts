import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "home-loading.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  expect: { timeout: 30000 },
  retries: process.env.CI ? 1 : 0,
  outputDir: "test-results/home-loading",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-loading-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.HOME_QA_URL || "http://127.0.0.1:4173",
    reducedMotion: "no-preference",
    deviceScaleFactor: 1,
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    },
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
    screenshot: "only-on-failure",
    video: { mode: "on", size: { width: 1280, height: 900 } },
  },
  projects: [
    {
      name: "loading-desktop",
      use: { viewport: { width: 1440, height: 900 } },
    },
    {
      name: "loading-mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
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
        timeout: 180000,
      },
});
