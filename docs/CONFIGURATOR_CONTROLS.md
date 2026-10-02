# Configurator controls and interaction feedback

The configurator uses the previously published, licensed Ciasny R35 exterior. This work changes control behavior and material presentation without replacing or adding vehicle geometry.

## Corrected behavior

- Selecting the same camera view again now issues a fresh camera request. After a manual orbit, the selected view returns to its canonical camera position instead of silently retaining the manual angle.
- Configurator drawers remain mounted for their 280 ms exit, then restore focus to their trigger. A newer panel cancels an older exit. Reduced motion dismisses immediately.
- The camera panel explicitly explains that the source has no detailed cabin. Interior stays disabled rather than entering an empty or fabricated cabin.
- Lights show an on/off label. The actual source supports front LED strips and rear rings; projector bulb and beam controls are not claimed. Optical lamp-cover materials are isolated from black window and lamp-housing materials. The unlit LED substrate is subdued so emission has a visible on/off response.
- Sound is labeled “UI sound”; it plays opt-in interface cues, not an engine recording.
- Menu and control hovers use restrained content translation, an accent line and icon motion, with keyboard-focus equivalents. Menu links reverse out on close; model-card zoom remains subtle. Hover-only transforms are avoided for touch and reduced-motion preferences.

## Verification

The regression suite first reproduced the repeated-camera bug with the actual Three camera and OrbitControls. It failed before the fix and passed afterward.

Real WebGL browser evidence at 838ea3654395bdc8bfbd4e44906e2223d63a66bb includes 38 checks per viewport at 1440×900 and 390×844: panel triggering and dismissal, seven exterior camera choices, canonical camera restoration after manual orbit, nine paints, five environments, front/rear lamp state, rotation start/movement/stop, a real WebAudio cue, and all five photographic fallbacks. The redundant footer information shortcut is intentionally absent on mobile; the top provenance button provides the same disclosure.

Rendered-state comparisons wait for AdaptiveDpr to restore full resolution. Outdoor checks wait for actual HDR responses and decode frames. Static captures use reduced motion for deterministic software-renderer readback; rotation is explicitly exercised with normal motion. Hover, keyboard focus, close phases and reduced-motion dismissal have a separate normal-motion browser sequence and native video evidence.

The full Quality run 37027178939 passed for that checkpoint, including unit/DOM tests, typecheck, general browser tests, renderer QA and real vehicle tests. The final front-LED substrate change has an additional failing-then-passing unit regression. Application candidate 04527bfa36508c7adcf25c7b22db91413df61b2b passed all 269 local tests, typecheck and production build; its control audit 37029064458 passed all 38 checks on both desktop and mobile with no browser errors. In a matched-resolution, lamp-only front crop, 833 pixels show a strong on/off change localized to the actual LED strips, compared with 28 before the substrate correction. The enhanced vehicle checkpoint also verifies exact camera restoration.

## Remaining asset limitations

An accurate, accepted cabin and five separate variant GLBs are still unavailable. NISMO, T-spec, GT-R50, GT3 and GT500 stay clearly identified photographic references with scene-dependent controls disabled. The published R35 is an artist-built custom-aero model rather than a verified factory 2024 Premium replica. This release does not establish OEM photorealism or completion of the six-car project.

Final application candidate 04527bfa36508c7adcf25c7b22db91413df61b2b passed complete Quality run 37029064775 on 2 October 2026, including the production-asset WebGL suite. The release marker promotes this exact tested source; no additional application change is bundled into promotion.
