# Rear-scene preparation cancellation

This is a lifecycle-only correction. Homepage art, the licensed R35 asset,
configurator environments and all material/lighting designs are unchanged.

## Cause and correction

Three r180's `compileAsync` starts an uncancellable polling timer. Its callback
re-reads each material's current shader program. Skipping 3D or leaving the home
route can dispose the separately owned vehicle, declarative studio materials and
renderer while that timer is still pending. The old callback then throws outside
its promise's rejection handler.

`compileRearScene` now owns the compilation barrier and its timer. It calls the
renderer compiler, checks parallel-completion status on owned program handles,
and cancels from the scene's layout-effect cleanup. It detects context loss or
released resources before querying them and reports real preparation failures.
The existing shader-error observer and subsequent completed renderer-frame gate
remain required before readiness. Model and studio disposal remain unchanged.

## Verification

- The original disposed-poll regression failed before the fix and passes afterward
- Exact-candidate Quality run [37186002256](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37186002256): 598 unit, 44 end-to-end, 6 renderer and 14 real-vehicle tests passed with no retries; TypeScript and production build passed
- Dedicated lifecycle run [37186002298](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37186002298): 9/9 real-browser cases, retries disabled, at 1440px, 390px and 430px
- Cases hold real shader completion while exercising skip/reentry, browser Back/Forward, and context loss/retry. No post-disposal completion queries or page errors are accepted
- Existing homepage run [37185690648](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37185690648) on the identical application tree passed: 10 loading/persistence cases (4 intentional duplicate-project skips), 6 rear, 32 cards, 18 hero-exit, 11 heritage and 21 applicable home checks. No retries were observed
- Physical-environment checkpoint [37185690643](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37185690643): all 15 scene captures passed on the unchanged configurator

The first dedicated run [37185690658](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/37185690658) passed 8/9. One desktop test pressed Back after the URL changed but before React mounted Models, preserving the intentionally skipped home state. The corrected test waits for a real route unmount; no application behavior was changed to satisfy it.

The superseded Quality run 37185690642 was cancelled when the test-only correction
was published. It is not a clean full pass; its first desktop navigation case also
hit the existing five-second configurator control-readiness assertion and passed
on retry. Its trace contained no rear-scene page error.

## Release discipline and limits

Candidate `e12a0cb27b0f7c0ae401fe3629b0a283e69d6d35` contains the reviewed application
fix plus the test-only route-settlement correction. The unique
`/release-loading-disposal-approved-20261004.txt` watch gate prevents candidate
source from auto-deploying. Promotion adds only the marker and this record.
The live lifecycle job verifies the exact release SHA, public HTML and every
freshly built JavaScript/CSS asset before running the same no-retry lifecycle
suite and the existing loading/persistence suite against Railway.
Restore and compare the complete original Railway service configuration after
successful exact-release and public-flow verification.

Chromium/SwiftShader is controlled desktop/mobile-viewport evidence, not a claim
of physical-device performance or new provider-hosted film playback verification.
