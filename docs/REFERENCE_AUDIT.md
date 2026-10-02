# Reference audit — 2026-10-01

Reference: https://everymatrix-porchelab.netlify.app/ and /configurator

## Method and confidence
Actual interactions in dot's cloud Chromium (1180×747 viewport), not source-code copying or screenshot guessing. Inspected both URLs, clicked navigation categories/close, hero Explore in 3D, a model invitation, Model Detail and Back, and scrolled the editorial/heritage/lineup content. The cloud browser cannot create WebGL (console reports GL_VENDOR/GL_RENDERER Disabled). One reload reproduced failure; direct reload of the configurator returned to home. An isolated Playwright Chromium fallback also failed to launch due OS socket permissions. No user-computer browser was used. These initial-browser limits prevented full reference 3D, mobile, sound or exact-timing verification. The later GitHub-runner evidence below supersedes the blanket WebGL limitation and verifies route entry plus color-input state changes at desktop/mobile sizes, but does not establish rendered configurator behavior. The implementation below must use the user's explicit brief for unverified behavior, not inventions attributed to the reference.

## 1. Routes and hierarchy
- `/`: long cinematic editorial homepage, in-page model selection, footer
- `/configurator`: runtime-state-dependent configurator route entered via Explore in 3D or model invitation
- No separately discovered local `/models` route; navigation links predominantly leave for official Porsche services
- Direct configurator reload returned `/` in this audit. GT-R LAB deliberately supports deep links reliably

## 2–4. Home and model selection
- Full-viewport autoplay cinematic video backdrop; centered brand mark above; Menu upper-left
- Large centered one-line hero title with smaller multiline explanatory copy below
- Explore in 3D outlined CTA lower-right, tiny 3D symbol
- White editorial section: left typography/right rounded wide photograph, second staggered image below-left with engineering copy opposite
- Large video/film section; transition into black heritage story
- Scroll-triggered historic timeline with changing captions and imagery, leading to modern era
- Black lineup area contains six large vertically stacked wide photographic invitations (911,718,918,Taycan,Panamera,Cayenne), centered stylized names. Panamera and Cayenne cards visibly inspected
- Cards use strong photographic content, restrained radius, generous horizontal margins. Hovered/pressed card revealed central 3D icon and lower CTA while background blurred/dimmed
- White footer: brand, independent-project/non-affiliation disclaimer, creator and external contact columns

## 5–6. Configurator and loading
- Entry overlays homepage with vertical translucent dark/blur panels and PREPARING YOUR 3D PORSCHE EXPERIENCE text before route handoff
- Initial home also showed a brief Loading.../brand state. The later desktop runner recorded `Loading 96%` at configurator entry and its absence at the next checkpoint; exact progress accounting and successful geometry/material readiness are not verified
- Configurator DOM exposes Model Detail at top, custom color well, roughness slider (0.41), metalness slider (1), Back button and WebGL surface
- In the initial cloud browser, WebGL context failure left the viewport black; do not infer visible toolbar positioning from hidden DOM. Both subsequent GitHub passes created live contexts, but no configurator screenshot succeeded (see evidence updates below)
- Do not reproduce its blank-screen environmental failure: GT-R LAB must have explicit recoverable fallback

## 7–8. Typography, layout, hierarchy
Large light/regular sans hero typography, smaller restrained UI, editorial headings heavier/condensed in appearance. Black hero/heritage/lineup alternates white editorial/footer. Wide gutters, full-screen media, low control density, rounded photographic panels. Exact font identity and pixel values were not measured; original GT-R typography is appropriate.

