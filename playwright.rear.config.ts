import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["rear-signature.spec.ts", "rear-brand-layout.spec.ts"],
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 240000,
  outputDir: "rear-signature-results",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-rear-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.HOME_QA_URL || "http://127.0.0.1:4173",
    reducedMotion: "no-preference",
    deviceScaleFactor: 1,
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
    screenshot: "only-on-failure",
    video: { mode: "on", size: { width: 1280, height: 900 } },
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    },
  },
  projects: [
    { name: "rear-desktop", use: { viewport: { width: 1920, height: 900 } } },
    {
      name: "rear-mobile",
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
        timeout: 180000,
        reuseExistingServer: !process.env.CI,
      },
});
