# Reference audit — 2026-10-01

Reference: https://everymatrix-porchelab.netlify.app/ and /configurator

## Method and confidence
Actual interactions in dot's cloud Chromium (1180×747 viewport), not source-code copying or screenshot guessing. Inspected both URLs, clicked navigation categories/close, hero Explore in 3D, a model invitation, Model Detail and Back, and scrolled the editorial/heritage/lineup content. The cloud browser cannot create WebGL (console reports GL_VENDOR/GL_RENDERER Disabled). One reload reproduced failure; direct reload of the configurator returned to home. An isolated Playwright Chromium fallback also failed to launch due OS socket permissions. No user-computer browser was used. These environmental limits prevent claiming full reference 3D, mobile, sound or exact-timing verification. The implementation below must use the user's explicit brief for unverified behavior, not inventions attributed to the reference.

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
- Initial home also showed a brief Loading.../brand state; exact progress accounting not verified
- Configurator DOM exposes Model Detail at top, custom color well, roughness slider (0.41), metalness slider (1), Back button and WebGL surface
- Due WebGL context failure viewport remained black; don't infer visible toolbar positioning from hidden DOM
- Do not reproduce its blank-screen environmental failure: GT-R LAB must have explicit recoverable fallback

## 7–8. Typography, layout, hierarchy
Large light/regular sans hero typography, smaller restrained UI, editorial headings heavier/condensed in appearance. Black hero/heritage/lineup alternates white editorial/footer. Wide gutters, full-screen media, low control density, rounded photographic panels. Exact font identity and pixel values were not measured; original GT-R typography is appropriate.

## 9–16. Interaction matrix
| Trigger | Observed animation | Resulting state | Exit / return |
|---|---|---|---|
| Menu button | Drawer/overlay reveal; page becomes dark and blurred | Wide two-column light drawer, categories left and link lists right | Close Menu returns unobscured home |
| Vehicle Purchase | Category highlight/link replacement | Configure, Compare, Inventory, E-performance, Finance external links | Select another category/close |
| Services | Link-list replacement | Accessories, Individualisation, Approved, Service, Classic, Lifestyle | Another category/close |
| Experience | Link-list replacement | Motorsport, Driving experiences, Communities, Golf, Magazine, Museum | Another category/close |
| Explore in 3D | Blur/dark vertical-panel takeover with preparation text | `/configurator`, runtime fails WebGL in this environment | Back returns `/` |
| Scroll editorial | Smooth scroll and reveal/parallax-like staged image positioning | Design then Engineering content | Reverse scroll |
| Scroll heritage | Captions change across timeline segments | Early engineer through modern vision | Reverse scroll; exact image pacing unverified |
| Panamera model card | Card blur and central 3D mark, full-route dark panel transition | `/configurator` | Back returns homepage |
| Model Detail | Click tested, no usable resulting visual state due failed 3D route | Unverified | Not enough evidence |
| Back | Page return transition and brand/loading overlay | `/` homepage | Explore/card can enter again |
| Color well/sliders | Controls discovered in accessibility DOM, rendering could not validate effect | Unverified material behavior | Unverified |

Camera presets, orbit/zoom clamps, model handoff geometry, toolbar toggles, environment controls, light controls, precise drawer animations, auto-rotation and audio are unverified because the 3D route did not render. No audible behavior was established. No proprietary source or assets were downloaded/copied.

## 15. Timing
Perceived transitions are deliberate, with card/route blur followed by takeover. The browser tool sampling is too coarse to truthfully give millisecond durations. GT-R LAB targets original 160–240ms micro-interactions, 350ms drawers and ~900ms camera interpolation; these are implementation design decisions, not measured reference values.

## 17. Responsive behavior
Desktop current viewport inspected. No supported cloud browser viewport resize API was available, and fallback Chromium launch failed, so reference mobile/tablet layouts remain unverified. GT-R LAB must independently validate target sizes with available means and explicitly report any unavailable checks.

## 18. Subtleties and adaptation
- Route entry carries selection in runtime state rather than pathname: improve via per-variant routes
- A card is itself a navigation target, not merely its small CTA
- Navigation is partly decorative/lifestyle routing to official Porsche sites; GT-R LAB will use concise local routes and never imitate official-brand association
- Tiny controls are not all semantic buttons in reference; original implementation must improve keyboard/ARIA support
- Strong imagery does most of the work; UI should remain secondary
- Do not copy timelines, logos, fonts, photos or source code from reference
- Assets and environmental render failures must be visible states, not theatrical indefinite loaders

Audit is sufficient for the observed homepage/entry grammar; it is explicitly incomplete for reference3D/mobile. Continue with user's detailed functional specification while retaining those limits in final QA.

## User-supplied reference screenshots, inspected 2026-10-01
The user subsequently supplied four screenshots of the working configurator. These provide visual evidence, not proof of animations or interactions. Pixels were materialized and inspected:
- Exterior front-three-quarter Porsche on a photographic forest road, headlights illuminated, Model Detail at upper-left, logo/name top center, tall right toolbar, bottom translucent multi-color rail, Back lower-left
- Driver-seat detailed interior with visible steering wheel, gauges, dashboard, mirror and forest outside glazing
- Cabin view angled toward passenger seat/console with detailed door trim and cabin materials
- Large centered environment-selection overlay with scrollable panoramic preview rows (including a coastal sunset)
These reinforce the user's original specification: a properly modeled cabin and believable outdoor lighting are essential, not optional screenshot simulations. A camera inside an empty shell does not pass. The original GT-R interface retains restrained dark control styling rather than copying reference white icon squares or branding. Personal browser-tab chrome in supplied screenshots is excluded from public source control.
