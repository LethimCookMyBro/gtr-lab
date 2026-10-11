// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { StrictMode } from "react";
import ts from "typescript";
import { OrbitControls } from "three-stdlib";
import { interpolationAlpha } from "../src/components/three/sceneHelpers";
import { stepVehicleAppearance } from "../src/components/three/materialAdapter";
import { connectExteriorKeyboard } from "../src/components/three/keyboardControls";
import { createRequire } from "node:module";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  createRoot,
  useFrame,
  invalidate,
  _roots,
} from "@react-three/fiber";
import type { RootState } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import { installDemandRenderBackpressure } from "../src/components/three/demandFrameAdmission";

import { DemandRenderBackpressure } from "../src/components/three/DemandRenderBackpressure";

const THREE: typeof import("three") = createRequire(import.meta.url)("three");
let rafs: Map<number, FrameRequestCallback>;
let nextRaf: number;
const roots: ReturnType<typeof createRoot>[] = [];
const releases: (() => void)[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  rafs = new Map();
  nextRaf = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafs.set(++nextRaf, callback);
    return nextRaf;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafs.delete(id));
});
async function frame() {
  await act(async () => {
    const callbacks = [...rafs.values()];
    rafs.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
}
afterEach(async () => {
  releases.splice(0).forEach((release) => release());
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  await frame();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function fixture(
  options: {
    component?: boolean;
    paced?: boolean;
    step?: (state: RootState, delta: number) => void;
  } = {},
) {
  let lost = false;
  const syncs: { status: number }[] = [];
  const order: string[] = [];
  const context = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    TIMEOUT_EXPIRED: 0x911b,
    CONDITION_SATISFIED: 0x911c,
    WAIT_FAILED: 0x911d,
    fenceSync: vi.fn(() => {
      const sync = { status: 0x911b };
      syncs.push(sync);
      order.push("fence");
      return sync;
    }),
    flush: vi.fn(),
    clientWaitSync: vi.fn(
      (sync: { status: number }, _flags: number, _timeout: number) =>
        sync.status,
    ),
    deleteSync: vi.fn(),
    isContextLost: () => lost,
  };
  const canvas = document.createElement("canvas");
  const draws: number[] = [];
  const deltas: number[] = [];
  const positions: number[][] = [];
  let latestInput = 0;
  const renderer = {
    isWebGLRenderer: true,
    domElement: canvas,
    getContext: () => context,
    shadowMap: { enabled: false, type: THREE.PCFSoftShadowMap },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    render(_scene: unknown, camera: import("three").Camera) {
      positions.push(camera.position.toArray());
      order.push("render");
      draws.push(latestInput);
    },
    setPixelRatio() {},
    setSize() {},
    getPixelRatio: () => 1,
    getSize: (target: import("three").Vector2) => target.set(100, 100),
    setDrawingBufferSize() {},
    renderLists: { dispose() {} },
    dispose() {},
    forceContextLoss() {},
  } as unknown as WebGLRenderer;
  const errors = vi.fn();
  const pending = vi.fn();
  const root = createRoot(canvas);
  roots.push(root);
  await root.configure({
    gl: () => renderer,
    frameloop: "demand",
    size: { width: 100, height: 100, top: 0, left: 0 },
    onCreated: (state) => {
      if (options.paced !== false && !options.component)
        releases.push(
          installDemandRenderBackpressure(state.get, errors, pending),
        );
    },
  });
  function Work() {
    useFrame((state, delta) => {
      deltas.push(delta);
      order.push("tick");
      options.step?.(state, delta);
    });
    return options.component ? (
      <DemandRenderBackpressure onError={errors} onPendingChange={pending} />
    ) : null;
  }
  await act(async () =>
    root.render(
      <StrictMode>
        <Work />
      </StrictMode>,
    ),
  );
  const state = _roots.get(canvas)!.store.getState();
  return {
    root,
    state,
    renderer,
    context,
    errors,
    pending,
    order,
    draws,
    positions,
    deltas,
    syncs,
    input: (value: number) => {
      latestInput = value;
      state.invalidate();
    },
    complete: () =>
      syncs.forEach((sync) => {
        sync.status = context.ALREADY_SIGNALED;
      }),
    loseSilently: () => {
      lost = true;
    },
    lose: () => {
      lost = true;
      canvas.dispatchEvent(new Event("webglcontextlost"));
    },
    restore: () => {
      lost = false;
      canvas.dispatchEvent(new Event("webglcontextrestored"));
    },
  };
}

it("gates the installed R3F demand tick, retaining the latest input until completion", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  expect(f.draws).toEqual([0]);
  for (let value = 1; value <= 27; value++) {
    f.input(value);
    await frame();
  }
  expect(f.draws).toEqual([0]);
  expect(f.deltas).toHaveLength(1);
  expect(f.state.internal.frames).toBe(1);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.draws).toEqual([0, 27]);
  expect(f.deltas).toHaveLength(2);
  expect(
    f.context.clientWaitSync.mock.calls.every(
      (args) => args[1] === 0 && args[2] === 0,
    ),
  ).toBe(true);
  expect(f.errors).not.toHaveBeenCalled();
});

it("admits every requested RAF when the backend completes within a refresh", async () => {
  const f = await fixture({ step: (state) => state.invalidate() });
  for (let index = 0; index < 12; index++) {
    f.complete();
    await frame();
  }
  expect(f.draws).toHaveLength(12);
  expect(f.deltas).toHaveLength(12);
  expect(f.state.internal.frames).toBe(1);
});

it("preserves a sibling root's invalidation without letting it defeat the same-RAF veto", async () => {
  let target: RootState | undefined;
  const sibling = await fixture({
    paced: false,
    step: () => target?.invalidate(),
  });
  const f = await fixture();
  target = f.state;
  f.complete();
  await frame();
  expect(f.draws).toHaveLength(1);
  sibling.state.invalidate();
  await frame();
  expect(sibling.draws).toHaveLength(2);
  expect(f.draws).toHaveLength(1);
  expect(f.state.internal.frames).toBe(1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws).toHaveLength(2);
});

it("fences complete offscreen batches without dropping or deferring their render calls", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  const earlierFence = f.syncs.at(-1)!;
  const count = f.context.fenceSync.mock.calls.length;
  for (let face = 0; face < 6; face++)
    f.renderer.render(f.state.scene, f.state.camera);
  expect(f.draws).toHaveLength(7);
  await Promise.resolve();
  expect(f.context.fenceSync).toHaveBeenCalledTimes(count + 1);
  earlierFence.status = f.context.ALREADY_SIGNALED;
  f.input(42);
  await frame();
  expect(f.draws).toHaveLength(7);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws.at(-1)).toBe(42);
  expect(f.draws).toHaveLength(8);
});

