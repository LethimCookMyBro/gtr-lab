/** Serialized into the page by Playwright. Observe the shipped canvas only;
 * never change the application, DPR, camera, animations or pixels.
 */
export function waitForFullResolutionFrames({ timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let frame;
    let samples = 0;
    let regressedFrames = 0;
    let fullFrames = 0;
    let previous;
    const started = performance.now();
    const fail = () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      reject(
        new Error(
          `Canvas did not retain full resolution for three frames within ${timeoutMs}ms`,
        ),
      );
    };
    const timer = setTimeout(fail, timeoutMs);
    const next = () => {
      // A blocked main thread can deliver this RAF before an overdue timer.
      // Never let that delayed callback accept a frame beyond the same budget.
      if (performance.now() - started >= timeoutMs) {
        fail();
        return;
      }
      samples++;
      const canvas = document.querySelector(".scene-stage canvas");
      const expectedDpr = Math.min(devicePixelRatio, 1.75);
      const observation = canvas && {
        css: [canvas.clientWidth, canvas.clientHeight],
        drawingBuffer: [canvas.width, canvas.height],
        expectedDpr,
      };
      const full =
        observation &&
        observation.css.every(
          (size, axis) =>
            size > 0 &&
            observation.drawingBuffer[axis] === Math.floor(size * expectedDpr),
        );
      const same =
        previous && JSON.stringify(observation) === JSON.stringify(previous);
      // A late OrbitControls change can regress AdaptiveDpr after an initially
      // full canvas. Count only consecutive full native frames with stable size.
      fullFrames = full ? (same ? fullFrames + 1 : 1) : 0;
      if (!full) regressedFrames++;
      previous = observation;
      if (fullFrames === 3) {
        clearTimeout(timer);
        resolve({
          ...observation,
          fullFrames,
          sampledFrames: samples,
          regressedFrames,
          elapsedMs: Math.round(performance.now() - started),
        });
      } else frame = requestAnimationFrame(next);
    };
    // Do not accept the old full-sized canvas before queued reset work runs.
    frame = requestAnimationFrame(next);
  });
}