## 9–16. Interaction matrix
Initial interactive-browser observations are retained below; later GitHub DOM evidence is identified explicitly. A dispatched input, a changed form value, and a verified visual response are different evidence levels.
| Trigger | Observed animation | Resulting state | Exit / return |
|---|---|---|---|
| Menu button | Drawer/overlay reveal; page becomes dark and blurred | Wide two-column light drawer, categories left and link lists right | Close Menu returns unobscured home |
| Vehicle Purchase | Category highlight/link replacement | Configure, Compare, Inventory, E-performance, Finance external links | Select another category/close |
| Services | Link-list replacement | Accessories, Individualisation, Approved, Service, Classic, Lifestyle | Another category/close |
| Experience | Link-list replacement | Motorsport, Driving experiences, Communities, Golf, Magazine, Museum | Another category/close |
| Explore in 3D | Initial browser: blur/dark vertical-panel takeover; later DOM also contains preparation text | `/configurator` reached on both runner viewports with live WebGL | Back returned `/` only in the initial browser; later runner return not verified |
| Scroll editorial | Smooth scroll and reveal/parallax-like staged image positioning | Design then Engineering content | Reverse scroll |
| Scroll heritage | Captions change across timeline segments | Early engineer through modern vision | Reverse scroll; exact image pacing unverified |
| Panamera model card | Card blur and central 3D mark, full-route dark panel transition | `/configurator` | Back returns homepage |
| Model Detail | No usable visual result in initial browser; later desktop/mobile click attempts timed out waiting for actionability | No detail panel content or heading recorded; unverified | Exit behavior unverified |
| Back | Initial browser: page return transition and brand/loading overlay | Initial browser returned `/`; later desktop click timed out, later mobile had no visible matching target at the final checkpoint | Later runner return remains unverified |
| Color well/sliders | Initial controls discovered; later runner filled the visible color input | Both runner viewports changed input value `#80807d` → `#991b2b`; rendered paint effect and slider effects remain unverified | Restoration/persistence not tested |
| Pointer orbit / zoom | Later runner dispatched mouse drag at both sizes and mouse wheel on desktop | Public DOM retained configurator state; no pixels establish camera movement, zoom, or clamps | Touch gestures and auto-rotation interaction unverified |

Camera presets, orbit/zoom clamps, model handoff geometry, toolbar toggles, environment controls, light controls, precise drawer animations, auto-rotation and audio remain unverified: the initial browser did not render the 3D route; the latest GitHub pass retained public DOM/input evidence but produced no screenshots. Toolbar labels for Camera, Environment, Lights, or Sound were not discovered, so those actions were not attempted. No audible behavior was established. No proprietary source or assets were downloaded/copied.

## 15. Timing
Perceived transitions are deliberate, with card/route blur followed by takeover. The browser tool sampling is too coarse to truthfully give millisecond durations. GT-R LAB targets original 160–240ms micro-interactions, 350ms drawers and ~900ms camera interpolation; these are implementation design decisions, not measured reference values.

## 17. Responsive behavior
The initial cloud-browser desktop viewport was inspected. A later GitHub runner captured the homepage at 1440×900 and 390×844; these screenshots show transient page states, not a complete responsive-layout audit. Both configurator canvases reported the matching dimensions and a live WebGL context, but no configurator screenshot or interaction result survived the first pass. The subsequent pass retained route/color-input results and measured no horizontal document overflow at all 16 recorded DOM checkpoints across both sizes. That measurement does not prove readable text, unclipped controls, or touch usability; notably, mobile Back was absent from the visible-control set after pointer input despite remaining in body text. Without pixels its location/cause cannot be established. Tablet and complete mobile behavior remain unverified. GT-R LAB must independently validate target sizes with available means and explicitly report any unavailable checks.

## 18. Subtleties and adaptation
- Route entry carries selection in runtime state rather than pathname: improve via per-variant routes
- A card is itself a navigation target, not merely its small CTA
- Navigation is partly decorative/lifestyle routing to official Porsche sites; GT-R LAB will use concise local routes and never imitate official-brand association
- Tiny controls are not all semantic buttons in reference; original implementation must improve keyboard/ARIA support
- Strong imagery does most of the work; UI should remain secondary
- Do not copy timelines, logos, fonts, photos or source code from reference
- Assets and environmental render failures must be visible states, not theatrical indefinite loaders

Audit is sufficient for the observed homepage/entry grammar; it is explicitly incomplete for rendered reference 3D interactions and complete mobile behavior. Continue with user's detailed functional specification while retaining those limits in final QA.

