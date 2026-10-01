import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
interface AudioState {
  enabled: boolean;
  toggle: () => void;
  play: () => void;
  error: string | null;
}
const AudioContextValue = createContext<AudioState>({
  enabled: false,
  toggle: () => {},
  play: () => {},
  error: null,
});
function remember(enabled: boolean) {
  try {
    localStorage.setItem("gtr-lab:sound", enabled ? "on" : "off");
  } catch {
    /* optional persistence */
  }
}
export function AudioProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const mounted = useRef(true);
  const active = useRef(new Set<OscillatorNode>());
  useEffect(() => {
    mounted.current = true;
    try {
      enabledRef.current = localStorage.getItem("gtr-lab:sound") === "on";
      setEnabled(enabledRef.current);
    } catch {
      /* storage unavailable */
    }
    return () => {
      mounted.current = false;
      enabledRef.current = false;
      void ctx.current?.close().catch(() => {});
      ctx.current = null;
      active.current.clear();
    };
  }, []);
  function fail(message: string) {
    if (!mounted.current) return;
    enabledRef.current = false;
    setEnabled(false);
    remember(false);
    setError(message);
  }
  // This function is called only by click handlers, never by an effect or timer.
  function cue() {
    try {
      const AudioConstructor = window.AudioContext;
      if (!AudioConstructor) throw new Error("Audio unavailable");
      ctx.current ??= new AudioConstructor();
      const context = ctx.current;
      void context
        .resume()
        .then(() => {
          if (
            !mounted.current ||
            !enabledRef.current ||
            context.state === "closed"
          )
            return;
          const now = context.currentTime;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(380, now);
          oscillator.frequency.exponentialRampToValueAtTime(180, now + 0.12);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.028, now + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
          oscillator.connect(gain);
          gain.connect(context.destination);
          active.current.add(oscillator);
          oscillator.start(now);
          oscillator.stop(now + 0.17);
          oscillator.onended = () => {
            active.current.delete(oscillator);
            oscillator.disconnect();
            gain.disconnect();
          };
        })
        .catch(() => fail("Sound could not start. Try enabling it again."));
    } catch {
      fail("Sound is unavailable in this browser.");
    }
  }
  function toggle() {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    setError(null);
    remember(next);
    if (next) cue();
    else
      for (const oscillator of active.current) {
        try {
          oscillator.stop();
        } catch {
          /* already stopped */
        }
      }
  }
  return (
    <AudioContextValue.Provider
      value={{
        enabled,
        toggle,
        play: () => {
          if (enabledRef.current) cue();
        },
        error,
      }}
    >
      {children}
    </AudioContextValue.Provider>
  );
}
export const useAudio = () => useContext(AudioContextValue);
