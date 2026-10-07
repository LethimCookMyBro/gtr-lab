import { useEffect, useRef } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useConfigurator } from "../../stores/configurator";
import { formatModelBytes } from "../home/homeReadiness";
import type { CabinSeat } from "../three/cabinPreview";
const seats: { id: CabinSeat; label: string }[] = [
  { id: "driver", label: "Driver" },
  { id: "passenger", label: "Passenger" },
  { id: "rear", label: "Rear seat" },
];
export function CabinPreviewControls({
  onExit,
  reducedMotion,
}: {
  onExit: () => void;
  reducedMotion: boolean;
}) {
  const { cabin, beginCabin, setCabinSeat } = useConfigurator();
  const focus = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cabin.phase === "closed") return;
    // Let the existing drawer finish its focus-return lifecycle first.
    const timer = window.setTimeout(
      () => {
        if (
          useConfigurator.getState().panel ||
          document.querySelector('[role="dialog"]')
        )
          return;
        focus.current?.focus({ preventScroll: true });
      },
      reducedMotion ? 0 : 300,
    );
    return () => window.clearTimeout(timer);
  }, [cabin.phase, reducedMotion]);
  if (cabin.phase === "closed") return null;
  const progress = cabin.phase === "loading" ? cabin.progress : null;
  const downloading = progress?.phase === "downloading" ? progress : null;
  return (
    <footer
      className="paint-rail cabin-preview-controls"
      aria-label="Cabin preview controls"
    >
      <div className="cabin-preview-copy">
        <strong>Cabin preview · work in progress</strong>
        {cabin.phase !== "error" && (
          <p>
            Original authored R35 approximation. Not an official factory
            interior.
          </p>
        )}
      </div>
      {cabin.phase === "active" ? (
        <>
          <div
            className="cabin-seat-choices"
            role="group"
            aria-label="Fixed cabin seats"
          >
            {seats.map((seat) => (
              <button
                key={seat.id}
                ref={seat.id === "driver" ? focus : undefined}
                aria-pressed={cabin.seat === seat.id}
                onClick={() => setCabinSeat(seat.id)}
              >
                {seat.label}
              </button>
            ))}
          </div>
          <button className="text-link cabin-exit" onClick={onExit}>
            <ArrowLeft size={17} />
            Back to exterior
          </button>
        </>
      ) : cabin.phase === "loading" ? (
        <>
          <div className="cabin-load-status" role="status" aria-live="polite">
            <span>
              {downloading
                ? "Downloading cabin"
                : progress?.phase === "decoding"
                  ? "Decoding cabin geometry"
                  : "Preparing cabin rendering"}
            </span>
            {downloading && (
              <small>
                {formatModelBytes(downloading.loadedBytes)}
                {downloading.totalBytes
                  ? ` / ${formatModelBytes(downloading.totalBytes)}`
                  : ""}
              </small>
            )}
            {downloading?.totalBytes ? (
              <progress
                aria-label="Cabin download"
                max={downloading.totalBytes}
                value={downloading.loadedBytes}
              />
            ) : (
              <span className="cabin-load-indeterminate" aria-hidden="true" />
            )}
          </div>
          <button ref={focus} className="text-link" onClick={onExit}>
            Cancel cabin loading
          </button>
        </>
      ) : (
        <>
          <p role="alert" className="cabin-load-error">
            Cabin preview couldn’t load. {cabin.message}
          </p>
          <div className="cabin-recovery">
            <button ref={focus} className="text-link" onClick={beginCabin}>
              <RefreshCw size={16} />
              Retry cabin preview
            </button>
            <button className="text-link" onClick={onExit}>
              Back to exterior
            </button>
          </div>
        </>
      )}
    </footer>
  );
}
