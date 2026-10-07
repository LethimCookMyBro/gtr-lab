import { beforeEach, expect, it } from "vitest";
import { useConfigurator } from "../src/stores/configurator";
const state = () => useConfigurator.getState();
beforeEach(() => {
  state().reset();
  useConfigurator.setState({ ready: true });
});
it("requires an explicit ready Premium request and ignores duplicate starts", () => {
  expect(state().cabin.phase).toBe("closed");
  state().beginCabin();
  const request = state().cabinRequest;
  expect(state().cabin).toMatchObject({ phase: "loading", request });
  state().beginCabin();
  expect(state().cabinRequest).toBe(request);
  state().selectVariant("nismo");
  useConfigurator.setState({ ready: true });
  state().beginCabin();
  expect(state().cabin.phase).toBe("closed");
});
it("preserves exterior policy during download and restores it after exit", () => {
  useConfigurator.setState({ autoRotate: true, cameraPreset: "rear" });
  state().beginCabin();
  const request = state().cabinRequest;
  expect(state().autoRotate).toBe(true);
  state().cabinReady(request);
  expect(state().cabin).toMatchObject({ phase: "active", seat: "driver" });
  expect(state().autoRotate).toBe(false);
  state().setCabinSeat("rear");
  expect(state().cabin).toMatchObject({ seat: "rear" });
  state().exitCabin(true);
  expect(state()).toMatchObject({
    autoRotate: true,
    cameraPreset: "rear",
    cabin: { phase: "closed" },
  });
});
it("ignores cancelled and older load callbacks, retries with a new identity", () => {
  state().beginCabin();
  const old = state().cabinRequest;
  state().exitCabin(true);
  state().cabinReady(old);
  expect(state().cabin.phase).toBe("closed");
  state().beginCabin();
  const next = state().cabinRequest;
  state().cabinFailed(old, "Old failure");
  expect(state().cabin.phase).toBe("loading");
  state().cabinFailed(next, "Missing cabin");
  expect(state().cabin).toMatchObject({
    phase: "error",
    message: "Missing cabin",
  });
  state().beginCabin();
  expect(state().cabinRequest).toBeGreaterThan(next);
  state().cabinProgress(next, { phase: "downloading", loadedBytes: 40 });
  expect(state().cabin).not.toMatchObject({ progress: { loadedBytes: 40 } });
});
it("does not resume rotation under reduced motion or after selecting another exterior preset", () => {
  useConfigurator.setState({ autoRotate: true });
  state().beginCabin();
  state().cabinReady(state().cabinRequest);
  state().exitCabin(false);
  expect(state().autoRotate).toBe(false);
  state().beginCabin();
  state().cabinReady(state().cabinRequest);
  state().setCamera("front");
  expect(state()).toMatchObject({
    cabin: { phase: "closed" },
    cameraPreset: "front",
    autoRotate: false,
  });
});
it.each(["loading", "active"] as const)(
  "clears a %s preview on model switch and ignores every late callback",
  (phase) => {
    state().beginCabin();
    const request = state().cabinRequest;
    if (phase === "active") state().cabinReady(request);
    state().selectVariant("nismo");
    state().cabinReady(request);
    state().cabinProgress(request, { phase: "preparing" });
    state().cabinFailed(request, "late error");
    expect(state()).toMatchObject({
      selectedVariant: "nismo",
      cabin: { phase: "closed" },
      ready: false,
      error: null,
      autoRotate: false,
    });
  },
);
