/**
 * A demand-rendered transition owns time from its latest committed target,
 * never from R3F's previous frame (which may predate the request by minutes).
 * Exponential interpolation composes across samples, so sparse admitted frames
 * catch up with wall time without changing the usual 60 Hz easing curve.
 */
export function createTargetTransitionClock(now = () => performance.now()) {
  let lastSample = now();
  return {
    reset() {
      lastSample = now();
    },
    sampleAlpha(reducedMotion: boolean) {
      const current = Math.max(lastSample, now());
      const elapsed = (current - lastSample) / 1000;
      lastSample = current;
      return reducedMotion ? 1 : 1 - Math.exp(-7 * elapsed);
    },
  };
}
