import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Square, Play, RotateCcw } from "lucide-react";
import { homeFilms } from "../../data/films";
import { mayAutoplay } from "./motion";
/** Embed lifecycle only: Flixel exposes no verified playback event API here. */
export type FilmState = "loading" | "embedded" | "stopped" | "unavailable";
interface FilmProps {
  kind: "hero" | "detail";
  reducedMotion: boolean;
  saveData: boolean;
  suspended?: boolean;
  onStateChange?: (state: FilmState) => void;
  onFallbackReady?: () => void;
}
export function Film({
  kind,
  reducedMotion,
  saveData,
  suspended = false,
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
  const [visible, setVisible] = useState(kind === "hero");
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [choice, setChoice] = useState<"auto" | "play" | "stop">("auto");
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const previousPolicy = useRef({ reducedMotion, saveData });
  const film = homeFilms[kind];
  const name = kind === "hero" ? "opening" : "detail";
  const title = kind === "hero" ? "Opening" : "Detail";
  const active =
    !suspended &&
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
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { threshold: 0.1 },
          );
    if (holder.current) observer?.observe(holder.current);
    const onVisibility = () =>
      setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
    setLoaded(false);
  }, [active, kind]);
  useEffect(() => {
    if (!active || loaded) return;
    const timeout = window.setTimeout(() => setFailed(true), 20000);
    return () => window.clearTimeout(timeout);
  }, [active, loaded, kind, attempt]);
  const retry = () => {
    setFailed(false);
    setLoaded(false);
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
        loading={kind === "hero" ? "eager" : "lazy"}
      />
      {active && (
        <iframe
          key={attempt}
          ref={frame}
          className="home-film-provider"
          inert={kind === "hero" && !loaded}
          aria-hidden={kind === "hero" && !loaded ? true : undefined}
          src={film.embed}
          title={`${title} film: ${film.description}`}
          allow="autoplay; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={(event) => {
            if (event.currentTarget === frame.current) setLoaded(true);
          }}
        />
      )}
      <div className="home-film-shade" aria-hidden="true" />
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
      {active && kind !== "hero" && (
        <p className="home-film-status" role="status">
          {loaded
            ? "Film not moving? Retry or open the original."
            : "Loading the publisher’s player…"}
        </p>
      )}
      {failed && (
        <p className="home-film-error" role="status">
          {title} film could not load. Try again or open the credited original.
        </p>
      )}
    </div>
  );
}
