# Performance

## Implemented
- Vite production bundle with route-level lazy configurator and separate renderer / Three chunks; homepage does not fetch renderer code until configuration needs it
- Rights-cleared photos resized to max1920px, WebP quality82; six desktop images total1.06MB, six small copies342KB
- The opening and expanding film slots use intact NissanNews/Flixel hosted players. Only visible, active sections mount an iframe; offscreen and hidden-tab states unload it. Reduced motion and Save-Data prevent automatic third-party requests, with explicit play available. Provider media size/format may vary by device; real browser QA measures playback instead of claiming the old local MP4 byte sizes. The earlier original CGI files remain archived but are not requested by the homepage.
- HDRIs load only for selected outdoor environment:2K desktop (6.9MB forest/6.4MB coast),1K mobile (1.7MB/1.6MB); CC0 panorama-derived previews
- One Canvas, demand render loop, adaptive DPR capped1.75,1024 shadow map,512 contact shadows,256 studio reflection map
- Manual interaction cancels auto-rotation; hidden assets/resources disposed; GLB stream aborted on model change/unmount;45s timeout and120MB hard input bound
- Models loaded lazily, with real byte-based progress when Content-Length exists; unknown totals show no invented completion
- Self-hosted variable DM Sans font, no third-party font network request
- Production server streams GLB/HDRI/video payloads, supports single bounded byte ranges and serves HEAD without buffering file bytes
- Audio synthesized on gesture, no background audio file or autoplay

## Current build baseline
Latest verified production build succeeded. The Three chunk is704.45KB minified/181.57KB gzip; renderer337.75KB/106.97KB gzip; this is a disclosed bundler size warning, not a runtime failure. These figures must be refreshed after final edits and asset integration.

## Pending genuine measurements
The current licensed exterior is 8,296,356 bytes with 566,475 triangles, 82 mesh objects and 22 materials. It is lazily loaded on one route. Geometry is not decimated; textures are limited to 2K and compressed as WebP. Meshopt decoding is bundled locally. Actual-car software-WebGL tests run in GitHub Actions; physical-device FPS/memory remain unmeasured. Do not report invented FPS, Lighthouse scores or mobile performance passes.

## Production asset acceptance
Per vehicle target ideally<10MB compressed transfer, texture max2K default, mobile1K where suitable, measured draw-call/triangle/texture counts. Preserve cabin visibility and curved silhouette quality. Use meshopt or Draco only with configured local decoders; loader support and final file compatibility must be tested, not assumed. Split interior only if transition/loading remains coherent. Optimize exported content in a DCC or verified asset optimization pipeline, never obscure geometry with darkness or bloom.


## Mobile scroll diagnostics

Five final Chromium Android-emulation recordings cover 390×844, 390×700, 430×932, 430×700 and reduced-motion 390×844. Real incremental wheel input drives the actual page; no animation state is patched. The inspected normal-motion runs recorded approximately 16.7–16.8ms 95th-percentile RAF intervals, no frames above 34ms and no reported Long Tasks. These unthrottled cloud-runner observations are not physical Android/iOS FPS or thermal certification.

A separate six-portrait-viewport sweep includes 375×600 and 390×667. After allowing preceding native input to settle, each single film target stayed within 0px over 14 RAFs in the verified run. Continuous photographic transforms and film frame growth use one shared scheduled update; independent image geometry is read before writes to avoid layout-thrashing loops. Reduced-motion content remains sequential and films initially remain paused.


The archive/rear-signature revision reuses existing optimized photographs and the same hosted film URL; it adds no GLB, new media binary, animation framework or runtime service. Mobile articles use their natural photographic dimensions rather than long empty viewport slots. Image geometry is read in one scheduled pass before style updates; the focused film replaces the ambient iframe instead of decoding both. Exact physical-device GPU/thermal and touch-performance testing remains outstanding.
