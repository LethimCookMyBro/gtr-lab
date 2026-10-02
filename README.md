# GT-R LAB

An original independent GT-R digital exhibition built with React, TypeScript and React Three Fiber. This project is not affiliated with Nissan, NISMO, Italdesign or Porsche.

## Current status
**In progress. Not a completed production configurator.**

One licensed Ciasny R35 exterior renders in the real WebGL configurator on the Premium route, with its custom-aero/model-year limitations visible. The other five routes remain labeled photographic references, not renamed copies of the same mesh. Paint, lamps, cameras and outdoor environments work on the licensed exterior. Interior remains disabled until an accurate cabin preview is accepted. The calibrated vehicle revision passed all14 actual-car browser flows; physical-device performance and final visual quality are still open.

The homepage combines two real NissanNews GT-R track films in intact Flixel players, white overlapping editorial photography, a scroll-expanding second film, pinned heritage and six full-width model invitations. The film revision passes 250 unit/DOM/build-asset tests. Both exact players were verified advancing on the actual Railway origin; GitHub runner playback is blocked by the provider, so runner layout checks and public-origin media verification are reported separately. Main-only development continues; the [Railway development preview](https://gtr-lab-production.up.railway.app/) publishes reviewed releases. This is not the finished six-vehicle experience.

## Run

Requires Node22.12+ or24 and npm.

- `npm ci`
- `npm run prepare:assets` (model, film and HDRI preparation for local development; production builds do this automatically)
- `npm run dev` (Vite development)
- `npm test`
- `npm run typecheck`
- `npm run build`
- `npm start` (production server, uses `PORT`, default3000)

A restricted environment may disallow Vite’s network-interface enumeration. The production server does not need that enumeration. Build first and use `PORT=4173 npm start` for a production-equivalent local preview. This is not a bypass of browser or network restrictions; use a permitted browser test environment.

## Build-time assets

The licensed GLB is reconstructed offline from small SHA-256-pinned binary chunks in `modeldata/`. The build verifies each chunk, the completed payload and the glTF container before publishing it to `public/models/`. See `docs/MODEL_TRANSPORT.md` and `docs/MODEL_PROVENANCE.md`. Model data is served locally at runtime.

### Archived original CGI films

Two native720p MP4s total1,820,885bytes. `filmdata/` stores explicit64KiB chunks solely for reliable source publication. `prepare-films.mjs` validates every chunk and the completed film against the source manifest before writing self-contained `public/films/` outputs. There is no runtime chunk assembly. These files are archived development media and are not requested by the homepage; the current homepage uses external publisher-hosted players. Posters and full author/license/modification credits ship alongside the films. The films animate real perspective-changing cameras around the unchanged licensed Ciasny exterior; they are CGI previews, not live-action footage or proof that all six variants are complete.

### Environment assets

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
- `docs/DEPLOYMENT.md`: reviewed release process, live checks and normal deployment triggers
- `docs/ARCHITECTURE.md`: application/state/rendering boundaries and plan
- `docs/ASSETS_REQUIRED.md`: six-variant readiness and qualified source candidates
- `public/films/ATTRIBUTION.txt`, `public/films/provenance.json`: original film provenance and modifications
- `docs/HOME_MEDIA_CREDITS.md`: authentic editorial and heritage imagery
- `docs/IMAGE_CREDITS.md`, `docs/ENVIRONMENT_CREDITS.md`, `docs/SPECIFICATIONS.md`: rights and factual sources
- `docs/PERFORMANCE.md`: actual bundle/assets and pending measurements
- `docs/IMPLEMENTATION_NOTES.md`: compromises and blockers
- `docs/design/design-system.md`: original art direction and conceptual references

## Privacy and licensing

The app has no analytics, account login, backend user data or checkout. Playing a hosted film connects the browser to Flixel; reduced motion and Save-Data prevent automatic film requests. Sound preference is stored locally. Audio cues are original procedural tones, activated only after user interaction. Photographs keep their individual CC licenses; HDRIs are CC0. User-uploaded reference screenshots and source originals are excluded from public git; no credential is part of this project. Code has no declared public license yet; media licenses do not grant trademark rights or official affiliation.

## Browser QA

`npm run test:e2e` is the real-browser suite (install Chromium with `npx playwright install chromium` in a permitted environment). It exercises home→models→configurator→detail→back, all six variants, fallbacks, reduced motion and overflow at1920×1080,1440×900,390×844 and430×932. A prepared GitHub Actions workflow can run these on a standard cloud runner after an authorized push. The scaffold suite ran in GitHub Actions and its settled screenshots were inspected. `npm run test:vehicle` separately exercises the licensed vehicle through the production server and CSP. Fresh real-car screenshots must be inspected before visual acceptance; passing tests alone cannot establish premium realism.

`REQUIRE_HOME_FILMS=1 npx playwright test -c playwright.home.config.ts` is the separate cinematic-homepage acceptance suite. It checks1920×1080,1440×900 and390×844 compositions, two temporal frames per real film, intact publisher playback, stop/restart and offscreen unloading, reduced-motion and Save-Data behavior, and a bounded extra viewport/landscape sweep. The final composed images require human visual review before release.

The opening and expanding films now use real NissanNews track footage through the publisher’s intact Flixel embeds. See [film sources and bounded embedding permission](docs/film-sources/DRIVING_EMBEDS.md). No third-party video bytes are extracted or rehosted.
