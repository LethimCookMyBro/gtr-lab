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

import {
  enqueueRendererPreparation,
  awaitCompletedMain,
} from "../src/components/three/rendererPreparation";

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
    DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
    getParameter: vi.fn((): unknown => null),
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
    getRenderTarget: () => null,
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

it("retains queued demand across never mode while fences and other roots keep the native loop alive", async () => {
  const f = await fixture({ component: true });
  const other = await fixture({ paced: false });
  other.state.setFrameloop("always");
  f.complete();
  await frame();
  expect(f.draws).toEqual([0]);
  f.input(1);
  f.state.setFrameloop("never");
  await frame();
  expect(f.draws).toEqual([0]);
  expect(f.deltas).toHaveLength(1);
  expect(f.state.internal.frames).toBe(1);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(32));
  for (const input of [2, 3, 4]) {
    f.input(input);
    await frame();
  }
  expect(f.draws).toEqual([0]);
  expect(f.deltas).toHaveLength(1);
  expect(f.state.internal.frames).toBe(1);
  f.state.setFrameloop("demand");
  f.state.invalidate();
  await frame();
  expect(f.draws).toEqual([0, 4]);
  expect(f.errors).not.toHaveBeenCalled();
});

it("leaves ordinary always-mode rendering ungated and resumes admission for demand", async () => {
  const f = await fixture({ component: true });
  f.state.setFrameloop("always");
  for (let index = 0; index < 3; index++) await frame();
  expect(f.draws).toHaveLength(3);
  expect(f.deltas).toHaveLength(3);
  f.input(7);
  f.state.setFrameloop("demand");
  await frame();
  expect(f.draws).toHaveLength(3);
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.draws).toEqual([0, 0, 0, 7]);
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

async function idle(f: Awaited<ReturnType<typeof fixture>>) {
  f.complete();
  await frame();
  f.complete();
  await act(async () => vi.advanceTimersByTimeAsync(16));
  await frame();
  expect(f.state.internal.frames).toBe(0);
}
function observed<T>(promise: Promise<T>) {
  const events: { value?: T; error?: unknown; done?: boolean } = {};
  void promise.then(
    (value) => Object.assign(events, { value, done: true }),
    (error) => Object.assign(events, { error, done: true }),
  );
  return events;
}
it("preparation wakes an idle owner without fabricating a main tick and requires a positive native fence", async () => {
  const f = await fixture();
  await idle(f);
  const draws = f.draws.length,
    count = f.syncs.length;
  const run = vi.fn();
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run,
    }),
  );
  expect(run).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(16);
  expect(run).toHaveBeenCalledTimes(1);
  expect(f.draws).toHaveLength(draws);
  expect(f.state.internal.frames).toBe(0);
  expect(f.syncs).toHaveLength(count + 1);
  expect(result.done).toBeUndefined();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result).toEqual({ value: undefined, done: true });
});
it("native completion and asynchronous link completion are independent preparation barriers", async () => {
  const f = await fixture();
  await idle(f);
  let linked = false;
  const poll = vi.fn(() => linked);
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => ({ poll }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  expect(poll).not.toHaveBeenCalled();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(poll).toHaveBeenCalled();
  expect(result.done).toBeUndefined();
  linked = true;
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBe(true);
  expect(result.error).toBeUndefined();
});
it("normal demand gets priority and nested preparation renders seal exactly one complete batch", async () => {
  const f = await fixture();
  await idle(f);
  const count = f.syncs.length;
  const run = vi.fn(() => {
    for (let i = 0; i < 3; i++)
      f.renderer.render(new THREE.Scene(), f.state.camera);
  });
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run,
    }),
  );
  f.input(1);
  await vi.advanceTimersByTimeAsync(16);
  expect(run).not.toHaveBeenCalled();
  await frame();
  expect(f.draws.at(-1)).toBe(1);
  expect(f.syncs).toHaveLength(count + 1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(run).toHaveBeenCalledTimes(1);
  expect(f.syncs).toHaveLength(count + 2);
  await Promise.resolve();
  expect(f.syncs).toHaveLength(count + 2);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBe(true);
});
it("abort removes queued work and stops link queries while retaining the native in-flight fence", async () => {
  const f = await fixture();
  await idle(f);
  const abort = new AbortController();
  const poll = vi.fn(() => false);
  const first = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: abort.signal,
      run: () => ({ poll }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  const native = f.syncs.at(-1);
  abort.abort();
  await Promise.resolve();
  expect(first.error).toMatchObject({ name: "AbortError" });
  const next = vi.fn();
  const second = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: next,
    }),
  );
  await vi.advanceTimersByTimeAsync(48);
  expect(next).not.toHaveBeenCalled();
  expect(poll).not.toHaveBeenCalled();
  expect(f.syncs.at(-1)).toBe(native);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(next).toHaveBeenCalledTimes(1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(second.done).toBe(true);
  const queuedAbort = new AbortController(),
    never = vi.fn();
  const third = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: queuedAbort.signal,
      run: never,
    }),
  );
  queuedAbort.abort();
  await vi.advanceTimersByTimeAsync(32);
  expect(never).not.toHaveBeenCalled();
  expect(third.error).toMatchObject({ name: "AbortError" });
});
it("a throwing preparation step seals partial work but preserves the usable renderer", async () => {
  const f = await fixture();
  await idle(f);
  const count = f.syncs.length;
  const error = new Error("optional shader failed");
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => {
        throw error;
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  expect(result.error).toBe(error);
  expect(f.syncs).toHaveLength(count + 1);
  expect(f.errors).not.toHaveBeenCalled();
  f.input(7);
  await frame();
  expect(f.draws.at(-1)).not.toBe(7);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  await frame();
  expect(f.draws.at(-1)).toBe(7);
});
it("main readiness requires a fresh successful root/default-target draw and its completed fence", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver-generation-1",
    }),
  );
  f.renderer.render(new THREE.Scene(), f.state.camera);
  await Promise.resolve();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBeUndefined();
  f.state.invalidate();
  await frame();
  expect(result.done).toBeUndefined();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.value).toMatchObject({ stamp: "driver-generation-1" });
  expect(result.value!.completedAt).toBeGreaterThanOrEqual(
    result.value!.submittedAt,
  );
});
it("a main certificate cannot survive changed state, aborted generation, or context restoration", async () => {
  const f = await fixture();
  await idle(f);
  let stamp = "driver-1";
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => stamp,
    }),
  );
  f.state.invalidate();
  await frame();
  stamp = "driver-2";
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.error).toBeInstanceOf(Error);
  const abort = new AbortController(),
    cancelled = observed(
      awaitCompletedMain(f.renderer, {
        signal: abort.signal,
        stamp: () => stamp,
      }),
    );
  abort.abort();
  await Promise.resolve();
  expect(cancelled.error).toMatchObject({ name: "AbortError" });
  const old = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => stamp,
    }),
  );
  f.state.invalidate();
  await frame();
  f.lose();
  f.restore();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(old.error).toBeInstanceOf(Error);
  expect(old.value).toBeUndefined();
});
it("superseding offscreen work carries main completion forward without accepting the old fence", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  f.state.invalidate();
  await frame();
  const old = f.syncs.at(-1)!;
  const target = new THREE.WebGLRenderTarget(1, 1);
  f.renderer.getRenderTarget = () => target;
  f.renderer.render(new THREE.Scene(), f.state.camera);
  f.renderer.getRenderTarget = () => null;
  await Promise.resolve();
  old.status = f.context.ALREADY_SIGNALED;
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBeUndefined();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.value?.stamp).toBe("driver");
});

