// @vitest-environment jsdom
import { useLayoutEffect, useRef } from "react";
import { createRequire } from "node:module";
import { act, createRoot, extend, _roots } from "@react-three/fiber";
import { expect, it, vi } from "vitest";
import { Material, PlaneGeometry, type Mesh, type WebGLRenderer } from "three";
import { WebGLPrograms } from "three/src/renderers/webgl/WebGLPrograms.js";
import { WebGLAttributes } from "three/src/renderers/webgl/WebGLAttributes.js";
import { WebGLGeometries } from "three/src/renderers/webgl/WebGLGeometries.js";
import { WebGLProperties } from "three/src/renderers/webgl/WebGLProperties.js";
import { prepareAsyncRendererDisposal } from "../src/components/three/asyncRendererDisposal";
import {
  prepareRendererResourceOwnership,
  registerRendererResourceOwner,
  releaseRendererResourceOwners,
  releaseRemainingRendererPrograms,
  disposeOwnedResources,
} from "../src/components/three/rendererResourceOwnership";

// The real installed program cache, shader/program constructor and material
// event behavior; only the native device is replaced. No server or WebGL IO.
function fixture() {
  type Handle = {
    kind: string;
    deleted: number;
    marked: boolean;
    alive: boolean;
    deletedLive: boolean;
    shaders: Handle[];
  };
  const handles: Handle[] = [],
    errors: string[] = [],
    order: string[] = [];
  let lost = false;
  const create = (kind: string) => {
    const h = {
      kind,
      deleted: 0,
      marked: false,
      alive: true,
      deletedLive: false,
      shaders: [],
    };
    handles.push(h);
    return h;
  };
  const gl = {
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    DELETE_STATUS: 3,
    ACTIVE_UNIFORMS: 4,
    ACTIVE_ATTRIBUTES: 5,
    createProgram: () => create("program"),
    createShader: () => create("shader"),
    createBuffer: () => create("buffer"),
    deleteBuffer: (h: Handle) => {
      if (!h.alive) errors.push("duplicate buffer delete");
      h.deleted++;
      h.deletedLive = !lost;
      h.alive = false;
    },
    bindBuffer() {},
    bufferData() {},
    bufferSubData() {},
    ARRAY_BUFFER: 10,
    ELEMENT_ARRAY_BUFFER: 11,
    FLOAT: 12,
    UNSIGNED_SHORT: 13,
    shaderSource() {},
    compileShader() {},
    linkProgram() {},
    attachShader: (p: Handle, s: Handle) => p.shaders.push(s),
    isContextLost: () => lost,
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
    ALREADY_SIGNALED: 0x911a,
    CONDITION_SATISFIED: 0x911c,
    TIMEOUT_EXPIRED: 0x911b,
    fenceSync: () => ({}),
    flush() {},
    clientWaitSync: () => 0x911a,
    deleteSync() {
      order.push("sync");
    },
    isShader: (s: Handle) => !!s?.alive && s.kind === "shader",
    getShaderParameter: (s: Handle, name: number) => {
      if (!s?.alive || name !== 3) {
        errors.push("invalid shader query");
        return null;
      }
      return s.marked;
    },
    deleteShader: (s: Handle) => {
      if (!s.alive || s.marked) errors.push("duplicate/invalid shader delete");
      s.deleted++;
      s.marked = true;
    },
    deleteProgram: (p: Handle) => {
      if (!p.alive) errors.push("duplicate program delete");
      p.deleted++;
      p.alive = false;
      order.push("program");
      for (const s of p.shaders) if (s.marked) s.alive = false;
    },
    getProgramParameter: (_p: Handle, name: number) =>
      name === 4 || name === 5 ? 0 : true,
  };
  const properties = new WebGLProperties();
  const renderer = {
    isWebGLRenderer: true,
    render() {},
    setPixelRatio() {},
    setSize() {},
    getPixelRatio: () => 1,
    shadowMap: { enabled: false },
    xr: {
      enabled: false,
      isPresenting: false,
      addEventListener() {},
      removeEventListener() {},
    },
    forceContextLoss() {
      lost = true;
      order.push("context loss");
    },
    getContext: () => gl,
    debug: { checkShaderErrors: false },
    properties,
    info: { programs: [] as any[], memory: { geometries: 0 } },
    domElement: document.createElement("canvas"),
    compile: undefined as any,
    dispose: undefined as any,
  };
  const cache = new (WebGLPrograms as any)(
    renderer,
    {},
    {},
    {},
    {},
    { releaseStatesOfProgram() {} },
    {},
  );
  renderer.info.programs = cache.programs;
  let failCompile = false;
  renderer.compile = (material: Material) => {
    const program = cache.acquireProgram(
      {
        isRawShaderMaterial: true,
        vertexShader: "void main() {}",
        fragmentShader: "void main() {}",
        shaderType: "RawShaderMaterial",
        shaderName: "fixture",
        defines: {},
        rendererExtensionParallelShaderCompile: false,
      },
      "shared",
    );
    (properties.get(material) as { programs?: Map<string, any> }).programs =
      new Map([["shared", program]]);
    const release = () => {
      material.removeEventListener("dispose", release);
      for (const p of (
        properties.get(material) as { programs?: Map<string, any> }
      ).programs?.values() ?? [])
        cache.releaseProgram(p);
      properties.remove(material);
    };
    material.addEventListener("dispose", release);
    if (failCompile) throw new Error("compile failed after allocation");
    return new Set([material]);
  };
  renderer.dispose = () => {
    order.push("properties clear");
    properties.dispose();
    cache.dispose();
  };
  return {
    renderer: renderer as unknown as WebGLRenderer,
    native: renderer,
    gl,
    handles,
    errors,
    order,
    cache,
    failCompile: () => {
      failCompile = true;
    },
  };
}
function assertDeleted(f: ReturnType<typeof fixture>) {
  expect(f.errors).toEqual([]);
  expect(
    f.handles
      .filter((h) => h.kind !== "buffer")
      .map((h) => [h.kind, h.deleted]),
  ).toEqual([
    ["program", 1],
    ["shader", 1],
    ["shader", 1],
  ]);
}
function compile(f: ReturnType<typeof fixture>, material: Material) {
  f.native.compile(material);
}

