import { expect, it, vi } from "vitest";
import {
  Color,
  Group,
  Scene,
  Mesh,
  MeshStandardMaterial,
  BoxGeometry,
  Texture,
  PerspectiveCamera,
  Vector4,
} from "three";
// Kept dynamic to report an absent new contract as a failing assertion first.
async function implementation() {
  const module =
    await import("../src/components/three/cabinPreparationSteps").catch(
      () => ({}),
    );
  expect(module).toHaveProperty("createCabinPreparationSteps");
  return module as typeof import("../src/components/three/cabinPreparationSteps");
}
function fixture() {
  const scene = new Scene(),
    cabin = new Group(),
    camera = new PerspectiveCamera();
  const material = new MeshStandardMaterial({ map: new Texture() });
  for (let i = 0; i < 10; i++) cabin.add(new Mesh(new BoxGeometry(), material));
  const exterior = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  scene.add(exterior);
  const nativeProgram = {},
    program = { program: nativeProgram };
  const viewport = new Vector4(12, 13, 800, 600),
    scissor = new Vector4(2, 3, 700, 500);
  let scissorTest = false,
    target: unknown = null,
    shaderReady = false,
    linked = true;
  const clearColor = new Color(0x123456);
  let clearAlpha = 0.4;
  const context = {
    isContextLost: () => false,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }),
    LINK_STATUS: 2,
    getProgramParameter: vi.fn((_p, parameter) =>
      parameter === 1 ? shaderReady : linked,
    ),
  };
  const gl = {
    info: { programs: [program] },
    properties: {
      get: () => ({
        programs: new Map([["front", program]]),
        currentProgram: program,
      }),
    },
    getContext: () => context,
    compile: vi.fn(() => new Set([material])),
    initTexture: vi.fn(),
    shadowMap: { autoUpdate: true, needsUpdate: true },
    autoClear: true,
    autoClearColor: false,
    autoClearDepth: true,
    autoClearStencil: false,
    getClearColor: (out: Color) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (value: Color, alpha: number) => {
      clearColor.copy(value);
      clearAlpha = alpha;
    },
    getViewport: (out: Vector4) => out.copy(viewport),
    setViewport: (...a: [Vector4] | [number, number, number, number]) =>
      viewport.copy(
        a[0] instanceof Vector4
          ? a[0]
          : new Vector4(...(a as [number, number, number, number])),
      ),
    getScissor: (out: Vector4) => out.copy(scissor),
    setScissor: (...a: [Vector4] | [number, number, number, number]) =>
      scissor.copy(
        a[0] instanceof Vector4
          ? a[0]
          : new Vector4(...(a as [number, number, number, number])),
      ),
    getScissorTest: () => scissorTest,
    setScissorTest: (value: boolean) => {
      scissorTest = value;
    },
    getRenderTarget: () => target,
    setRenderTarget: (value: unknown) => {
      target = value;
    },
    render: vi.fn(),
  };
  return {
    scene,
    cabin,
    camera,
    material,
    exterior,
    gl,
    context,
    program,
    shaderReady: () => {
      shaderReady = true;
    },
    failLink: () => {
      linked = false;
    },
    state: () => ({
      viewport: viewport.toArray(),
      scissor: scissor.toArray(),
      scissorTest,
      target,
      autoClear: gl.autoClear,
      clearColor: clearColor.toArray(),
      clearAlpha,
      clearFlags: [gl.autoClearColor, gl.autoClearDepth, gl.autoClearStencil],
      shadows: { ...gl.shadowMap },
    }),
  };
}
it("creates bounded object-dependent compile and geometry steps with exactly one unique texture upload", async () => {
  const { createCabinPreparationSteps } = await implementation(),
    f = fixture();
  const steps = createCabinPreparationSteps(
    f.gl as any,
    f.scene,
    f.camera,
    { scene: f.cabin } as any,
    { scale: 2, position: [1, 2, 3] } as any,
  );
  expect(steps.filter((x) => x.kind === "compile").length).toBeGreaterThan(1);
  expect(steps.filter((x) => x.kind === "geometry").length).toBeGreaterThan(1);
  expect(steps.filter((x) => x.kind === "texture")).toHaveLength(1);
  for (const step of steps.filter((x) => x.kind === "compile")) step.run();
  expect(f.gl.compile).toHaveBeenCalledTimes(10);
  for (const step of steps.filter((x) => x.kind === "texture")) step.run();
  expect(f.gl.initTexture).toHaveBeenCalledTimes(1);
});
it("waits for independent KHR completion and validates all live program handles", async () => {
  const { createCabinPreparationSteps } = await implementation(),
    f = fixture();
  const step = createCabinPreparationSteps(
    f.gl as any,
    f.scene,
    f.camera,
    { scene: f.cabin } as any,
    { scale: 1, position: [0, 0, 0] } as any,
  ).find((x) => x.kind === "compile")!;
  const ticket = step.run()!;
  expect(ticket.poll()).toBe(false);
  expect(f.context.getProgramParameter.mock.calls.some((x) => x[1] === 2)).toBe(
    false,
  );
  f.shaderReady();
  expect(ticket.poll()).toBe(true);
  f.failLink();
  expect(() => ticket.poll()).toThrow(/link/i);
  f.program.program = null as any;
  expect(() => ticket.poll()).toThrow(/released|missing/i);
});
it.each([false, true])(
  "restores renderer, scene, ownership and mesh state after a bounded warm draw; throw=%s",
  async (throws) => {
    const { createCabinPreparationSteps } = await implementation(),
      f = fixture(),
      before = f.state();
    const background = new Texture();
    f.scene.background = background;
    const meshes = [...f.cabin.children] as Mesh[],
      beforeFlags = meshes.map((x) => [x.visible, x.frustumCulled]);
    f.gl.render.mockImplementation((scene, camera) => {
      expect(scene).toBe(f.scene);
      expect(camera).toBe(f.camera);
      expect(f.exterior.visible).toBe(false);
      expect(meshes.filter((x) => x.visible).length).toBeLessThanOrEqual(4);
      expect(
        meshes.filter((x) => x.visible).every((x) => !x.frustumCulled),
      ).toBe(true);
      expect(f.state().viewport.slice(2)).toEqual([1, 1]);
      expect(f.state().scissorTest).toBe(true);
      expect(f.gl.shadowMap.autoUpdate).toBe(false);
      expect(f.gl.shadowMap.needsUpdate).toBe(false);
      expect(f.scene.background).toBeNull();
      expect(f.cabin.parent?.position.toArray()).toEqual([1, 2, 3]);
      f.gl.setClearColor(new Color(0), 0);
      f.gl.autoClearColor = true;
      f.gl.autoClearDepth = false;
      f.gl.autoClearStencil = true;
      if (throws) throw new Error("injected render error");
    });
    const step = createCabinPreparationSteps(
      f.gl as any,
      f.scene,
      f.camera,
      { scene: f.cabin } as any,
      { scale: 2, position: [1, 2, 3] } as any,
    ).find((x) => x.kind === "geometry")!;
    if (throws) expect(() => step.run()).toThrow("injected render error");
    else step.run();
    expect(f.state()).toEqual(before);
    expect(f.exterior.visible).toBe(true);
    expect(meshes.map((x) => [x.visible, x.frustumCulled])).toEqual(
      beforeFlags,
    );
    expect(f.cabin.parent).toBeNull();
    expect(f.scene.background).toBe(background);
  },
);

