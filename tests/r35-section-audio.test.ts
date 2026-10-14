// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  R35SectionAudioController,
  sectionViewportFraction,
} from "../src/audio/r35SectionAudioController";
import { rememberSiteSound } from "../src/audio/siteSoundPreference";
import {
  SectionAudioPort,
  flushAudio,
  installSectionAudioPort,
  trustedGesture,
} from "./helpers/r35-audio-port";
const controllers: R35SectionAudioController[] = [];
const create = (preferences = { reducedMotion: false, saveData: false }) => {
  const controller = new R35SectionAudioController(preferences);
  controllers.push(controller);
  return controller;
};
beforeEach(() => {
  localStorage.clear();
  installSectionAudioPort();
});
afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe("section entry sound", () => {
  it("scrolling alone and fabricated pointer/key events never unlock audio", async () => {
    const controller = create();
    controller.setViewportFraction(1);
    document.dispatchEvent(new Event("scroll"));
    document.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await flushAudio();
    expect(fetch).not.toHaveBeenCalled();
    expect(SectionAudioPort.instances).toHaveLength(0);
  });
  it("the first trusted gesture prepares offscreen and a later entry plays only once", async () => {
    const controller = create();
    controller.onGesture(trustedGesture());
    await flushAudio();
    const context = SectionAudioPort.instances[0];
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(context.sources).toHaveLength(0);
    controller.setViewportFraction(0.7);
    await flushAudio();
    expect(context.sources).toHaveLength(1);
    context.sources[0].onended?.();
    controller.setViewportFraction(1);
    controller.onGesture(trustedGesture("keydown"));
    await flushAudio();
    expect(context.sources).toHaveLength(1);
    controller.setViewportFraction(0);
    controller.setViewportFraction(1);
    await flushAudio();
    expect(context.sources).toHaveLength(2);
  });
  it("does not turn a threshold wobble into a new entry", async () => {
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(0.7);
    await flushAudio();
    controller.setViewportFraction(0.4);
    controller.setViewportFraction(0.7);
    await flushAudio();
    expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
    expect(
      SectionAudioPort.instances[0].sources[0].stop,
    ).not.toHaveBeenCalled();
    controller.setViewportFraction(0.1);
    expect(SectionAudioPort.instances[0].sources[0].stop).toHaveBeenCalledWith(
      10.08,
    );
  });
  it.each([
    { reducedMotion: true, saveData: false },
    { reducedMotion: false, saveData: true },
  ])("requires the Sound control opt-in for %o", async (preferences) => {
    localStorage.setItem("gtr-lab:sound", "on");
    const controller = create(preferences);
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    expect(controller.getSnapshot().enabled).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    controller.toggleFromGesture(trustedGesture("click"));
    await flushAudio();
    expect(controller.getSnapshot().enabled).toBe(true);
    expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
  });
  it("honors persisted global mute even when the recording preference says unmuted", async () => {
    localStorage.setItem("gtr-lab:sound", "off");
    localStorage.setItem("gtr-lab:r35-sample-muted", "false");
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(0);
    expect(controller.getSnapshot().enabled).toBe(false);
  });
  it("global same-tab mute stops immediately and later unmute does not resume", async () => {
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    const source = SectionAudioPort.instances[0].sources[0];
    rememberSiteSound(false);
    expect(source.stop).toHaveBeenCalledExactlyOnceWith();
    expect(controller.getSnapshot().enabled).toBe(false);
    rememberSiteSound(true);
    controller.setViewportFraction(1);
    await flushAudio();
    expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
  });
  it("explicit off persists both preferences and aborts an offscreen preparation", async () => {
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const controller = create();
    controller.onGesture(trustedGesture());
    await flushAudio();
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    controller.toggleFromGesture(trustedGesture("click"));
    expect(signal?.aborted).toBe(true);
    expect(localStorage.getItem("gtr-lab:sound")).toBe("off");
    expect(localStorage.getItem("gtr-lab:r35-sample-muted")).toBe("true");
  });
  it.each(["visibilitychange", "pagehide", "popstate", "hashchange"])(
    "%s urgently stops a fading source and never auto-resumes",
    async (event) => {
      const controller = create();
      controller.onGesture(trustedGesture());
      controller.setViewportFraction(1);
      await flushAudio();
      controller.setViewportFraction(0);
      const source = SectionAudioPort.instances[0].sources[0];
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      (event === "visibilitychange" ? document : window).dispatchEvent(
        new Event(event),
      );
      expect(source.stop).toHaveBeenLastCalledWith();
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await flushAudio();
      expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
    },
  );
  it("changing to a restrictive preference cancels playback until explicit opt-in", async () => {
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    controller.setPreferences({ reducedMotion: true, saveData: false });
    expect(
      SectionAudioPort.instances[0].sources[0].stop,
    ).toHaveBeenLastCalledWith();
    expect(controller.getSnapshot().enabled).toBe(false);
  });
  it("disposal removes gesture listeners and rejects later load completion", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    controller.dispose();
    resolve({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    await flushAudio();
    controller.onGesture(trustedGesture());
    expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
    expect(SectionAudioPort.instances[0].close).toHaveBeenCalledOnce();
  });
});
describe("reachable viewport entry thresholds", () => {
  it("uses the smaller visible viewport area for a tall section in short landscape", () => {
    expect(
      sectionViewportFraction(
        {
          left: 0,
          right: 960,
          top: -200,
          bottom: 840,
          width: 960,
          height: 1040,
        },
        960,
        400,
      ),
    ).toBe(1);
    expect(
      sectionViewportFraction(
        {
          left: 0,
          right: 960,
          top: 180,
          bottom: 1220,
          width: 960,
          height: 1040,
        },
        960,
        400,
      ),
    ).toBe(0.55);
  });
  it("normalizes small sections and safely rejects empty/outside geometry", () => {
    expect(
      sectionViewportFraction(
        { left: 0, right: 100, top: 0, bottom: 100, width: 100, height: 100 },
        960,
        400,
      ),
    ).toBe(1);
    expect(
      sectionViewportFraction(
        { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
        960,
        400,
      ),
    ).toBe(0);
  });
});

describe("trusted activation boundaries", () => {
  it.each([
    { type: "keydown", key: "Shift" },
    { type: "keydown", key: "Enter", repeat: true },
    { type: "keydown", key: "a", ctrlKey: true },
    { type: "pointerdown", button: 2 },
    { type: "pointerdown", isPrimary: false },
  ])("ignores %o", async (patch) => {
    const controller = create();
    controller.onGesture({ ...trustedGesture(patch.type), ...patch } as Event);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(0);
  });
  it("waits for browser activation on touch pointer-up rather than failing at pointer-down", async () => {
    const controller = create();
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: false },
    });
    controller.onGesture(trustedGesture());
    expect(controller.getSnapshot().error).toBeNull();
    Object.defineProperty(navigator, "userActivation", {
      configurable: true,
      value: { isActive: true },
    });
    controller.onGesture(trustedGesture("pointerup"));
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(1);
  });
  it("does not unlock from a Sound-control pointer-down or within an open modal", async () => {
    const controller = create();
    const button = document.createElement("button");
    button.setAttribute("data-r35-sound-control", "");
    document.body.append(button);
    controller.onGesture({ ...trustedGesture(), target: button } as Event);
    expect(SectionAudioPort.instances).toHaveLength(0);
    const dialog = document.createElement("dialog");
    dialog.open = true;
    document.body.append(dialog);
    controller.onGesture(trustedGesture());
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(0);
    button.remove();
    dialog.remove();
  });
  it("a cross-tab sample mute stops playback without writing storage back", async () => {
    const controller = create();
    controller.onGesture(trustedGesture());
    controller.setViewportFraction(1);
    await flushAudio();
    localStorage.setItem("gtr-lab:r35-sample-muted", "true");
    const writes = vi.spyOn(Storage.prototype, "setItem");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "gtr-lab:r35-sample-muted",
        newValue: "true",
      }),
    );
    expect(controller.getSnapshot().muted).toBe(true);
    expect(
      SectionAudioPort.instances[0].sources[0].stop,
    ).toHaveBeenLastCalledWith();
    expect(writes).not.toHaveBeenCalled();
    rememberSiteSound(true);
    expect(controller.getSnapshot().enabled).toBe(false);
  });
});