## User-supplied reference screenshots, inspected 2026-10-01
The user subsequently supplied four screenshots of the working configurator. These provide visual evidence, not proof of animations or interactions. Pixels were materialized and inspected:
- Exterior front-three-quarter Porsche on a photographic forest road, headlights illuminated, Model Detail at upper-left, logo/name top center, tall right toolbar, bottom translucent multi-color rail, Back lower-left
- Driver-seat detailed interior with visible steering wheel, gauges, dashboard, mirror and forest outside glazing
- Cabin view angled toward passenger seat/console with detailed door trim and cabin materials
- Large centered environment-selection overlay with scrollable panoramic preview rows (including a coastal sunset)
These reinforce the user's original specification: a properly modeled cabin and believable outdoor lighting are essential, not optional screenshot simulations. A camera inside an empty shell does not pass. The original GT-R interface retains restrained dark control styling rather than copying reference white icon squares or branding. Personal browser-tab chrome in supplied screenshots is excluded from public source control.


## GitHub cloud-renderer evidence update — 2026-10-01

The first `browser-qa-evidence` reference artifact was inspected directly (`reference-audit-results/observations.json`, captured at **09:04:20 UTC**, plus both homepage PNGs). This is a separate environment from the WebGL-disabled interactive cloud browser; no user computer was used.

Verified from that artifact:
- Desktop: 1440×900 canvas, `webgl: true`, `lost: false`, renderer reported `WebKit WebGL`
- Mobile: 390×844 canvas, the same live/non-lost WebGL result
- Both homepage captures exist. Desktop shows a historical racing-video frame with no readable hero overlay in that frame. Mobile shows a full-height car/road image and bottom Explore in 3D CTA, with very dark/faint heading and copy. These are captured transition/loading states; they do not establish stable text contrast, final layout, or animation timing
- The first configurator screenshot in each viewport failed after 10 seconds. The old capture helper attempted screenshots before saving DOM, so the only retained event in each view is `home`. Live WebGL does **not** prove model geometry/materials finished loading
- No Model Detail, orbit, zoom, paint, toolbar, or return action can be claimed from this first artifact

### Audit-runner correction and validation

`scripts/audit-reference.mjs` now saves a checkpoint before reading public DOM, saves DOM/control values before requesting pixels, and catches screenshot errors at the individual event. It writes progress atomically after each checkpoint and action. A stalled screenshot therefore cannot discard already observed controls or skip all subsequent actions.

The run is desktop-first, with 125 seconds for desktop, 75 seconds for mobile, and a 220-second total watchdog inside the existing four-minute CI step. Each screenshot has a 2.5-second limit. CSS animations are left intact. Initial configurator DOM is recorded before ordinary mouse drag input and the first image attempt; no reference application state, animation loop, camera object, or renderer code is patched. Pointer input is explicitly distinguished from a visually verified camera response. The mobile pass is a mobile viewport with desktop-style diagnostic pointer input; touch gestures are not claimed.

Model Detail, visible color input, and Back are attempted independently. Toolbar candidates are selected only from labels actually exposed by the visible current UI. Unlabeled or missing controls are recorded as unverified rather than assigned guessed meanings. Each record includes the attempted action, resulting public text/control state, screenshot success/failure, and any error. Escape is recorded as an attempted exit; a discovered close label is used when available. Exact camera clamps, audible sound, and animation duration still require separate evidence.

A local, browser-free regression harness reproduced the original data-loss failure by injecting screenshot timeouts, then passed with the corrected script: both viewport records retained configurator controls and progressed through Model Detail, color-input, and Back checkpoints. This verifies audit error handling only. The subsequent real artifact below establishes which actions actually ran; the synthetic harness is not evidence of reference-site behavior.


### Subsequent real GitHub artifact — captured 09:48:40 UTC

The corrected script completed an observation pass in **167.093 seconds**, retaining 13 desktop events and 12 mobile events. The artifact directory contains **only `observations.json`**: all ten screenshot attempts timed out at 2.5 seconds, including both homepage attempts. There are no new reference pixels to inspect or compare. A successful CI step and `finished-observation-pass` mean the audit ran to its end, not that all reference interactions passed.

