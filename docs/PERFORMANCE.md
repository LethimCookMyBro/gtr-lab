# Performance

## Implemented
- Vite production bundle with route-level lazy configurator and separate renderer / Three chunks; homepage does not fetch renderer code until configuration needs it
- Rights-cleared photos resized to max1920px, WebP quality82; six desktop images total1.06MB, six small copies342KB
- One high-priority compressed hero, below-fold lazy-loaded photos; no autoplay video payload
- HDRIs load only for selected outdoor environment:2K desktop (6.9MB forest/6.4MB coast),1K mobile (1.7MB/1.6MB); CC0 panorama-derived previews
- One Canvas, demand render loop, adaptive DPR capped1.75,1024 shadow map,512 contact shadows,256 studio reflection map
- Manual interaction cancels auto-rotation; hidden assets/resources disposed; GLB stream aborted on model change/unmount;45s timeout and120MB hard input bound
- Models loaded lazily, with real byte-based progress when Content-Length exists; unknown totals show no invented completion
- Self-hosted variable DM Sans font, no third-party font network request
- Production server streams GLB/HDRI payloads and serves HEAD without buffering file bytes
- Audio synthesized on gesture, no background audio file or autoplay

## Current build baseline
Latest verified production build succeeded. The Three chunk is704.45KB minified/181.57KB gzip; renderer315.15KB/100.61KB gzip; this is a disclosed bundler size warning, not a runtime failure. These figures must be refreshed after final edits and asset integration.

## Pending genuine measurements
No production-approved vehicle GLB is integrated yet. Geometry/textures dominate performance and final FPS/memory cannot be measured without the real asset and a functioning WebGL test browser. Current cloud CUA reports WebGL disabled; fallback Chromium launch is restricted by OS socket support. Do not report invented FPS, Lighthouse scores or mobile performance passes.

## Production asset acceptance
Per vehicle target ideally<10MB compressed transfer, texture max2K default, mobile1K where suitable, measured draw-call/triangle/texture counts. Preserve cabin visibility and curved silhouette quality. Use meshopt or Draco only with configured local decoders; loader support and final file compatibility must be tested, not assumed. Split interior only if transition/loading remains coherent. Optimize exported content in a DCC or verified asset optimization pipeline, never obscure geometry with darkness or bloom.
