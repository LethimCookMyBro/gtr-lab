import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";
// The helper has a separate CPU-tested contract and no browser side effects.
import {
  FORMULA_E_VIEWPORTS,
  validateFormulaECI,
} from "./scripts/formula-e-layout-contract.mjs";
validateFormulaECI();
export default defineConfig({
  ...base,
  testMatch: "formula-e.spec.ts",
  retries: 0,
  projects: FORMULA_E_VIEWPORTS.map(
    (target: { name: string; width: number; height: number }) => ({
      name: target.name,
      use: {
        ...(target.width < 700
          ? devices["iPhone 13"]
          : devices["Desktop Chrome"]),
        browserName: "chromium" as const,
        viewport: { width: target.width, height: target.height },
      },
    }),
  ),
  outputDir: "test-results/formula-e",
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-formula-e-report", open: "never" }],
  ],
  webServer: {
    ...base.webServer,
    command:
      "node scripts/formula-e-layout-contract.mjs && npm run build && npm start",
    url: "http://127.0.0.1:4173",
    env: { PORT: "4173" },
    reuseExistingServer: false,
    timeout: 120000,
  },
});