Newly established from the actual records:
- **Entry, both sizes:** Explore in 3D was clicked; preparation text appeared in the next public-DOM checkpoint, followed by the `/configurator` URL and one canvas. WebGL was live and not lost at 1440×900 and 390×844, again reporting `WebKit WebGL`
- **Loading, desktop:** configurator-entry body text included `Loading 96%`; subsequent checkpoints omitted it. This only establishes a UI-text change, not model/material completeness
- **Color input, both sizes:** the visible `customCarColor` input began at `#80807d`, accepted `#991b2b`, and retained `#991b2b` in the following toolbar checkpoint. No screenshot proves that rendered body paint changed. Roughness `0.41` and metalness `1` were observed at entry but were not changed
- **Pointer input:** a mouse drag was dispatched at both sizes; desktop also received a wheel delta of −220. No recorded pixels or camera state establish the resulting orbit, zoom, clamps, or auto-rotation behavior. The mobile-sized pass is not touch-gesture verification
- **Runtime/layout diagnostics:** no page errors or console errors were recorded; all 16 retained DOM snapshots measured no horizontal document overflow. These limited diagnostics do not establish complete visual correctness

Actions that did not establish their intended result:
- **Model Detail, both sizes:** the label was found, but each click timed out after 3 seconds while waiting for the element to be visible, enabled, and stable. No detail content, heading, or semantic dialog was recorded. The intended click did not complete, so no Escape/close action was run
- **Back, desktop:** the button was found, but the click timed out on the same actionability wait. The resulting URL remained `/configurator`
- **Back, mobile:** Back appeared in the initial configurator visible-control set, then was absent from that set after pointer input while remaining in body text. The final lookup recorded no visible match, so no return click occurred. The records do not establish whether this reflects placement, clipping, animation, or a different cause
- **Toolbar:** Camera, Environment, Lights, and Sound had no discovered visible labels. Many visible list items were unlabeled; their meanings were not guessed and they were not clicked

**Remaining benchmark gaps:** rendered model/cabin fidelity; visual material response; model-detail open/close; current-run Back return; labeled or visually grounded toolbar interaction; environment/light/audio response; actual orbit/zoom/clamps and auto-rotation; touch behavior; complete responsive layout; precise animation timing. The user's supplied configurator screenshots remain static visual evidence for exterior/cabin/environment layouts, not proof that these interactions were exercised by the audit.

## Homepage re-audit after user design critique (2026-10-01, 10:13–10:33 UTC)

Actual cloud-browser scrolling, menu clicks, screenshots and read-only rendered DOM were used. The desktop viewport was1173×761. The supplied screenshot was also inspected at its original pixels; its browser chrome is not a public project asset.

### Material differences from the first GT-R LAB homepage

| Surface | Observed reference behavior/layout | Required original GT-R response |
|---|---|---|
| Hero | Real16.133-second muted autoplay loop, full viewport; centered wordmark, Menu upper-left, large lower-screen headline, support and3D CTA at bottom; media clock advanced6.76→11.15seconds | A real locally served original/licensed film with actual pause/play controls; no static illustration substituted for video |
| Hero exit | Scroll changes video vertical offset and opacity; offscreen media was paused | Restrained native-scroll parallax/fade with visible-entry playback and offscreen pause |
| Editorial | White background; copy upper-left and oversized rounded image upper-right, followed by overlapping lower-left portrait and right-hand engineering copy; generous asymmetric whitespace | Rebuild the composition and media depth, rather than retain equal dark cards with fade-up effects |
| Second film | Separate14.933-second muted loop; paused at time0 when offscreen, later reached10.44seconds. Observed bounds changed from938px-wide inset atx117 to1089px atx42, then full1173×761; surrounding chapter darkened | Continuous inset-to-full-viewport film expansion, real changing footage and a controlled light-to-dark chapter transition |
| Heritage | Black field with alternating image positions and a central caption. Scrolling changed the caption from the first engineering chapter to the next historical chapter while the image arrangement progressed | Pinned caption and layered, differently paced authenticated GT-R generation photography; functional timeline navigation |
| Model invitations | Large stacked image panels, about74% viewport width at this size, black surroundings and gaps; six separate model invitations | All six distinct full-width GT-R invitations, meaningful focus/hover CTA, correct navigation and honest readiness |
| Footer | Strong return to white, with wordmark, descriptive/disclaimer content and separate link columns | A clean white independent-project footer with useful navigation and sources |
| Menu | Left white category column, adjacent pale submenu and dimmed/blurred remaining page. Clicking Services changed the submenu without route navigation; Close Menu returned to the hero | Original GT-R navigation hierarchy with real relevant routes, accessible close/Escape/focus restoration; do not copy manufacturer financial/sales links |