it("fences useFrame offscreen passes and the main render together, after all subscribers", async () => {
  const f = await fixture({
    step: (state) => {
      state.gl.render(state.scene, state.camera);
      state.invalidate();
    },
  });
  f.complete();
  await frame();
  expect(f.order.slice(-4)).toEqual(["tick", "render", "render", "fence"]);
  const count = f.context.fenceSync.mock.calls.length;
  await Promise.resolve();
  expect(f.context.fenceSync).toHaveBeenCalledTimes(count);
  await frame();
  expect(f.draws).toHaveLength(2);
});

it("keeps multiple requested demand frames and stops when their exact work is consumed", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  f.state.invalidate(4);
  await frame();
  expect(f.draws).toHaveLength(1);
  expect(f.state.internal.frames).toBe(4);
  for (let index = 0; index < 4; index++) {
    f.complete();
    await vi.advanceTimersByTimeAsync(16);
    await frame();
  }
  expect(f.draws).toHaveLength(5);
  expect(f.state.internal.frames).toBe(0);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws).toHaveLength(5);
  expect(vi.getTimerCount()).toBe(0);
});

it("retires the fence and cancels polling without waking an unmounted root", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  f.input(1);
  await frame();
  const render = f.renderer.render;
  releases.pop()!();
  expect(f.renderer.render).not.toBe(render);
  const checks = f.context.clientWaitSync.mock.calls.length;
  await act(async () => f.root.unmount());
  f.complete();
  await vi.advanceTimersByTimeAsync(1000);
  await frame();
  expect(f.context.clientWaitSync).toHaveBeenCalledTimes(checks);
  expect(vi.getTimerCount()).toBe(0);
  expect(f.draws).toHaveLength(1);
});

