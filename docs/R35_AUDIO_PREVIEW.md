# Standalone R35 recording preview

## Intent and integration

`R35SoundPreview` is an optional listening control below the rear narrative. It
is separate from the moving scene and from the existing 170 ms synthetic UI
click effect in `src/hooks/useAudio.tsx`. It requires a React Router context;
`className` and `buttonClassName` allow integration without shared CSS changes.

The recording is the complete original **2009 Nissan GT-R SpecV acceleration**
by **Edvvc (Ed Pond)** at Goodwood on 3 July 2009. It is neither a startup nor a
verified stock-exhaust sample, and it does not purport to be audio of the
separate licensed Ciasny model shown by the site. The source is identified
next to the control rather than assigning a generic “R35 engine” label.

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
The sample is never synchronized with a logo, camera, scroll position,
loading stage, film or other animation. **Do not include the sample in a
recorded website preview or future video without independently reviewing
that artifact's licensing.** Unrelated site media/code retain their own
terms, and no trademark rights or endorsement are implied.

## Asset identity

| Property | Verified value |
| --- | --- |
| File | `/audio/nissan-gtr-specv-edvvc.ogg` |
| Bytes | 189136 |
| Codec | Vorbis in Ogg |
| Channels / rate | Stereo / 44100 Hz |
| Decoded frames | 335185 per channel |
| Duration | 7.60056689342404 seconds |
| SHA-256 | `496536debb72d6d540914cc330db43567fc64b85e8e7dd892d6d1dcee3051a60` |
| SHA-1 | `e1555928be7cdff222372f3d534ad29316046de0` |

The source asset is small enough to commit directly. Production playback is
same-origin, with no runtime third-party request and no dependency on an
external audio host. No new packages or accounts are required.

## Interaction and lifecycle

- Mounting, scrolling, reduced motion, saved preferences and unmuting never
  fetch audio, create an AudioContext or play sound
- `Hear the R35` is the only initial playback path. AudioContext resume is
  called synchronously in the click before any network/decode awaits. When
  the browser exposes user activation, inactive calls are refused
- Real decode completes before the interface reports playing. Loading can be
  cancelled. Repeated calls during loading/playing cannot overlap
- `Stop recording`, mute, tab hiding, pagehide, history/hash navigation,
  React Router navigation and unmount cancel pending work and stop playback
- A token plus AbortController prevents late resume/fetch/decode work from
  restarting stopped or disposed audio; another preview stops the previous
  one before loading its own sound
- Errors and a 12-second loading timeout offer a fresh explicit Retry. There
  is no automatic retry, synthetic fallback, looping or auto-resume
- Sample mute is stored under `gtr-lab:r35-sample-muted`. It is independent
  of the site's existing synthetic UI sound preference. Denied storage is
  tolerated. Unmute changes preference only
- Keyboard-native buttons, a named polite status region, a persistent Stop
  action, source/license links and adjacent modification notices are included

## Verification

Three dedicated Vitest suites cover controller lifecycle, React StrictMode,
React navigation, loading cancellation, repeat actions, persisted mute,
explicit retry, missing API, denied storage, timeouts and asset provenance.
The existing synthetic-audio tests remain unchanged.

The original file passed `ffprobe` and a complete `ffmpeg -v error ... -f null -`
decode. Its SHA-1 matches the Commons structured-data checksum, and a test
pins its full SHA-256 and checks that the older embedded notice remains.

At audio handoff, 26 focused tests (24 new plus 2 existing audio tests)
passed. After the integration owner scoped older rear-scene status queries,
the fresh aggregate `npm test` run passed all 647 tests in 69 files, and
`npm run typecheck` passed. This is a working-tree verification; any later
integration changes and the production build remain subject to the main
integration gate.

No subjective listening or real-browser playback is claimed from this cloud
executor. The initial default-host Vite command hit the documented network
interface limitation; the explicit loopback server started normally. Browser
launch was not retried after the integration owner reported an existing
Chromium EPERM restriction. A permitted CI browser gate should verify the
actual file decodes, genuine button activation, natural end, Stop, tab hide,
route leave, mute persistence, explicit error/retry and no pre-gesture audio
request. Mobile Safari/physical-device audio output remains a separate check.
