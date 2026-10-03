// @vitest-environment jsdom
import { Component } from "react";
import type { ReactNode } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { RearSignature } from "../src/components/home/RearSignature";

// Reject the actual lazy import, before RearVehicleScene can mount its boundary.
vi.mock("../src/components/home/RearVehicleScene", () => {
  throw new Error("Deliberately unavailable rear scene chunk");
});

let notify: IntersectionObserverCallback;
class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p>The whole page failed</p>
    ) : (
      this.props.children
    );
  }
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => ({ loseContext() {} }),
  } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
  // React logs caught errors; the deliberately rejected import is expected here.
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("contains a rejected scene import and offers reload instead of a cached lazy retry", async () => {
  render(
    <MemoryRouter>
      <PageBoundary>
        <h1>The rest of the homepage</h1>
        <RearSignature />
        <a href="/models">Continue exploring models</a>
      </PageBoundary>
    </MemoryRouter>,
  );
  act(() =>
    notify(
      [{ isIntersecting: true }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    ),
  );
  await waitFor(() =>
    expect(
      document.querySelector(
        '.home-signature-runway[data-scene-state="error"]',
      ),
    ).not.toBeNull(),
  );
  expect(
    screen.getByRole("heading", { name: "The rest of the homepage" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Continue exploring models" }),
  ).toBeTruthy();
  expect(screen.queryByText("The whole page failed")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Reload the page");
  expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Retry 3D view" })).toBeNull();
  expect(document.querySelector('[aria-busy="true"]')).toBeNull();
});
