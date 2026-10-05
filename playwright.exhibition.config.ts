import { defineConfig } from "@playwright/test";

const viewports = [
  { name: "exhibition-desktop-1440", width: 1440, height: 900 },
  { name: "exhibition-wide-1920", width: 1920, height: 1080 },
  { name: "exhibition-mobile-390", width: 390, height: 844 },
  { name: "exhibition-mobile-430", width: 430, height: 932 },
  { name: "exhibition-short-1440", width: 1440, height: 600 },
];

export default defineConfig({
  testDir: "./e2e",
  testMatch: "centered-exhibition-preview.spec.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 240000,
  expect: { timeout: 10000 },
  outputDir: "test-results/centered-exhibition",
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/exhibition-report", open: "never" }],
  ],
  use: {
    baseURL: process.env.HOME_QA_URL || "http://127.0.0.1:4173",
    reducedMotion: "no-preference",
    deviceScaleFactor: 1,
    screenshot: "only-on-failure",
    trace: { mode: "retain-on-failure", screenshots: false, snapshots: true },
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
  projects: viewports.map(({ name, width, height }) => ({
    name,
    use: {
      viewport: { width, height },
      isMobile: width < 701,
      hasTouch: width < 701,
      // Record native viewport dimensions. No scaling into a desktop canvas,
      // retiming, frame interpolation, or assembled screenshot animation.
      video: { mode: "on" as const, size: { width, height } },
    },
  })),
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
