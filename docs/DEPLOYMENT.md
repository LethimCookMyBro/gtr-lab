# Railway preview deployment

The public preview is https://gtr-lab-production.up.railway.app/. It uses one static Node service and one replica, with idle sleep enabled. There is no database, account backend, analytics service or external runtime media host.

## Runtime configuration

- Railpack builds with `npm run build`; Node starts with `npm start` and honors Railway’s `PORT`
- One Singapore replica; no database, volume, custom domain or paid add-on
- Idle sleep can introduce a cold-start delay
- Model, film and HDRI files are self-contained at runtime; no external runtime asset credentials

## Release verification

The mobile-motion product candidate is `4aa490a110954b41c0b4aac586ba216a85c6872a`, with the final test-only follow-up `0538e2f8123aba3de1f7cb41b3f7c65f58b8676f`. Homepage browser run `36889777177` passed 21 applicable cases, with 6 intentionally skipped duplicate-project checks. The six-portrait-size sweep includes 600/667px heights, stable scroll targets, readable timeline/credit spacing and focus reveal. Real native films, reduced-motion/Save-Data explicit play and desktop/landscape regressions also passed. These tests do not constitute OEM-photoreal, physical-Safari or six-car product acceptance.

A temporary release-marker watch gate kept unfinished homepage commits out of the existing preview. The reviewed release restores ordinary deployment triggers after the exact new Railway revision is healthy and its public browser smoke checks pass. The release marker records the tested application candidate; the release commit adds only deployment verification and documentation, not untested application changes.

`Railway live smoke` waits for the exact GitHub commit's Railway status, verifies both movie hashes, HTTP MIME/HEAD and 206 byte ranges, checks the deployed real-car controls/environments, then captures the public homepage during native video playback at 1920, 1440 and 390 widths. It additionally records gradual live 390×700 scrolling and verifies 430×700 motion. Its evidence is retained as `railway-live-browser-proof`. The 390px demonstration uses slower actual wheel input; the footage is not retimed.

## Normal service watch patterns

The mobile revision temporarily uses only `/release-marker.json`; restore the exact 14 patterns below after the tested live release. The two film-pipeline paths were already part of the recorded pre-mobile list. No other service settings change.

```json
[
  "/src/**",
  "/public/**",
  "/modeldata/**",
  "/package.json",
  "/package-lock.json",
  "/index.html",
  "/vite.config.ts",
  "/tsconfig*.json",
  "/server.mjs",
  "/railway.json",
  "/scripts/prepare-models.mjs",
  "/scripts/fetch-environments.mjs",
  "/filmdata/**",
  "/scripts/prepare-films.mjs"
]
```

The first 12 entries are the original list; only the final 2 are new. The build remains `npm run build`, start is `npm start`, healthcheck is `/`, and idle sleep remains enabled.

## Remaining product gaps

Only the accepted licensed custom-aero R35 exterior is integrated. The other 5 variant GLBs and an accepted accurate interior remain unavailable. Previously rejected original geometry and cabin studies are not published. See ASSETS_REQUIRED.md and IMPLEMENTATION_NOTES.md. This deployment is a functional visual preview, not the completed six-vehicle release.


## Initial verification

Revision `b2579cef674d09d1aeeee5df63462bd5839c2211`, deployment `d6777878-285f-45fd-853b-e31cb41445b0`: build and healthcheck succeeded. Public HEAD requests to `/`, `/models`, `/configurator/premium` and `/models/ciasny-r35.glb` returned200. The GLB response is8,296,356 bytes, matching the initial accepted exterior revision.

The direct cloud browser opened the actual homepage and followed Enter configurator. That browser does not expose WebGL; the deployed app correctly displayed its photo/error fallback instead of a blank screen. A separate public-URL Chromium/SwiftShader workflow verifies rendered3D and essential controls. Run36847271913 subsequently passed actual public-URL WebGL, paint/lamp/detail and studio/forest/coast checks at1440×900 and 390×844 after verifying revision1a6f68faf21cc32442a1ef919e05049716194ae0 deployed successfully.

The first Nixpacks build failed because a redundant `npm ci` attempted to remove the mounted dependency cache. The config now selects current Railpack and runs build only after dependency installation.

## Cost boundary

The user approved this preview on the existing Hobby plan after disclosure that its included usage is shared and overage is possible. This project did not change workspace billing or limits. Idle sleep and a single small static-serving process keep the baseline modest. Early measurements were approximately33MB RAM and0.00078CPU; these are not a monthly quote or proof of remaining workspace credits. Traffic, model downloads and other projects can affect the bill.

## Repository presentation

GitHub About Website is set to the exact live Railway URL. Only `main` remains; the temporary WIP branch was removed after verifying its commits were retained on main.
