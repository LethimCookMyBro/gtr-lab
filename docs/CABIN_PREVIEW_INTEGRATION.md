# Optional R35 cabin preview

## Scope and fidelity

This is interim progress on the complete six-model experience. Only Premium has an explicitly selected original authored cabin preview. All five unavailable variant meshes remain unavailable; no shared cabin is relabeled. The cabin is a work in progress, not official Nissan geometry, an OEM scan, or a verified factory trim. See MODEL_PROVENANCE.md and qa/cabin-preview/PROVENANCE.md.

## Runtime ownership

- The existing VehicleScene owns one demand-rendered Canvas and the accepted licensed exterior load
- CabinPreviewState separates closed, streaming/preparing, active fixed-seat and recoverable-error phases; each attempt has a monotonically increasing identity
- CABIN_URL is fetched only after the explicit camera-drawer gesture. The exterior stays interactive and uses its normal window materials during download/preparation
- The shared streaming loader owns cancellation, decoded asset disposal and measured byte progress. Compressed or absent Content-Length is not presented as a trustworthy total
- CabinAttachment compiles the detached cabin using the existing scene's environment/lights. The cancellable renderer barrier rejects missing programs, context loss and failed shader links, and cancels polling before querying disposed resources
- The cabin and all three camera poses use the exterior-derived scale and position. Cabin bounds never renormalize the interior
- Only the four reviewed window names receive the reviewed MeshStandardMaterial thin-glass policy while the preview is active. Their exact material or material-array references are restored on exit, failure and teardown; no lamp, paint or cowl role changes
- The authored cabin retains the reviewed native no-shadow policy. The exterior adapter's defaults are not allowed to add shadow passes to it
- The eye moves directly between fixed reviewed seat positions, never via free orbit/translation through the center console. The look direction and lens interpolate; reduced motion applies immediately. Manual drag/arrows clamp yaw/pitch, and wheel input changes only FOV
- Entry saves the actual exterior pose, target, FOV, near/far and rotation policy. Back/Escape restores them; choosing a new exterior preset takes precedence. Old orbit damping is drained before fixing the cabin eye
- Global renderer/context failure uses the existing scene fallback. Optional cabin failures leave the exterior available with Retry/Back controls
- Loading completion cannot steal keyboard focus from a foreground drawer. Escape closes the topmost drawer first. Preview exit focuses Camera

## Reproduction

Run npm test, npm run typecheck, and npm run build for Node/unit/type/build checks. prepare:assets verifies and expands the existing pinned sealed gzip into /models/r35-cabin-sealed-spatial.glb.

Actual rendered review is separate: use the main-only cabin-preview-integration GitHub Actions workflow after explicit source-publication approval. It exercises the actual built app at desktop/mobile sizes, rather than the standalone asset inspector. Do not use local browser or socket execution in an environment where that was denied.

## Remaining acceptance

The asset inspector's thin-glass pixels have been accepted only for an opt-in WIP interior. The integrated app's lighting, mobile layout, transitions, interruption flows and captures still require CI review. No frame-rate claim, physical-device result or production deployment is implied by passing unit tests or a successful build.
