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
