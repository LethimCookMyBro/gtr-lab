# GT-R motion direction — official-source research, 2 October 2026

## User acceptance feedback

The user rejected a static menu, overlapping editorial components and caption/navigation collision, ordinary desktop image strips, the photographic four-circle bridge and a sparse footer. Six supplied images were actually inspected. The new direction must use controlled automotive motion and a real upright/straight-on vehicle presentation, not randomly accumulated effects.

## Selected references

- React Bits Staggered Menu: https://reactbits.dev/components/staggered-menu . The audit interacted with the actual cloud-browser demo: layered lateral underlays, masked large numbered links entering in sequence, reversible close. Docs list GSAP as dependency. Adopt the behavior with original graphite/silver/red treatment, not the purple demo identity. Suggested design timings, not measured reference values: 350–550ms panel, 40–60ms link stagger. Preserve focus trap, Escape, click-away and rapid reversal.
- Motion stagger: https://motion.dev/docs/stagger . Useful for menu item sequencing and coherent entrances/exits. Avoid bringing in another animation runtime if the existing stack already covers it.
- Motion accessibility: https://motion.dev/docs/react-accessibility . Reduced-motion keeps function, replaces large transforms with simpler opacity changes, avoids automatic parallax. Do not remove this accommodation because one user wants more animation.
- GSAP ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/ . Scroll progress can drive camera/scene choreography; preserve native scrolling and avoid forced snap.
- GSAP matchMedia: https://gsap.com/docs/v3/GSAP/gsap.matchMedia() . Responsive setup/cleanup should not leave stale pinning or transforms after viewport changes.
- R3F performance: https://r3f.docs.pmnd.rs/advanced/scaling-performance . Reuse existing geometry/materials, cache loaders, render on demand and invalidate on camera movement. Pause/dispose appropriately outside the visible scene.
- Drei AdaptiveDpr: https://drei.docs.pmnd.rs/performances/adaptive-dpr . Adapt render resolution under load, not a promise of measured device performance.

## Legal and scope

React Bits current license is MIT + Commons Clause, not plain MIT: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md . Website/product use allowed with retained notice for copied portions; standalone component resale/redistribution restricted. No paid React Bits Pro or Motion+ purchase. Prefer original implementation with the existing dependencies.

The rear scene must reuse only the already-public licensed Ciasny R35 derivative. This is not permission to upload any blocked new road assembly or rejected model. It remains a custom-aero R35, not a claimed factory-accurate NISMO. Prove a real WebGL straight-rear view before replacing the photo scene. No fake rear geometry from photographs, no 2D ring overlay representing physical lights.

## Coherent page behavior

Menu: layered reveal, numbered links, restrained highlight. Editorial: separate rows with bounded stagger instead of overlapping photos. Heritage: dedicated caption and navigation zones tested at short desktop heights and intermediate scroll positions. Models: larger two-column desktop imagery, hover/focus response and retained mobile breathing space. Footer: authentic independent-project description, six variant links, heritage/configurator and asset credits, no invented social/contact/services.

Reject gratuitous glitch, gooey menus, neon, custom-cursor requirements, rubbery springing cars and infinite ornamental loops. This judgment follows the project's premium automotive brief rather than a claim those components are technically unavailable.


## Original implementation and verification

The menu uses original CSS keyframes and the existing React dialog, not copied React Bits code or new GSAP/Motion dependencies. Escape and Close retain focus trapping through a bounded exit transition; reduced motion closes immediately. Editorial imagery now occupies two distinct grid rows, with small scroll-linked offsets contained within the row gaps. Desktop archive navigation occupies its narrative column, separate from moving image captions. New collision checks cover1920×900 and1440×900 and intermediate scroll positions.

The rear view lazily imports its R3F chunk and the already-public `/models/ciasny-r35.glb`. It retains the custom-aero R35 attribution and does not imply factory2024NISMO accuracy. Its camera stays centered onX0 and changes distance with native scroll; physical lamp materials supply the red light. It uses demand rendering, caps DPR at1.25desktop/1mobile, and disposes its owned GLB load offscreen or while the document is hidden. Data saving requires explicit loading; reduced motion renders a static whole rear. Load/context failures have readable retry/details paths. No blocked model files are included.

The ordinary layout suite deliberately fails its model request and cannot prove real3D appearance. The dedicated rear-signature workflow uses the actual published GLB, Chromium SwiftShader and canvas pixel captures at close/middle/full/reverse states. This is browser rendering evidence, not physical mobile GPU certification. Visual acceptance remains dependent on inspected screenshots.
