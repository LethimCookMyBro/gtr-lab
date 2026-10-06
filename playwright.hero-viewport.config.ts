import { defineConfig, devices } from "@playwright/test";
import home from "./playwright.home.config";
export default defineConfig({
  ...home,
  testMatch: "home-hero-viewport.spec.ts",
  reporter: "list",
  outputDir: "test-results/hero-viewport",
  projects: [{ name: "hero-viewport", use: { ...devices["Desktop Chrome"] } }],
});