The editorial media in the inspected overlap section are image elements, not videos. The hero and expanding film are real video elements with advancing clocks. The distinction matters for both implementation and asset requirements.

These are observed structural/motion behaviors, not copied source code. Exact easing curves and animation durations were not measured; apparent screenshot lag in the cloud browser is not a trustworthy animation-timing measurement. Desktop hover/focus and390px-specific motion evidence are being collected separately by `audit-home-motion.mjs`; do not claim those new checks from this desktop pass alone.

## Homepage runner evidence — GitHub run 36849965017 (2026-10-01, 10:34–10:36 UTC)

This section adds the actual `audit-home-motion.mjs` results and supersedes earlier **homepage** pixel/mobile gaps only. All prior manual observations are retained above. Configurator, cabin, material, audio, and 3D-toolbar limitations are unchanged.

The desktop artifact (`observations-desktop.json`) contains 1440×900 observations and **eight PNGs**; the mobile artifact (`observations-mobile.json`) contains 390×844 observations and **seven PNGs**. All 15 images were inspected. Runs completed in 55.507 seconds and 52.922 seconds respectively. Every image reports successful geometry settling before capture; animation and video were left running. Each size has 39 DOM snapshots with no horizontal document overflow and no recorded page/console errors. Individual failed actions are still recorded separately and are not erased by the successful runner status.

### Verified video and scroll behavior
- The hero is an actual **16.133008-second muted autoplay looping video**, initially full viewport at both sizes. Its clock advances and its rendered frames change; the first samples show desktop 0→0.968 seconds and mobile 0→0.726 seconds during startup
- The second film is an actual **14.933333-second muted autoplay looping video**. Initially offscreen, it is paused at time 0. On entering view, desktop time advances 0.850617→2.406991 seconds in 1.556 seconds; mobile advances 0.828695→2.379995 seconds in 1.551 seconds. The paired film PNGs also show different frames, so this is both clock and pixel evidence rather than an animated poster assumption
- The film expands with real scrolling: desktop bounds move from **1152×648 at x144** to **1440×900 at x0**. Mobile bounds move from **366.83×593.28 at x11.58** to **390×844 at x0**. Screenshots show the surrounding light editorial surface darkening during this transition. A circular play-style overlay remains visible while the preview loop is already advancing; opening that control was not tested
- The hero exits with upward media translation, opacity loss and blur. It continues playing briefly during the opacity-zero exit, then pauses when fully offscreen: desktop at 12.947 seconds, mobile at 11.811 seconds. The second film subsequently pauses at 5.819/5.559 seconds. Both clocks remain unchanged through later footer checkpoints. Do not equate the first opacity-zero sample with the final offscreen pause threshold
- Editorial text/media transforms and opacity change over successive real wheel inputs. For example, desktop design text/image groups progress from opacity approximately 0.599/0.429 to 1/0.996. The subdued first editorial PNG is an intermediate scroll-controlled reveal, not evidence that the final design is permanently washed out
- The history caption is **visually pinned while its text changes**: desktop caption x432/y417.89 remains constant while scrollY progresses 3582→4374→5166→5958 and the chapters change from 1931 to 1963, 1970 and 2002. Mobile caption x58.5/y389.59 stays constant across scrollY 3358→4101 while changing 1963→2002. Nearby images use alternating positions and independently changing opacity/blur. Later scrolling reveals the full-width modern-car closing composition and then the lineup