it("preparation-owned default-framebuffer draws never certify a main presentation", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  const prep = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => f.renderer.render(f.state.scene, f.state.camera),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(prep.done).toBe(true);
  expect(result.done).toBeUndefined();
  f.state.invalidate();
  await frame();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.value?.stamp).toBe("driver");
});
it("queued preparation invalidates an earlier submitted main certificate", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  f.state.invalidate();
  await frame();
  const prep = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => {},
    }),
  );
  await Promise.resolve();
  expect(result.error).toBeInstanceOf(Error);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(prep.done).toBe(true);
});
it("a foreign default-framebuffer write rejects a previously submitted main", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  f.state.invalidate();
  await frame();
  f.renderer.render(new THREE.Scene(), f.state.camera);
  await Promise.resolve();
  expect(result.error).toBeInstanceOf(Error);
});
it("native loss during the completion query cannot resolve a preparation ticket", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => {},
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.context.clientWaitSync.mockImplementationOnce(() => {
    f.loseSilently();
    return f.context.ALREADY_SIGNALED;
  });
  await vi.advanceTimersByTimeAsync(16);
  expect(result.error).toBeInstanceOf(Error);
  expect(result.value).toBeUndefined();
});
it("an inactive root cannot complete presentation after it is retired", async () => {
  const f = await fixture();
  await idle(f);
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  f.state.invalidate();
  await frame();
  f.state.internal.active = false;
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.error).toBeInstanceOf(Error);
  f.state.internal.active = true;
});
it("a link-check failure rejects optional preparation without losing normal demand", async () => {
  const f = await fixture();
  await idle(f);
  const error = new Error("link failed");
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => ({
        poll: () => {
          throw error;
        },
      }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.error).toBe(error);
  expect(f.errors).not.toHaveBeenCalled();
  f.input(13);
  await frame();
  expect(f.draws.at(-1)).toBe(13);
});
it("abort after fence completion prevents all later program polling", async () => {
  const f = await fixture();
  await idle(f);
  const signal = new AbortController(),
    poll = vi.fn(() => false);
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: signal.signal,
      run: () => ({ poll }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(poll).toHaveBeenCalledTimes(1);
  signal.abort();
  await vi.advanceTimersByTimeAsync(100);
  expect(poll).toHaveBeenCalledTimes(1);
  expect(result.error).toMatchObject({ name: "AbortError" });
});
it("main stamp callback failures remain local and await alone creates no frames or timers", async () => {
  const f = await fixture();
  await idle(f);
  const count = vi.getTimerCount(),
    draws = f.draws.length;
  const error = new Error("stamp invalid");
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => {
        throw error;
      },
    }),
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(f.draws).toHaveLength(draws);
  expect(vi.getTimerCount()).toBe(count);
  f.input(1);
  await frame();
  expect(result.error).toBe(error);
  expect(f.errors).not.toHaveBeenCalled();
});
it("a changed stamp inside submission cannot satisfy the ticket until a later stable main", async () => {
  const f = await fixture();
  await idle(f);
  let n = 0;
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => (++n === 1 ? "old" : "new"),
    }),
  );
  f.input(1);
  await frame();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBeUndefined();
  f.input(2);
  await frame();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.value?.stamp).toBe("new");
});
it("preparation cannot commit a pending resize before its normal repaint tick", async () => {
  const f = await fixture({ component: true });
  await idle(f);
  const resized = vi.fn();
  f.renderer.setDrawingBufferSize = resized;
  const run = vi.fn();
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run,
    }),
  );
  f.state.setSize(180, 120);
  await vi.advanceTimersByTimeAsync(16);
  expect(resized).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
  await frame();
  expect(resized).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(run).toHaveBeenCalledTimes(1);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBe(true);
});
it("link polling survives a positive fence observed in an otherwise empty global RAF", async () => {
  const f = await fixture();
  await idle(f);
  let linked = false;
  const poll = vi.fn(() => linked);
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => ({ poll }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete(); // The installed global loop may still have an empty callback scheduled.
  const sibling = await fixture({ paced: false });
  sibling.state.invalidate();
  await frame(); // Only sibling draws; target completion is consumed by before-effect.
  expect(f.state.internal.frames).toBe(0);
  expect(f.syncs.at(-1)?.status).toBe(f.context.ALREADY_SIGNALED);
  expect(result.done).toBeUndefined();
  linked = true;
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBe(true);
});

it("functional evidence never labels preparation-owned tiny default draws as main", async () => {
  const events: { kind: string; draws?: number[] }[] = [];
  vi.stubGlobal("__gtrFunctionalCaptureObserver", (event: { kind: string }) =>
    events.push(event),
  );
  const f = await fixture();
  Object.assign(f.context, {
    DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
    getParameter: () => null,
  });
  await idle(f);
  events.length = 0;
  const prep = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => f.renderer.render(f.state.scene, f.state.camera),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(prep.done).toBe(true);
  expect(events.filter((e) => e.kind === "main")).toHaveLength(0);
  expect(events.some((e) => e.kind === "buffer-replaced")).toBe(true);
  expect(events.some((e) => e.kind === "invalid")).toBe(false);
  expect(events.find((e) => e.kind === "fence")?.draws).toEqual([]);
  f.input(1);
  await frame();
  expect(events.filter((e) => e.kind === "main")).toHaveLength(1);
});

it("inactive root stops KHR polling after the native fence has completed", async () => {
  const f = await fixture();
  await idle(f);
  const poll = vi.fn(() => false);
  const result = observed(
    enqueueRendererPreparation(f.renderer, {
      signal: new AbortController().signal,
      run: () => ({ poll }),
    }),
  );
  await vi.advanceTimersByTimeAsync(16);
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  const count = poll.mock.calls.length;
  f.state.internal.active = false;
  await vi.advanceTimersByTimeAsync(32);
  expect(poll).toHaveBeenCalledTimes(count);
  expect(result.error).toBeInstanceOf(Error);
  f.state.internal.active = true;
});
it("main proof checks the native default framebuffer and never queries it without waiters", async () => {
  const f = await fixture();
  await idle(f);
  expect(f.context.getParameter).not.toHaveBeenCalled();
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: new AbortController().signal,
      stamp: () => "driver",
    }),
  );
  f.context.getParameter.mockReturnValue({ foreign: true });
  f.input(1);
  await frame();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.done).toBeUndefined();
  f.context.getParameter.mockReturnValue(null);
  f.input(2);
  await frame();
  f.complete();
  await vi.advanceTimersByTimeAsync(16);
  expect(result.value?.stamp).toBe("driver");
});

it.each(["lost", "replaced"])(
  "a %s context after native completion stops KHR queries",
  async (kind) => {
    const f = await fixture();
    await idle(f);
    const poll = vi.fn(() => false);
    const result = observed(
      enqueueRendererPreparation(f.renderer, {
        signal: new AbortController().signal,
        run: () => ({ poll }),
      }),
    );
    await vi.advanceTimersByTimeAsync(16);
    f.complete();
    await vi.advanceTimersByTimeAsync(16);
    const count = poll.mock.calls.length;
    if (kind === "lost") f.loseSilently();
    else
      f.renderer.getContext = () =>
        ({ ...f.context }) as unknown as WebGL2RenderingContext;
    await vi.advanceTimersByTimeAsync(32);
    expect(poll).toHaveBeenCalledTimes(count);
    expect(result.error).toBeInstanceOf(Error);
  },
);
