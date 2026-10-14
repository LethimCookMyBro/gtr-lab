// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import initialFive from "./fixtures/catalog-first-five.json";
import { models, getModel, imageCredits } from "../src/data/models";
import { ModelInvitations } from "../src/components/home/ModelInvitations";
import { ModelsPage } from "../src/pages/ModelsPage";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { ModelDetails } from "../src/components/configurator/ModelDetails";
import { AssetDisclosure } from "../src/components/configurator/AssetDisclosure";
import { CreditsPage } from "../src/pages/CreditsPage";
import { createHash } from "node:crypto";
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
  it("uses the approved Season 11 photograph while keeping licensed geometry explicitly missing", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    expect(model?.image).toBe("/images/nissan-gen3-evo-2024-25.jpg");
    expect(model?.imageSmall).toBe(model?.image);
    expect(model?.imageReferenceLabel).toBe("2024/25 GEN3 Evo reference");
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
  it("offers a keyboard-accessible photo invitation with honest season context", () => {
    wrapper(<ModelInvitations />);
    const link = screen.getByRole("link", {
      name: "Explore Formula E: View photos",
    });
    expect(link.getAttribute("href")).toBe("/configurator/formula-e");
    expect(link.getAttribute("data-experience")).toBe("photography");
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      getModel("formula-e")!.image,
    );
    expect(
      link.querySelector("img")?.getAttribute("srcset") ?? "",
    ).not.toContain(".webp");
    expect(within(link).getByText("2024/25 GEN3 Evo reference")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Find your GT-R." }),
    ).toBeNull();
  });
  it("gives the collection a sixth photograph with its historical season label", () => {
    wrapper(<ModelsPage />);
    const link = screen.getByRole("link", {
      name: "Explore Nissan e-4ORCE 05",
    });
    expect(link.querySelector("img")?.getAttribute("src")).toBe(
      getModel("formula-e")!.image,
    );
    expect(
      link.querySelector("img")?.getAttribute("srcset") ?? "",
    ).not.toContain(".webp");
    expect(within(link).getByText("2024/25 GEN3 Evo reference")).toBeTruthy();
    expect(document.querySelectorAll(".model-band img")).toHaveLength(6);
  });
  it("shows source-backed figures and retains unknown torque in the source notes", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    if (!model) return;
    const { container } = wrapper(<ModelDetails model={model} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      model.image,
    );
    expect(screen.getByText("2024/25 GEN3 Evo reference")).toBeTruthy();
    expect(screen.queryByText("Reference image unavailable")).toBeNull();
    expect(screen.queryByText("Not specified in source")).toBeNull();
    expect(container.querySelectorAll(".key-figures > div")).toHaveLength(1);
    expect(
      screen.getByText(
        "Torque and transmission details are not specified in the cited sources.",
      ),
    ).toBeTruthy();
    expect(
      screen.getAllByText("No licensed 3D model has been integrated."),
    ).toHaveLength(1);
    expect(screen.getByText("Maximum traction power")).toBeTruthy();
    expect(screen.getByText("Powertrain")).toBeTruthy();
    expect(screen.queryByText("Engine")).toBeNull();
    expect(container.textContent).not.toMatch(/0Nm|0lb-ft|Published torque0/);
  });
  it("discloses photographic reference availability separately from pending geometry", () => {
    const model = getModel("formula-e");
    expect(model).toBeDefined();
    if (!model) return;
    wrapper(<AssetDisclosure model={model} interactive={false} />);
    expect(screen.queryByText("Reference image unavailable")).toBeNull();
    expect(screen.getByText("Available · attributed")).toBeTruthy();
    expect(screen.getByText(/clearly marked photograph/)).toBeTruthy();
  });
  it("renders a labeled photograph without unavailable 3D controls or renderer", async () => {
    const { container } = route("formula-e");
    expect(
      screen.getByRole("heading", { name: "Nissan e-4ORCE 05" }),
    ).toBeTruthy();
    expect(screen.getByText("Photo reference · 3D asset pending")).toBeTruthy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(
      container.querySelector(".reference-view img")?.getAttribute("src"),
    ).toBe(getModel("formula-e")!.image);
    expect(
      within(
        container.querySelector(".reference-view")! as HTMLElement,
      ).getByText("2024/25 GEN3 Evo reference"),
    ).toBeTruthy();
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
    expect(choice.querySelector("img")?.getAttribute("src")).toBe(
      getModel("formula-e")!.imageSmall,
    );
    expect(choice.textContent).toContain("2024/25 GEN3 Evo reference");
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

it("pins the inspected Commons JPEG bytes and links author, source and CC0 in credits", () => {
  const credit = imageCredits.find((item) => item.id === "formula-e")!;
  expect(credit).toBeDefined();
  const bytes = readFileSync(`public${credit.path}`);
  expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  expect(bytes.length).toBe(246734);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    "4aaf4aafbfffc1825d9ab403c356fdf89415cae58603e93a60e7b583e35e7b08",
  );
  expect(credit.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(credit.bytes).toBe(bytes.length);
  wrapper(<CreditsPage />);
  const item = document.querySelector("#photography-formula-e")! as HTMLElement;
  expect(item.querySelector("img")?.getAttribute("src")).toBe(credit.path);
  expect(
    within(item).getByRole("link", { name: "TTTNIS" }).getAttribute("href"),
  ).toBe("https://commons.wikimedia.org/wiki/User:TTTNIS");
  expect(
    within(item)
      .getByRole("link", { name: "Original source" })
      .getAttribute("href"),
  ).toBe("https://commons.wikimedia.org/wiki/File:2024-25_Nissan_Gen3_Evo.jpg");
  expect(
    within(item).getByRole("link", { name: "CC0 1.0" }).getAttribute("href"),
  ).toBe("https://creativecommons.org/publicdomain/zero/1.0/");
});