### Verified desktop/mobile composition
- **Desktop hero:** wide wordmark at top center, Menu upper-left, large lower-screen title, centered supporting copy and lower-right outlined Explore in 3D CTA (`desktop-hero-playback-after.png`)
- **Mobile hero:** full-height cropped video, small crest at top center, Menu upper-left, then bottom-centered title, compact copy and CTA (`mobile-hero-playback-after.png`)
- **Editorial:** desktop uses left design copy/right rounded image, followed by the large left image/right engineering copy. At 390px, design copy sits above its image; the engineering image sits above its copy. The mobile design image is partly translated beyond the left viewport edge during the recorded reveal, despite no horizontal document overflow. This is observed choreography/clipping, not an accessibility requirement to reproduce
- **Menu:** desktop uses adjacent white category and pale submenu columns; mobile stacks category and submenu sections in an approximately 310px-wide left drawer, with the close icon in the dimmed right strip. Actual clicks on Vehicle Purchase, Services, and Experience replace the visible link set without navigating away; Close Menu removes the submenu from visible controls on both sizes
- **Lineup breakpoint correction:** at **1440px the six invitations form two columns and three rows** (`desktop-scroll-14.png` and `desktop-model-hover-after.png`); at **390px they are one stacked column** (`mobile-scroll-12.png` and `mobile-model-hover-after.png`). The prior 1173px manual record must not be generalized into an all-desktop single-column claim. Exact breakpoint location was not measured
- Desktop model cards are tall photographic panels with small corner radii, black surroundings, generous outer margins and a dark lower gradient. Mobile keeps tall photographic cards with roughly 49px side margins in the captured final rows. The white footer and its separate information/link groups are confirmed by the end-of-page DOM checkpoints

### Hover appearance, keyboard evidence, and remaining limits

`desktop-model-hover-after.png` contains a **rendered hover-style card state**: blurred/darkened photography, a central 3D mark, and a bottom Customize & Explore in 3D CTA. This establishes the appearance. It does **not** turn the intended action into a pass: the script targeted the Panamera logo image (Cayenne on mobile), and both hover and navigation clicks timed out because the containing car-card element intercepted pointer events. Both route-intent records remained on `/`; successful model navigation is not established by this run. The mobile final screenshot establishes the stacked card appearance, not touch-hover behavior.

The selected logo images had no native focusable link/button/tabindex ancestor. Eight real Tab presses traversed page-level/hero/footer targets rather than these cards. This is specific evidence of a keyboard-access gap in the sampled flow; the original implementation should provide explicit keyboard-reachable cards and focus states. It is not a complete WCAG audit.

No further homepage rerun is required for the verified motion/layout findings above. Exact easing/durations, the film overlay's activation, reliable targeted card hover/navigation, tablet/intermediate breakpoints, touch gestures, reduced-motion behavior, and full accessibility remain outside this run. The homepage evidence must not be used to claim any previously unverified configurator behavior.

## Final bounded configurator pixel attempt — run 36880375364

On 2026-10-01 the desktop-only GitHub Chromium/SwiftShader pass used a 40-second per-screenshot budget, a six-minute overall cap and a two-failure capture stop. No reference runtime, animation loop, renderer, source code or asset was modified. The observation pass finished in 154.399 seconds; workflow success describes the evidence collection only.

A configurator PNG finally returned after 16.422 seconds, but inspection shows an entirely black frame. It does not establish any rendered vehicle, toolbar or loading-screen appearance. The preceding DOM checkpoint reported Model Detail, Back and Loading 100%; these are separate observations, not claims about pixels in the later screenshot. Subsequent orbit and zoom inputs were dispatched, but each screenshot timed out after 40 seconds. The collector then stopped pixel retries as intended. Model Detail still failed actionability; a color-input change was recorded; Back was successfully clicked and the homepage URL/text returned. No labeled camera/environment/light/sound toolbar controls were discovered.

Consequently, rendered reference configurator behavior, cabin/camera response and toolbar details remain unverified beyond the user's supplied static screenshots. This bounded retry closes the current cloud-renderer attempt; there will be no further retry loop. Continue judging GT-R LAB against its explicitly requested functionality and actual independent browser evidence, not imagined reference behavior.

Artifact: `reference-configurator-bounded-evidence`, SHA-256 `813c14d9fa88ad25ac091b39e3b6808ed916d0960a2d9bc7dcf73f916a2819ba`. Workflow: https://github.com/LethimCookMyBro/gtr-lab/actions/runs/36880375364