it("halts on context loss and resumes pending input only with a fresh restored-context fence", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  f.lose();
  f.input(8);
  await frame();
  expect(f.draws).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
  f.restore();
  await frame();
  expect(f.draws).toHaveLength(1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws).toEqual([0, 8]);
});

it("restores frame eligibility when context loss is detected by a poll before the DOM event", async () => {
  const f = await fixture();
  f.complete();
  await frame();
  f.input(9);
  f.loseSilently();
  await frame();
  expect(
    Object.getOwnPropertyDescriptor(f.state.internal, "frames"),
  ).toMatchObject({ value: 1, writable: true });
  expect(f.draws).toHaveLength(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["WAIT_FAILED", "null", "throw"])(
  "reports %s visibly and stops polling without falsely declaring completion",
  async (failure) => {
    const f = await fixture();
    f.complete();
    await frame();
    f.input(99);
    if (failure === "WAIT_FAILED")
      f.syncs.at(-1)!.status = f.context.WAIT_FAILED;
    if (failure === "throw")
      f.context.clientWaitSync.mockImplementation(() => {
        throw new Error("broken context");
      });
    if (failure === "null") {
      f.context.fenceSync.mockImplementation(() => null as never);
      f.renderer.render(f.state.scene, f.state.camera);
      await Promise.resolve();
    }
    await vi.advanceTimersByTimeAsync(16);
    expect(f.errors).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/retry.*viewer/i),
    );
    expect(vi.getTimerCount()).toBe(0);
    const ticks = f.deltas.length;
    await frame();
    expect(f.deltas).toHaveLength(ticks);
    expect(
      Object.getOwnPropertyDescriptor(f.state.internal, "frames"),
    ).toHaveProperty("value");
  },
);

it("microtask-restores the exact descriptor and pending demand when another root throws before after effects", async () => {
  let shouldThrow = false;
  const sibling = await fixture({
    paced: false,
    step: () => {
      if (shouldThrow) throw new Error("subscriber failed");
    },
  });
  const f = await fixture();
  f.complete();
  await frame();
  const descriptor = Object.getOwnPropertyDescriptor(
    f.state.internal,
    "frames",
  )!;
  f.input(55);
  sibling.state.invalidate();
  shouldThrow = true;
  await expect(frame()).rejects.toThrow("subscriber failed");
  await Promise.resolve();
  shouldThrow = false;
  expect(Object.getOwnPropertyDescriptor(f.state.internal, "frames")).toEqual({
    ...descriptor,
    value: 1,
  });
  expect(f.draws).toHaveLength(1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws.at(-1)).toBe(55);
});

it("makes the legacy additive limitation explicit for a multi-frame sibling request during a masked window", async () => {
  let target: RootState | undefined;
  let request = false;
  const sibling = await fixture({
    paced: false,
    step: () => {
      if (request && target) invalidate(target, 3);
    },
  });
  const f = await fixture();
  target = f.state;
  f.complete();
  await frame();
  f.state.invalidate(4);
  request = true;
  sibling.state.invalidate();
  await frame();
  // This app-specific adapter coalesces to four, not the general legacy sum
  // seven. Do not use it for applications relying on additive invalidations.
  expect(f.state.internal.frames).toBe(4);
  expect(f.draws).toHaveLength(1);
});

it("pins the installed scheduler and audits the application's single-frame invalidation contract", () => {
  const packageJson = JSON.parse(
    readFileSync("node_modules/@react-three/fiber/package.json", "utf8"),
  );
  expect(packageJson.version).toBe("9.8.1");
  const dist = "node_modules/@react-three/fiber/dist";
  const source = readFileSync(
    join(
      dist,
      readdirSync(dist).find((file) => /^events-.*\.esm\.js$/.test(file))!,
    ),
    "utf8",
  );
  expect(source).toContain("flushGlobalEffects('before', timestamp)");
  expect(source).toContain(
    "state.frameloop === 'always' || state.internal.frames > 0",
  );
  expect(source).toContain("repeat += update(timestamp, state)");
  expect(source).toContain("flushGlobalEffects('after', timestamp)");
  const files = readdirSync("src", { recursive: true }).filter((file) =>
    /\.[tj]sx?$/.test(String(file)),
  );
  const unsupported: string[] = [];
  for (const file of files) {
    const contents = readFileSync(join("src", String(file)), "utf8");
    const ast = ts.createSourceFile(
      String(file),
      contents,
      ts.ScriptTarget.Latest,
      true,
    );
    const inspect = (node: ts.Node) => {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        const name = ts.isIdentifier(node.expression)
          ? node.expression.text
          : ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name.text
            : "";
        if (name === "invalidate")
          unsupported.push(`${file}: ${node.getText(ast)}`);
      }
      ts.forEachChild(node, inspect);
    };
    inspect(ast);
  }
  expect(unsupported).toEqual([]);
});

