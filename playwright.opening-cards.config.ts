import { defineConfig, devices } from "@playwright/test";
import home from "./playwright.home.config";

export default defineConfig({
  ...home,
  testMatch: "home-opening-cards.spec.ts",
  projects: [
    ...[1024, 1051, 1180, 1366, 1440, 1920].map((width) => ({
      name: `cards-desktop-${width}`,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width, height: width === 1180 ? 757 : 900 },
      },
    })),
    ...[390, 430].map((width) => ({
      name: `cards-mobile-${width}`,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium" as const,
        viewport: { width, height: 844 },
      },
    })),
  ],
  use: {
    ...home.use,
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
      ],
    },
    video: { mode: "on", size: { width: 1280, height: 900 } },
  },
  outputDir: "test-results/opening-cards",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "playwright-opening-cards-report", open: "never" },
    ],
  ],
});
