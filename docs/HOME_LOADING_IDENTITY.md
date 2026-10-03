# Homepage preparation, identity and story motion

This revision keeps the single published Ciasny custom-aero R35 exterior and the
four three-image heritage spreads. It adds no vehicle model or interior and does
not change the existing configurator's camera or controls.

## Initial preparation

The viewport-level opening belongs to HomePage. The normal-data path prepares
the same rear scene that appears later in the page. It waits for a usable hero
visual and actual scene preparation, rather than treating a film iframe document
load as model readiness. The film document check is not a claim of playback.

Download progress reports bytes actually received. Geometry/texture decoding and
render preparation are separate named phases. Unknown response lengths remain
indeterminate. Errors remain errors, with explicit recovery and Continue without
3D controls. Save-Data retains an explicit model opt-in; reduced motion removes
animation while preserving the preparation contract.

The home scene owns its parsed object and GPU resources. Scroll-away and document
visibility changes pause rendering; they do not dispose/redecode the scene.
Resources are disposed on route exit, explicit skip, failed attempt or retry.
There is no shared parsed-object cache.

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

The dedicated loading suite covers real published-model preparation, retained
canvas identity, failure/retry/skip and policy/accessibility cases. Layout-only
suites explicitly select Continue without 3D and cannot count as evidence of 3D
readiness. Screenshots and unretimed videos are kept in Actions artifacts for
review before changing the release marker. Chromium/SwiftShader emulation does
not certify physical-phone GPU performance. Provider playback remains a separate
public-origin verification because Flixel may restrict GitHub runners.
