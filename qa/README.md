# Renderer-only browser QA

This isolated harness renders clearly labeled synthetic geometry through the actual production VehicleScene. It is a functional regression fixture, not a vehicle asset, realism benchmark, interior validation, or replacement for the missing licensed models.

## Isolation

- Default `vite.config.ts`, production routes, and asset manifests do not import the harness or its fixture
- `vite.renderer-qa.config.ts` refuses every mode except explicit `renderer-qa`
- The harness entry also refuses execution outside that mode
- Its root is `qa/renderer`, `publicDir` is disabled, and its build output is separate `qa-dist`
- The GLB is assembled in memory, loaded using a temporary blob URL, and never placed in `public`
- QA preview binds to `127.0.0.1:4174`; do not deploy `qa-dist`

## Commands

- Typecheck harness and browser tests: `npx tsc --noEmit -p tsconfig.renderer-qa.json`
- List browser cases: `npx playwright test -c playwright.renderer.config.ts --list`
- Run browser cases: `npx playwright test -c playwright.renderer.config.ts`

The Playwright configuration builds the isolated harness and starts its preview server automatically. It does not alter the existing production-route E2E configuration. Chromium must be installed (`npx playwright install chromium` in an authorized CI setup). The configuration explicitly selects ANGLE SwiftShader for deterministic software WebGL in CI.

## Covered behavior

1. Actual GLB parse and rendering, matched material capabilities, visible paint/camera pixel changes
2. Keyboard/pointer manipulation, automatic-rotation cancellation, single-canvas lifecycle
3. Invalid GLB error and replacement with a valid fixture
4. Unavailable WebGL surfaces an actionable error
5. Real WEBGL_lose_context event and retry into a new working context
6. HDRI request failure preserves the model and returns to Studio

The healthy-render and context-loss cases intentionally fail if CI cannot provide WebGL. They do not silently skip or count software capability failures as passing product verification. Screenshot and trace artifacts remain available on test failure. Nothing here verifies detailed vehicle quality, real interior placement, mobile car framing, or per-variant authenticity.