it("checks every transparent/object permutation rather than only the last currentProgram", async () => {
  const { createCabinPreparationSteps } = await implementation(),
    f = fixture();
  const other = { program: {} };
  f.gl.info.programs.push(other);
  f.gl.properties.get = () => ({
    programs: new Map([
      ["back", other],
      ["front", f.program],
    ]),
    currentProgram: f.program,
  });
  f.context.getProgramParameter.mockImplementation((program, parameter) =>
    parameter === 1 ? program !== other.program : true,
  );
  const ticket = createCabinPreparationSteps(
    f.gl as any,
    f.scene,
    f.camera,
    { scene: f.cabin } as any,
    { scale: 1, position: [0, 0, 0] } as any,
  )[0].run()!;
  expect(ticket.poll()).toBe(false);
  f.context.getProgramParameter.mockImplementation(() => true);
  expect(ticket.poll()).toBe(true);
});
it("times out only a still-pending shader link, never an already linked batch", async () => {
  vi.useFakeTimers({ toFake: ["performance"] });
  try {
    const { createCabinPreparationSteps } = await implementation(),
      f = fixture();
    const ticket = createCabinPreparationSteps(
      f.gl as any,
      f.scene,
      f.camera,
      { scene: f.cabin } as any,
      { scale: 1, position: [0, 0, 0] } as any,
    )[0].run()!;
    expect(ticket.poll()).toBe(false);
    vi.advanceTimersByTime(30_001);
    expect(() => ticket.poll()).toThrow(/shader.*too long/i);
    f.shaderReady();
    expect(ticket.poll()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

it("does not charge native-prefix time before the first link poll to the shader deadline", async () => {
  vi.useFakeTimers({ toFake: ["performance"] });
  try {
    const { createCabinPreparationSteps } = await implementation(),
      f = fixture();
    const ticket = createCabinPreparationSteps(
      f.gl as any,
      f.scene,
      f.camera,
      { scene: f.cabin } as any,
      { scale: 1, position: [0, 0, 0] } as any,
    )[0].run()!;
    vi.advanceTimersByTime(45_000);
    expect(ticket.poll()).toBe(false);
    f.shaderReady();
    expect(ticket.poll()).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
