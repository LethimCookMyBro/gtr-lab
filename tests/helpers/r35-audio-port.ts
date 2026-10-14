import { vi } from "vitest";
/** Web Audio command port for CPU lifecycle tests; no real sound or sockets. */
export class SectionAudioPort {
  static instances: SectionAudioPort[] = [];
  state: AudioContextState = "running";
  currentTime = 10;
  destination = {};
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {
    this.state = "closed";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 7.60056689342404 }));
  sources: ReturnType<SectionAudioPort["makeSource"]>[] = [];
  gains: ReturnType<SectionAudioPort["makeGain"]>[] = [];
  private makeSource() {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      buffer: null as unknown,
      loop: false,
      onended: null as (() => void) | null,
    };
  }
  private makeGain() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      },
    };
  }
  createBufferSource = () => {
    const node = this.makeSource();
    this.sources.push(node);
    return node;
  };
  createGain = () => {
    const node = this.makeGain();
    this.gains.push(node);
    return node;
  };
  constructor() {
    SectionAudioPort.instances.push(this);
  }
}
export const flushAudio = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
export function installSectionAudioPort() {
  SectionAudioPort.instances = [];
  vi.stubGlobal("AudioContext", SectionAudioPort);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    })),
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    value: { isActive: true },
  });
}
export const trustedGesture = (type = "pointerdown") =>
  ({
    type,
    isTrusted: true,
    defaultPrevented: false,
    target: document.body,
    button: 0,
    key: "Enter",
    repeat: false,
  }) as unknown as Event;
