/** Public build-byte preflight only; no model fetch/recorder or release operation. */
import { mkdir, writeFile } from 'node:fs/promises';
import { verifyTouchCheckout, assertTouchBuild } from './touch-ui-live-contract.mjs';
import { readFormulaEAssets } from './formula-e-live-contract.mjs';
import { verifyReleaseAssets } from './verify-release-assets.mjs';
export default async function setup() {
  const directory = 'test-results/touch-ui'; await mkdir(directory,{recursive:true});
  const receipt = {status:'running',harnessCommit:process.env.GITHUB_SHA};
  try {
    const identity = await verifyTouchCheckout(); Object.assign(receipt,identity);
    receipt.build = assertTouchBuild(await readFormulaEAssets(),identity.request);
    if(identity.request.mode === 'baseline-live') {
      const {commit,...publicAssets} = await verifyReleaseAssets({commit:identity.request.target.expectedDeployedCommit});
      receipt.publicAssets = {...publicAssets,expectedDeployedCommit:commit};
      receipt.commitEvidence = 'Frozen separate Railway connector readback. HTTP compares bytes and does not prove commit provenance.';
    }
    receipt.status = 'passed';
  } catch(error) { receipt.status = 'failed'; receipt.error = String(error); throw error; }
  finally { await writeFile(`${directory}/preflight.json`,JSON.stringify(receipt,null,2)); }
}
