import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
import { loadTouchRequest, TOUCH_UI_VIEWPORTS } from "./scripts/touch-ui-live-contract.mjs";
const request = await loadTouchRequest();
const target = TOUCH_UI_VIEWPORTS.find(value => value.name === process.env.TOUCH_UI_VIEWPORT);
if (!target) throw new Error("Explicit reviewed viewport required");
export default defineConfig({
  ...base,
  testMatch: "touch-ui-live.spec.ts",
  // Bounded refinement run. Original @home and @configurator failures remain in prior receipts.
  grep: process.env.TOUCH_UI_AREA === "home-collection" ? /@collection|@footer/ : /@configurator/,
  timeout: 30_000,
  retries: 0,
  workers: 1,
  maxFailures: 0,
  globalSetup: "./scripts/touch-ui-live-setup.mjs",
  metadata: { touchUiRequest: request, physicalDevice: false, engine: "chromium", input: target.touch ? "trusted Chromium touch emulation" : "desktop mouse and keyboard" },
  use: { ...base.use, baseURL: request.target.origin, serviceWorkers: "block", reducedMotion: "no-preference", actionTimeout: 5_000, navigationTimeout: 30_000 },
  projects: [{ name: target.name, use: { ...(target.touch ? devices["iPhone 13"] : devices["Desktop Chrome"]), browserName: "chromium", viewport: {width:target.width,height:target.height}, deviceScaleFactor:target.deviceScaleFactor, hasTouch:target.touch, isMobile:target.touch } }],
  webServer: request.mode === "candidate-ci" ? { command: "node server.mjs", url:"http://127.0.0.1:4173", env:{PORT:"4173"}, reuseExistingServer:false, timeout:120_000 } : undefined,
  outputDir: "test-results/touch-ui",
  reporter: [["list"],["html",{outputFolder:"playwright-touch-ui-report",open:"never"}]],
});
