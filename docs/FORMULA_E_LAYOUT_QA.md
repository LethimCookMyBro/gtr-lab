# Formula E neutral-state CI capture

The suite targets production identity `f353b758035fcc65b88376a46b5cf7c5c3e14016c1769f052368070efbe7f5dc` (103 files). Compared with the initial catalog identity `9d52e83b8a0a05992457fca998c2ec32f4d14ec1b6c3fb94cb0b8ff71fde174f`, only the Formula E mobile collection CSS has changed. Model, catalog, material, existing timer and historical test configuration bytes are unchanged.

## Why a separate suite

The existing general browser suite covers desktop 1440/1920 and mobile 390/430. It already checks the Formula E heading, disabled paint, detail opening and the retired GT500 route. It does not exercise 320 width, verify neutral-label clipping/overlap across surfaces, or capture a complete Formula E home/collection/switcher flow. The dedicated suite closes that evidence gap without rerunning real Premium initialization as a proxy for the missing Formula E asset.

## Later authorized CI command

From the exact staged checkout in GitHub Actions, after npm dependencies and Chromium are installed:

`npx playwright test -c playwright.formula-e.config.ts`

The dedicated workflow requires a main-branch push with the `[stage-formula-e-layout]` commit marker. The configuration rejects execution outside GitHub Actions and requires its 40-character source/harness commit. The web-server command verifies the exact production hash before the existing asset/build/start commands. It does not reuse a previously running server. Existing startup budget stays 120 seconds; no historical timeouts are widened.

There are two tests at each of 1440×900, 320×844 and 390×844. They use the real rendered app and real keyboard/click navigation. No route interception, fake image response, synthetic car, forced model readiness or production test hook is introduced. Reduced motion is inherited from the existing general suite for these static layout captures; this is not native-motion evidence.

Checks include:

- Actual homepage, collection and switcher Formula E links, keyboard activation and Back navigation
- Visible “Reference image unavailable” and exact season context, without image/canvas/picture substitution
- Text rectangles contained within their card/dialog/viewport, separated from each other and observed title/control rectangles; no page horizontal overflow
- Direct-route absence of GLB or old GT500/imaginary Formula E image requests
- Disabled paint, lights, rotate and Interior; visible unavailable-image disclosure; details, source access and Escape/focus restoration
- Explicit legacy GT500 explanation and collection return without silent redirect

Each test attaches a JSON receipt with production identity, source/harness commit, viewport, observed rectangles, screenshot hashes and hashes of served HTML/JS/CSS compared to this checkout’s fresh distribution. Screenshots cover the homepage card, collection card, switcher, neutral route, details and legacy route. Evidence is written under `test-results/formula-e/`; the HTML report is `playwright-formula-e-report/`. Preserve both in the later CI artifact.

## Local verification boundary

The pure rectangle/source/CI contract has positive and negative CPU tests, including 320-wide clipping and heading/CTA overlap. TypeScript checks and targeted existing catalog/navigation DOM tests are permitted locally. No browser, server or socket has been run locally for this patch. Actual layout, pixel quality, visibility outside the observed rectangles and mobile usability still require successful CI execution and image review. Passing CPU tests is not evidence that the six-browser-test suite has passed.

## First CI finding and mobile correction

At commit `d5b4dd0a3e13724b594f87d4bc728f4001ca3b94`, five of six browser cases passed. The 320px collection case failed the original no-overlap assertion: the season label at y=500.125, height=18 intersected the card copy starting at y=501.0625. The failure screenshot also shows the season colliding with `06 / TRACK`.

The neutral labels inherited an absolutely positioned photo layer. Shared mobile rules loaded later also overrode the equal-specificity Formula E card alignment. The correction gives only this card three normal-flow mobile grid rows for labels, copy and Explore, with content-sized text and stronger scoped selectors. No label, font size or geometry assertion is removed or relaxed. The source regression retains the observed collision as a failing geometry example and checks the flow rules; all six original browser cases and their deadlines remain unchanged. The corrected production identity still requires a new CI run and pixel review.

## Reviewer corrections

The neutral scene checks the rendered `.config-header` and `.config-title` children. Their parent uses `display: contents` on desktop and has no reliable box; null rectangles still fail rather than being skipped.

Runtime HTML/JS/CSS evidence now uses the existing request-bound body ledger. Every relevant Request object receives an ID at issue time, before a response arrives. Response bodies are checked against exact build hashes and byte counts with rejection handlers attached immediately. Issued/no-response requests, late responses, raw failures and pending bodies remain in the receipt. Hard navigation first drains/seals the old document; SPA links retain its generation. All document drains and finalization share one unchanged test-timeout window starting before the first navigation. Neither new requests nor a second document renews that window.

An after-test hook drains the original bounded window, closes its observation listeners and always attaches the final request-ledger snapshot, including on layout failure. Events after the earlier success receipt but before this closure remain checked. A failed/expired receipt cannot become a pass if bytes arrive later. The helper requires completed HTML, JavaScript and CSS bodies; a partial receipt is insufficient. These guards are CPU-tested but still need actual browser execution in authorized CI.
