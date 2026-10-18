// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Link, MemoryRouter, useNavigate, useParams } from "react-router-dom";
import { App } from "../src/App";

const deferred = vi.hoisted(() => ({
  ready: true,
  promise: Promise.resolve() as Promise<void>,
  release: () => {},
}));
vi.mock("../src/pages/HomePage", () => ({
  HomePage: () => <h1>Home introduction</h1>,
}));
vi.mock("../src/pages/ModelsPage", () => ({
  ModelsPage: () => (
    <>
      <h1>Choose your expression.</h1>
      <Link to="/models?sort=name">Sort by name</Link>
      <Link to="/models#collection">Jump to collection</Link>
      <Link to="/credits#films">Film sources</Link>
      <div id="collection">Collection</div>
    </>
  ),
}));
vi.mock("../src/pages/HeritagePage", () => ({
  HeritagePage: () => <h1>Heritage introduction</h1>,
}));
vi.mock("../src/pages/CreditsPage", () => ({
  CreditsPage: () => (
    <>
      <h1>Credits and sources</h1>
      <section id="films">
        <h2>Film credits</h2>
      </section>
    </>
  ),
}));
vi.mock("../src/pages/ConfiguratorPage", () => ({
  ConfiguratorPage: () => {
    const { model } = useParams();
    if (model === "unknown")
      return (
        <div className="not-found">
          <h1>That model isn’t in the lab.</h1>
        </div>
      );
    if (!deferred.ready) throw deferred.promise;
    return (
      <main>
        <h1>GT-R R35</h1>
      </main>
    );
  },
}));
function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Browser back</button>
      <button onClick={() => navigate("/configurator/unknown")}>
        Unknown model
      </button>
    </>
  );
}
function show(path = "/heritage") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HistoryControls />
      <App />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  deferred.ready = true;
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("moves keyboard focus to the new page heading after navigation", () => {
  show();
  const models = screen.getByRole("link", { name: "Models" });
  models.focus();
  fireEvent.click(models);
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { level: 1 }),
  );
  expect(document.activeElement?.textContent).toBe("Choose your expression.");
});
it("does not take focus on initial load", () => {
  const before = document.createElement("button");
  document.body.append(before);
  before.focus();
  show();
  expect(document.activeElement).toBe(before);
  before.remove();
});
it.each(["Sort by name", "Jump to collection"])(
  "preserves focus for same-page %s navigation",
  (name) => {
    show("/models");
    const link = screen.getByRole("link", { name });
    link.focus();
    fireEvent.click(link);
    expect(document.activeElement).toBe(link);
  },
);
it("keeps route focus from adding a second scroll or replacing browser back behavior", () => {
  show();
  fireEvent.click(screen.getByRole("link", { name: "Models" }));
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  vi.mocked(window.scrollTo).mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Browser back" }));
  expect(document.activeElement?.textContent).toBe("Heritage introduction");
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  // Existing application policy is one scroll reset per route, including POP.
  expect(window.scrollTo).toHaveBeenCalledTimes(1);
  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  focus.mockRestore();
});
it("waits for lazy content before selecting a focus target", async () => {
  show();
  deferred.ready = false;
  deferred.promise = new Promise<void>((resolve) => {
    deferred.release = resolve;
  });
  const trigger = screen.getByRole("link", { name: "Enter configurator" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.queryByRole("heading", { name: "GT-R R35" })).toBeNull();
  await act(async () => {
    deferred.ready = true;
    deferred.release();
  });
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "GT-R R35" }),
  );
});
it.each([
  ["/", "GT-R LAB — Engineered to defy."],
  ["/models", "GT-R LAB — Models"],
  ["/heritage", "GT-R LAB — Heritage"],
  ["/about", "GT-R LAB — Heritage"],
  ["/credits", "GT-R LAB — Credits & sources"],
  ["/models/", "GT-R LAB — Models"],
  ["/configurator", "GT-R LAB — Premium configurator"],
  ["/configurator/premium", "GT-R LAB — Premium configurator"],
  ["/configurator/premium?study=2008", "GT-R LAB — 2008 GT-R R35 Study"],
  ["/configurator/nismo?study=2008", "GT-R LAB — NISMO configurator"],
  ["/configurator/nismo", "GT-R LAB — NISMO configurator"],
  ["/unmapped-route", "GT-R LAB — Page not found"],
  ["/configurator/unknown", "GT-R LAB — Model not found"],
])("describes the actual %s page in the document title", (path, title) => {
  show(path);
  expect(document.title).toBe(title);
});

it("leaves focus with a modal that owns the destination opening", () => {
  show();
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  dialog.innerHTML = "<button>Continue without 3D</button>";
  document.body.append(dialog);
  const control = dialog.querySelector("button")!;
  control.focus();
  fireEvent.click(screen.getByRole("link", { name: "Models" }));
  expect(document.activeElement).toBe(control);
  dialog.remove();
});

it("focuses the existing invalid-model error heading even outside a main landmark", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Unknown model" }));
  await act(async () => {});
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "That model isn’t in the lab." }),
  );
});

it("focuses a cross-page fragment destination rather than the page heading", () => {
  show("/models");
  fireEvent.click(screen.getByRole("link", { name: "Film sources" }));
  expect(document.activeElement).toBe(
    screen.getByRole("heading", { name: "Film credits" }),
  );
});
