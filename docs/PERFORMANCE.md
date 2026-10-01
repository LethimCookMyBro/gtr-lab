# Performance

## Implemented
- Vite production bundle with route-level lazy configurator and separate renderer / Three chunks; homepage does not fetch renderer code until configuration needs it
- Rights-cleared photos resized to max1920px, WebP quality82; six desktop images total1.06MB, six small copies342KB
- Two original native-film slots on the redesigned homepage, with lazy below-fold photos. Films pause offscreen and in background tabs; reduced-motion and Save-Data disable autoplay and set preload to none. The hero MP4 is886,469bytes, rear detail934,416bytes, and both posters together58,546bytes. Each native720p clip is8seconds at24fps with no audio. Only MP4 is shipped; unused WebM exports are kept outside the app.
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
