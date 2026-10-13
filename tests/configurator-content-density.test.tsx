// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ConfiguratorPage } from "../src/pages/ConfiguratorPage";
import { AudioProvider } from "../src/hooks/useAudio";
import { useConfigurator } from "../src/stores/configurator";

// The renderer owns WebGL and network work, neither is part of this DOM contract.
vi.mock("../src/components/three/VehicleScene", () => ({
  default: () => <div data-testid="vehicle-scene" />,
}));
function setup(model = "premium") {
  return render(
    <MemoryRouter initialEntries={[`/configurator/${model}`]}>
      <AudioProvider>
        <Routes>
          <Route path="/configurator/:model" element={<ConfiguratorPage />} />
        </Routes>
      </AudioProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  useConfigurator.getState().reset();
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

it.each(["nismo", "tspec", "gtr50", "gt3", "formula-e"])(
  "omits unavailable scene controls from the %s DOM while keeping navigation and details",
  async (model) => {
    const { container } = setup(model);
    expect(screen.getByRole("main").getAttribute("data-asset-state")).toBe(
      "missing",
    );
    for (const name of [
      "Camera",
      "Environment",
      "Lights",
      "Rotate",
      "Pearl White",
    ])
      expect(screen.queryByRole("button", { name, hidden: true })).toBeNull();
    expect(container.querySelector(".config-toolbar, .paint-rail")).toBeNull();
    expect(screen.queryByTestId("vehicle-scene")).toBeNull();
    expect(screen.getByRole("link", { name: "Back to models" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Switch model" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Turn sound on" })).toBeTruthy();
    expect(container.querySelectorAll(".asset-status")).toHaveLength(1);
    const user = userEvent.setup();
    expect(document.querySelector(".config-title > p")).toBeNull();
    const details = screen.getByRole("button", { name: "Model detail" });
    await user.click(details);
    expect(
      screen.getByRole("dialog").querySelector(".key-figures"),
    ).not.toBeNull();
    expect(
      screen.getByRole("dialog").querySelectorAll("dl > div"),
    ).toHaveLength(4);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(details);
  },
);

it("restores scene controls when switching from a missing model to a loading asset", async () => {
  setup("formula-e");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Switch model" }));
  await user.click(screen.getByRole("button", { name: /^Premium / }));
  expect(screen.getByRole("main").getAttribute("data-asset-state")).toBe(
    "available",
  );
  expect(useConfigurator.getState().ready).toBe(false);
  for (const name of [
    "Camera",
    "Environment",
    "Lights",
    "Rotate",
    "Pearl White",
  ])
    expect(screen.getByRole("button", { name })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Environment" }));
  expect(
    screen.getByRole("radio", { name: /^Reduced/ }).hasAttribute("disabled"),
  ).toBe(false);
});

it("keeps the cabin disclosure concise and connected to Interior", async () => {
  const { container } = setup();
  act(() => useConfigurator.setState({ ready: true }));
  await userEvent.setup().click(screen.getByRole("button", { name: "Camera" }));
  const dialog = screen.getByRole("dialog", { name: "Camera" });
  expect(
    within(dialog).queryByText(/Find the form from every angle/),
  ).toBeNull();
  expect(container.querySelector("#cabin-preview-note")?.textContent).toBe(
    "Cabin preview · Work in progress. Original approximation, not a verified factory interior. Instruments are static.",
  );
  expect(
    within(dialog)
      .getByRole("button", { name: "Interior" })
      .getAttribute("aria-describedby"),
  ).toBe("cabin-preview-note");
});

it("states quality tradeoffs and visit lifetime without extra introductory prose", async () => {
  setup();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Environment" }));
  const dialog = screen.getByRole("dialog", { name: "Environment" });
  expect(
    within(dialog).queryByText(
      "Lighting, reflections and background change together.",
    ),
  ).toBeNull();
  const group = within(dialog).getByRole("group", {
    name: "Rendering quality",
  });
  expect(group.textContent).toMatch(/2 million pixels.*default/);
  expect(group.textContent).toMatch(/1 million pixels.*softer fine detail/);
  expect(dialog.querySelector("#render-quality-note")?.textContent).toBe(
    "Reduced may help on larger screens; small screens may be unchanged. Both retain anti-aliasing. Choice lasts this visit; reload restores Standard.",
  );
});

it("uses one shared missing-asset layout with no reserved toolbar or paint rows", () => {
  const css = parse(readFileSync("src/styles.css", "utf8"));
  const selector = '.configurator[data-asset-state="missing"]';
  function properties(suffix = "") {
    const result: Record<string, string> = {};
    const matching: string[] = [];
    css.walkRules((rule) => {
      if (rule.selector.replace(/\s+/g, " ") !== selector + suffix) return;
      // A single layout applies to all widths, not breakpoint-specific patches.
      expect(rule.parent?.type).toBe("root");
      matching.push(rule.selector);
      rule.walkDecls((declaration) => {
        result[declaration.prop] = declaration.value;
      });
    });
    expect(matching).toHaveLength(1);
    return result;
  }
  expect(properties()).toMatchObject({
    "min-height": "0",
    display: "grid",
    "grid-template-rows": "auto minmax(0, 1fr) auto",
  });
  expect(properties(" .scene-stage")).toMatchObject({
    position: "relative",
    inset: "auto",
    "grid-row": "2",
  });
  expect(properties(" .scene-bottom")).toMatchObject({
    position: "relative",
    inset: "auto",
    "grid-row": "3",
  });
  expect(properties(" .scene-bottom button")["min-height"]).toBe("44px");
  expect(properties(" .reference-view > .reference-unavailable").padding).toBe(
    "24px",
  );
});
