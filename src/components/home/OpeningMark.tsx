import { useCallback, useEffect, useRef } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { GtrWordmark } from "./GtrWordmark";
import { formatModelBytes, sceneLoadLabel } from "./homeReadiness";
import type { HomeSceneLoadState } from "./homeReadiness";

/** A viewport-level, accessible gate around the actual homepage preparation. */
export function OpeningMark({
  pending,
  scene,
  heroReady,
  reducedMotion,
  onContinue,
  onRetry,
}: {
  pending: boolean;
  scene: HomeSceneLoadState;
  heroReady: boolean;
  reducedMotion: boolean;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const releaseModal = useRef<(() => void) | null>(null);
  const latestPending = useRef(pending);
  latestPending.current = pending;
  const skipped = useRef(false);
  const closeGate = useCallback(
    (restoreFocus = true, element = dialog.current) => {
      const wasOpen = element?.hasAttribute("open");
      if (element) {
        if (typeof element.close === "function") element.close();
        else element.removeAttribute("open");
      }
      releaseModal.current?.();
      releaseModal.current = null;
      if (wasOpen && restoreFocus)
        document.getElementById("home-title")?.focus({ preventScroll: true });
    },
    [],
  );
  useEffect(() => {
    const element = dialog.current;
    return () => closeGate(false, element);
  }, [closeGate]);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!pending) {
      if (!element.hasAttribute("open")) {
        if (skipped.current)
          document.getElementById("home-title")?.focus({ preventScroll: true });
        skipped.current = false;
        return;
      }
      if (reducedMotion) {
        closeGate();
        return;
      }
      // The real dialog remains present only for this completion fade. The
      // deadline also releases it when transition events are suppressed.
      const finish = () => {
        if (!latestPending.current) closeGate();
      };
      const transition = (event: TransitionEvent) => {
        if (event.target === element && event.propertyName === "opacity")
          finish();
      };
      element.addEventListener("transitionend", transition);
      const deadline = window.setTimeout(finish, 360);
      return () => {
        window.clearTimeout(deadline);
        element.removeEventListener("transitionend", transition);
      };
    }
    if (element.hasAttribute("open")) return;
    const bodyOverflow = document.body.style.overflow;
    const rootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    skip.current?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons = [
        ...element.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      ];
      const first = buttons[0],
        last = buttons.at(-1);
      if (
        !element.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    releaseModal.current = () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = rootOverflow;
      document.removeEventListener("keydown", trap);
    };
  }, [pending, reducedMotion, closeGate]);
  const downloading = scene.phase === "downloading" ? scene : undefined;
  const total = downloading?.totalBytes;
  const label =
    scene.phase === "ready" || scene.phase === "deferred"
      ? "Preparing the opening image"
      : sceneLoadLabel(scene);
  return (
    <dialog
      ref={dialog}
      className="home-opening home-loading-gate"
      aria-label="Preparing GT-R LAB"
      aria-describedby="home-loading-status"
      aria-modal="true"
      data-state={
        pending ? (scene.phase === "error" ? "error" : "loading") : "resolved"
      }
      data-load-phase={scene.phase}
      onCancel={(event) => event.preventDefault()}
    >
      <div className="home-opening-center">
        <GtrWordmark
          sweep={pending && !reducedMotion && scene.phase !== "error"}
        />
        <span className="home-opening-rule" aria-hidden="true" />
        <p id="home-loading-status" role="status" aria-live="polite">
          {label}
        </p>
        {downloading && (
          <div className="home-loading-download">
            <progress
              aria-label="R35 model download"
              value={total ? downloading.loadedBytes : undefined}
              max={total || undefined}
              aria-valuenow={total ? downloading.loadedBytes : undefined}
              aria-valuemin={0}
              aria-valuemax={total}
            />
            <span>
              {formatModelBytes(downloading.loadedBytes)}
              {total ? ` / ${formatModelBytes(total)}` : " received"}
            </span>
          </div>
        )}
        <p className="home-loading-detail">
          {heroReady ? "Opening image ready" : "Loading the opening image"} ·
          Ciasny R35 exterior
        </p>
      </div>
      <div className="home-loading-actions">
        {scene.phase === "error" && (
          <button type="button" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" />
            {scene.recovery === "reload" ? "Reload page" : "Retry 3D view"}
          </button>
        )}
        <button
          ref={skip}
          className="home-opening-continue"
          type="button"
          onClick={() => {
            // Explicit skip never waits for the decorative completion fade.
            skipped.current = true;
            closeGate(false);
            onContinue();
          }}
        >
          Continue without 3D{" "}
          <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
