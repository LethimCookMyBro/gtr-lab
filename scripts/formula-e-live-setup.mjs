/** Read-only public preflight. Reuses the existing bounded all-asset verifier. */
import { mkdir, writeFile } from "node:fs/promises";
import { verifyReleaseAssets } from "./verify-release-assets.mjs";
import {
  assertFormulaELiveBuild,
  readFormulaEAssets,
  verifyFormulaELiveCheckout,
} from "./formula-e-live-contract.mjs";
export default async function setup() {
  await mkdir("test-results/formula-e-live", { recursive: true });
  const receipt = { status: "running", harnessCommit: process.env.GITHUB_SHA };
  try {
    const checkout = await verifyFormulaELiveCheckout();
    Object.assign(receipt, checkout, {
      build: assertFormulaELiveBuild(
        checkout.request,
        await readFormulaEAssets(),
      ),
      commitEvidence:
        "Expected deployed commit and deployment ID were frozen from a separate Railway connector readback. HTTP verifies bytes, not commit provenance.",
    });
    const { commit, ...publicAssets } = await verifyReleaseAssets({
      commit: checkout.request.expectedDeployedCommit,
    });
    receipt.publicAssets = { ...publicAssets, expectedDeployedCommit: commit };
    receipt.status = "passed";
  } catch (error) {
    receipt.status = "failed";
    receipt.error = String(error);
    throw error;
  } finally {
    await writeFile(
      "test-results/formula-e-live/preflight.json",
      JSON.stringify(receipt, null, 2),
    );
  }
}
