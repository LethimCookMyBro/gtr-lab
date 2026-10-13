// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";
import { ConfiguratorPanels } from "../src/components/configurator/ConfiguratorPanels";
import { cameraPresets, environments } from "../src/data/configuration";
import { getModel, models, type VehicleModel } from "../src/data/models";
import { useConfigurator } from "../src/stores/configurator";

const state = () => useConfigurator.getState();
function PanelHost({
  interactive,
  override,
}: {
  interactive: boolean;
  override?: VehicleModel;
}) {
  const { model: id = "premium" } = useParams();
  const location = useLocation();
  return (
    <>
      <p data-testid="route">{location.pathname}</p>
      <button onClick={() => state().togglePanel("camera")}>Open camera</button>
      <button onClick={() => state().togglePanel("environment")}>
        Open atmosphere
      </button>
      <button onClick={() => state().togglePanel("models")}>Open models</button>
      <ConfiguratorPanels
        key={id}
        model={override ?? getModel(id)!}
        interactive={interactive}
      />
    </>
  );
}
function show(id = "premium", interactive = true, override?: VehicleModel) {
  state().selectVariant(id);
  useConfigurator.setState({ ready: interactive });
  return render(
    <MemoryRouter initialEntries={[`/configurator/${id}`]}>
      <Routes>
        <Route
          path="/configurator/:model"
          element={<PanelHost interactive={interactive} override={override} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}
const open = async (name: "camera" | "atmosphere" | "models") => {
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: `Open ${name}` }));
  return screen.getByRole("dialog");
};
function expectCameraSelection(id: string) {
  const dialog = screen.getByRole("dialog");
  for (const preset of cameraPresets) {
    const button = within(dialog).getByRole("button", { name: preset.name });
    const selected = preset.id === id;
    expect(button.classList.contains("selected")).toBe(selected);
    expect(Boolean(button.querySelector(".lucide-check"))).toBe(selected);
    expect(button.getAttribute("aria-pressed")).toBe(String(selected));
  }
}
function expectEnvironmentSelection(id: string) {
  const dialog = screen.getByRole("dialog");
  for (const environment of environments) {
    const button = within(dialog).getByRole("button", {
      name: new RegExp(`^${environment.name}`),
    });
    const selected = environment.id === id;
    expect(button.classList.contains("selected")).toBe(selected);
    expect(Boolean(button.querySelector(".lucide-check"))).toBe(selected);
    expect(button.getAttribute("aria-pressed")).toBe(String(selected));
  }
}
function prepareCabin() {
  act(() => {
    state().prepareCabin();
    state().cabinReady(state().cabinRequest);
  });
}
beforeEach(() => {
  state().reset();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("exposes exactly the visible current exterior camera as pressed", async () => {
  show();
  await open("camera");
  expectCameraSelection("hero");
});
it.each(["{Enter}", " "])(
  "preserves native %s camera activation and stable labels",
  async (key) => {
    show();
    await open("camera");
    const side = screen.getByRole("button", { name: "Side" });
    expect(side.tagName).toBe("BUTTON");
    side.focus();
    await userEvent.setup().keyboard(key);
    expect(state().cameraPreset).toBe("side");
    expect(screen.queryByRole("dialog")).toBeNull();
    await open("camera");
    expectCameraSelection("side");
    expect(
      screen.getByRole("button", { name: "Side", pressed: true }),
    ).toBeTruthy();
  },
);
it("moves both the checkmark and pressed state to the prepared cabin while retaining the exterior preset", async () => {
  show();
  prepareCabin();
  await open("camera");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Interior" }));
  expect(state().cabin.phase).toBe("active");
  expect(state().cameraPreset).toBe("hero");
  await open("camera");
  expectCameraSelection("interior");
  for (const seat of ["passenger", "rear", "driver"] as const) {
    act(() => state().setCabinSeat(seat));
    expectCameraSelection("interior");
  }
});
it("restores the saved exterior selection after leaving the cabin", async () => {
  show();
  prepareCabin();
  act(() => {
    state().setCamera("rear");
    state().beginCabin();
  });
  await open("camera");
  expectCameraSelection("interior");
  act(() => state().exitCabin(false));
  expectCameraSelection("rear");
});
it("represents the existing native-interior camera branch without requiring a preview cabin", async () => {
  const model = getModel("premium")!;
  show("premium", true, {
    ...model,
    asset: { ...model.asset, cabinPreview: undefined, interior: true },
  });
  await open("camera");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Interior" }));
  expect(state().cameraPreset).toBe("interior");
  expect(state().cabin.phase).toBe("closed");
  await open("camera");
  expectCameraSelection("interior");
});
it("keeps unavailable Interior disabled, described and unpressed", async () => {
  show("formula-e", false);
  await open("camera");
  const interior = screen.getByRole("button", {
    name: /Interior/,
  }) as HTMLButtonElement;
  expect(interior.disabled).toBe(true);
  expect(interior.getAttribute("aria-pressed")).toBe("false");
  expect(interior.textContent).toContain("Detailed cabin required");
  await userEvent.setup().click(interior);
  expect(state().cameraPreset).toBe("hero");
  expect(state().cabin.phase).toBe("closed");
});
it("does not make an unprepared cabin available through selected-state markup", async () => {
  show();
  await open("camera");
  const interior = screen.getByRole("button", {
    name: "Interior",
  }) as HTMLButtonElement;
  expect(interior.disabled).toBe(true);
  expect(interior.getAttribute("aria-describedby")).toBe("cabin-preview-note");
  expect(interior.getAttribute("aria-pressed")).toBe("false");
  await userEvent.setup().click(interior);
  expect(state().cabin.phase).toBe("closed");
  expect(state().cabinPreparation.phase).toBe("idle");
});
it("exposes selected environment and retains native quality radios", async () => {
  show();
  const dialog = await open("atmosphere");
  expectEnvironmentSelection("studio");
  const radios = within(dialog).getAllByRole("radio") as HTMLInputElement[];
  expect(radios).toHaveLength(2);
  expect(
    radios.every(
      (radio) => radio.tagName === "INPUT" && radio.type === "radio",
    ),
  ).toBe(true);
  expect(within(dialog).getAllByRole("button", { pressed: true })).toHaveLength(
    1,
  );
});
it.each(["{Enter}", " "])(
  "preserves native %s environment activation and selection after reopening",
  async (key) => {
    show();
    await open("atmosphere");
    const gallery = screen.getByRole("button", { name: /^Gallery/ });
    expect(gallery.tagName).toBe("BUTTON");
    gallery.focus();
    await userEvent.setup().keyboard(key);
    expect(state().selectedEnvironment).toBe("gallery");
    expect(screen.queryByRole("dialog")).toBeNull();
    await open("atmosphere");
    expectEnvironmentSelection("gallery");
  },
);
it("keeps photo-only environment choices disabled without erasing their saved selection", async () => {
  show("nismo", false);
  act(() => state().setEnvironment("gallery"));
  await open("atmosphere");
  expectEnvironmentSelection("gallery");
  for (const environment of environments) {
    expect(
      (
        screen.getByRole("button", {
          name: new RegExp(`^${environment.name}`),
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  }
});
it.each(models.map((model) => model.id))(
  "marks only the current %s model page in navigation",
  async (id) => {
    show(id);
    const dialog = await open("models");
    for (const model of models) {
      const button = within(dialog).getByRole("button", {
        name: `${model.shortName} ${model.tagline}`,
      });
      expect(button.getAttribute("aria-current")).toBe(
        model.id === id ? "page" : null,
      );
      expect(button.hasAttribute("aria-pressed")).toBe(false);
      expect(button.classList.contains("selected")).toBe(model.id === id);
      expect(Boolean(button.querySelector(".lucide-check"))).toBe(
        model.id === id,
      );
    }
    expect(dialog.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  },
);
it("preserves native model navigation and updates the current-page marker on the destination", async () => {
  show();
  await open("models");
  const target = getModel("formula-e")!;
  const button = screen.getByRole("button", {
    name: `${target.shortName} ${target.tagline}`,
  });
  button.focus();
  await userEvent.setup().keyboard("{Enter}");
  expect(screen.getByTestId("route").textContent).toBe(
    "/configurator/formula-e",
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  const dialog = await open("models");
  expect(
    within(dialog)
      .getByRole("button", { name: `${target.shortName} ${target.tagline}` })
      .getAttribute("aria-current"),
  ).toBe("page");
  expect(dialog.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
});
