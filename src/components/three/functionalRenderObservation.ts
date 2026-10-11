import type { RootState } from "@react-three/fiber";
import { Vector2, type Camera, type Object3D, type WebGLRenderer } from "three";

type Event = Record<string, unknown> & { kind: string; owner: number };
type Observer = (event: Event) => void;
type Host = typeof globalThis & { __gtrFunctionalCaptureObserver?: Observer };
const providers = new WeakMap<WebGLRenderer, Map<string, () => unknown>>();
let nextOwner = 0;

/** Read-only and completely dormant unless explicitly installed before navigation. */
export function registerFunctionalState(
  renderer: WebGLRenderer,
  key: string,
  read: () => unknown,
): () => void {
  if (typeof (globalThis as Host).__gtrFunctionalCaptureObserver !== "function")
    return () => {};
  const entries = providers.get(renderer) ?? new Map();
  providers.set(renderer, entries);
  entries.set(key, read);
  return () => {
    if (entries.get(key) === read) entries.delete(key);
    if (!entries.size) providers.delete(renderer);
  };
}

/** This observer never requests rendering, polls, or owns/deletes a native sync. */
export function createFunctionalRenderObservation(get: () => RootState) {
  const observer = (globalThis as Host).__gtrFunctionalCaptureObserver;
  if (typeof observer !== "function") return undefined;
  const owner = ++nextOwner;
  const renderer = get().gl;
  const context = renderer.getContext();
  const canvas = renderer.domElement;
  let stopped = false,
    nextDraw = 0,
    nextFence = 0;
  let draws: number[] = [];
  const fences = new WeakMap<WebGLSync, { id: number; draws: number[] }>();
  const emit = (kind: string, data: Record<string, unknown> = {}) => {
    try {
      const event = { kind, owner, ...data };
      if (kind !== "attach") {
        const freeze = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          Object.values(value).forEach(freeze);
          Object.freeze(value);
        };
        freeze(event);
      }
      observer(event);
    } catch {
      /* Observation cannot affect production. */
    }
  };
  const read = () => {
    const state = get(),
      camera = state.camera;
    const size = renderer.getSize(new Vector2());
    const values = Object.fromEntries(
      [...(providers.get(renderer) ?? [])].map(([key, readValue]) => [
        key,
        readValue(),
      ]),
    );
    return {
      ...values,
      pose: {
        position: camera.position.toArray(),
        quaternion: camera.quaternion.toArray(),
        projection: camera.projectionMatrix.toArray(),
      },
      dimensions: {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        pixelRatio: renderer.getPixelRatio(),
        renderWidth: size.x,
        renderHeight: size.y,
      },
      live:
        !stopped &&
        canvas.isConnected &&
        renderer.getContext() === context &&
        !context.isContextLost(),
    };
  };
  emit("attach", {
    canvas,
    context,
    read,
    pending: () => get().internal.frames > 0,
  });
  return {
    begin(scene: Object3D, camera: Camera) {
      try {
        if (stopped || renderer.getRenderTarget() !== null) return;
        const gl = context as WebGL2RenderingContext;
        if (gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) !== null) return;
        if (scene !== get().scene || camera !== get().camera)
          return { kind: "foreign-default" as const };
        return { kind: "main" as const, snapshot: read() };
      } catch {
        emit("invalid", { reason: "main observation failed" });
      }
    },
    main(
      token:
        | { kind: "main"; snapshot: ReturnType<typeof read> }
        | { kind: "foreign-default" }
        | undefined,
    ) {
      if (!token || stopped) return;
      if (token.kind === "foreign-default") {
        emit("buffer-replaced");
        return;
      }
      const snapshot = token.snapshot;
      try {
        const id = ++nextDraw;
        draws.push(id);
        const stable = JSON.stringify(snapshot) === JSON.stringify(read());
        // Serialize before handing off: no mutable app state reaches a consumer.
        emit("main", {
          id,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          stable,
        });
      } catch {
        emit("invalid", { reason: "main snapshot failed" });
      }
    },
    fence(sync: WebGLSync, previous: WebGLSync | null) {
      const prior = previous && fences.get(previous);
      const batch = {
        id: ++nextFence,
        draws: [...(prior ? prior.draws : []), ...draws],
      };
      draws = [];
      fences.set(sync, batch);
      emit("fence", {
        ...batch,
        draws: [...batch.draws],
        previous: prior ? prior.id : null,
      });
    },
    wait(sync: WebGLSync, status: number) {
      emit("wait", { id: fences.get(sync)?.id, status });
    },
    retire(sync: WebGLSync, reason: string) {
      emit("retire", { id: fences.get(sync)?.id, reason });
      fences.delete(sync);
    },
    invalid(reason: string) {
      emit("invalid", { reason });
    },
    stop() {
      stopped = true;
      draws = [];
      emit("stop");
    },
  };
}
