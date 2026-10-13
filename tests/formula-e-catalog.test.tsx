// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import initialFive from "./fixtures/catalog-first-five.json";
import { models, getModel } from "../src/data/models";
import { ModelInvitations } from "../src/components/home/ModelInvitations";
import { ModelsPage } from "../src/pages/ModelsPage";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { ModelDetails } from "../src/components/configurator/ModelDetails";
import { AssetDisclosure } from "../src/components/configurator/AssetDisclosure";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";

beforeEach(() => {
  useConfigurator.getState().reset();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});
afterEach(cleanup);
function wrapper(content: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AudioProvider>{content}</AudioProvider>
    </MemoryRouter>,
  );
}
function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
function route(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/configurator/${id}`]}>
      <AudioProvider>
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
          <Route path="/models" element={<ModelsPage />} />
        </Routes>
        <Location />
      </AudioProvider>
    </MemoryRouter>,
  );
}

describe("Nissan Formula E catalog correction", () => {
  it("preserves all first-five facts and local reference image files", () => {
    const facts = JSON.parse(
      readFileSync("src/data/specifications.json", "utf8"),
    );
    expect(facts.variants.slice(0, 5)).toEqual(initialFive);
    for (const model of models.slice(0, 5)) {
      expect(model.image).toBe(`/images/gtr-${model.id}.webp`);
      expect(existsSync(`public${model.image}`)).toBe(true);
      expect(existsSync(`public/images/gtr-${model.id}.small.webp`)).toBe(true);
    }
  });
  it("replaces only the sixth identity and never aliases the old GT500 route", () => {
    expect(models.map((m) => m.id)).toEqual([
      "premium",
      "nismo",
      "tspec",
      "gtr50",
      "gt3",
      "formula-e",
    ]);
    expect(getModel("gt500")).toBeUndefined();
    expect(getModel("formula-e")?.name).toBe("Nissan e-4ORCE 05");
    expect(getModel("formula-e")?.modelYear).toBe(
      "2025/26 Season 12 · GEN3 Evo",
    );
  });
  it("retains primary-source electric facts without inherited combustion specs or invented torque", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    expect(model?.powerValue).toBe(350);
    expect(model?.powerUnit).toBe("kW");
    expect(model?.torqueValue).toBeNull();
    expect(model?.engine).toContain("electric");
    expect(model?.transmission).toBe("Not specified in cited sources");
    expect(model?.drive).toContain(
      "qualifying duels, race starts and ATTACK MODE",
    );
    expect(model?.notes.join(" ")).toContain("600 kW maximum regeneration");
    expect(model?.sourceUrls).toContain(
      "https://global.nissannews.com/en/releases/nissan-formula-e-press-kit",
    );
    expect(model?.sourceUrls).toContain(
      "https://www.fia.com/news/formula-e-and-fia-unveil-gen3-evo-race-car-capable-0-60mph-just-182s",
    );
    expect(JSON.stringify(model)).not.toMatch(
      /VR38|NR20|NR4S|inline-four|twin-turbo|6-speed|dual-clutch|gtr-gt500|latest/i,
    );
  });
  it("keeps unacquired image and geometry explicitly missing", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    expect(model?.image).toBeNull();
    expect(model?.asset).toMatchObject({
      status: "missing",
      url: null,
      source: null,
      license: null,
      interior: false,
      lights: false,
    });
    expect(model?.asset.cabinPreview).toBeUndefined();
  });
  it("offers a truthful keyboard-accessible home invitation with no image request", () => {
    wrapper(<ModelInvitations />);
    const link = screen.getByRole("link", {
      name: "Explore Formula E: View specifications",
    });
    expect(link.getAttribute("href")).toBe("/configurator/formula-e");
    expect(link.getAttribute("data-experience")).toBe("specifications");
    expect(link.querySelector("img")).toBeNull();
    expect(within(link).getByText("Reference image unavailable")).toBeTruthy();
    expect(within(link).getByText("2025/26 Season 12 · GEN3 Evo")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Find your GT-R." }),
    ).toBeNull();
  });
  it("gives the collection an honest no-image sixth entry", () => {
    wrapper(<ModelsPage />);
    const link = screen.getByRole("link", {
      name: "Explore Nissan e-4ORCE 05",
    });
    expect(link.querySelector("img")).toBeNull();
    expect(within(link).getByText("Reference image unavailable")).toBeTruthy();
    expect(document.querySelectorAll(".model-band img")).toHaveLength(5);
  });
  it("shows source-backed details and explicit unknown torque, never zero", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    if (!model) return;
    const { container } = wrapper(<ModelDetails model={model} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Reference image unavailable")).toBeTruthy();
    expect(screen.getByText("Not specified in source")).toBeTruthy();
    expect(screen.getByText("Maximum traction power")).toBeTruthy();
    expect(screen.getByText("Powertrain")).toBeTruthy();
    expect(screen.queryByText("Engine")).toBeNull();
    expect(container.textContent).not.toMatch(/0Nm|0lb-ft|Published torque0/);
  });
  it("discloses unavailable photo rights and geometry without claiming attribution", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    if (!model) return;
    wrapper(<AssetDisclosure model={model} interactive={false} />);
    expect(screen.getByText("Reference image unavailable")).toBeTruthy();
    expect(screen.queryByText("Available · attributed")).toBeNull();
    expect(screen.getByText(/No rights-cleared reference image/)).toBeTruthy();
  });
  it("renders the new route without unavailable 3D controls, renderer or image", async () => {
    const { container } = route("formula-e");
    expect(
      screen.getByRole("heading", { name: "Nissan e-4ORCE 05" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Specifications only · 3D asset pending"),
    ).toBeTruthy();
    expect(container.querySelector("canvas, .reference-view img")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Lights", hidden: true }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Pearl White", hidden: true }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Switch model" }));
    const choice = screen.getByRole("button", {
      name: "Formula E Electric racing, a different discipline.",
    });
    expect(choice.querySelector("img")).toBeNull();
    expect(choice.textContent).toContain("Reference image unavailable");
  });
  it("keeps the retired GT500 URL explicit without redirecting to a different vehicle", async () => {
    route("gt500");
    expect(
      screen.getByRole("heading", {
        name: "GT500 is no longer in this collection.",
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(/previous sixth slot was a catalog error/),
    ).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe(
      "/configurator/gt500",
    );
    expect(
      screen.queryByRole("heading", { name: "Nissan e-4ORCE 05" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: /Explore the collection/ }));
    expect(screen.getByTestId("location").textContent).toBe("/models");
  });
  it("documents current cabin behavior and the unresolved Formula E assets", () => {
    const readme = readFileSync("README.md", "utf8");
    expect(readme).toContain("2025/26 Season 12");
    expect(readme).toContain("route-resident");
    expect(readme).toContain("static");
    expect(readme).not.toContain("Interior remains disabled");
    const provenance = readFileSync("docs/MODEL_PROVENANCE.md", "utf8");
    expect(provenance).toContain("exterior-window proxy");
    expect(provenance).toContain("route-resident");
  });
});
