// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AudioProvider } from "../src/hooks/useAudio";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { CreditsPage } from "../src/pages/CreditsPage";
import { ModelDetails } from "../src/components/configurator/ModelDetails";
import { models } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";
vi.mock("../src/components/three/VehicleScene", () => ({
  default: () => <div>GPU dependency isolated for text test</div>,
}));
const savedAsset = models[0].asset;
beforeEach(() => {
  useConfigurator.getState().reset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  models[0].asset = {
    ...savedAsset,
    status: "ready",
    kind: "licensed-model",
    url: "/models/ciasny-r35.glb",
    displayName: "GT-R R35 · Ciasny edition",
    referenceNote:
      "2017-era custom exterior; catalog specifications below describe the 2024 Premium separately.",
  };
});
afterEach(() => {
  models[0].asset = savedAsset;
  cleanup();
});
it("names the actual licensed scene and does not label a loading GLB as a photograph", () => {
  render(
    <MemoryRouter initialEntries={["/configurator/premium"]}>
      <AudioProvider>
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("heading", { name: "GT-R R35 · Ciasny edition" }),
  ).toBeTruthy();
  expect(
    screen.getByLabelText("Loading 3D GT-R R35 · Ciasny edition"),
  ).toBeTruthy();
  expect(screen.queryByText("Photo reference · 3D asset pending")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Model provenance & limitations" }),
  ).toBeTruthy();
});
it("separates catalog performance figures from the artist's source geometry", () => {
  render(<ModelDetails model={models[0]} />);
  expect(screen.getByText(/2017-era custom exterior/)).toBeTruthy();
  expect(screen.getByText("2024 US specification")).toBeTruthy();
});

it("publishes the model creator, license and actual modifications in credits", () => {
  models[0].asset = {
    ...models[0].asset,
    source: "https://sketchfab.com/model",
    author: "Ciasny",
    license: "https://creativecommons.org/licenses/by/4.0/",
    licenseName: "CC BY 4.0",
    changes: [
      "Geometry normalized; lamp and exhaust materials separated; textures resized; Meshopt compression.",
    ],
  };
  render(
    <MemoryRouter>
      <CreditsPage />
    </MemoryRouter>,
  );
  expect(
    screen
      .getByRole("link", { name: "Ciasny · Original 3D model" })
      .getAttribute("href"),
  ).toBe("https://sketchfab.com/model");
  expect(screen.getByText(/Geometry normalized; lamp/)).toBeTruthy();
});
