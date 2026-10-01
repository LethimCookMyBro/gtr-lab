# Implementation status / honest limitations

## Implemented, not yet full product acceptance
Original home, cinematic six-variant selector, heritage/engineering, sources/credits, per-variant configurator route, responsive layout rules, keyboard panels, gesture-only audio preference, central state, realGLB renderer, eight camera modes, declared PBR/light-material adapters, studio/gallery/night plus CC0 outdoor HDRI pipeline, progress/error handling and production server.

## Blocking acceptance criteria
1. **One licensed exterior integrated; full cabin and five variants remain incomplete.** Ciasny’s custom-aero R35 is available on one route with provenance and clear model-year limitations. Interior remains unavailable: the newly authored cabin was rejected and is not included. A separately accepted authentic interior is required. The other five routes remain explicit photographic references. The complete six-variant experience is not finished.
2. **Real vehicle final visual/GPU acceptance is still pending.** The accepted exterior rendered at1440/390 with no browser errors. Paint, camera, lamps, environment and recovery cases passed; rotation traces exposed slow screenshot readback rather than absent motion. The contact-shadow rectangle is fixed in inspected browser pixels. Grounding and framing are improved in actual screenshots. Source-normal fidelity correction and the complete rerun remain open.
3. **Railway development preview deployed.** The existing Hobby workspace hosts https://gtr-lab-production.up.railway.app/ with one service/replica and idle sleep. Initial healthy deployment b2579cef passed healthcheck and public HTTP checks. The direct cloud browser verifies the homepage and graceful WebGL-unavailable fallback; deployed WebGL verification runs separately on the supported Chromium runner. No new plan, database or credentials were established. This is not full product acceptance.
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
Unit/DOM tests cover data accuracy, variant state cleanup, exclusive panels, material-role selection, bounds normalization, camera definitions, real progress helpers, photo-fallback honesty, detail drawer open/Escape/focus return, variant navigation and Back. Main commitaf06fb4 passed81unit tests,24UI browser cases and6WebGL fixture cases; production build and typecheck passed. Real licensed-car outcomes and subsequent visual defects/fixes are recorded per commit in QA_REPORT.md. See QA_REPORT.md for evidence and fixed risks.

## Rejected original asset study
An original Blender study was evaluated and rejected as insufficiently accurate. It is not included in the application, public assets or deployment. The acquired Ciasny exterior replaces that approach. The separately authored cabin was also rejected and has been removed from the working app. Neither rejected asset appears in any published commit. No new interior should be integrated before its preview is accepted.
