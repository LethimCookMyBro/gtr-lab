import { readFile, writeFile } from 'node:fs/promises';
import { compareRasterTrials, trialOrder } from './raster-cost-policy.mjs';
const reports = [], missing = [];
for (let i = 0; i < trialOrder.length; i++) {
  const file = `raster-cost-results/trial-${i + 1}-${trialOrder[i]}/report.json`;
  try { reports.push(JSON.parse(await readFile(file, 'utf8'))); }
  catch (error) { missing.push({ file, error: String(error) }); }
}
const summary = { ...compareRasterTrials(reports), missing };
await writeFile('raster-cost-results/comparison.json', JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.status !== 'paired-observation') process.exitCode = 1;