it("owns hooks and fences under a real StrictMode subtree and final root retirement", async () => {
  const f = await fixture({ component: true });
  expect(f.context.fenceSync).toHaveBeenCalled();
  f.complete();
  await frame();
  expect(f.draws).toHaveLength(1);
  f.input(6);
  await frame();
  expect(f.draws).toHaveLength(1);
  await act(async () => f.root.unmount());
  const count = f.context.clientWaitSync.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  await frame();
  expect(f.context.clientWaitSync).toHaveBeenCalledTimes(count);
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["readonly", "nonconfigurable", "nonnumeric"])(
  "refuses an incompatible %s frames descriptor before installing an owner",
  async (kind) => {
    const f = await fixture({ paced: false });
    Object.defineProperty(f.state.internal, "frames", {
      configurable: kind !== "nonconfigurable",
      writable: kind !== "readonly",
      value: kind === "nonnumeric" ? "pending" : 0,
    });
    const render = f.renderer.render;
    const release = installDemandRenderBackpressure(f.state.get, f.errors);
    releases.push(release);
    expect(f.errors).toHaveBeenCalledOnce();
    expect(f.renderer.render).toBe(render);
    expect(f.context.fenceSync).not.toHaveBeenCalled();
  },
);

it("presents the latest real keyboard-controlled camera after three inputs arrive behind one fence", async () => {
  const f = await fixture();
  const camera = f.state.camera as import("three").PerspectiveCamera;
  camera.position.set(0, 2, 7);
  const controls = new OrbitControls(camera);
  controls.target.set(0, 0.7, 0);
  const disconnect = connectExteriorKeyboard({
    canvas: f.renderer.domElement,
    camera,
    controls,
    onManual() {},
    onReset() {},
    invalidate: f.state.invalidate,
  });
  releases.push(() => {
    disconnect();
    controls.dispose();
  });
  f.complete();
  await frame();
  const initial = camera.position.clone();
  for (let index = 0; index < 3; index++) {
    f.renderer.domElement.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true }),
    );
    await frame();
  }
  expect(f.draws).toHaveLength(1);
  expect(camera.position.equals(initial)).toBe(false);
  const latest = camera.position.toArray();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.positions).toHaveLength(2);
  expect(f.positions[1]).toEqual(latest);
});

it("invalidates old queued batches and completion polling when an owner is replaced", async () => {
  const f = await fixture();
  f.renderer.render(f.state.scene, f.state.camera);
  releases.pop()!();
  const replace = installDemandRenderBackpressure(f.state.get, f.errors);
  releases.push(replace);
  const fences = f.context.fenceSync.mock.calls.length;
  await Promise.resolve();
  expect(f.context.fenceSync).toHaveBeenCalledTimes(fences);
  expect(vi.getTimerCount()).toBe(1);
  f.complete();
  await frame();
  expect(f.deltas).toHaveLength(1);
});

it("allows a valid startup capture batch to complete after 30.53 seconds without importing a teardown deadline", async () => {
  const f = await fixture();
  // Reproduce the count and a longer-than-30s completion boundary, not GPU cost.
  // These are all legitimate outside-RAF submissions; no one may drop them.
  for (let draw = 0; draw < 502; draw++)
    f.renderer.render(f.state.scene, f.state.camera);
  await Promise.resolve();
  await frame();
  expect(f.draws).toHaveLength(502);
  expect(f.deltas).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(30_550);
  expect(f.errors).not.toHaveBeenCalled();
  expect(f.deltas).toHaveLength(0);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws).toHaveLength(503);
  expect(f.deltas).toHaveLength(1);
  expect(f.errors).not.toHaveBeenCalled();
});

