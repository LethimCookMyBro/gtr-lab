import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { homeFilms } from "../../data/films";

function DialogPlayer({ onRetry }: { onRetry: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (loaded || failed) return;
    const timeout = window.setTimeout(() => setFailed(true), 20000);
    return () => window.clearTimeout(timeout);
  }, [loaded, failed]);
  return (
    <>
      <div
        className="home-film-dialog-player"
        data-film-state={
          failed ? "unavailable" : loaded ? "embedded" : "loading"
        }
        aria-busy={!loaded && !failed}
      >
        {failed ? (
          <div className="home-film-dialog-recovery">
            <p>Try again or watch the publisher’s original.</p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setFailed(false);
                  onRetry();
                }}
                aria-label="Retry driving film"
              >
                Retry film
              </button>
              <a href={homeFilms.detail.page} target="_blank" rel="noreferrer">
                Watch original on Flixel
              </a>
            </div>
          </div>
        ) : (
          <iframe
            ref={frame}
            src={homeFilms.detail.embed}
            title="Enlarged Nissan GT-R driving film"
            allow="autoplay; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={(event) => {
              // Loading the cross-origin document does not establish video playback.
              if (event.currentTarget === frame.current) setLoaded(true);
            }}
          />
        )}
      </div>
      <p className="home-film-dialog-status" role="status">
        {failed
          ? "The embedded film could not load."
          : loaded
            ? "If the film stays blank, watch the original on Flixel below."
            : "Loading the publisher’s player…"}
      </p>
    </>
  );
}

export function FilmDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    const node = dialog.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="home-film-dialog"
      aria-label="GT-R driving film"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const targets = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button, a[href], iframe, [tabindex="0"]',
          ),
        ];
        const first = targets[0];
        const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="home-film-dialog-shell">
        <header>
          <div>
            <p>NISSAN GT-R · ON TRACK</p>
            <h2>A closer look.</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close driving film"
            autoFocus
          >
            <span>Close</span>
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        {open && visible && (
          <DialogPlayer
            onRetry={() => closeButton.current?.focus({ preventScroll: true })}
          />
        )}
        <footer>
          <span>A short track loop from NissanNews.</span>
          <a href={homeFilms.detail.page} target="_blank" rel="noreferrer">
            © NissanNews · Original on Flixel
          </a>
        </footer>
      </div>
    </dialog>
  );
}