it("opening any home menu dialog stops the active source, and closing it does not resume", async () => {
  const controller = create();
  controller.onGesture(trustedGesture());
  controller.setViewportFraction(1);
  await flushAudio();
  const dialog = document.createElement("div");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  document.body.append(dialog);
  await flushAudio();
  expect(
    SectionAudioPort.instances[0].sources[0].stop,
  ).toHaveBeenCalledExactlyOnceWith();
  dialog.remove();
  await flushAudio();
  controller.setViewportFraction(1);
  expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
});
it("an already-open modal prevents viewport playback even before observer delivery", async () => {
  const controller = create();
  controller.onGesture(trustedGesture());
  await flushAudio();
  const dialog = document.createElement("dialog");
  document.body.append(dialog);
  dialog.open = true;
  controller.setViewportFraction(1);
  await flushAudio();
  expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
});

function appendOpeningGate() {
  const gate = document.createElement("dialog");
  gate.className = "home-loading-gate";
  gate.open = true;
  const button = document.createElement("button");
  button.className = "home-opening-continue";
  button.textContent = "Continue browsing";
  gate.append(button);
  document.body.append(gate);
  return { gate, button };
}
describe("opening Continue activation exception", () => {
  it.each(["pointerdown", "pointerup", "keydown"])(
    "prepares offscreen from trusted %s on Continue then plays on later entry",
    async (type) => {
      const { gate, button } = appendOpeningGate();
      const controller = create();
      controller.onGesture({
        ...trustedGesture(type),
        target: button,
      } as Event);
      await flushAudio();
      expect(SectionAudioPort.instances).toHaveLength(1);
      expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
      gate.open = false;
      await flushAudio();
      expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
      controller.setViewportFraction(1);
      await flushAudio();
      expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
    },
  );
  it("starts an unattempted restored-scroll entry once when Continue closes the gate", async () => {
    const { gate, button } = appendOpeningGate();
    const controller = create();
    controller.setViewportFraction(1);
    controller.onGesture({ ...trustedGesture(), target: button } as Event);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(1);
    const context = SectionAudioPort.instances[0];
    expect(context.sources).toHaveLength(0);
    gate.open = false;
    await flushAudio();
    expect(context.sources).toHaveLength(1);
    const menu = document.createElement("dialog");
    menu.open = true;
    document.body.append(menu);
    await flushAudio();
    expect(context.sources[0].stop).toHaveBeenCalledExactlyOnceWith();
    menu.open = false;
    await flushAudio();
    controller.setViewportFraction(1);
    expect(context.sources).toHaveLength(1);
  });
  it("rejects Continue preparation when another modal is also open", async () => {
    const { button } = appendOpeningGate();
    const menu = document.createElement("dialog");
    menu.open = true;
    document.body.append(menu);
    const controller = create();
    controller.onGesture({ ...trustedGesture(), target: button } as Event);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(0);
  });
  it("does not exempt other gate buttons or non-activation keys", async () => {
    const { gate, button } = appendOpeningGate();
    const retry = document.createElement("button");
    gate.append(retry);
    const controller = create();
    controller.onGesture({ ...trustedGesture(), target: retry } as Event);
    controller.onGesture({
      ...trustedGesture("keydown"),
      key: "Tab",
      target: button,
    } as unknown as Event);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(0);
  });
  it("cancels the pending Continue release if another modal intervenes", async () => {
    const { gate, button } = appendOpeningGate();
    const controller = create();
    controller.setViewportFraction(1);
    controller.onGesture({ ...trustedGesture(), target: button } as Event);
    await flushAudio();
    const menu = document.createElement("dialog");
    menu.open = true;
    document.body.append(menu);
    gate.open = false;
    await flushAudio();
    menu.open = false;
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(1);
    expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
  });
});

