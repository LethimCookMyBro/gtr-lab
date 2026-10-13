// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ModelsPage } from "../src/pages/ModelsPage";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { ModelDetails } from "../src/components/configurator/ModelDetails";
import { ModelInvitations } from "../src/components/home/ModelInvitations";
import { AudioProvider } from "../src/hooks/useAudio";
import { models, getModel } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";

beforeEach(() => {
  useConfigurator.getState().reset();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function collection() {
  return render(
    <MemoryRouter initialEntries={["/models"]}>
      <AudioProvider>
        <Routes>
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
}

describe("concise, capability-specific catalog actions", () => {
  it("keeps one truthful action per collection card and the existing link names", () => {
    const { container } = collection();
    for (const model of models) {
      const link = screen.getByRole("link", { name: `Explore ${model.name}` });
      const expected =
        model.id === "premium"
          ? "View in 3D"
          : model.image
            ? "View photos"
            : "View specifications";
      expect(link.getAttribute("href")).toBe(`/configurator/${model.id}`);
      expect(within(link).getAllByText(expected)).toHaveLength(1);
      const action = link.querySelector(".band-action");
      expect(action?.textContent).toBe(expected);
      expect(link.getAttribute("aria-describedby")).toBe(action?.id);
    }
    expect(container.querySelector(".models-heading > p")?.textContent).toBe(
      "GT-R heritage. Electric competition.",
    );
    expect(container.querySelector(".lineup-note")?.textContent).toBe(
      "Photographs show specific model years. See model details for specifications and image context.",
    );
  });

  it("matches the home actions without adding visible availability badges", () => {
    const { container } = render(
      <MemoryRouter>
        <ModelsPage />
        <ModelInvitations />
      </MemoryRouter>,
    );
    for (const model of models) {
      const collectionAction = container.querySelector(
        `.model-band-${model.id} .band-action`,
      );
      const homeAction = container.querySelector(
        `.home-model-invitation--${model.id} .home-invitation-cta`,
      );
      expect(collectionAction?.textContent).toBe(homeAction?.textContent);
    }
    expect(container.querySelector(".home-invitation-meta")).toBeNull();
    expect(container.querySelector(".home-invitation-copy p")).toBeNull();
  });

  it.each(["nismo", "tspec", "gtr50", "gt3"])(
    "opens the actual local %s photograph from View photos",
    async (id) => {
      const model = getModel(id)!;
      const { container } = collection();
      const link = screen.getByRole("link", { name: `Explore ${model.name}` });
      expect(within(link).getByText("View photos")).toBeTruthy();
      await userEvent.setup().click(link);
      const image = container.querySelector(".reference-view img");
      expect(image?.getAttribute("src")).toBe(model.image);
      expect(image?.getAttribute("alt")).toBe(model.imageCaption);
      expect(existsSync(`public${model.image}`)).toBe(true);
      expect(container.querySelector("canvas")).toBeNull();
      expect(screen.getByRole("button", { name: "Model detail" })).toBeTruthy();
      expect(container.querySelector(".asset-status")).not.toBeNull();
    },
  );
});

describe("compact Formula E details", () => {
  it("replaces the image-shaped placeholder with one small line and one specification context", () => {
    const model = getModel("formula-e")!;
    const { container } = render(<ModelDetails model={model} />);
    const missing = screen.getByText("Reference image unavailable");
    expect(missing.tagName).toBe("P");
    expect(missing.className).toBe("reference-unavailable-note");
    expect(container.querySelector(".reference-unavailable, img")).toBeNull();
    expect(screen.getAllByText(model.modelYear)).toHaveLength(1);
    expect(container.querySelector(".spec-context")?.textContent).toBe(
      model.modelYear,
    );
    expect(container.querySelector(".detail-lead")?.textContent).toBe(
      "Nissan’s battery-electric single-seater for Formula E competition.",
    );
    expect(
      readFileSync("src/styles/reference-unavailable.css", "utf8"),
    ).not.toMatch(/\.model-details\s*>\s*\.reference-unavailable\s*\{/);
  });

  it("retains every source-backed value, note, unknown and primary-source link", () => {
    const model = getModel("formula-e")!;
    const { container } = render(<ModelDetails model={model} />);
    expect(container.querySelector(".key-figures")?.textContent).toContain(
      "350kW",
    );
    for (const text of [
      model.powerLabel!,
      "Not specified in source",
      model.engine,
      model.drive,
      model.transmission,
      model.purpose!,
      ...model.notes,
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    const sources = container.querySelectorAll(".detail-sources a");
    expect(Array.from(sources, (link) => link.getAttribute("href"))).toEqual(
      model.sourceUrls,
    );
    for (const link of sources) {
      expect(link.textContent).toMatch(/Primary source/);
      expect(link.getAttribute("rel")).toBe("noreferrer");
    }
  });

  it("preserves photographed model descriptions, captions and asset provenance", () => {
    const model = getModel("premium")!;
    const { container } = render(<ModelDetails model={model} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      model.image,
    );
    expect(screen.getByText(model.imageCaption)).toBeTruthy();
    expect(screen.getByText(model.description)).toBeTruthy();
    expect(screen.getByText(model.asset.referenceNote!)).toBeTruthy();
    expect(screen.getByText(model.modelYear)).toBeTruthy();
  });
});
