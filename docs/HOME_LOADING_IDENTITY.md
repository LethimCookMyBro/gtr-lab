# Homepage preparation, identity and story motion

This revision keeps the single published Ciasny custom-aero R35 exterior and the
four three-image heritage spreads. It adds no vehicle model or interior and does
not change the existing configurator's camera or controls.

## Initial preparation

The viewport-level opening belongs to HomePage and releases after the local hero
photograph decodes. Neither the rear model nor an iframe document load certifies
that photograph. The opening retains its 25-second timeout, Reload page recovery,
modal focus/scroll cleanup, and an immediate Continue browsing action. Continuing
does not cancel rear preparation.

The normal-data path independently prepares the rear scene that appears later in
the page. Its local UI reports real received bytes, geometry/texture decoding,
and render preparation. Unknown response lengths stay indeterminate. Rear errors
and retry/reload controls stay in that section with their existing native bounds.
Save-Data retains explicit model opt-in; reduced motion removes animation without
blocking the independent preparation contract.

The home scene owns its parsed object and GPU resources. Scroll-away and document
visibility changes pause rendering; they do not dispose/redecode the scene.
Resources are disposed on route exit, failed attempt or retry. There is no shared
parsed-object cache, and the opening's Continue browsing action is not a scene
skip.

The intact Flixel embeds have no verified first-frame or pause API here. Local
posters stay visible until the corresponding iframe document loads; that handoff
never claims playback readiness. The detail poster prepares near the viewport,
while its provider mounts only on entry. Automatic reentry is quiet. Offscreen,
hidden-tab, and modal-covered inline players unmount instead of running in the
background. The initial opening alone permits hero-document preparation in
parallel, without spending its provider deadline before entry. Reduced-motion
and Save-Data visitors still explicitly request film playback. An expanded film
stops the rear recording before its player mounts.

## Visual identity

The GT-R mark is the exact supplied image: stacked chrome GT and red R, with only
black outer margins hidden in presentation. A smaller unchanged 2001 chrome
Nissan SVG sits above it. These are not font approximations. The supplied GT-R
art's copyright status has not been independently verified. The Nissan source is
Commons' PD-textlogo asset and remains a trademark. Full attribution, provenance
and limitations are in `public/brand/ATTRIBUTION.txt` and the Credits page.

Headings use the unmodified self-hosted Barlow Condensed Bold, under SIL OFL 1.1;
body text remains DM Sans. Neutral paper/metal tones and restrained red details
replace the previous gold/olive accents. Source/license details ship beside the
font.

## Reversible story motion

A shared scroll-geometry model sequences heading, main photograph and supporting
evidence, with a readable hold and a gentle exit fade. There are no timed scroll
locks. Backward scrolling reverses the same phases. Reduced-motion and short
landscape layouts use readable static content. All 12 heritage images and their
specific, qualified captions remain intact.

## Verification boundaries

Unit tests, type checking and the production build are required before staging.
Actual browser acceptance runs on the existing GitHub Chromium route. The cloud
workspace's local Chromium socket and cloud-browser localhost routes were denied;
those restrictions are not bypassed.

The current dedicated loading suite separates decoded-poster opening acceptance
from real published-model preparation and local rear recovery. It covers retained
canvas identity, failure/retry, continuing without cancellation, and policy and
accessibility cases. Layout-only suites select Continue browsing when needed;
neither that action nor opening resolution proves rear readiness. Current GPU
suites wait on the local rear state and preserve their existing deadlines/skips.
Screenshots and unretimed videos must be reviewed in Actions artifacts before
changing the release marker. Chromium/SwiftShader emulation does not certify
physical-phone GPU performance. Provider playback remains a separate public-origin
verification because Flixel may restrict GitHub runners.

### Historical evidence

Earlier captures and source-pinned acceptance scripts describe a combined
hero-plus-rear opening gate and a Continue without 3D action that cancelled rear
work. Those records remain historical and are not evidence for the reconstructed
2026-10-14 behavior. A compatibility helper name remains only for those closed
source contracts; current behavior is Continue browsing and does not skip the
rear scene. This reconstruction requires fresh CI browser evidence.
