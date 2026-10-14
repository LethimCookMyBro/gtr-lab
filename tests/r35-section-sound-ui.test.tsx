// @vitest-environment jsdom
import { StrictMode, useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { Link, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { R35SectionSound } from "../src/components/home/R35SectionSound";
import { AudioProvider, useAudio } from "../src/hooks/useAudio";
import {
  SectionAudioPort,
  flushAudio,
  installSectionAudioPort,
  trustedGesture,
} from "./helpers/r35-audio-port";
function SiteControl() {
  const audio = useAudio();
  return (
    <button onClick={audio.toggle}>Site {audio.enabled ? "on" : "off"}</button>
  );
}
function Stage() {
  const section = useRef<HTMLElement>(null);
  return (
    <>
      <section ref={section}>
        <R35SectionSound
          sectionRef={section}
          reducedMotion={false}
          saveData={false}
        />
      </section>
      <Link to="/next">Next</Link>
      <SiteControl />
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  installSectionAudioPort();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: 960,
    top: 0,
    bottom: 1040,
    width: 960,
    height: 1040,
    x: 0,
    y: 0,
    toJSON() {},
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function show() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <AudioProvider>
          <Stage />
        </AudioProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}
async function activateMountedSection() {
  const listen = vi.spyOn(document, "addEventListener");
  const result = show();
  const callback = listen.mock.calls
    .filter(([name]) => name === "pointerdown")
    .at(-1)![1] as EventListener;
  await act(async () => {
    callback(trustedGesture());
    await flushAudio();
  });
  return result;
}
it("StrictMode mounts without network/context and keeps native accessible compact controls", () => {
  show();
  expect(fetch).not.toHaveBeenCalled();
  expect(SectionAudioPort.instances).toHaveLength(0);
  expect(
    screen
      .getByRole("button", { name: "Sound on" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    screen.getByRole("link", { name: "Credits for the R35 recording" })
      .textContent,
  ).toBe("Credits");
});
it("a real site's same-tab mute stops the section immediately", async () => {
  localStorage.setItem("gtr-lab:sound", "on");
  await activateMountedSection();
  const source = SectionAudioPort.instances[0].sources[0];
  expect(source.start).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Site on" }));
  expect(source.stop).toHaveBeenCalledExactlyOnceWith();
  expect(screen.getByRole("button", { name: "Sound off" })).toBeTruthy();
});
it("navigation disposes the current transport and cannot restart from a late event", async () => {
  await activateMountedSection();
  const context = SectionAudioPort.instances[0];
  fireEvent.click(screen.getByRole("link", { name: "Next" }));
  expect(context.sources[0].stop).toHaveBeenCalledExactlyOnceWith();
  expect(context.close).toHaveBeenCalledOnce();
  await act(flushAudio);
  expect(SectionAudioPort.instances).toHaveLength(1);
});
it("unmount closes the active context and clears ownership", async () => {
  const result = await activateMountedSection();
  const context = SectionAudioPort.instances[0];
  result.unmount();
  expect(context.sources[0].stop).toHaveBeenCalledExactlyOnceWith();
  expect(context.close).toHaveBeenCalledOnce();
});
