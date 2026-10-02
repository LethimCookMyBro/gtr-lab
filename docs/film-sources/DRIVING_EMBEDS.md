# Publisher-hosted GT-R driving films

Verified 2 October 2026 using actual cloud-browser playback and the public Embed dialogs. These replace the two stationary CGI home films; existing scroll choreography remains.

| Section | Exact clip | Observed content | Observed duration |
|---|---|---|---|
| Opening | https://flixel.com/cinemagraph/7x5domma49p8pb7z8k1l | NissanNews, “2020 Nissan GT-R NISMO”; real close tracking shots on a race circuit, spinning wheels and driver visible | 9.36 seconds |
| Expanding | https://flixel.com/cinemagraph/t53p8d1vu4miy763a938 | NissanNews, GT-R camera car and white GT-R NISMO making a high-speed pass at Lausitzring | 10.948207 seconds |

## Narrow permission and provenance

Both exact public NissanNews clip pages expose an Embed control and a dialog saying “Copy this code to embed on your website.” Each supplies a responsive `media.flixel.com/cinemagraph/<id>` iframe, including the HD option. The app uses these intact provider-hosted players and keeps visible NissanNews/Flixel credits and original-film links. It does not extract, modify, cache, redistribute or rehost the video files. This is not a general license to Nissan footage or a statement of endorsement.

The opening clip appears in [Nissan’s performance-test article](https://global.nissannews.com/en/releases/2020-nissan-gt-r-nismo-put-to-the-test). The detail clip is explicitly linked as a website embed from [Nissan’s camera-car article](https://global.nissannews.com/en/releases/the-only-car-capable-of-filming-the-2020-gt-r-nismo-another-gt-r). The first article's separate aerodynamics embed `j1od28kr4ejncg6ea32z` depicts stationary CGI and was rejected for this driving-footage task.

[Nissan newsroom terms](https://global.nissannews.com/en/pages/terms-of-use) limit general creative-asset reuse to defined editorial purposes. [Flixel terms](https://flixel.com/terms/) retain third-party content rights. Our use relies narrowly on the clip-specific publisher-provided embedding feature, not a raw-download or general reuse grant. [Flixel’s embedding documentation](https://support.flixel.com/articles/embedding-cinemagraphs-on-websites-blogs) describes the responsive, muted looping service. Availability and provider presentation can change.

## Playback and accessibility

No documented player pause API or native controls are exposed for these clips. The local control therefore says **Stop film**, and removes the iframe to stop playback; **Play film** mounts it again and restarts the provider loop. Offscreen sections and hidden tabs remove their players. Reduced motion and Save-Data prevent automatic loading, while explicit play remains available. A stricter motion/data preference stops a previous manual attempt.

The full provider viewport is preserved rather than cropping away provider UI or branding. The mobile opening player keeps its native landscape aspect ratio. Original-film links are always available. A missing iframe document load has a bounded timeout/retry. Cross-origin iframe `load` is not proof of video playback and does not expose every provider error; the app labels that state `embedded`, and real-browser QA inspects the actual provider video. No MP4 from the former CGI home films should be requested by the page.

The static app policy adds only `frame-src https://media.flixel.com`; parent script, fetch, object and frame-ancestor restrictions remain intact.

## Verification status

Lifecycle and homepage unit checks plus TypeScript passed locally. Actual desktop/mobile playback, successive frames, stop/restart, offscreen unloading, preference opt-in and the preserved scroll expansion are required in the exact-commit browser run before deployment. An external-player outage must remain distinguishable from an application regression.