it("reproduces the original Three cache and compile-only shader deletion deficit", () => {
  const f = fixture(),
    m = new Material();
  compile(f, m);
  f.renderer.dispose();
  m.dispose();
  expect(f.handles.map((h) => h.deleted)).toEqual([0, 0, 0]);
  expect(f.renderer.info.programs).toHaveLength(1);
});
it.each([false, true])(
  "retires compile-only/rendered shared programs once (rendered=%s)",
  (rendered) => {
    const f = fixture(),
      a = new Material(),
      b = new Material();
    prepareRendererResourceOwnership(f.renderer);
    compile(f, a);
    compile(f, b);
    const p = f.renderer.info.programs![0];
    if (rendered) p.getUniforms(); // Real Three first-use shader deletion.
    a.dispose();
    expect(f.handles[0].deleted).toBe(0);
    b.dispose();
    assertDeleted(f);
    p.destroy();
    a.dispose();
    b.dispose();
    releaseRendererResourceOwners(f.renderer);
    f.renderer.dispose();
    releaseRemainingRendererPrograms(f.renderer);
    assertDeleted(f);
  },
);
it("protects a partially allocated program even when compile throws", () => {
  const f = fixture(),
    m = new Material();
  prepareRendererResourceOwnership(f.renderer);
  f.failCompile();
  expect(() => compile(f, m)).toThrow("compile failed after allocation");
  m.dispose();
  assertDeleted(f);
});
it("releases renderer-internal residual programs after property clear; late material/idle disposal is harmless", () => {
  const f = fixture(),
    m = new Material();
  prepareRendererResourceOwnership(f.renderer);
  compile(f, m);
  releaseRendererResourceOwners(f.renderer);
  f.renderer.dispose();
  releaseRemainingRendererPrograms(f.renderer);
  m.dispose();
  releaseRemainingRendererPrograms(f.renderer);
  assertDeleted(f);
  expect(f.order).toEqual(["properties clear", "program"]);
  expect(f.renderer.info.programs).toEqual([]);
});
it("does not query or delete already destroyed shaders", () => {
  const f = fixture(),
    m = new Material();
  prepareRendererResourceOwnership(f.renderer);
  compile(f, m);
  f.renderer.info.programs![0].getUniforms();
  for (const h of f.handles.filter((h) => h.kind === "shader")) h.alive = false;
  m.dispose();
  assertDeleted(f);
});
it("owns each helper generation, deduplicates shared resources and leaves a replacement renderer alone", () => {
  const f = fixture(),
    other = fixture();
  const geometry = new PlaneGeometry();
  const dispose = vi.spyOn(geometry, "dispose");
  const release = registerRendererResourceOwner(f.renderer, () =>
    disposeOwnedResources([geometry, geometry]),
  );
  release();
  release();
  expect(dispose).toHaveBeenCalledTimes(1);
  registerRendererResourceOwner(f.renderer, () =>
    disposeOwnedResources([geometry]),
  );
  const replacement = vi.fn();
  registerRendererResourceOwner(other.renderer, replacement);
  releaseRendererResourceOwners(f.renderer);
  releaseRendererResourceOwners(f.renderer);
  expect(dispose).toHaveBeenCalledTimes(2);
  expect(replacement).not.toHaveBeenCalled();
  const refusedRelease = vi.fn();
  expect(() =>
    registerRendererResourceOwner(f.renderer, refusedRelease),
  ).toThrow(/retired/);
  expect(refusedRelease).toHaveBeenCalledTimes(1);
  expect(() => compile(f, new Material())).toThrow(/retired/);
});
it("attempts every owner and native disposal when a release throws", async () => {
  const f = fixture(),
    later = vi.fn(),
    external = vi.fn();
  registerRendererResourceOwner(f.renderer, () => {
    throw new Error("bad owner");
  });
  registerRendererResourceOwner(f.renderer, later);
  prepareAsyncRendererDisposal(f.renderer, external);
  await expect(f.renderer.dispose()).rejects.toThrow(/resource release failed/);
  expect(later).toHaveBeenCalledTimes(1);
  expect(external).toHaveBeenCalledTimes(1);
  expect(f.order).toEqual(["properties clear"]);
});

