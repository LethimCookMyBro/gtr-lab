# Production cabin teardown diagnostic

This is a diagnostic-only proposal. It does not change application source, assets, route handling, readiness, disposal, or acceptance timeouts. Publishing and running the workflow require separate approval.

## Reproduction and bounds

The gated, main-only workflow runs the exact production build at desktop 1440 × 900 using the existing Chromium SwiftShader arguments and reduced-motion setting. The driver verifies the reviewed application-tree SHA-256 and exact cabin/exterior GLB identities before starting a server or browser.

Two fresh browser processes run sequentially on the same CI runner. Both keep Playwright action snapshots; the first enables trace screenshots and the second disables them. The setup is Premium ready → photographic NISMO → Premium ready, preserving the second Premium canvas. The measured sequence is Camera → cabin opt-in → active UI → Switch model → NISMO.

The driver retains 15-second click waits, including Playwright's scheduled-navigation wait, and five-second drawer/canvas teardown requirements. A failure remains failed even if later evidence shows clean NISMO. After the strict outcome, the diagnostic observes the identified second renderer’s final release for up to 45 seconds, then exports browser evidence within a separate 30-second budget. The CPU/GL trace stays open until that release or bounded observation failure. The driver adds no screenshots, frame-settle waits, readbacks, GPU fences or awaited page evaluations between active readiness and the route clicks. Filesystem report writes are deferred during this interval too.

The focused setup intentionally omits the full visual/fault-injection suite. If it does not reproduce, that is inconclusive: earlier repeated cabin loads or trace accumulation may be necessary. Neither a pass nor a slower instrumented run should be interpreted as physical-device performance evidence.

## Observations collected outside the application

An init script wraps existing calls while preserving their receiver, arguments, return value and thrown error:
- Capture/bubble click timing and History API transitions
- MutationObserver changes to cabin controls, route title, canvas presence and drawer phase
- Existing requestAnimationFrame callback start/end, including draw/upload/delete totals; it schedules no frames of its own
- Native WebGL draw, buffer/texture upload, shader-query, deletion, fence/readback and existing context-loss calls
- Program creation and first draw after probe activation, to help identify first-use work
- Long-task entries

Native calls accumulate count/total/max duration. Calls taking at least 8ms retain a bounded stack. Ordinary draw calls do not create per-call log entries. The event ring holds 6,000 entries and reports dropped events. The DOM active flag and frame draw submissions are observed separately: the diagnostic does not claim that a specific mesh has been rasterized or that submitted GPU work is complete.

The measured window also captures a 1ms-sampling main-thread CPU profile and a CDP performance trace with main-thread, JavaScript, user-timing and GPU categories. CDP screenshot recording is disabled in both cases. Trace buffering is capped at 32 MiB; the compressed output has a 64 MiB guard. Perfetto/DevTools user-timing marks share IDs with browser-events.json.

## Reading the evidence

Each case produces report.json, browser-events.json, main-thread.cpuprofile, performance-trace.json.gz and playwright-trace.zip. identity.json records source inputs, compiled JS/CSS and model digests.

- A long rAF after active UI, with upload/first-program-draw activity before canvas removal, points toward first-render work. A draw submission alone does not prove GPU completion
- A long delete/context-loss call or CPU stack inside dispose after the click points toward synchronous resource teardown
- Prompt history change but delayed DOM route/canvas mutation without a long GL call requires examining the React/scheduler CPU stacks
- Prompt DOM cleanup and responsive main thread while Playwright still waits, especially only with trace screenshots enabled, points toward browser/GPU tracing or automation backpressure
- A long main-thread task with little native GL time points toward JavaScript reconciliation, model traversal or another CPU boundary; inspect the profile before choosing a fix
- Buffer loss, missing exports or no reproduction are explicitly inconclusive

No second production fix should be inferred solely from this instrumentation's existence or from the previous memo optimization.

## Local validation

Only syntax and Node instrumentation tests may be run locally. The driver requires GITHUB_ACTIONS=true, explicit diagnostic opt-in and the exact reviewed application-tree digest. Do not set these flags locally or run a browser/app server as a workaround.

The eight Node instrumentation tests cover native-call semantics, RAF semantics without extra scheduling, repeated installation/inheritance/extension wrapping, bounded event accounting, timeline summaries, execution guards, evidence-collection deadlines and target-context final-release correlation.


## Async disposal candidate

The application candidate installs an idempotent disposal wrapper on the configurator renderer only. Normal renderer, model, geometry, material and texture cleanup still happens immediately and exactly once. The wrapper returns a Promise into the installed R3F 9.8.1 disposal contract. It inserts a WebGL2 fence, flushes, then polls with clientWaitSync(sync, 0, 0) every 16 ms on later tasks. The sync and timer are removed on settlement. A context-loss event cancels waiting; an already-lost context settles without a new fence.

A signaled fence is the healthy path. R3F then performs its unchanged final forceContextLoss. There is no renderer pool, permanent forced-loss suppression, fixed delay before an unsafe loss, dependency edit or GPU/security setting change.

Null fences, WAIT_FAILED, thrown device/cleanup calls and a 30-second background drainage limit reject the Promise. R3F's existing warning and final-release fallback remain in force. That exceptional path may retain the current driver's blocking behavior and is not a successful nonblocking result. It is finite and does not leave polling or context ownership hanging indefinitely.

Node tests verify the actual installed R3F path and include 24 overlapping retirements. They prove root deregistration, stopped rendering, one-time normal disposal, deferred final loss until successful drainage, and cleanup on the failure paths. They do not prove physical GPU responsiveness.

CI reports strictResult separately from cleanup. The target context ID is recorded from the second Premium canvas before opt-in; a late release from the first canvas cannot satisfy the cleanup check. The post-outcome observation reports forceContextLossCalls and forceContextLossMs. Acceptance requires the original strict flows and a measured reduction of the final native call/main-thread long task, with no disposal warning indicating fallback. A passing route alone, or a later timer running the same slow native call, is insufficient.
