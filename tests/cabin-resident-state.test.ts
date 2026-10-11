import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useConfigurator } from "../src/stores/configurator";
const state = () => useConfigurator.getState();
beforeEach(() => {
  state().reset();
  useConfigurator.setState({ ready: true });
});
it("prepares independently of entry and makes ready entry a synchronous view change", () => {
  expect(state().cabinPreparation).toEqual({ phase: "idle" });
  state().prepareCabin();
  const request = state().cabinRequest;
  expect(state().cabinPreparation).toMatchObject({ phase: "loading", request });
  expect(state().cabin.phase).toBe("closed");
  state().beginCabin();
  expect(state().cabin.phase).toBe("closed");
  state().cabinReady(request);
  expect(state().cabinPreparation).toEqual({ phase: "ready", request });
  expect(state().cabin.phase).toBe("closed");
  state().beginCabin();
  expect(state().cabin).toMatchObject({
    phase: "active",
    request,
    seat: "driver",
  });
});
it("keeps the same prepared identity on exit, exterior camera changes and reentry", () => {
  state().prepareCabin();
  state().cabinReady(state().cabinRequest);
  const prepared = state().cabinPreparation;
  if (prepared.phase !== "ready") throw new Error("Expected prepared cabin");
  useConfigurator.setState({ autoRotate: true, cameraPreset: "rear" });
  state().beginCabin();
  expect(state().autoRotate).toBe(false);
  state().exitCabin(true);
  expect(state().autoRotate).toBe(true);
  expect(state().cabinPreparation).toBe(prepared);
  state().setCamera("front");
  state().beginCabin();
  expect(state().cabinPreparation).toBe(prepared);
  expect(state().cabinRequest).toBe(prepared.request);
});
it("never opens the cabin or steals a drawer on preparation completion", () => {
  state().prepareCabin();
  state().togglePanel("details");
  state().cabinReady(state().cabinRequest);
  expect(state().panel).toBe("details");
  expect(state().cabin.phase).toBe("closed");
});
it("rejects stale progress and completion after route switch or retry", () => {
  state().prepareCabin();
  const old = state().cabinRequest;
  state().selectVariant("nismo");
  state().cabinReady(old);
  state().cabinProgress(old, { phase: "preparing" });
  state().cabinFailed(old, "obsolete");
  expect(state().cabinPreparation).toEqual({ phase: "idle" });
  useConfigurator.setState({ ready: true });
  state().prepareCabin();
  expect(state().cabinPreparation).toEqual({ phase: "idle" });
  state().selectVariant("premium");
  useConfigurator.setState({ ready: true });
  state().prepareCabin();
  const next = state().cabinRequest;
  expect(next).toBeGreaterThan(old);
  state().cabinReady(old);
  expect(state().cabinPreparation.phase).toBe("loading");
  state().cabinFailed(next, "Texture decode failed");
  expect(state().error).toBeNull();
  expect(state().ready).toBe(true);
  expect(state().cabinPreparation).toMatchObject({
    phase: "error",
    request: next,
  });
  state().prepareCabin();
  expect(state().cabinRequest).toBeGreaterThan(next);
});
it("keeps preparation scoped and does not duplicate an active attempt", () => {
  useConfigurator.setState({ ready: false });
  state().prepareCabin();
  expect(state().cabinPreparation.phase).toBe("idle");
  useConfigurator.setState({ ready: true });
  state().prepareCabin();
  const request = state().cabinRequest;
  state().prepareCabin();
  expect(state().cabinRequest).toBe(request);
  state().cabinReady(request);
  state().prepareCabin();
  expect(state().cabinRequest).toBe(request);
});

afterEach(() => vi.unstubAllGlobals());
it("records initial preparation separately from the accepted direct-entry handler", () => {
  let time = 10;
  const measure = vi.fn(),
    mark = vi.fn();
  vi.stubGlobal("performance", { now: () => time, measure, mark });
  state().prepareCabin();
  const request = state().cabinRequest;
  expect(state().cabinPreparationStartedAt).toBe(10);
  time = 90;
  state().cabinReady(request - 1);
  expect(measure).not.toHaveBeenCalled();
  time = 100;
  state().cabinReady(request);
  expect(measure).toHaveBeenCalledWith("gtr-cabin-preparation-ready", {
    start: 10,
    end: 100,
    detail: { request },
  });
  expect(state().cabinPreparationReadyAt).toBe(100);
  time = 120;
  state().beginCabin();
  expect(state().cabinEntryRequestedAt).toBe(120);
  expect(mark).toHaveBeenCalledWith("gtr-cabin-entry-request", {
    startTime: 120,
    detail: { request },
  });
  state().beginCabin();
  expect(mark).toHaveBeenCalledTimes(1);
});
