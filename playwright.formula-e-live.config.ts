import { defineConfig } from "@playwright/test";
import formulaE from "./playwright.formula-e.config";
import {
  FORMULA_E_LIVE_ORIGIN,
  loadFormulaELiveRequest,
} from "./scripts/formula-e-live-contract.mjs";
await loadFormulaELiveRequest(); // Inactive requests stop before any browser/setup work.
export default defineConfig({
  ...formulaE,
  timeout: 30_000,
  retries: 0,
  webServer: undefined,
  globalSetup: "./scripts/formula-e-live-setup.mjs",
  metadata: { formulaEMode: "live" },
  use: {
    ...formulaE.use,
    baseURL: FORMULA_E_LIVE_ORIGIN,
    serviceWorkers: "block",
  },
  outputDir: "test-results/formula-e-live",
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "playwright-formula-e-live-report", open: "never" },
    ],
  ],
});
