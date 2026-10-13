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
  it("uses one existing availability disclosure and one specification context", () => {
    const model = getModel("formula-e")!;
    const { container } = render(<ModelDetails model={model} />);
    expect(screen.queryByText("Reference image unavailable")).toBeNull();
    expect(container.querySelector(".reference-unavailable-note")).toBeNull();
    expect(
      screen.getAllByText(
        "No rights-cleared reference image or licensed 3D model has been integrated.",
      ),
    ).toHaveLength(1);
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

  it("retains every source-backed value, note and primary-source link", () => {
    const model = getModel("formula-e")!;
    const { container } = render(<ModelDetails model={model} />);
    expect(container.querySelector(".key-figures")?.textContent).toContain(
      "350kW",
    );
    for (const text of [
      model.powerLabel!,
      model.engine,
      model.drive,
      model.transmission,
      model.purpose!,
      ...model.notes,
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
    expect(container.querySelectorAll(".key-figures > div")).toHaveLength(1);
    expect(container.querySelector(".unknown-figure")).toBeNull();
    expect(screen.queryByText("Not specified in source")).toBeNull();
    expect(screen.queryByText("Torque", { exact: true })).toBeNull();
    const sources = container.querySelectorAll(".detail-sources a");
    expect(Array.from(sources, (link) => link.getAttribute("href"))).toEqual(
      model.sourceUrls,
    );
    for (const link of sources) {
      expect(link.textContent).toMatch(/Primary source/);
      expect(link.getAttribute("rel")).toBe("noreferrer");
    }
  });

  it.each(models.filter((model) => model.torqueValue !== null))(
    "retains published or estimated torque for $id",
    (model) => {
      const { container } = render(<ModelDetails model={model} />);
      const figures = container.querySelectorAll(".key-figures > div");
      expect(figures).toHaveLength(2);
      expect(figures[1].querySelector("strong")?.textContent).toBe(
        `${model.torqueValue}${model.torqueUnit}`,
      );
      expect(figures[1].querySelector("span")?.textContent).toBe(
        model.outputIsEstimate ? "Estimated torque" : "Published torque",
      );
    },
  );

  it("distinguishes a provided zero from an unavailable torque value", () => {
    const model = { ...getModel("nismo")!, torqueValue: 0 };
    const { container } = render(<ModelDetails model={model} />);
    expect(container.querySelectorAll(".key-figures > div")).toHaveLength(2);
    expect(container.querySelectorAll(".key-figures strong")[1].textContent).toBe(
      `0${model.torqueUnit}`,
    );
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
