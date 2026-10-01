// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioProvider, useAudio } from "../src/hooks/useAudio";
function Controls() {
  const audio = useAudio();
  return (
    <>
      <button onClick={audio.toggle}>
        {audio.enabled ? "Sound on" : "Sound off"}
      </button>
      {audio.error && <p role="status">{audio.error}</p>}
    </>
  );
}
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});
describe("gesture-only audio preference", () => {
  it("does not create an audio context on mount even with a remembered preference", () => {
    localStorage.setItem("gtr-lab:sound", "on");
    const constructor = vi.fn();
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: constructor,
    });
    render(
      <AudioProvider>
        <Controls />
      </AudioProvider>,
    );
    expect(screen.getByText("Sound on")).toBeTruthy();
    expect(constructor).not.toHaveBeenCalled();
  });
  it("reverts persistent preference and shows a usable error when audio unsupported", async () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(
      <AudioProvider>
        <Controls />
      </AudioProvider>,
    );
    await userEvent.setup().click(screen.getByRole("button"));
    expect(screen.getByRole("button").textContent).toBe("Sound off");
    expect(screen.getByRole("status").textContent).toContain("unavailable");
    expect(localStorage.getItem("gtr-lab:sound")).toBe("off");
  });
});
