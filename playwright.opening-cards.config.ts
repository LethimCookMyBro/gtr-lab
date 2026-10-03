import { defineConfig } from "@playwright/test";
import home from "./playwright.home.config";

export default defineConfig({
  ...home,
  testMatch: "home-opening-cards.spec.ts",
  use: {
    ...home.use,
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
