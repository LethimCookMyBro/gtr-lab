/** Explicit CI preflight only; imports perform no requests. */
import {mkdir,writeFile} from 'node:fs/promises';
import {verifyStudyLiveSource} from './integrated-study-live-contract.mjs';
import {verifyReleaseAssets} from './verify-release-assets.mjs';
export default async function setup() {
  await mkdir('test-results/integrated-study-live',{recursive:true});
  const report={status:'running'};
  try {
    const {assets,...identity}=await verifyStudyLiveSource(process.cwd(),process.env);
    Object.assign(report,identity);
    const {commit,...http}=await verifyReleaseAssets({commit:identity.request.expectedDeployedCommit});
    report.publicAssets=http;
    report.commitEvidence={expectedDeployedCommit:commit,railwayDeploymentId:identity.request.railwayDeploymentId,
      provenance:'Separately verified Railway connector deployment readback. HTTP proves exact frontend bytes, not deployed commit provenance. Model identity is proved by each actual browser session CDP response body.'};
    report.status='passed';
  } catch(error) {report.status='failed';report.error=String(error);throw error;}
  finally {await writeFile('test-results/integrated-study-live/preflight.json',JSON.stringify(report,null,2));}
}
