import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Square, Play } from "lucide-react";
import { homeFilms } from "../../data/films";
import { mayAutoplay } from "./motion";
export type FilmState = "loading" | "embedded" | "stopped" | "unavailable";
interface FilmProps {
  kind: "hero" | "detail";
  reducedMotion: boolean;
  saveData: boolean;
  suspended?: boolean;
  onStateChange?: (state: FilmState) => void;
}
export function Film({
  kind,
  reducedMotion,
  saveData,
  suspended = false,
  onStateChange,
}: FilmProps) {
  const holder = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(kind === "hero");
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [choice, setChoice] = useState<"auto" | "play" | "stop">("auto");
  const [loaded, setLoaded] = useState(false);
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
  }, [active, loaded, kind]);
  const toggle = () => {
    if (active) setChoice("stop");
    else {
      setFailed(false);
      setLoaded(false);
      setChoice("play");
    }
  };
  return (
    <div
      ref={holder}
      className={`home-film home-film--${kind}`}
      data-film-provider="flixel"
      data-film-state={state}
    >
      <img
        className="home-film-backup"
        src="/images/gtr-premium.webp"
        alt="2018 Nissan GT-R Premium in Super Silver"
        loading={kind === "hero" ? "eager" : "lazy"}
        hidden={active && loaded}
      />
      {active && (
        <iframe
          ref={frame}
          className="home-film-provider"
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
      {failed && (
        <p className="home-film-error" role="status">
          {title} film could not load. Try again or open the credited original.
        </p>
      )}
    </div>
  );
}
