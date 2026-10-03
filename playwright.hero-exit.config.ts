import { defineConfig } from "@playwright/test";
import home from "./playwright.home.config";
export default defineConfig({
  ...home,
  testMatch: "home-hero-exit.spec.ts",
  reporter: "list",
  outputDir: "test-results/hero-exit",
  use: { ...home.use, baseURL: "http://127.0.0.1:4177" },
  projects: home.projects?.map((project) => ({
    ...project,
    use: {
      ...project.use,
      video: {
        mode: "on",
        size: project.use?.viewport || { width: 1440, height: 900 },
      },
    },
  })),
  webServer: {
    command: "npm run build && npm start",
    url: "http://127.0.0.1:4177",
    env: { PORT: "4177" },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
