# Homepage entry and motion repair — 6 October 2026

## Observed baseline

Reviewed production revision `8f5b00349a12929deccfc233e0916f98fcd1287d` at
https://gtr-lab-production.up.railway.app/ in the cloud Chromium browser,
1180 × 757, on 6 October 2026 around 15:34–15:43 UTC.

- The black header gutter comes from an explicit 64px desktop / 88px mobile
  top inset on both the poster and the intact provider iframe.
- On completion or explicit continuation, the opening correctly focuses
  `#home-title`. However, `.home-hero-copy:focus-within` forces opacity to 1
  indefinitely. The browser showed computed opacity 1 while the scroll engine
  wrote lower values. This hides the intended copy fade during ordinary scroll.
- The opening film did play in this browser: muted, unpaused, readyState 4,
  1920 × 1080, with samples at 5.645545 and 9.244559 seconds. This does not
  establish that the reported Android browser plays successfully.
- The old entry sequence waited for 3D/poster preparation before requesting the
  provider document, imposing an additional poster-only load after the modal.
- Editorial motion was active in this normal-motion browser. Reduced-motion
  and compact-height layouts intentionally suppress choreography. Reduced-motion
  and Save-Data intentionally require manual film playback. No assumption was
  made about the reporting device's preferences or browser.

## Candidate behavior

1. Start the complete 16:9 frame at the top edge, behind the existing menu.
   Keep the exact source, proportions, provider viewport and attribution.
   Remove the former top inset from the total desktop panel height as well.
2. Restrict the copy's focus hold to interactive support content. The heading
   remains the accessible focus destination but no longer suppresses the fade.
3. Prepare the existing hero iframe in parallel with the opening's 3D work.
   Keep it inert/hidden to assistive technology while the modal is pending.
   Entry does not recreate or navigate a successfully preloaded iframe.
4. Start the 20-second missing-document timeout only when the opening is
   released. A provider stall cannot hold the opening gate closed. Retry, Stop,
   offscreen/hidden-tab cleanup and all motion/data preferences are retained.
5. An iframe load still certifies only document navigation. No playback-ready
   event is invented, and `data-film-playback` remains `unverified`.

The loader's ring, authentic badge and visual design are unchanged.

## Provider contract

The [official embedding guide](https://support.flixel.com/articles/embedding-cinemagraphs-on-websites-blogs)
says the generated embed loops/autoplays on supported sites and chooses media
for the browser/device. The existing exact `?hd=true` iframe and autoplay
permission are retained. No new autoplay query parameters, proxy, extracted
video, cropped branding or rehosted media are introduced.

## Verification boundary

Unit regressions first failed for the top inset, focused-title opacity and
serial player startup. The new cases check frame identity across entry,
inertness, separate document/playback semantics, delayed deadline, policy
opt-in, independent poster decoding and loader recovery. Browser regression
coverage was updated for desktop/mobile geometry and early loading, including
one request and the same DOM iframe across entry.

The candidate still needs actual desktop/mobile browser execution in the
supported runner and final real-provider review on its published origin.
Local headless Chromium was already blocked by this executor's socket policy;
that restriction was not bypassed. Test discovery is not browser execution.
The live baseline review is not evidence that the local candidate has shipped.
Physical Android playback and performance remain unverified.

### Local candidate checks

- `npm test`: 80 files, 728 tests passed
- `npm run typecheck`: passed
- `npm run build`: passed; existing large-chunk warnings remain
- Playwright discovery: opening/cards, hero viewport, hero exit and loading
  suites parse successfully. Browser execution has not run for this candidate
- `git diff --check`: passed

### Independent code review

Read-only review found no remaining critical or important application defect
and cleared the candidate for supported CI. One stale viewport-test request
count was corrected from zero to one for gate-time preloading; the separate
reduced-motion/Save-Data zero-request expectation remains. Hero viewport test
discovery and `git diff --check` passed again after that test-only correction.