it("announces a slow valid prefix nonfatally and clears its status only on completion or owner cleanup", async () => {
  const f = await fixture();
  await vi.advanceTimersByTimeAsync(4_992);
  expect(f.pending).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(32);
  expect(f.pending).toHaveBeenCalledExactlyOnceWith(true);
  expect(f.errors).not.toHaveBeenCalled();
  await frame();
  expect(f.deltas).toHaveLength(0);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(f.pending.mock.calls.map(([value]) => value)).toEqual([true, false]);
  await frame();
  await vi.advanceTimersByTimeAsync(5_024);
  expect(f.pending.mock.calls.at(-1)).toEqual([true]);
  releases.pop()!();
  expect(f.pending.mock.calls.at(-1)).toEqual([false]);
  const calls = f.pending.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(f.pending).toHaveBeenCalledTimes(calls);
});

it("connects the mounted admission component's pending-status callback to its live owner", async () => {
  const f = await fixture({ component: true });
  await vi.advanceTimersByTimeAsync(5_024);
  expect(f.pending).toHaveBeenCalledExactlyOnceWith(true);
  await act(async () => f.root.unmount());
  expect(f.pending.mock.calls.at(-1)).toEqual([false]);
});

it("preserves elapsed clock time while exposing the existing camera and paint interpolation cap on slow admitted frames", async () => {
  const material = new THREE.MeshStandardMaterial({ color: "#000000" });
  releases.push(() => material.dispose());
  const alphas: number[] = [];
  let cameraProgress = 0;
  let paintSettled = false;
  const f = await fixture({
    step: (state, delta) => {
      const alpha = interpolationAlpha(delta, false);
      alphas.push(alpha);
      cameraProgress += (1 - cameraProgress) * alpha;
      paintSettled = stepVehicleAppearance(
        [{ material, role: "paint" }],
        "#ffffff",
        false,
        delta,
        false,
      );
      state.invalidate();
    },
  });
  f.complete();
  await frame();
  for (let index = 0; index < 5; index++) {
    await vi.advanceTimersByTimeAsync(3_500);
    f.complete();
    await frame();
  }
  expect(f.deltas.slice(1)).toEqual([3.5, 3.5, 3.5, 3.5, 3.5]);
  expect(alphas.slice(1)).toEqual(
    Array(5).fill(interpolationAlpha(0.1, false)),
  );
  expect(cameraProgress).toBeLessThan(0.98);
  expect(material.color.r).toBeCloseTo(cameraProgress);
  expect(paintSettled).toBe(false);
  // 17.5s of synthetic wall time has not become 17.5s of interpolation. This
  // documents the unchanged caller behavior; the gate must not alter it covertly.
});

it.each([false, true])(
  "a clamped keyboard action avoids fresh work and preserves existing demand: pending=%s",
  async (pending) => {
    const f = await fixture();
    const camera = f.state.camera as import("three").PerspectiveCamera;
    camera.position.set(4.275, 1.8675, 5.1);
    const controls = new OrbitControls(camera);
    controls.target.set(0, 0.72, 0);
    controls.minDistance = 2.7;
    controls.maxDistance = 12;
    controls.update();
    controls.addEventListener("change", () => f.state.invalidate());
    const disconnect = connectExteriorKeyboard({
      canvas: f.renderer.domElement,
      camera,
      controls,
      onManual() {},
      onReset() {},
      invalidate: f.state.invalidate,
    });
    releases.push(() => {
      disconnect();
      controls.dispose();
    });
    const key = () =>
      f.renderer.domElement.dispatchEvent(
        new KeyboardEvent("keydown", { key: "+", cancelable: true }),
      );
    for (let index = 0; index < 40; index++) key();
    f.complete();
    await frame();
    f.complete();
    await act(async () => vi.advanceTimersByTimeAsync(16));
    await frame();
    expect(f.state.internal.frames).toBe(0);
    const count = f.draws.length;
    const baseline = camera.position.toArray();
    if (pending) f.input(42);
    key();
    key();
    await frame();
    expect(camera.position.toArray()).toEqual(baseline);
    expect(f.draws).toHaveLength(count + (pending ? 1 : 0));
    if (pending) expect(f.draws.at(-1)).toBe(42);
  },
);
