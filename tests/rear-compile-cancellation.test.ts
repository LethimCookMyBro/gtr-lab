import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Scene } from "three";
import type { WebGLRenderer } from "three";
import { compileRearScene } from "../src/components/home/compileRearScene";

// The GPU itself is unavailable in unit tests; browser regression coverage holds
// the real KHR completion query while the real loaded scene is skipped/unmounted.
function rendererFixture({ parallel = true, linked = true } = {}) {
  const complete = new Set<object>();
  let lost = false;
  let queries = 0;
  const vehicle = { program: {} as object | undefined };
  const studio = { program: {} as object | undefined };
  const renderer = {
    compile: () => new Set(),
    info: { programs: [vehicle, studio] },
    getContext: () => ({
      LINK_STATUS: 0x8b82,
      isContextLost: () => lost,
      getExtension: () => (parallel ? { COMPLETION_STATUS_KHR: 0x91b1 } : null),
      getProgramParameter: (program: object, name: number) => {
        queries++;
        expect([0x91b1, 0x8b82]).toContain(name);
        if (!renderer.info.programs.some((owner) => owner.program === program))
          throw new Error("Queried a deleted program");
        return name === 0x8b82 ? linked : complete.has(program);
      },
    }),
  };
  return {
    renderer,
    start: (signal: AbortSignal) =>
      compileRearScene(
        renderer as unknown as WebGLRenderer,
        new Scene(),
        new PerspectiveCamera(),
        signal,
      ),
    completeVehicle: () => complete.add(vehicle.program!),
    complete: () => {
      complete.add(vehicle.program!);
      complete.add(studio.program!);
    },
    dispose: () => {
      vehicle.program = undefined;
      studio.program = undefined;
      renderer.info.programs = [];
    },
    loseContext: () => {
      lost = true;
    },
    queries: () => queries,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("does not resolve until both the vehicle and studio shader programs finish", async () => {
  const fixture = rendererFixture();
  const abort = new AbortController();
  let finished = false;
  const result = fixture.start(abort.signal).then(() => {
    finished = true;
  });
  await vi.advanceTimersByTimeAsync(600);
  expect(finished).toBe(false);
  fixture.completeVehicle();
  await vi.advanceTimersByTimeAsync(30);
  expect(finished).toBe(false);
  fixture.complete();
  await vi.advanceTimersByTimeAsync(10);
  await result;
  expect(finished).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts before disposal without polling freed vehicle or studio programs", async () => {
  const fixture = rendererFixture();
  const abort = new AbortController();
  const result = fixture.start(abort.signal).catch((error) => error);
  await vi.advanceTimersByTimeAsync(600);
  abort.abort();
  fixture.dispose();
  const queries = fixture.queries();
  await vi.advanceTimersByTimeAsync(1000);
  expect((await result).name).toBe("AbortError");
  expect(fixture.queries()).toBe(queries);
  expect(vi.getTimerCount()).toBe(0);
});

it("reports a released program before querying its handle if another root cleans up first", async () => {
  const fixture = rendererFixture();
  const result = fixture
    .start(new AbortController().signal)
    .catch((error) => error);
  fixture.dispose();
  const queries = fixture.queries();
  await vi.advanceTimersByTimeAsync(20);
  expect((await result).message).toMatch(/resources were released/);
  expect(fixture.queries()).toBe(queries);
  expect(vi.getTimerCount()).toBe(0);
});

it("stops polling on context loss and reports the real preparation failure", async () => {
  const fixture = rendererFixture();
  const result = fixture
    .start(new AbortController().signal)
    .catch((error) => error);
  fixture.loseContext();
  const queries = fixture.queries();
  await vi.advanceTimersByTimeAsync(20);
  expect((await result).message).toMatch(/connection was interrupted/);
  expect(fixture.queries()).toBe(queries);
  expect(vi.getTimerCount()).toBe(0);
});

it("rejects exceptions from a later completion query without an uncaught timer error", async () => {
  const fixture = rendererFixture();
  const context = fixture.renderer.getContext();
  fixture.renderer.getContext = () => context;
  const result = fixture
    .start(new AbortController().signal)
    .catch((error) => error);
  context.getProgramParameter = () => {
    throw new Error("GPU query failed");
  };
  await vi.advanceTimersByTimeAsync(20);
  expect((await result).message).toBe("GPU query failed");
  expect(vi.getTimerCount()).toBe(0);
});

it("uses the synchronous compile fallback when parallel completion is unavailable", async () => {
  const fixture = rendererFixture({ parallel: false });
  await fixture.start(new AbortController().signal);
  expect(fixture.queries()).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});

it("does not start work for an already-aborted scene", async () => {
  const fixture = rendererFixture();
  fixture.renderer.compile = () => {
    throw new Error("Should not compile");
  };
  const abort = new AbortController();
  abort.abort();
  await expect(fixture.start(abort.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fixture.queries()).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([true, false])(
  "rejects completed but unlinked shaders with parallel compilation %s",
  async (parallel) => {
    const fixture = rendererFixture({ parallel, linked: false });
    fixture.complete();
    await expect(fixture.start(new AbortController().signal)).rejects.toThrow(
      /shader.*link/i,
    );
    expect(vi.getTimerCount()).toBe(0);
  },
);
