import type { WebGLRenderer } from "three";

const prepared = new WeakSet<WebGLRenderer>();
const POLL_MS = 16;
const DRAIN_LIMIT_MS = 30_000;

/**
 * R3F 9.8.1 awaits a returned disposal Promise before its final context loss.
 * Release normal resources immediately, then allow submitted GPU work to drain
 * without blocking the UI. Failure rejects into R3F's existing final-release
 * fallback; it never suppresses forceContextLoss or retains an endless poll.
 */
export function prepareAsyncRendererDisposal(renderer: WebGLRenderer): void {
  if (prepared.has(renderer)) return;
  prepared.add(renderer);
  const dispose = renderer.dispose.bind(renderer);
  let disposal: Promise<void> | undefined;
  renderer.dispose = () => {
    if (disposal) return disposal;
    disposal = new Promise<void>((resolve, reject) => {
      let context: WebGL2RenderingContext | undefined;
      let sync: WebGLSync | null = null;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (error: unknown = null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        if (context && sync) {
          const owned = sync;
          sync = null;
          try {
            context.deleteSync(owned);
          } catch (cleanupError) {
            if (error === null) error = cleanupError;
          }
        }
        if (error === null) resolve();
        else reject(error);
      };
      const lost = () => finish();
      try {
        dispose();
        const gl = renderer.getContext();
        if (gl.isContextLost()) {
          finish();
          return;
        }
        if (!("fenceSync" in gl)) {
          finish(new Error("Renderer disposal requires a WebGL2 fence."));
          return;
        }
        context = gl;
        sync = context.fenceSync(context.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (!sync) {
          if (context.isContextLost()) finish();
          else finish(new Error("Could not create a renderer disposal fence."));
          return;
        }
        renderer.domElement.addEventListener("webglcontextlost", lost);
        context.flush();
        const started = performance.now();
        const poll = () => {
          if (settled || !context || !sync) return;
          try {
            if (context.isContextLost()) {
              finish();
              return;
            }
            const status = context.clientWaitSync(sync, 0, 0);
            if (
              status === context.ALREADY_SIGNALED ||
              status === context.CONDITION_SATISFIED
            ) {
              finish();
            } else if (status === context.TIMEOUT_EXPIRED) {
              if (performance.now() - started >= DRAIN_LIMIT_MS)
                finish(
                  new Error("Renderer disposal fence exceeded 30 seconds."),
                );
              else timer = setTimeout(poll, POLL_MS);
            } else if (context.isContextLost()) {
              finish();
            } else {
              finish(new Error("Renderer disposal fence wait failed."));
            }
          } catch (error) {
            finish(error);
          }
        };
        // A new WebGL sync cannot signal until control returns to the event loop.
        timer = setTimeout(poll, POLL_MS);
      } catch (error) {
        finish(error);
      }
    });
    return disposal;
  };
}
