import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Square, Play, RotateCcw } from "lucide-react";
import { homeFilms } from "../../data/films";
import { mayAutoplay } from "./motion";
import "../../styles/home-film-entry.css";
/** Embed lifecycle only: Flixel exposes no verified playback event API here. */
export type FilmState = "loading" | "embedded" | "stopped" | "unavailable";
interface FilmProps {
  kind: "hero" | "detail";
  reducedMotion: boolean;
  saveData: boolean;
  suspended?: boolean;
  /** Prepare the hero while the opening is modal, without spending its retry deadline. */
  entryPending?: boolean;
  onStateChange?: (state: FilmState) => void;
  onFallbackReady?: () => void;
}
export function Film({
  kind,
  reducedMotion,
  saveData,
  suspended = false,
  entryPending = false,
  onStateChange,
  onFallbackReady,
}: FilmProps) {
  const holder = useRef<HTMLDivElement>(null);
  const backup = useRef<HTMLImageElement>(null);
  const [fallbackLoaded, setFallbackLoaded] = useState(false);
  const [posterDecoded, setPosterDecoded] = useState(false);
  useEffect(() => {
    const image = backup.current;
    if (!image?.complete || !image.naturalWidth) return;
    let live = true;
    // decode() covers cached images too; a load event alone is not our readiness barrier.
    const decoded =
      typeof image.decode === "function" ? image.decode() : Promise.resolve();
    void decoded
      .then(() => {
        if (!live || !image.naturalWidth) return;
        setPosterDecoded(true);
        // This certifies only the local photograph, never the hosted film.
        onFallbackReady?.();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [fallbackLoaded, onFallbackReady]);
  const frame = useRef<HTMLIFrameElement>(null);
  const entry = useRef<HTMLDivElement>(null);
  const focusPlayerAfterLoad = useRef(false);
  const [visible, setVisible] = useState(kind === "hero");
  const [coveredByModal, setCoveredByModal] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [choice, setChoice] = useState<"auto" | "play" | "stop">("auto");
  const [documentLoad, setDocumentLoad] = useState<{
    node: HTMLIFrameElement;
    kind: FilmProps["kind"];
    attempt: number;
  } | null>(null);
  const attachFrame = useCallback((node: HTMLIFrameElement | null) => {
    frame.current = node;
    // Ref attachment runs during commit, before paint. Never let a replacement
    // document inherit the previous node's presentation or keyboard readiness.
    setDocumentLoad((current) => (current?.node === node ? current : null));
  }, []);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const loaded =
    documentLoad !== null &&
    documentLoad.node === frame.current &&
    documentLoad.kind === kind &&
    documentLoad.attempt === attempt;
  const previousPolicy = useRef({ reducedMotion, saveData });
  const film = homeFilms[kind];
  const name = kind === "hero" ? "opening" : "detail";
  const title = kind === "hero" ? "Opening" : "Detail";
  const active =
    !suspended &&
    !coveredByModal &&
    !failed &&
    visible &&
    documentVisible &&
    choice !== "stop" &&
    (choice === "play" ||
      mayAutoplay({ reducedMotion, saveData, visible, documentVisible }));
  // A cross-origin iframe load ends document loading, but cannot verify media or playback.
  const state: FilmState = failed
    ? "unavailable"
    : active
      ? loaded
        ? "embedded"
        : "loading"
      : "stopped";
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);
  useEffect(() => {
    if (!loaded || !focusPlayerAfterLoad.current) return;
    focusPlayerAfterLoad.current = false;
    // The contextual control has gone away; keep keyboard focus at the film.
    if (document.activeElement === document.body) {
      frame.current?.focus({ preventScroll: true });
    }
  }, [loaded]);
  useEffect(() => {
    const element = holder.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    // The local photographs prepare from mount; the provider still waits for
    // the actual film viewport, then unmounts whenever it leaves view.
    const visibility = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { threshold: 0.1 },
    );
    visibility.observe(element);
    return () => {
      visibility.disconnect();
    };
  }, []);
  useEffect(() => {
    const onVisibility = () =>
      setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    // A modal's inline background cannot pause this cross-origin player.
    // Unmount it instead. The initial image gate deliberately permits the
    // opening embed to prepare in parallel without claiming playback readiness.
    const update = () =>
      setCoveredByModal(
        Boolean(
          document.querySelector(
            'dialog[open]:not(.home-loading-gate), [role="dialog"][aria-modal="true"]:not(.home-loading-gate)',
          ),
        ),
      );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "role", "aria-modal"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (
      (!previousPolicy.current.reducedMotion && reducedMotion) ||
      (!previousPolicy.current.saveData && saveData)
    ) {
      setChoice((current) => (current === "play" ? "auto" : current));
    }
    previousPolicy.current = { reducedMotion, saveData };
  }, [reducedMotion, saveData]);
  useEffect(() => {
    // Prepare in parallel with the photograph. A slow provider must not
    // expire before the visitor can reach the opening film.
    if (!active || loaded || entryPending) return;
    const timeout = window.setTimeout(() => setFailed(true), 20000);
    return () => window.clearTimeout(timeout);
  }, [active, loaded, kind, attempt, entryPending]);
  const retry = () => {
    setFailed(false);
    setAttempt((current) => current + 1);
    setChoice("play");
  };
  const toggle = () => {
    if (active) setChoice("stop");
    else retry();
  };
  return (
    <div
      ref={holder}
      className={`home-film home-film--${kind}`}
      data-film-provider="flixel"
      data-film-state={state}
      data-film-document={
        active
          ? loaded
            ? "loaded"
            : "loading"
          : failed
            ? "unavailable"
            : "unmounted"
      }
      data-film-playback={active ? "unverified" : "inactive"}
      data-film-poster={posterDecoded ? "decoded" : "loading"}
    >
      <div className="home-film-viewport">
        <img
          ref={backup}
          className="home-film-backup"
          onLoad={() => setFallbackLoaded(true)}
          src={
            kind === "hero"
              ? "/media/campaign-r35-orange-hero.webp"
              : "/images/gtr-premium.webp"
          }
          alt={
            kind === "hero"
              ? "Orange facelift Nissan GT-R R35 photographed by Martin Katler; modern example, exact model year unverified"
              : "2018 Nissan GT-R Premium in Super Silver"
          }
          loading="eager"
          fetchPriority={kind === "detail" ? "low" : undefined}
        />
        {active && (
          <iframe
            key={`${kind}:${attempt}`}
            ref={attachFrame}
            className="home-film-provider"
            inert={!loaded || (kind === "hero" && entryPending)}
            aria-hidden={
              !loaded || (kind === "hero" && entryPending) ? true : undefined
            }
            src={film.embed}
            title={`${title} film: ${film.description}`}
            allow="autoplay; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={(event) => {
              if (event.currentTarget !== frame.current) return;
              focusPlayerAfterLoad.current =
                entry.current === document.activeElement;
              setDocumentLoad({ node: event.currentTarget, kind, attempt });
            }}
          />
        )}
      </div>
      <div className="home-film-shade" aria-hidden="true" />
      {kind === "hero" &&
        !suspended &&
        !coveredByModal &&
        !entryPending &&
        visible &&
        documentVisible &&
        state !== "embedded" &&
        (!active || choice === "play") && (
          <div
            ref={entry}
            className="home-film-entry"
            data-pending={active}
            tabIndex={-1}
          >
            {!active && (
              <>
                {failed && <span role="status">Film could not load.</span>}
                <button
                  type="button"
                  aria-label={`${failed ? "Retry" : "Play"} opening video`}
                  onClick={() => {
                    entry.current?.focus({ preventScroll: true });
                    retry();
                  }}
                >
                  {failed ? (
                    <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Play size={16} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span>{failed ? "Retry film" : "Play film"}</span>
                </button>
              </>
            )}
          </div>
        )}
      <div className="home-film-controls">
        <div className="home-film-actions">
          <button
            type="button"
            className="home-film-toggle"
            onClick={toggle}
            aria-label={`${active ? "Stop" : failed ? "Retry" : "Play"} ${name} film`}
          >
            {active ? (
              <Square size={14} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <Play size={16} strokeWidth={1.5} aria-hidden="true" />
            )}
            <span>
              {active ? "Stop film" : failed ? "Retry film" : "Play film"}
            </span>
          </button>
          {active && kind !== "hero" && (
            <button
              type="button"
              className="home-film-toggle home-film-retry"
              onClick={retry}
              aria-label={`Retry ${name} film`}
            >
              <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
              <span>Retry film</span>
            </button>
          )}
          {kind === "hero" && (
            <details className="home-film-tools">
              <summary>Film controls</summary>
              <div className="home-film-tools-panel">
                <p>
                  {active && !loaded
                    ? "Loading the publisher’s player…"
                    : "If the film does not move, retry it or open the credited original."}
                </p>
                {active && (
                  <button
                    type="button"
                    className="home-film-toggle home-film-retry"
                    onClick={retry}
                    aria-label={`Retry ${name} film`}
                  >
                    <RotateCcw size={14} strokeWidth={1.5} aria-hidden="true" />
                    <span>Retry film</span>
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
        <div className="home-film-credit">
          <a
            href={film.page}
            target="_blank"
            rel="noreferrer"
            aria-label={`Watch original ${name} film by NissanNews on Flixel`}
          >
            © NissanNews · Flixel
          </a>
          <span aria-hidden="true">·</span>
          <Link to="/credits#films">Film credits</Link>
        </div>
      </div>
      {failed && kind !== "hero" && (
        <p className="home-film-error" role="status">
          {title} film could not load. Try again or open the credited original.
        </p>
      )}
    </div>
  );
}
