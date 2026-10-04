import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e-renderer",
  outputDir: "renderer-test-results",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-renderer-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
    {
      name: "renderer-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command:
      "node scripts/fetch-surfaces.mjs && npx vite build --config vite.renderer-qa.config.ts --mode renderer-qa && npx vite preview --config vite.renderer-qa.config.ts --mode renderer-qa",
    url: "http://127.0.0.1:4174",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
