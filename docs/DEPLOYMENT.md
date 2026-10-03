# Railway preview deployment

The public preview is https://gtr-lab-production.up.railway.app/. It uses one static Node service and one replica, with idle sleep enabled. There is no database, account backend or app analytics service. The two homepage driving films use external publisher-hosted Flixel players.

## Runtime configuration

- Railpack builds with `npm run build`; Node starts with `npm start` and honors Railway’s `PORT`
- One Singapore replica; no database, volume, custom domain or paid add-on
- Idle sleep can introduce a cold-start delay
- Model and HDRI files are self-contained at runtime; homepage films use intact public Flixel embeds without credentials

## Release verification

The mobile-motion product candidate is `4aa490a110954b41c0b4aac586ba216a85c6872a`, with the final test-only follow-up `0538e2f8123aba3de1f7cb41b3f7c65f58b8676f`. Homepage browser run `36889777177` passed 21 applicable cases, with 6 intentionally skipped duplicate-project checks. The six-portrait-size sweep includes 600/667px heights, stable scroll targets, readable timeline/credit spacing and focus reveal. Real native films, reduced-motion/Save-Data explicit play and desktop/landscape regressions also passed. These tests do not constitute OEM-photoreal, physical-Safari or six-car product acceptance.

A temporary release-marker watch gate kept unfinished homepage commits out of the existing preview. The reviewed release restores ordinary deployment triggers after the exact new Railway revision is healthy and its public browser smoke checks pass. The release marker records the tested application candidate; the release commit adds only deployment verification and documentation, not untested application changes.

The driving-film revision separates deterministic app/scroll checks from provider playback. GitHub runner requests to the Flixel players returned 403 with SAMEORIGIN protection; no headers were removed or requests proxied. Both exact intact players were then verified on the real Railway origin in the cloud browser, including advancing frames, Stop/Play and offscreen unloading. See `film-sources/QA_PROVIDER_LIMITATION.md`. The live browser workflow checks the deployed CSP, vehicle controls and responsive scroll layout; actual hosted-film playback requires the separate public-origin browser check.

## Normal service watch patterns

The driving-film revision used `/release-driving-films-approved.txt` temporarily. The release procedure restores the exact 14 patterns below after live verification. The two film-pipeline paths were already part of the recorded pre-mobile list. No other service settings change.

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


## Driving-film release, 2 October 2026

Application revision `c6db05ef45df53222cb2c43762c8b352ff1531f2` deployed successfully as `f94a3e69-31d2-4d0f-9e11-da6332286341`. Both real NissanNews films advanced on the public Railway origin. Actual cloud-browser review covered the desktop hero/detail, Stop/Play, offscreen unloading, continuous detail width/radius growth, and the full responsive app at measured390×844 and430×932 iframe viewports. These are CSS-sized browser checks, not physical-phone performance benchmarks.

The mobile correction preserves the whole landscape film, brings hero copy28px below it and keeps detail controls in an adjacent76px row. Exact-revision homepage and mobile-motion workflows passed. The follow-up cleanup removes the unlinked temporary responsive wrapper and its route-only same-origin framing exception; ordinary pages retain `frame-ancestors 'none'`. No player headers were removed, no media was extracted or rehosted, and no model asset changed.


## Archive story release, 2 October 2026

Application candidate `aa63a90c68eabb37379480feb15897377097fef1` adds four native-scroll archive chapters, a truthful rear-quarter photographic reveal and focused viewing of the already verified short driving loop. [Exact-candidate homepage QA](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36993099351) passed, including real forward/reverse wheel input, bounded first/last chapter navigation, responsive/reduced-motion layout and dialog focus/close/scroll-return behavior. [Mobile motion captures](https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36993099322) cover390/430 widths and700/844/932 heights.

The first candidate exposed native dialog focus leaving the modal on Shift+Tab; explicit boundary wrapping fixed it. Capture review also identified photo/timeline contrast and excessively long mobile gaps. The final layout uses natural image heights, a bounded gap, a protected timeline background and a distinct2018Premium photo in the last chapter so the immediate NISMO rear reveal does not repeat the same shot. Showroom background and mixed photographic quality remain visible source limitations.

A narrow `/release-home-story-approved.txt` watch gate isolates staging commits. The release marker promotes the tested application tree; all14 saved normal patterns must be restored after the new deployment is healthy. This release adds no framing-policy exceptions or temporary browser wrapper, and changes no vehicle asset or hosting plan. The final public-origin dialog playback check remains distinct from GitHub runner provider restrictions.