## Fresh interaction audit, 2 October 2026


Observed in the cloud browser at https://everymatrix-porchelab.netlify.app/ with real scrolling, menu and card clicks. This is behavioral evidence, not permission to copy assets, branding or source. Approximate visual timing only; no precise durations were measured.

## Sequence and interaction grammar

1. Full-height driving-film hero: centered brand, menu at upper left, headline/description and model CTA near lower composition. Scroll exits into light editorial space.
2. Editorial: large rounded images alternate with concise text. Images overlap neighboring compositions and move at different rates; staggered opacity/position avoids a repeated uniform card-grid rhythm.
3. Expanding film: scrolling grows a rounded frame toward viewport width while surrounding background darkens. Central Play opens a full-viewport modal over a dim/blur backdrop. Close returns to underlying page. YouTube playback itself stalled at 0:00 in this browser; do not report full-film playback verified.
4. History: large photographic panels alternate across a long vertical gallery. Center narrative stays spatially anchored and changes with the chapter. Observed captions include The Visionary Engineer (1931), First Porsche Legend (1948) and A New Era (2000s). The movement is a story progression rather than a fixed giant heading above small toggled photos.
5. History exit: a separate dark rear-light/brand scene gradually reveals the rear car and The Modern Vision. It changes visual pace before lineup.
6. Model selection: dominant campaign imagery and minimal overlaid identity. Clicking a card transitions through a blurred/preparing state into /configurator. Hover behavior was not verified; do not claim exact hover animation. Responsive card columns require additional breakpoint testing.
7. Menu: Open Menu reveals a white category column and pale-gray secondary link column over a dim/blur homepage. Selecting Services changes the secondary links without route navigation. Adapt only meaningful GT-R routes/anchors, never dead commerce links. The reference uses some weak category semantics; do not reproduce accessibility defects.
8. Configurator: Model Detail, custom color, roughness, metalness and Back appeared in DOM. WebGL context failed with GL_VENDOR/GL_RENDERER Disabled in this browser. No claim of verified 3D toolbar/camera behavior. Back returned to homepage.

### Verified GT-R gaps

- Current history keeps one oversized static heading with small photo/era switches. Replace with alternating large photographic chapters and changing narrative.
- No distinct transition between heritage and model lineup. Existing cleared NISMO rear-quarter photo can support honest photographic detail-to-rear reveal, not a simulated straight-rear 3D camera pullback.
- Detail film has ambient loop and Stop but no intentional enlarged viewing interaction. Reuse verified publisher iframe in accessible focused-view dialog, explicitly not a promised longer movie.
- Existing showroom/cockpit images are technically real but weaker campaign compositions. UI changes cannot alone solve asset realism or the five missing accepted vehicle variants.
- An initial observation suggested iframe scroll capture after one action. A subsequent test reproduced actual native wheel over both hero and detail iframe, with measured page displacement; suspicion disproven. No overlay workaround warranted. Physical touch was not tested.

## Release boundary and QA

Driving-film release a5d4d1d979be6cf0db46863e13d077ff75b01840 is complete per deployment/CI evidence. Review confirmed final 390px hero and detail screenshots: real footage visible; former large black detail void removed. Screenshots used CSS-sized app viewport, not a physical phone. Temporary wrappers removed and framing policy restored by builder.

Next revision: heritage story gallery, truthful rear-photo transition and focused film viewing. Test forward/reverse scroll, reduced motion, keyboard/focus, dialog close/return, 390/430 widths and desktop. Preserve public credits and provider controls.


## Motion-component follow-up, 2 October2026

User feedback rejected the earlier intentional image overlap and the photographic four-circle bridge. These are updated product requirements, not newly inferred reference behavior. React Bits Staggered Menu was actually opened and closed: layered underlays precede sequential numbered links. Proposed implementation timings are design choices, not measured reference timings. The current original implementation and primary-source motion references are recorded in `MOTION_NOTES.md`. Desktop QA now includes900px content height and positions between archive anchors because a1920×1080-only composition check missed a caption/timeline collision.