it.each([false, true])(
  "installed Fiber deferred-idle red/green retirement (repaired=%s)",
  async (repaired) => {
    const require = createRequire(import.meta.url);
    const scheduler = require("scheduler"),
      THREE = require("three");
    extend({
      Mesh: THREE.Mesh,
      PlaneGeometry: THREE.PlaneGeometry,
      MeshBasicMaterial: THREE.MeshBasicMaterial,
    });
    const held: (() => void)[] = [];
    const schedule = scheduler.unstable_scheduleCallback;
    const spy = vi
      .spyOn(scheduler, "unstable_scheduleCallback")
      .mockImplementation((...args: unknown[]) => {
        const [priority, callback] = args;
        if (priority === scheduler.unstable_IdlePriority) {
          held.push(callback as () => void);
          return {};
        }
        return schedule(...args);
      });
    const f = fixture();
    const allocations = geometryAllocator(f);
    let root: ReturnType<typeof createRoot> | undefined;
    const previous = Object.getOwnPropertyDescriptor(
      globalThis,
      "IS_REACT_ACT_ENVIRONMENT",
    );
    function Scene() {
      const mesh = useRef<Mesh>(null);
      useLayoutEffect(() => {
        const value = mesh.current!,
          geometry = value.geometry;
        compile(f, value.material as Material);
        allocations.upload(value);
        return repaired
          ? registerRendererResourceOwner(f.renderer, () => geometry.dispose())
          : () => {};
      }, []);
      // Material deliberately remains Fiber-owned: its idle dispose runs after
      // Three properties have cleared. The renderer program owner covers it.
      return (
        <mesh ref={mesh}>
          <planeGeometry />
          <meshBasicMaterial />
        </mesh>
      );
    }
    try {
      if (repaired) prepareAsyncRendererDisposal(f.renderer);
      root = createRoot(f.renderer.domElement);
      await root.configure({
        gl: () => f.renderer,
        frameloop: "never",
        size: { width: 40, height: 40, top: 0, left: 0 },
      });
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      await act(async () => root!.render(<Scene />));
      Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
      root.unmount();
      for (let i = 0; i < 100 && !f.gl.isContextLost(); i++)
        await new Promise((done) => setTimeout(done, 5));
      expect(_roots.has(f.renderer.domElement)).toBe(false);
      expect(held.length).toBeGreaterThan(0);
      expect(f.gl.isContextLost()).toBe(true);
      const buffers = f.handles.filter((h) => h.kind === "buffer");
      expect(buffers).toHaveLength(4);
      if (repaired) {
        expect(buffers.every((b) => b.deleted === 1 && b.deletedLive)).toBe(
          true,
        );
        assertDeleted(f);
        expect(f.order).toEqual([
          "properties clear",
          "program",
          "sync",
          "context loss",
        ]);
      } else {
        expect(buffers.every((b) => b.deleted === 0)).toBe(true);
        expect(f.handles.every((h) => h.deleted === 0)).toBe(true);
        expect(f.order).toEqual(["properties clear", "context loss"]);
      }
      for (const callback of held) callback();
      expect(
        buffers.every((b) => b.deleted === 1 && b.deletedLive === repaired),
      ).toBe(true);
      if (repaired) assertDeleted(f);
      else
        expect(
          f.handles
            .filter((h) => h.kind !== "buffer")
            .every((h) => h.deleted === 0),
        ).toBe(true);
    } finally {
      for (const callback of held.splice(0)) callback();
      spy.mockRestore();
      if (previous)
        Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previous);
      else Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
      root?.unmount();
      vi.unstubAllGlobals();
    }
  },
);

