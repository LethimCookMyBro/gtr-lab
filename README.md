# GT-R LAB

An original independent GT-R digital exhibition built with React, TypeScript and React Three Fiber. This project is not affiliated with Nissan, NISMO, Italdesign or Porsche.

## Current status
**In progress. Not a completed production configurator.**

The application builds and its core UI/data/renderer unit tests run. All six catalog vehicles currently show labeled photographic references because production-qualified licensed GLBs (including detailed cabins and separately controlled materials) have not been acquired. Camera, lights and paint are not faked. The renderer mechanics passed six real-WebGL fixture tests and the application passed sixteen responsive browser cases. Accurate vehicle integration, material/cabin visual quality and real-car GPU validation remain blocking acceptance requirements. Source is available on main. Railway deployment is pending; no live URL is implied by this README.

## Run

Requires Node22.12+ or24 and npm.

- `npm ci`
- `npm run prepare:assets` (one-time HDRI preparation for local development; production builds do this automatically)
- `npm run dev` (Vite development)
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm start` (production server, uses `PORT`, default3000)

A restricted environment may disallow Vite’s network-interface enumeration. The production server does not need that enumeration. Build first and use `PORT=4173 npm start` for a production-equivalent local preview. This is not a bypass of browser or network restrictions; use a permitted browser test environment.

## Build-time environment assets

HDR binaries are excluded from Git. `npm run build` fetches missing/corrupt files from the pinned official Poly Haven HTTPS URLs and verifies byte size, SHA-256 and Radiance headers before Vite bundles them. A cold build requires HTTPS access to `dl.polyhaven.org`; a valid local cache supports offline builds. Production serves the bundled files locally and has no external HDRI dependency. No credentials are needed. See `docs/ENVIRONMENT_CREDITS.md` for timeout and cache details.

## Routes

- `/` cinematic home
- `/models` six-model collection
- `/configurator/premium`, `/nismo`, `/tspec`, `/gtr50`, `/gt3`, `/gt500` under the configurator prefix
- `/heritage` engineering/heritage
- `/credits` photography, factual sources and independent-project disclosure

## Asset integration

1. Obtain a legitimate licensed asset from the author/authorized service. Keep license, author, source URL, download date and required attribution
2. Verify variant/year, exterior proportions, actual detailed cabin, wheels/brakes, glass, lights, texture mapping and material separation
3. Export binary glTF2.0 with +Y up/+Z forward. Geometry normalizes to4.7m longest horizontal extent. Calibrate physical dimensions/camera/driver-seat position per variant before releasing
4. Place the ready GLB under `public/models/`; update `src/data/models.ts` asset URL/status/provenance/material roles
5. Declare exact material or mesh names in `paint`, `headlights`, `taillights`. Unknown materials are deliberately untouched
6. Enable interior/lights only after verifying real geometry/material capability. Optional parts remain unavailable without proper topology/rigging
7. Test cameras, materials, environment alignment and memory on actual GPU/mobile devices. Update credits and `docs/ASSETS_REQUIRED.md`

Do not label the same mesh as six different vehicles, ship the excluded R34 low-poly model, use ripped game assets, fabricate detailed interiors, or claim a photograph is interactive3D.

## Deployment target

Railway. `railway.json` defines build, Node start and healthcheck. Connect the authorized GitHub repository `LethimCookMyBro/gtr-lab`, verify billing/permissions with the user if required, deploy a reviewed commit, then verify the exact revision and live public URL. No alternate hosting provider is silently substituted.

## Documentation

- `docs/REFERENCE_AUDIT.md`: observed interaction audit and verification limitations
- `docs/ARCHITECTURE.md`: application/state/rendering boundaries and plan
- `docs/ASSETS_REQUIRED.md`: six-variant readiness and qualified source candidates
- `docs/IMAGE_CREDITS.md`, `docs/ENVIRONMENT_CREDITS.md`, `docs/SPECIFICATIONS.md`: rights and factual sources
- `docs/PERFORMANCE.md`: actual bundle/assets and pending measurements
- `docs/IMPLEMENTATION_NOTES.md`: compromises and blockers
- `docs/design/design-system.md`: original art direction and conceptual references

## Privacy and licensing

No analytics, account login, backend user data or checkout. Sound preference is stored locally. Audio cues are original procedural tones, activated only after user interaction. Photographs keep their individual CC licenses; HDRIs are CC0. User-uploaded reference screenshots and source originals are excluded from public git; no credential is part of this project. Code has no declared public license yet; media licenses do not grant trademark rights or official affiliation.

## Browser QA

`npm run test:e2e` is the real-browser suite (install Chromium with `npx playwright install chromium` in a permitted environment). It exercises home→models→configurator→detail→back, all six variants, fallbacks, reduced motion and overflow at1920×1080,1440×900,390×844 and430×932. A prepared GitHub Actions workflow can run these on a standard cloud runner after an authorized push. It has not run yet. Its screenshots/reports must be inspected before visual acceptance; passing tests alone cannot establish premium realism.
