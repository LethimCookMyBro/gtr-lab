# Implementation status / honest limitations

## Implemented, not yet full product acceptance
Original home, cinematic six-variant selector, heritage/engineering, sources/credits, per-variant configurator route, responsive layout rules, keyboard panels, gesture-only audio preference, central state, realGLB renderer, eight camera modes, declared PBR/light-material adapters, studio/gallery/night plus CC0 outdoor HDRI pipeline, progress/error handling and production server.

## Blocking acceptance criteria
1. **No qualified licensed GT-R mesh yet.** All variant manifests intentionally remain missing. Photo references are visibly marked; painting/camera/light controls are disabled where inapplicable. This is not completed live3D functionality and must not be sold or described as finished. Candidate acquisition and required detailed cabin/material contract are in ASSETS_REQUIRED.md.
2. **Real vehicle visual/GPU QA still pending.** Direct cloud preview was unavailable, so the authorized GitHub Actions runner completed16responsive UI cases and6real-WebGL synthetic-fixture cases. Settled desktop/mobile screenshots were inspected. This validates application mechanics, but does not establish real vehicle geometry, cabin placement, material quality or animation feel.
3. **Railway deployment pending.** Railway is connected and the existing workspace was verified read-only. Build/deployment configuration is prepared, but no Railway deploy has occurred. No alternate host substituted. No new paid plans/credentials established.
4. **Work-in-progress GitHub branch approved.** The user requested main-only development after the initial WIP push. The full source and cloud browser tests are now on `main`, still explicitly in progress. No final release is implied.

## Deliberate choices
- Different photographs and specification sources for all six variants; no same-mesh renaming
- GT3 photograph is2015 context; GT-R50 photograph is2018 concept; Premium photo2018. Specs explicitly identify their other relevant year/market. Correct hp vs PS,2020GT500 inline-four RWD
- Concept paint palette is clearly non-official; no OEM availability claim
- Hero is an original generated illustration, labeled as such; actual lineup photos are licensed/credited. User requests no AI slop; final image quality still requires visual acceptance, or replace with approved photography/CGI
- Doors/hood/trunk omitted because unsupported asset animation is not faked
- No placeholder shopping/checkout/Finish control
- Generated sounds are short quiet interface cues, not genuine recorded engine audio
- User screenshots never committed publicly, since browser chrome may contain personal context

## Verification evidence
Unit/DOM tests cover data accuracy, variant state cleanup, exclusive panels, material-role selection, bounds normalization, camera definitions, real progress helpers, photo-fallback honesty, detail drawer open/Escape/focus return, variant navigation and Back. Main commit7efbac6 passed80unit tests,16UI browser cases and6WebGL fixture cases; production build and typecheck passed. Browser/GPU checks remain explicitly unrun. See QA_REPORT.md for evidence and fixed risks.

## Rejected original asset study
An original Blender study was evaluated and rejected as insufficiently accurate. It is not included in the application, public assets or deployment. An accurate, cabin-detailed, lawfully sourced model remains a blocking acceptance requirement.