function geometryAllocator(f: ReturnType<typeof fixture>) {
  const attributes = new (WebGLAttributes as any)(f.gl);
  const geometries = new (WebGLGeometries as any)(
    f.gl,
    attributes,
    f.native.info,
    { releaseStatesOfGeometry() {} },
  );
  return {
    upload(mesh: { geometry: PlaneGeometry | import("three").BufferGeometry }) {
      geometries.get(mesh, mesh.geometry);
      geometries.update(mesh.geometry);
      if (mesh.geometry.index)
        attributes.update(mesh.geometry.index, f.gl.ELEMENT_ARRAY_BUFFER);
    },
  };
}
it("reuploads the same helper after effect replay, and an old token cannot delete the new native generation", () => {
  const f = fixture(),
    allocator = geometryAllocator(f),
    geometry = new PlaneGeometry();
  allocator.upload({ geometry });
  const first = registerRendererResourceOwner(f.renderer, () =>
    disposeOwnedResources([geometry, geometry]),
  );
  first();
  allocator.upload({ geometry });
  const second = registerRendererResourceOwner(f.renderer, () =>
    disposeOwnedResources([geometry]),
  );
  first();
  expect(
    f.handles.filter((h) => h.kind === "buffer").map((h) => h.deleted),
  ).toEqual([1, 1, 1, 1, 0, 0, 0, 0]);
  second();
  releaseRendererResourceOwners(f.renderer);
  expect(
    f.handles.filter((h) => h.kind === "buffer").map((h) => h.deleted),
  ).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  expect(f.handles.every((h) => h.deletedLive)).toBe(true);
  expect(f.errors).toEqual([]);
});
