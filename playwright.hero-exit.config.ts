import { defineConfig } from "@playwright/test";
import home from "./playwright.home.config";
export default defineConfig({
  ...home,
  testMatch: "home-hero-exit.spec.ts",
  reporter: "list",
  outputDir: "test-results/hero-exit",
  use: { ...home.use, baseURL: "http://127.0.0.1:4177" },
  webServer: {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:4177",
    env: { PORT: "4177" },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
