// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SoundButton } from "../src/components/layout/SiteLayout";
import { AudioProvider } from "../src/hooks/useAudio";
import { rememberSiteSound } from "../src/audio/siteSoundPreference";
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("accurately describes the shared homepage preference while retaining the UI sound control", () => {
  const context = vi.fn();
  vi.stubGlobal("AudioContext", context);
  render(
    <AudioProvider>
      <SoundButton cueOnly />
    </AudioProvider>,
  );
  const button = screen.getByRole("button", { name: "Turn sound on" });
  expect(button.title).toBe(
    "Interface click cues · Also updates the homepage sound preference",
  );
  expect(button.textContent).toBe(" UI sound off");
  act(() => rememberSiteSound(true));
  expect(
    screen
      .getByRole("button", { name: "Turn sound off" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(context).not.toHaveBeenCalled();
});
