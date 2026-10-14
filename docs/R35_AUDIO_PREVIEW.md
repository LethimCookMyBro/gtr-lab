# R35 section sound and recording provenance

## Intent and integration

The homepage uses `R35SectionSound` inside the rear stage: one compact Sound
on/off button and an accessible Credits link to the complete recording notice.
There is no standalone audio band. The legacy `R35SoundPreview` remains usable
elsewhere as an explicitly requested Hear/Stop preview. Both share the same
transport, original bytes, gain and bounded loading/decode policy.

`RearSignature.audioReducedMotion` must receive the actual OS reduced-motion
preference, independently of `reducedMotion`, which also includes the
short-height sequential visual fallback. Save-Data is shared.

The recording is the complete original **2009 Nissan GT-R SpecV acceleration**
by **Edvvc (Ed Pond)** at Goodwood on 3 July 2009. It is neither a startup nor a
verified stock-exhaust sample, and it does not purport to be audio of the
separate licensed Ciasny model shown by the site. The linked Credits notice identifies the author, source, license, historical
license discrepancy and playback adaptations.

## Source and licensing

- [Commons source](https://commons.wikimedia.org/wiki/File:Nissan_GT-R_SpecV.ogg)
- [Original uploader grant, revision 26854850](https://commons.wikimedia.org/w/index.php?title=File:Nissan_GT-R_SpecV.ogg&oldid=26854850)
- [Author profile](https://commons.wikimedia.org/wiki/User:Edvvc)
- [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)
- Distributed notices: `public/audio/ATTRIBUTION.txt` and `provenance.json`

Source review established that the original 19 August 2009 description by
Edvvc already said “Own work by uploader” and contained
`{{self|cc-by-sa-3.0}}`. The current Commons description continues to display
that grant. The embedded Vorbis comment separately mentions the older
Attribution-Noncommercial-Share Alike 2.0 UK license. The byte-identical file
retains that notice; neither the source nor the metadata has been rewritten.
Use relies on the author's separate CC BY-SA 3.0 grant, not an assertion that
the older metadata disappeared. No new permission or universal legal
clearance is claimed.

The Ogg is untrimmed and untranscoded. Web Audio applies a playback gain of
0.2, a 0.12-second linear fade in and a 0.65-second linear fade out to the
full 0–7.60056689342404-second recording. These playback adaptations are
credited and offered under CC BY-SA 3.0. No audiovisual artifact is created.
Section entry triggers independent playback but never scrubs the recording
or synchronizes its timing/rate with a logo, camera, loading stage or film.
Ordinary section exit applies up to an 80 ms audio-clock fade; urgent stops
silence it immediately. **Do not include the sample in a
recorded website preview or future video without independently reviewing
that artifact's licensing.** Unrelated site media/code retain their own
terms, and no trademark rights or endorsement are implied.

## Asset identity

| Property        | Verified value                                                     |
| --------------- | ------------------------------------------------------------------ |
| File            | `/audio/nissan-gtr-specv-edvvc.ogg`                                |
| Bytes           | 189136                                                             |
| Codec           | Vorbis in Ogg                                                      |
| Channels / rate | Stereo / 44100 Hz                                                  |
| Decoded frames  | 335185 per channel                                                 |
| Duration        | 7.60056689342404 seconds                                           |
| SHA-256         | `496536debb72d6d540914cc330db43567fc64b85e8e7dd892d6d1dcee3051a60` |
| SHA-1           | `e1555928be7cdff222372f3d534ad29316046de0`                         |

The source asset is small enough to commit directly. Production playback is
same-origin, with no runtime third-party request and no dependency on an
external audio host. No new packages or accounts are required.

## Interaction and lifecycle

- Mount, scroll and fabricated events cannot unlock audio. The first eligible
  trusted primary pointer or non-repeated non-modifier keyboard gesture calls
  AudioContext resume synchronously before any network/decode await. Touch/pen
  pointer-up is supported; the browser's active user-activation flag is checked
  when available. Gestures in an open modal or inert subtree do not prepare it,
  except the actual opening gate's Continue button when it is the sole modal.
  That trusted pointer/Enter/Space action can prepare offscreen; playback remains
  blocked until gate closure and section eligibility. For restored scroll, the
  gate's closure releases this never-attempted entry once; later menu/film
  dismissal cannot restart an interrupted entry
- A first gesture on a menu/film modal opener unlocks the AudioContext only.
  It does not fetch/decode a recording that opening the modal would immediately
  cancel, and does not play into an already-visible car entry. After the modal
  closes, a later genuine section entry may load/play using that unlocked
  context; closing the modal itself never starts playback
- Preparation can happen offscreen. One playback occurs per genuine car-section
  entry after activation. The visible area is normalized against
  min(section width, viewport width) × min(section height, viewport height), so
  a long runway remains reachable in short landscape. Entry is 55%; exit is 15%
  to avoid threshold chatter. Natural end never replays within the same entry
- Reduced motion and Save-Data each require the compact Sound control's explicit
  opt-in in this visit, even if a prior site sound preference was on
- A persisted `gtr-lab:sound=off` or sample mute blocks preparation/playback.
  Explicit section Sound off stores both preferences. Same-tab events and
  cross-tab storage changes propagate mute immediately; external unmute never
  resumes the current entry. The synthetic UI-tone provider consumes the same
  preference bridge without auto-playing a cue
- Normal viewport exit schedules native gain automation and source.stop on the
  audio clock for up to 80 ms. There is no JavaScript fade timer. Nodes and the
  global playback owner remain retained until `ended`; repeated exit requests
  cannot extend the fade. A replacement, mute, hidden tab, navigation, modal or
  disposal overrides that scheduled fade with an immediate stop
- The 0.2 playback gain, 120 ms fade-in, and 650 ms natural-end fade are retained.
  Exit fades hold the current natural-envelope level, including during fade-in
  or the quiet tail, rather than increasing volume
- A 12-second deadline covers resume, fetch, bytes and decode. AbortController,
  attempt tokens and node identity reject late work and stale ended callbacks.
  Cleanup cancels the deadline, aborts fetch, disconnects nodes, releases the
  global owner, removes listeners/observers and closes the context
- One section-owned modal observer watches open/role/aria-modal changes and DOM
  insertion/removal, covering the existing home menu and opening/film dialogs.
  Closing a modal or returning to a tab does not resume the previous entry.
  `stopR35Recording()` additionally lets the film opener interrupt synchronously
  before mounting its embedded player
- Keyboard-native controls, a polite screen-reader status and a Credits link
  retain accessibility without visible explanatory copy over the car

## Reconstruction and verification boundary

This implementation was reconstructed from baseline commit `75db282` on
14 October 2026; it is not a claim of byte identity with a lost workspace.
The distributed Ogg bytes are still pinned by the provenance suite to the
original SHA-256 above, including the embedded older license notice.

CPU-only Vitest checks cover transport races, native fade ownership, genuine
entry hysteresis, restricted preferences, same-tab and cross-tab mute, modal
interruption, trust/activation boundaries, short-landscape geometry, React
StrictMode/navigation/disposal and compact DOM placement. TypeScript is checked
without emitting files. These checks run with the supplied deny-sockets preload.
They do not launch a browser/server or establish audible output or visual QA.

Authorized CI remains responsible for browser playback, real Ogg decode,
keyboard/touch activation, viewport presentation at portrait/short-landscape
sizes, dialog opening/closing, rapid viewport exit/re-entry, and background-tab
stopping. A physical Safari/device audio check remains separate. Do not include
the recording in a captured preview/video without reviewing that use's license.
