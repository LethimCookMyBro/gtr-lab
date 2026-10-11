// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";

vi.mock("../src/components/three/VehicleScene", () => ({
  default: ({ renderQuality }: { renderQuality?: string }) => (
    <div data-testid="scene-props" data-quality={renderQuality}>
      No WebGL device in this test
    </div>
  ),
}));
function History() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>History back</button>
      <button onClick={() => navigate(1)}>History forward</button>
    </>
  );
}
function setup(route = "/configurator/premium") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AudioProvider>
        <History />
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
          <Route path="/models" element={<p>Model collection</p>} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
}
const radio = (name: "Standard" | "Reduced") =>
  screen.getByRole("radio", {
    name: new RegExp(`^${name}`),
  }) as HTMLInputElement;
beforeEach(() => {
  useConfigurator.getState().reset();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("exposes Standard and Reduced in the existing Environment drawer even while loading", async () => {
  setup();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Environment" }));
  const group = screen.getByRole("group", { name: "Rendering quality" });
  expect(within(group).getAllByRole("radio")).toHaveLength(2);
  expect(radio("Standard").checked).toBe(true);
  expect(radio("Reduced").disabled).toBe(false);
  expect(group.textContent).toMatch(/2 million pixels/);
  expect(group.textContent).toMatch(/1 million pixels/);
  expect(group.textContent).toMatch(/softer fine detail/i);
  expect(group.textContent).toMatch(/small screens/i);
  expect(group.textContent).toMatch(/reload/i);
});

it("supports native radio keyboard navigation without closing or losing focus", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Environment" }));
  radio("Standard").focus();
  await user.keyboard("{ArrowRight}");
  expect(radio("Reduced").checked).toBe(true);
  expect(document.activeElement).toBe(radio("Reduced"));
  expect(useConfigurator.getState().renderQuality).toBe("reduced");
  await waitFor(() =>
    expect(screen.getByTestId("scene-props").dataset.quality).toBe("reduced"),
  );
  await user.keyboard("{ArrowLeft}");
  expect(radio("Standard").checked).toBe(true);
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("keeps choice on Escape, restores trigger focus and shows the same choice on reopen", async () => {
  setup();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "Environment" });
  await user.click(trigger);
  await user.click(radio("Reduced"));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await user.click(trigger);
  expect(radio("Reduced").checked).toBe(true);
});

it("keeps the same scene element and readiness on repeated choices", async () => {
  setup();
  const user = userEvent.setup();
  const scene = await screen.findByTestId("scene-props");
  act(() => useConfigurator.setState({ ready: true }));
  const generation = useConfigurator.getState().sceneRequest;
  await user.click(screen.getByRole("button", { name: "Environment" }));
  for (const choice of ["Reduced", "Standard", "Reduced"] as const)
    await user.click(radio(choice));
  expect(screen.getByTestId("scene-props")).toBe(scene);
  expect(useConfigurator.getState().sceneRequest).toBe(generation);
  expect(useConfigurator.getState().ready).toBe(true);
});

it("preserves the choice through Back to models, browser back and forward", async () => {
  setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Environment" }));
  await user.click(radio("Reduced"));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("link", { name: "Back to models" }));
  expect(screen.getByText("Model collection")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "History back" }));
  await user.click(screen.getByRole("button", { name: "Environment" }));
  expect(radio("Reduced").checked).toBe(true);
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "History forward" }));
  expect(screen.getByText("Model collection")).toBeTruthy();
  expect(useConfigurator.getState().renderQuality).toBe("reduced");
});

it("explains why photo-only variants cannot use rendering quality", async () => {
  setup("/configurator/gt500");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Environment" }));
  expect(
    radio("Standard").disabled ||
      radio("Standard").closest("fieldset")?.disabled,
  ).toBe(true);
  expect(
    radio("Reduced").disabled || radio("Reduced").closest("fieldset")?.disabled,
  ).toBe(true);
  expect(screen.getByText(/Quality applies to 3D models/)).toBeTruthy();
});

it("allows changing quality after a rendering error and retains it on retry", async () => {
  setup();
  act(() =>
    useConfigurator.setState({ error: "Rendering stopped", ready: false }),
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Environment" }));
  expect(radio("Reduced").disabled).toBe(false);
  await user.click(radio("Reduced"));
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(useConfigurator.getState().renderQuality).toBe("reduced");
  await waitFor(() =>
    expect(screen.getByTestId("scene-props").dataset.quality).toBe("reduced"),
  );
});

it.each(["/configurator/premium", "/configurator/gt500"])(
  "keeps Tab inside the drawer when quality is the only available choice on %s",
  async (route) => {
    // jsdom has no layout; provide only visibility geometry, retaining real
    // native radio semantics and the actual Drawer focus handler.
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      { width: 10, height: 10 },
    ] as unknown as DOMRectList);
    setup(route);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Environment" }));
    const dialog = screen.getByRole("dialog");
    const close = within(dialog).getByRole("button", { name: "Close panel" });
    if (route.endsWith("premium")) radio("Standard").focus();
    else close.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(
      route.endsWith("premium") ? radio("Standard") : close,
    );
  },
);

it("preserves mixed checkbox, radio and button tab order inside the shared drawer", async () => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    { width: 10, height: 10 },
  ] as unknown as DOMRectList);
  const { Drawer } = await import("../src/components/ui/Drawer");
  render(
    <>
      <button>Outside before</button>
      <Drawer title="Mixed controls" onClose={() => {}}>
        <label>
          <input type="checkbox" />
          Keep preference
        </label>
        <label>
          <input type="radio" name="mixed-choice" defaultChecked />
          First choice
        </label>
        <label>
          <input type="radio" name="mixed-choice" />
          Second choice
        </label>
        <button>Apply</button>
        <fieldset disabled>
          <input aria-label="Unavailable" />
        </fieldset>
      </Drawer>
      <button>Outside after</button>
    </>,
  );
  const dialog = screen.getByRole("dialog");
  const close = within(dialog).getByRole("button", { name: "Close panel" });
  const user = userEvent.setup();
  close.focus();
  for (const expected of [
    screen.getByRole("checkbox", { name: "Keep preference" }),
    screen.getByRole("radio", { name: "First choice" }),
    screen.getByRole("button", { name: "Apply" }),
    close,
  ]) {
    await user.tab();
    expect(document.activeElement).toBe(expected);
  }
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Apply" }),
  );
});
