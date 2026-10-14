# Official Nissan embed compatibility probe

This seven-file additive QA change does not change the product, production CSP, assets, deployment configuration, or release markers. Source baseline is `14668a99428bd995833317cf1fa66f4101922811` (tree `9ab4d5ba546a4da225be1f18f97fd6c1ae7cd538`). The integrator must review and approve publication and artifact storage separately. The repository is public, so its Actions artifacts must not be described as private. Browser evidence may never be copied into source fixtures, Library, or the source-only backup.

## Fixed provenance and constraints

- [Nissan publisher page](https://global.nissannews.com/en/videos/video-0770352876ecd1a82c7d011f86007f37-nissan-gt-r-the-ultimate-high-speed-camera-car?channelsConstraint=channel-NNG244&firstResultIndex=16) supplies YouTube video `Ccklrg-mZyY`, the official behind-the-scenes high-speed camera-car film. There is no alternate source or arbitrary video input.
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference) documents readiness, playback state/time, autoplay blocking and errors 101/150/153. Ready is not proof that a frame played.
- [Required minimum functionality](https://developers.google.com/youtube/terms/required-minimum-functionality) requires a player of at least 200 by 200 pixels, more than half visible before automatic playback, only one simultaneously automatic player, preserved presentation/controls and real client identification. No visual element may cover the player.
- The standalone HTTP document is served only inside the approved GitHub job at `http://127.0.0.1:4197`. The actual browser supplies its truthful local-origin Referer and matching `origin` parameter. No production identity is spoofed.
- The narrow QA-only CSP permits the official API at `www.youtube.com` and its script host `s.ytimg.com`, and the frame at `www.youtube.com`. It is not the product CSP and is never applied to production.
- Production source currently permits scripts only from self (plus wasm-unsafe-eval) and frames only from `media.flixel.com`. The report also records one read-only live HEAD response's CSP/Referrer-Policy when reachable. Production needs a separately reviewed UI/CSP integration and its own origin-level test even if this probe passes.

## Observation sequence

One job runs desktop 1440×900, mobile-sized 390×844 and tablet-sized 820×1180 sequentially. They are desktop Chromium responsive viewports, not physical-mobile/iOS claims. Each gets a fresh normal browser context, one player, no cached credentials and no autoplay-policy launch flags.

1. Load the real provider iframe below the viewport with autoplay disabled. Wait for the real onReady event, issue mute while still offscreen and observe the actual muted getter within the same readiness budget; record no automatic play attempt while invisible.
2. Scroll natively using browser mouse-wheel input. When more than 50% visible, request muted playback once for that visible epoch. Controls and branding remain intact. There are no custom player-covering overlays.
3. In every viewport, require real PLAYING state and currentTime at least three seconds. Only desktop may capture two full visible viewport PNGs separated by at least 1.5 seconds of provider time. Both desktop captures are bracketed by real API observations, confirmed muted state and equal measured geometry. A fixed batch-wide quota permits at most two capture attempts total. Mobile/tablet record a second real API state/time observation after 1.5 seconds, with no screenshots.
4. Assess advancing API time in all viewports. For desktop alone, separately assess changed nonblank pixels in a broad interior region outside normal control/title edges and the central loader. This is a diagnostic, not content recognition. Human inspection of the original full desktop screenshots remains required. Mobile/tablet report API-only success and explicitly make no visual-proof claim.
5. Scroll natively out of view. Require PAUSED and currentTime stable within 0.1 seconds for 1.5 seconds. Scroll back into view and require PLAYING with another second of advancement, still only one player and exactly two automatic requests total.

A blocked autoplay event is distinct from owner-disabled embedding (101/150), missing client identification (153), provider availability errors, and timeout. Each failure terminates that viewport. No click-forcing fallback, alternate video, repeated playback retry, response fabrication, download, rehosting, media extraction, seeking, hidden branding or timeout extension is allowed. Remaining viewports are independent single observations, not retries of a failed viewport.

## Bounds and execution

The pure request contract fixes the exact repository, main/push event, first run attempt, immediate baseline parent/tree, fixed official video, seven added-only paths, source-file hashes, all viewport dimensions, the desktop-only two-image-total capture policy and all deadlines. There are no runtime override inputs. Preflight runs before dependencies or sockets and again before the browser. The existing lockfile and existing Playwright package are used; no new framework or package is added.

A viewport has a 65-second absolute evidence budget; the complete runtime batch has a 240-second hard watchdog. Individual navigation, readiness, playback, command, screenshot and header-read deadlines are smaller and never extend a viewport. Cleanup has a separate five-second resource-disposal bound and cannot collect or validate late evidence. CPU decode/hash/pixel assessment and asynchronous writes must finish before the original lane deadline. The workflow has its own finite limits. Failed observations cannot become success via a late provider callback. A hard batch stop exits immediately without waiting for file I/O, so its last saved report can be incomplete. CI reruns are rejected. If an integration error requires a new test, it needs a new reviewed request rather than an implicit retry.

CPU-only author/review command (no browser, server, sockets or network):

    node --check scripts/official-nissan-embed.mjs
    node --check scripts/official-nissan-embed-page.mjs
    node --test tests/official-nissan-embed.node.mjs

No actual browser run or artifact upload has occurred during source authoring. Only the integrator may publish the approved source, within the approved exact two-images-total artifact scope. The report and at most two actual desktop frame PNGs total exist only as bounded CI evidence with three-day artifact retention. They are excluded from the exact source-only backup allowlist.
