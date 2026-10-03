import { defineConfig, devices } from "@playwright/test";
const variant = process.env.ENVIRONMENT_QA_VARIANT || "candidate";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "environment-grounding.spec.ts",
  outputDir: `environment-grounding-results/${variant}`,
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4179",
    reducedMotion: "reduce",
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
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        deviceScaleFactor: 1,
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:4179",
    env: { PORT: "4179" },
    reuseExistingServer: false,
    timeout: 180000,
  },
});
