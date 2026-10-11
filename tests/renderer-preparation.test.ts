import { afterEach, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import {
  awaitCompletedMain,
  createRendererPreparationOwner,
  enqueueRendererPreparation,
} from "../src/components/three/rendererPreparation";
const releases: (() => void)[] = [];
afterEach(() => releases.splice(0).forEach((release) => release()));
function fixture() {
  const renderer = {} as WebGLRenderer;
  const wake = vi.fn();
  const owner = createRendererPreparationOwner(renderer, wake);
  releases.push(() => owner.dispose());
  return { renderer, owner, wake };
}
function observed<T>(promise: Promise<T>) {
  const state = {
    status: "pending" as "pending" | "resolved" | "rejected",
    value: undefined as T | undefined,
    error: undefined as unknown,
  };
  void promise.then(
    (value) => {
      state.status = "resolved";
      state.value = value;
    },
    (error) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return state;
}
const signal = () => new AbortController().signal;
const sync = () => ({}) as WebGLSync;
it.each(["run", "poll", "before", "after", "completion"])(
  "throw undefined in %s must reject, never resolve",
  async (stage) => {
    const f = fixture();
    if (stage === "run" || stage === "poll") {
      const result = observed(
        enqueueRendererPreparation(f.renderer, {
          signal: signal(),
          run: () => {
            if (stage === "run") throw undefined;
            return {
              poll: () => {
                throw undefined;
              },
            };
          },
        }),
      );
      f.owner.runNext();
      const s = sync();
      f.owner.seal(s, null);
      f.owner.completed(s);
      f.owner.poll();
      await Promise.resolve();
      expect(result.status).toBe("rejected");
    } else {
      let count = 0;
      const failAt = stage === "before" ? 1 : stage === "after" ? 2 : 3;
      const result = observed(
        awaitCompletedMain(f.renderer, {
          signal: signal(),
          stamp: () => {
            if (++count === failAt) throw undefined;
            return "view";
          },
        }),
      );
      f.owner.afterMain(f.owner.beforeMain(), true);
      const s = sync();
      f.owner.seal(s, null);
      f.owner.completed(s);
      await Promise.resolve();
      expect(result.status).toBe("rejected");
    }
  },
);
it("preparation queued during main render prevents the captured token from binding", async () => {
  const f = fixture();
  const result = observed(
    awaitCompletedMain(f.renderer, { signal: signal(), stamp: () => "view" }),
  );
  const token = f.owner.beforeMain();
  const prep = observed(
    enqueueRendererPreparation(f.renderer, { signal: signal(), run: () => {} }),
  );
  f.owner.afterMain(token, true);
  const s = sync();
  f.owner.seal(s, null);
  f.owner.completed(s);
  await Promise.resolve();
  expect(result.status).toBe("pending");
  f.owner.runNext();
  const p = sync();
  f.owner.seal(p, null);
  f.owner.completed(p);
  f.owner.poll();
  await Promise.resolve();
  expect(prep.status).toBe("resolved");
  f.owner.afterMain(f.owner.beforeMain(), true);
  const main = sync();
  f.owner.seal(main, null);
  f.owner.completed(main);
  await Promise.resolve();
  expect(result.status).toBe("resolved");
});
it.each(["before", "after"])(
  "preparation queued in %s stamp cannot bind an old main",
  async (stage) => {
    const f = fixture();
    let count = 0;
    let prep: ReturnType<typeof observed<void>> | undefined;
    const result = observed(
      awaitCompletedMain(f.renderer, {
        signal: signal(),
        stamp: () => {
          if (++count === (stage === "before" ? 1 : 2))
            prep = observed(
              enqueueRendererPreparation(f.renderer, {
                signal: signal(),
                run: () => {},
              }),
            );
          return "view";
        },
      }),
    );
    f.owner.afterMain(f.owner.beforeMain(), true);
    const s = sync();
    f.owner.seal(s, null);
    f.owner.completed(s);
    await Promise.resolve();
    expect(result.status).toBe("pending");
    expect(prep?.status).toBe("pending");
  },
);
it("aborting from the after stamp does not leave a cancelled ticket owned", async () => {
  const f = fixture();
  const abort = new AbortController();
  let count = 0;
  const result = observed(
    awaitCompletedMain(f.renderer, {
      signal: abort.signal,
      stamp: () => {
        if (++count === 2) abort.abort();
        return "view";
      },
    }),
  );
  f.owner.afterMain(f.owner.beforeMain(), true);
  const s = sync();
  f.owner.seal(s, null);
  f.owner.completed(s);
  await Promise.resolve();
  expect(result.status).toBe("rejected");
  expect(count).toBe(2);
  expect(f.owner.hasMainWaiters()).toBe(false);
});
it("registration, reset, restore and replacement preserve owner isolation", async () => {
  const f = fixture();
  expect(() => createRendererPreparationOwner(f.renderer, () => {})).toThrow();
  const old = observed(
    awaitCompletedMain(f.renderer, { signal: signal(), stamp: () => "old" }),
  );
  f.owner.reset(new Error("lost"));
  f.owner.restore();
  const next = observed(
    awaitCompletedMain(f.renderer, { signal: signal(), stamp: () => "new" }),
  );
  f.owner.afterMain(f.owner.beforeMain(), true);
  const s = sync();
  f.owner.seal(s, null);
  f.owner.completed(s);
  await Promise.resolve();
  expect(old.status).toBe("rejected");
  expect(next.value?.stamp).toBe("new");
  expect(f.wake).not.toHaveBeenCalled();
  f.owner.dispose();
  await expect(
    awaitCompletedMain(f.renderer, { signal: signal(), stamp: () => "view" }),
  ).rejects.toThrow();
  const replacement = createRendererPreparationOwner(f.renderer, () => {});
  releases.push(() => replacement.dispose());
  f.owner.dispose();
  const p = observed(
    awaitCompletedMain(f.renderer, {
      signal: signal(),
      stamp: () => "replacement",
    }),
  );
  replacement.afterMain(replacement.beforeMain(), true);
  const n = sync();
  replacement.seal(n, null);
  replacement.completed(n);
  await Promise.resolve();
  expect(p.value?.stamp).toBe("replacement");
});
