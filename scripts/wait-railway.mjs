/** Read-only deployment gate: verify Railway's status for this exact public commit. */
const sha = process.env.GITHUB_SHA;
if (!/^[a-f0-9]{40}$/.test(sha ?? '')) throw new Error('Expected an exact GitHub commit SHA');
const endpoint = `https://api.github.com/repos/LethimCookMyBro/gtr-lab/commits/${sha}/status`;
const deadline = Date.now() + 5 * 60_000;
let verified = false;
while (Date.now() < deadline) {
  const response = await fetch(endpoint, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Cannot verify Railway commit status: HTTP ${response.status}`);
  const result = await response.json();
  const status = result.statuses.find(item => item.context === 'GT-R LAB - gtr-lab');
  console.log(`[Railway gate] ${sha} ${status?.state ?? 'awaiting deployment status'}`);
  if (status?.state === 'success') { verified = true; break; }
  if (status && ['failure', 'error'].includes(status.state)) throw new Error(`Railway deployment did not succeed: ${status.description}`);
  await new Promise(resolve => setTimeout(resolve, 15_000));
}
if (!verified) throw new Error('Railway did not report success for this commit within five minutes');
