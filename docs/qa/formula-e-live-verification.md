# Formula E live verification

This is an inactive, CI-only, read-only adaptation of the existing six Formula E cases at 1440, 320 and 390 CSS pixels. It uses their original 30-second test budgets, zero retries, actual navigation, missing-3D assertions and request-bound body ledger. The live configuration explicitly removes the local web server and blocks service workers. No application changes, Railway credentials, deployment call or workflow dispatch are introduced.

## Freeze the accepted identities

Do not learn any expected hash from a live page or public response.

1. Accept the staged CI run for the exact production source fingerprint `f353b758035fcc65b88376a46b5cf7c5c3e14016c1769f052368070efbe7f5dc` and all 103 production files. All six actual cases must pass without retries.
2. Obtain the compiled dist from the verified `environment-preview-build` artifact for that same exact commit. Verify the artifact/run/head-SHA provenance and archive digest, then run `node scripts/formula-e-live-contract.mjs --build-identity` with that dist and matching source. It records the canonical sorted `{path, bytes, sha256}` list for local dist/index.html and every built JS/CSS file; `sha256` is SHA-256 over JSON.stringify of that list. Keep the full manifest and CI provenance. A private local build is useful for development but is not accepted CI evidence. Do not rerun the browser acceptance solely to package a manifest.
3. After release, separately verify the active Railway deployment through the existing connector. Record its exact 40-character deployed commit and Railway deployment ID. HTTP cannot distinguish two commits with identical runtime bytes; no receipt here claims otherwise.
4. After independent review, activate only `allow`, `expectedDeployedCommit`, `railwayDeploymentId` and `buildSha256` in `qa/formula-e-live-request.json`. The expected build digest comes from step 2, the deployment fields from step 3. The origin/source/file-count pins remain fixed. These are reviewed repository data, never URL/environment overrides.
5. An explicitly authorized main-only QA commit containing `[verify-formula-e-live]` can run the workflow. The QA harness commit is independently recorded as `harnessCommit`; it is allowed to differ from `expectedDeployedCommit`, whose commit must be an ancestor of that checkout. This document itself grants no permission to publish, activate, dispatch or deploy.

## Gates and evidence

The inactive request fails before setup. An active run requires the closed GitHub repository/main/push invocation, an exact clean harness checkout, a tracked request, accepted runtime source and matching local build fingerprint. The global setup reuses `verifyReleaseAssets` to compare the public HTML and every JS/CSS bundle with those local pinned bytes, including lazy chunks, rejecting redirects. It never follows URLs extracted from public HTML.

The same existing tests then exercise the public origin. The original body collector observes each browser-issued Request, retains its actual bytes, and rejects foreign-origin documents/scripts/stylesheets, redirects, URL queries and unpinned scripts/stylesheets. Failed or late requests cannot be replaced by a separate preflight fetch or a later success.

The artifact contains the fixed request, public preflight receipt, six tests' layout/navigation receipts, request ledgers and native CI screenshots. Keep browser screenshots and reports in their GitHub artifact; do not upload them to Library. The separate Railway deployment readback is external evidence, not an HTTP-derived assertion.

## Private checks

Read package.json first. For source-only checks in this workspace use the existing deny-sockets preload with an explicit Node test runner. Actual browser acceptance is GitHub CI only. Do not run local Playwright, app servers or socket-based tests.
