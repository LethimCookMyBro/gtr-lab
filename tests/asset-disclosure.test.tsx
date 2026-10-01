// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfiguratorPanels } from "../src/components/configurator/ConfiguratorPanels";
import { AudioProvider } from "../src/hooks/useAudio";
import { models, type VehicleModel } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";
afterEach(() => {
  cleanup();
  useConfigurator.getState().reset();
});
it("identifies an original approximation and its limitations instead of claiming licensed production geometry", () => {
  const model = {
    ...models[0],
    asset: {
      ...models[0].asset,
      status: "ready",
      url: "/models/study.glb",
      kind: "original-study",
      displayName: "Original R35-inspired study",
      limitations: ["Original approximate bodywork; not dimension-certified"],
      interior: true,
    },
  } as VehicleModel;
  useConfigurator.setState({ panel: "assets" });
  render(
    <MemoryRouter>
      <AudioProvider>
        <ConfiguratorPanels model={model} interactive />
      </AudioProvider>
    </MemoryRouter>,
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "Original R35-inspired study",
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "not dimension-certified",
  );
  expect(screen.getByRole("dialog").textContent).not.toContain(
    "licensed GLB vehicle asset",
  );
});
