import { defineConfig, devices } from "@playwright/test";
const variant = process.env.ENVIRONMENT_QA_VARIANT || "candidate";
const scenario = process.env.ENVIRONMENT_QA_SCENARIO;
const scenarios = [
  "studio",
  "gallery",
  "night",
  "forest",
  "coast",
  "switching",
  "recovery",
];
if (scenario && !scenarios.includes(scenario))
  throw new Error(`Unknown environment QA scenario: ${scenario}`);
export default defineConfig({
  testDir: "./e2e",
  testMatch: "environment-grounding.spec.ts",
  grep: scenario ? new RegExp(`\\[${scenario}\\]`) : undefined,
  outputDir: `environment-grounding-results/${variant}`,
  fullyParallel: false,
  workers: 1,
  timeout: 600000,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4179",
    reducedMotion: "reduce",
    // Native repeated keydowns must not each trigger a GPU screenshot/DOM
    // snapshot. Keep the action/source trace and an automatic failure PNG.
    trace: {
      mode: "retain-on-failure",
      screenshots: false,
      snapshots: false,
      sources: true,
    },
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
