// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConfiguratorPanels } from "../src/components/configurator/ConfiguratorPanels";
import { AudioProvider } from "../src/hooks/useAudio";
import { models, type VehicleModel } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";
beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});
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

it("credits a licensed model and explains its relationship to catalog specifications", () => {
  const model = {
    ...models[0],
    asset: {
      ...models[0].asset,
      status: "ready",
      url: "/models/ciasny-r35.glb",
      kind: "licensed-model",
      displayName: "GT-R R35 · Ciasny edition",
      referenceNote:
        "2017-era exterior with custom aero; not a verified 2024 Premium replica.",
      source:
        "https://sketchfab.com/3d-models/nissan-gtr-r35-51c912a8310c4e00a82ad7673d84228a",
      author: "Ciasny",
      license: "https://creativecommons.org/licenses/by/4.0/",
      licenseName: "CC BY 4.0",
      limitations: ["Detailed cabin pending integration"],
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
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("GT-R R35 · Ciasny edition");
  expect(dialog.textContent).toContain("2017-era exterior");
  expect(
    screen
      .getByRole("link", { name: "Ciasny · Original model" })
      .getAttribute("href"),
  ).toBe(model.asset.source);
  expect(
    screen.getByRole("link", { name: "CC BY 4.0" }).getAttribute("href"),
  ).toBe(model.asset.license);
});