## Desktop composition release, 2 October 2026

Tested application candidate `e10ad46cff66f6f0d44f395b30f28d7d9e3a4f51` replaces arbitrary-height desktop provider boxes with full-width native-aspect frames and a separate controls row. Heritage photography grows to66% width with alternating dark narrative columns. Exact homepage workflow37005595356 and mobile workflow37005595301 passed. The short-landscape regression caught controls below the viewport and the candidate restores a fitted frame with reachable controls there. No provider footage or model asset was uploaded.

The original14 Railway watch patterns were snapshotted before temporarily selecting only `/release-home-story-approved.txt`. Restore that exact list after the released application is healthy and its actual hosted playback/framing is checked. No route framing exception, temporary wrapper, extra service or plan change is part of this release.


## Independent motion UI release boundary

The menu, editorial/caption collision corrections, desktop model invitations and footer are released independently of the unapproved rear3D study. Both the rejected photographic signature runway and the experimental rear canvas are absent from the public HomePage. The experimental source and historical captures do not represent a completed production feature. All source/model bytes used by the existing configurator remain unchanged. The temporary release-marker gate must be restored to the saved14 patterns after the verified UI deployment.


Application candidate `57e0de0f093c92a6fe79935d7bd3207bbafca95c` passed homepage workflow37018776233, all five mobile motion captures in37018776203, production build and260 unit/DOM tests. Existing vehicle checkpoint37018776332 passed. Exact public deployment smoke and the restored watchlist are verified after promotion; the broader unchanged vehicle suite remains separately reported rather than being confused with acceptance of the excluded rear prototype.


## Heritage exhibition release, 3 October 2026

Application revision `59fbc88902a5d0767c1a8a98461ac9d114875c19` and QA-only follow-up `4e9282422e07ddbbda62648ea75b4da01b208196` passed aggregate Quality `37099365343` and homepage/component workflow `37099365344`. The final checks include nine heritage flows and eighteen hero-exit flows. All five mobile-motion plans passed in `37098892949`; the real-vehicle checkpoint passed in `37098892955`. The local suite passed 306 tests, typecheck and the production build.

The archive now uses four compact, normal-flow, three-photo spreads. Each keeps its sourced competition milestone and individually credited captions beside the real image. The era rail follows the visible chapter through cold-load settling, reduced motion and normal scrolling. A native-wheel recording verifies the complete hero panel's bounded exit and reversal; its provider geometry and branding are unchanged. The paper transition is outside the provider frame.

Review caught a boundary-sensitive active-era reading line and corrected it with short-window regressions. Browser navigation checks wait for actual native scroll rest and assert visible headings below the rail rather than imposing an arbitrary 3px landing coordinate. A model-card pointer check passed on an isolated repeat without modifying that component. External hosted-film readiness may require a retry; no provider restriction was bypassed.

The temporary watch gate is `/release-heritage-exhibition-approved.txt`. The release commit changes only release metadata, this verification note and the corresponding live-smoke trigger. After this commit is healthy and its public-origin smoke and film verification pass, restore the exact 14 watch patterns recorded above. No hosting plan, service size, source branch, network permission or 3D asset is changed by this release.


The first public-origin smoke for release `d96828deb0274c6d45331fd3073c58b37e87a5c0` passed its exact Railway revision, CSP, real-vehicle capture and visible-heading/active-era/rail checks, but the legacy wheel helper still imposed a 2px final coordinate. Actual native wheel arrivals differed by about 28px while remaining readable and correctly selected. The QA-only follow-up replaces that changed-layout mismatch with explicit heading hit-testing, fully decoded selected photographs, correct active era and full visibility below the rail; it retains native-scroll settlement and the complete forward/reverse sequence. No product code is altered to force a pixel target. The trace shows lazy-image responses were still finishing when the coordinate assertion failed; those responses were valid 200 WebPs. The follow-up waits for real decode before accepting an arrival.

Public smoke run `37100438971` is **not green**: it records three coordinate-only failures, and two film-dialog cases passed on retry. It is not represented as a full smoke success. The reviewed production release remains `d96828deb0274c6d45331fd3073c58b37e87a5c0`; its own aggregate Quality run `37100438953` succeeded. Direct public cloud-browser checks confirmed advancing hosted playback, exit/reverse and Stop/Play. The focused QA correction is published without touching the release marker or changing production application bytes; no further deployment is started merely to change historical testing status.
