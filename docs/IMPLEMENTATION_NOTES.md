# Implementation status / honest limitations

## Implemented, not yet full product acceptance
Original home, cinematic six-variant selector, heritage/engineering, sources/credits, per-variant configurator route, responsive layout rules, keyboard panels, gesture-only audio preference, central state, realGLB renderer, eight camera modes, declared PBR/light-material adapters, studio/gallery/night plus CC0 outdoor HDRI pipeline, progress/error handling and production server.

## Blocking acceptance criteria
1. **One licensed exterior integrated; full cabin and five variants remain incomplete.** Ciasny’s custom-aero R35 is available on one route with provenance and clear model-year limitations. Interior remains unavailable: the newly authored cabin was rejected and is not included. A separately accepted authentic interior is required. The other five routes remain explicit photographic references. The complete six-variant experience is not finished.
2. **Real vehicle final visual/GPU acceptance is still pending.** The accepted exterior rendered at1440/390 with no browser errors. Paint, camera, lamps, environment and recovery cases passed; rotation traces exposed slow screenshot readback rather than absent motion. The contact-shadow rectangle is fixed in inspected browser pixels. Grounding and framing are improved in actual screenshots. A source-preserving normal-fidelity alternative was evaluated locally but is not published; the served exterior remains the accepted 8.30MB version.
3. **Railway development preview deployed.** The existing Hobby workspace hosts https://gtr-lab-production.up.railway.app/ with one service/replica and idle sleep. Initial healthy deployment b2579cef passed healthcheck and public HTTP checks. The direct cloud browser verifies the homepage and graceful WebGL-unavailable fallback; deployed WebGL verification runs separately on the supported Chromium runner. No new plan, database or credentials were established. This is not full product acceptance.
4. **Main-only development.** The full source and cloud browser tests are on `main`; the temporary WIP branch has been removed after its work was retained. No final release is implied.

## Deliberate choices
- Different photographs and specification sources for all six variants; no same-mesh renaming
- GT3 photograph is2015 context; GT-R50 photograph is2018 concept; Premium photo2018. Specs explicitly identify their other relevant year/market. Correct hp vs PS,2020GT500 inline-four RWD
- Concept paint palette is clearly non-official; no OEM availability claim
- The redesigned homepage uses real NissanNews track footage through publisher-provided Flixel players with credited photographic fallbacks, true-white asymmetric editorial sections, scroll-expanding film and a pinned heritage sequence. Generated layout concepts are design references only, not runtime vehicle imagery. The original cinematic homepage was released before this hosted-film update; the new footage requires its own browser and release verification. The later mobile-motion revision has its own exact-commit release checks.
- Doors/hood/trunk omitted because unsupported asset animation is not faked
- No placeholder shopping/checkout/Finish control
- Generated sounds are short quiet interface cues, not genuine recorded engine audio
- User screenshots never committed publicly, since browser chrome may contain personal context

## Verification evidence
Unit/DOM tests cover data accuracy, variant state cleanup, exclusive panels, material-role selection, bounds normalization, camera definitions, real progress helpers, photo-fallback honesty, detail drawer open/Escape/focus return, variant navigation and Back. Main commitaf06fb4 passed81unit tests,24UI browser cases and6WebGL fixture cases; production build and typecheck passed. Real licensed-car outcomes and subsequent visual defects/fixes are recorded per commit in QA_REPORT.md. See QA_REPORT.md for evidence and fixed risks.

## Rejected original asset study
An original Blender study was evaluated and rejected as insufficiently accurate. It is not included in the application, public assets or deployment. The acquired Ciasny exterior replaces that approach. The separately authored cabin was also rejected and has been removed from the working app. Neither rejected asset appears in any published commit. No new interior should be integrated before its preview is accepted.

## Cinematic homepage revision
The reference homepage was re-audited through actual desktop/mobile interaction and an independent Chromium capture. Its two genuine looping videos, white editorial overlap, expanding second film, heritage depth and responsive lineup behavior are recorded in REFERENCE_AUDIT.md. The GT-R adaptation deliberately uses full-width semantic model invitations rather than reproducing the reference's inaccessible image-card navigation.

First redesign browser run `36852709099` passed desktop/mobile layout, native scroll geometry, menu focus, six destinations and reduced-motion layout checks. Real-media tests were explicitly skipped because final original films were still rendering; this is not a film acceptance pass. Screenshot review identified mobile image-overlap and era-control placement issues, followed by measured regression assertions. The original cinematic homepage subsequently passed its real-film/crop checks and was released. The mobile-motion revision below supersedes its earlier short-height behavior.


## Gradual mobile motion revision

The live baseline disabled scroll staging for every viewport at or below 740px height, including ordinary portrait phones. The revised policy retains gradual motion for portrait viewports down to 600px, while reduced motion, genuinely very short screens and short wide layouts keep sequential content. Save-Data continues to prevent film autoplay without disabling the non-video storytelling.

The mobile hero has a controlled exit, the two editorial photographs stage independently, the second film grows continuously toward the viewport edges, and heritage photographs crossfade with a single large year fading through zero at each era boundary. Timeline navigation remains native scrolling; there is no scroll interception. The implementation batches geometry reads before style writes and removes motion styles when preferences change.

Product source is frozen at 4aa490a110954b41c0b4aac586ba216a85c6872a. The test-only follow-up 0538e2f8123aba3de1f7cb41b3f7c65f58b8676f waits for native focus scrolling to finish before issuing an independent film stability probe. It does not weaken the 14-frame/2px stability assertion. These changes do not add vehicle assets or change the outstanding interior/six-variant acceptance gates.


## Homepage story revision

The bounded homepage revision replaces the fixed three-era composition with four naturally scrolled photographic chapters and a pinned narrative selected from the actual chapter centers. R34 receives its own1999 chapter. Photographic dates remain distinct from generation introduction dates. A separate abstract four-circle motif transitions into a detail-to-rear-three-quarter reveal of the existing licensed2024NISMO photograph; it is not a simulated3D camera or newly generated car.

The expanding track loop gains an enlarged-view dialog using the already verified publisher iframe. Its ambient player unmounts while the dialog is open, background-tab playback unloads, Escape/Close return focus, and normal page scrolling is restored. The label promises enlarged viewing of a short loop, not an unverified longer film. Reduced motion and short layouts expose all chapter content sequentially. The menu remains unchanged; further menu/category work is outside this bounded revision. The final candidate aa63a90c68eabb37379480feb15897377097fef1 passed the dedicated desktop/mobile browser suite. Gallery pacing, reverse-scroll readability and dialog focus were corrected from actual captures before release. Public deployment checks are recorded separately.


## Responsive model-card spacing

The model invitations now have separate dark gaps and side gutters, rounded corners, and a stacked mobile heading/CTA. All six genuine photographs and destinations are preserved. Candidate903cea1544db55ddeba7ac2203cfc71973d6b2b1 passed actual-card image, spacing, label, keyboard-focus and link checks at390,430 and1440 CSS pixels. The rear-signature source-stability test now waits for the lazy photograph to be ready before sampling; its source/reverse-motion assertions remain intact.