describe("modal opener unlock without wasted recording fetch", () => {
  it.each(["pointerdown", "pointerup", "keydown"])(
    "a trusted Menu %s unlocks without fetching before its modal opens",
    async (type) => {
      const controller = create();
      const menuButton = document.createElement("button");
      menuButton.className = "home-menu-trigger";
      menuButton.setAttribute("aria-haspopup", "dialog");
      menuButton.setAttribute("aria-expanded", "false");
      document.body.append(menuButton);
      controller.onGesture({
        ...trustedGesture(type),
        target: menuButton,
      } as Event);
      expect(SectionAudioPort.instances).toHaveLength(1);
      expect(SectionAudioPort.instances[0].resume).toHaveBeenCalledOnce();
      // Let resume resolve before React's later click opens the menu. This was
      // the actual CI race: a real request could start between pointerdown/click.
      await flushAudio();
      expect(fetch).not.toHaveBeenCalled();
      const menu = document.createElement("dialog");
      menu.open = true;
      document.body.append(menu);
      await flushAudio();
      expect(fetch).not.toHaveBeenCalled();
      expect(SectionAudioPort.instances[0].sources).toHaveLength(0);
      menu.open = false;
      await flushAudio();
      expect(fetch).not.toHaveBeenCalled();
      controller.setViewportFraction(1);
      await flushAudio();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
      expect(SectionAudioPort.instances[0].resume).toHaveBeenCalledOnce();
    },
  );
  it("does not fetch or play under the menu-opening gesture even if the car is already visible", async () => {
    const controller = create();
    controller.setViewportFraction(1);
    const button = document.createElement("button");
    button.setAttribute("aria-haspopup", "dialog");
    document.body.append(button);
    controller.onGesture({ ...trustedGesture(), target: button } as Event);
    await flushAudio();
    expect(fetch).not.toHaveBeenCalled();
    const menu = document.createElement("dialog");
    menu.open = true;
    document.body.append(menu);
    await flushAudio();
    menu.open = false;
    await flushAudio();
    expect(fetch).not.toHaveBeenCalled();
    controller.setViewportFraction(0);
    controller.setViewportFraction(1);
    await flushAudio();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(SectionAudioPort.instances[0].sources).toHaveLength(1);
  });
  it("uses the same unlock-only path for the existing film modal opener", async () => {
    const controller = create();
    const button = document.createElement("button");
    button.className = "home-film-enlarge";
    const icon = document.createElement("span");
    button.append(icon);
    document.body.append(button);
    controller.onGesture({ ...trustedGesture(), target: icon } as Event);
    await flushAudio();
    expect(SectionAudioPort.instances).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
