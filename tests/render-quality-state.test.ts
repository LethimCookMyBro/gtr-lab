import { beforeEach, describe, expect, it } from "vitest";
import { useConfigurator } from "../src/stores/configurator";

describe("session-only rendering quality", () => {
  beforeEach(() => useConfigurator.getState().reset());
  it("starts at the preferred Standard quality", () => {
    expect(useConfigurator.getState().renderQuality).toBe("standard");
  });
  it("changes only the chosen quality without restarting the scene", () => {
    useConfigurator.setState({
      ready: true,
      autoRotate: true,
      lightsEnabled: true,
    });
    const before = useConfigurator.getState();
    before.setRenderQuality("reduced");
    expect(useConfigurator.getState()).toEqual({
      ...before,
      renderQuality: "reduced",
    });
    useConfigurator.getState().setRenderQuality("standard");
    expect(useConfigurator.getState()).toEqual(before);
  });
  it("keeps the choice across scene, paint, camera, environment, cabin and model changes", () => {
    useConfigurator.getState().setRenderQuality("reduced");
    useConfigurator.getState().setPaint("white");
    useConfigurator.getState().setCamera("front");
    useConfigurator.getState().setEnvironment("gallery");
    useConfigurator.setState({ ready: true });
    useConfigurator.getState().prepareCabin();
    useConfigurator
      .getState()
      .cabinReady(useConfigurator.getState().cabinRequest);
    useConfigurator.getState().beginCabin();
    expect(useConfigurator.getState().cabin.phase).toBe("active");
    useConfigurator.getState().exitCabin(false);
    useConfigurator.getState().retryScene();
    useConfigurator.getState().selectVariant("gt500");
    useConfigurator.getState().selectVariant("premium");
    expect(useConfigurator.getState().renderQuality).toBe("reduced");
  });
  it("ignores unknown choices and returns to Standard on a full explicit reset", () => {
    useConfigurator.getState().setRenderQuality("reduced");
    useConfigurator.getState().setRenderQuality("unknown" as "standard");
    expect(useConfigurator.getState().renderQuality).toBe("reduced");
    useConfigurator.getState().reset();
    expect(useConfigurator.getState().renderQuality).toBe("standard");
  });
});
