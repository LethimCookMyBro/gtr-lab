import { useEffect, useRef, useState } from "react";
import { R35AudioController } from "./r35AudioController";
import type { R35AudioSnapshot } from "./r35AudioController";

/** Nothing is fetched or played by a React effect, including StrictMode remounts. */
export function useR35Audio(navigationKey: string) {
  const controller = useRef<R35AudioController | null>(null);
  const [snapshot, setSnapshot] = useState<R35AudioSnapshot>({
    phase: "idle",
    muted: false,
    error: null,
  });
  useEffect(() => {
    const next = new R35AudioController();
    controller.current = next;
    setSnapshot(next.getSnapshot());
    const unsubscribe = next.subscribe(() => setSnapshot(next.getSnapshot()));
    return () => {
      unsubscribe();
      next.dispose();
      if (controller.current === next) controller.current = null;
    };
  }, []);
  useEffect(() => {
    controller.current?.stop();
  }, [navigationKey]);
  return {
    ...snapshot,
    playFromGesture: () => controller.current?.playFromGesture(),
    stop: () => controller.current?.stop(),
    setMuted: (muted: boolean) => controller.current?.setMuted(muted),
  };
}
