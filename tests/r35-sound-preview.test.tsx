// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Link } from "react-router-dom";
import { R35SoundPreview } from "../src/components/R35SoundPreview";
import { R35_SAMPLE_MUTED_KEY } from "../src/audio/r35AudioController";
class AudioPort {
  static instances: AudioPort[] = [];
  state = "running";
  currentTime = 0;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  decodeAudioData = vi.fn(async () => ({ duration: 7.60056689342404 }));
  source = {
    start: vi.fn(),
    stop: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    onended: null,
    buffer: null,
  };
  createBufferSource = () => this.source;
  createGain = () => ({
    connect() {},
    disconnect() {},
    gain: { setValueAtTime() {}, linearRampToValueAtTime() {} },
  });
  constructor() {
    AudioPort.instances.push(this);
  }
}
const flush = () =>
  act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
function mount() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <R35SoundPreview buttonClassName="integration-button" />
        <Link to="/models">Leave preview</Link>
      </MemoryRouter>
    </StrictMode>,
  );
}
beforeEach(() => {
  localStorage.clear();
  AudioPort.instances = [];
  vi.stubGlobal("AudioContext", AudioPort);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { isActive: true },
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("R35 Hear control", () => {
  it("mounts silently with meaningful source attribution and a gesture-only Hear control", () => {
    mount();
    expect(
      screen.getByRole("button", { name: "Hear the R35" }).className,
    ).toContain("integration-button");
    expect(
      screen.getByRole("link", { name: "CC BY-SA 3.0" }).getAttribute("href"),
    ).toBe("https://creativecommons.org/licenses/by-sa/3.0/");
    expect(screen.getByText(/Edvvc/)).toBeTruthy();
    expect(screen.getByText(/SpecV acceleration/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(AudioPort.instances).toHaveLength(0);
  });
  it("shows loading and lets the visitor cancel before a late response", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }) as Promise<Response>,
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Hear the R35" }));
    expect(screen.getByRole("status").textContent).toContain("Loading");
    fireEvent.click(screen.getByRole("button", { name: "Cancel loading" }));
    resolve({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    await flush();
    expect(screen.getByRole("button", { name: "Hear the R35" })).toBeTruthy();
    expect(AudioPort.instances[0].source.start).not.toHaveBeenCalled();
  });
  it("shows Stop during playback and cancels on React navigation even when the control stays mounted", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Hear the R35" }));
    await flush();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Leave preview" }));
    expect(screen.getByRole("button", { name: "Hear the R35" })).toBeTruthy();
    expect(AudioPort.instances[0].source.stop).toHaveBeenCalled();
  });
  it("remembers mute without resuming and requires explicit Hear after unmute", async () => {
    localStorage.setItem(R35_SAMPLE_MUTED_KEY, "true");
    mount();
    expect(
      (
        screen.getByRole("button", {
          name: "Hear the R35",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Unmute sample" }));
    await flush();
    expect(AudioPort.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Hear the R35" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Mute sample" }));
    expect(AudioPort.instances[0].source.stop).toHaveBeenCalled();
    expect(localStorage.getItem(R35_SAMPLE_MUTED_KEY)).toBe("true");
  });
  it("renders a recoverable error and makes Retry an explicit new gesture", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Hear the R35" }));
    await flush();
    expect(screen.getByRole("status").textContent).toContain("could not load");
    fireEvent.click(screen.getByRole("button", { name: "Retry R35 sound" }));
    await flush();
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeTruthy();
  });
  it("disposes live playback on unmount", async () => {
    const { unmount } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Hear the R35" }));
    await flush();
    unmount();
    expect(AudioPort.instances[0].source.stop).toHaveBeenCalled();
    expect(AudioPort.instances[0].close).toHaveBeenCalled();
  });
});
