import { afterEach, expect, it, vi } from "vitest";
import {
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";
import { compileRearScene } from "../src/components/home/compileRearScene";
afterEach(() => vi.useRealTimers());
function fixture() {
  let complete = false;
  const own = { program: {} as object | undefined },
    other = { program: {} as object | undefined };
  const material = new MeshStandardMaterial();
  const get = vi.fn(() => ({ currentProgram: own }));
  const query = vi.fn((program: object, name: number) => {
    expect(program).toBe(own.program);
    return name === 2 || complete;
  });
  const renderer = {
    compile: () => new Set([material]),
    properties: { get },
    info: { programs: [own, other] },
    getContext: () => ({
      isContextLost: () => false,
      getExtension: () => ({ COMPLETION_STATUS_KHR: 1 }),
      LINK_STATUS: 2,
      getProgramParameter: query,
    }),
  };
  const start = () =>
    compileRearScene(
      renderer as unknown as WebGLRenderer,
      new Scene(),
      new PerspectiveCamera(),
      new AbortController().signal,
      new Scene(),
      "object",
    );
  return {
    renderer,
    own,
    other,
    get,
    query,
    start,
    complete: () => {
      complete = true;
    },
  };
}
it("keeps a healthy proxy barrier alive when a concurrent full cabin's programs are disposed", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const result = f.start();
  f.other.program = undefined;
  f.renderer.info.programs = [f.own];
  await vi.advanceTimersByTimeAsync(20);
  f.complete();
  await vi.advanceTimersByTimeAsync(10);
  await result;
  expect(f.get).toHaveBeenCalledTimes(1);
  expect(f.query).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("still rejects release of its own program without querying a deleted handle or material properties", async () => {
  vi.useFakeTimers();
  const f = fixture();
  const result = f.start().catch((error) => error);
  f.own.program = undefined;
  f.renderer.info.programs = [f.other];
  const calls = f.query.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10);
  expect((await result).message).toMatch(/resources were released/);
  expect(f.query).toHaveBeenCalledTimes(calls);
  expect(f.get).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
