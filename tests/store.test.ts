import { describe, it, expect, beforeEach } from "vitest";
import { useConfigurator } from "../src/stores/configurator";
describe("predictable configurator state", () => {
  beforeEach(() => useConfigurator.getState().reset());
  it("selects variant and clears scene-specific state", () => {
    useConfigurator.setState({ autoRotate: true, ready: true });
    useConfigurator.getState().selectVariant("nismo");
    expect(useConfigurator.getState()).toMatchObject({
      selectedVariant: "nismo",
      autoRotate: false,
      ready: false,
    });
  });
  it("issues a fresh camera request when the already selected preset is chosen again", () => {
    const initialRequest = useConfigurator.getState().cameraRequest;
    useConfigurator.getState().setCamera("hero");
    const firstRequest = useConfigurator.getState().cameraRequest;
    useConfigurator.getState().setCamera("hero");
    expect(firstRequest).toBe(initialRequest + 1);
    expect(useConfigurator.getState().cameraRequest).toBe(firstRequest + 1);
  });
  it("ignores an unknown paint", () => {
    const old = useConfigurator.getState().selectedPaint;
    useConfigurator.getState().setPaint("made-up");
    expect(useConfigurator.getState().selectedPaint).toBe(old);
  });
  it("retry recovers from a failed outdoor environment", () => {
    useConfigurator.setState({
      selectedEnvironment: "forest",
      error: "HDRI failed",
      ready: false,
    });
    useConfigurator.getState().retryScene();
    expect(useConfigurator.getState()).toMatchObject({
      selectedEnvironment: "studio",
      error: null,
      ready: false,
      loadingProgress: 0,
    });
  });
  it("manual input immediately stops showcase", () => {
    useConfigurator.setState({ autoRotate: true });
    useConfigurator.getState().stopAutoRotate();
    expect(useConfigurator.getState().autoRotate).toBe(false);
  });
  it("opens only one panel and closes repeated toggle", () => {
    useConfigurator.getState().togglePanel("camera");
    useConfigurator.getState().togglePanel("environment");
    expect(useConfigurator.getState().panel).toBe("environment");
    useConfigurator.getState().togglePanel("environment");
    expect(useConfigurator.getState().panel).toBeNull();
  });
});
