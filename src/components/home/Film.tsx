import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play } from "lucide-react";
import { mayAutoplay } from "./motion";
interface FilmProps {
  kind: "hero" | "detail";
  reducedMotion: boolean;
  saveData: boolean;
}
export function Film({ kind, reducedMotion, saveData }: FilmProps) {
  const ref = useRef<HTMLVideoElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const userPaused = useRef(false);
  const intent = useRef(0);
  const wantsPlayback = useRef(false);
  const [visible, setVisible] = useState(kind === "hero");
  const [documentVisible, setDocumentVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const name = kind === "hero" ? "opening" : "detail";
  const title = kind === "hero" ? "Opening" : "Detail";
  useEffect(() => {
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            ([entry]) => setVisible(entry.isIntersecting),
            { threshold: 0.1 },
          );
    if (holder.current) observer?.observe(holder.current);
    const visibility = () =>
      setDocumentVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const sequence = ++intent.current;
    if (
      !failed &&
      !userPaused.current &&
      mayAutoplay({ reducedMotion, saveData, visible, documentVisible })
    ) {
      wantsPlayback.current = true;
      video.muted = true;
      const attempt = video.play();
      void attempt
        ?.then(() => {
          if (!wantsPlayback.current) video.pause();
        })
        .catch(() => {
          if (intent.current === sequence) setPlaying(false);
        });
    } else {
      wantsPlayback.current = false;
      video.pause();
    }
    return () => {
      intent.current++;
      wantsPlayback.current = false;
      video.pause();
    };
  }, [reducedMotion, saveData, visible, documentVisible, failed]);
  const toggle = async () => {
    const video = ref.current;
    if (!video || failed) return;
    const sequence = ++intent.current;
    if (playing) {
      userPaused.current = true;
      wantsPlayback.current = false;
      video.pause();
      return;
    }
    userPaused.current = false;
    wantsPlayback.current = true;
    try {
      video.muted = true;
      await video.play();
      if (!wantsPlayback.current) video.pause();
    } catch {
      if (intent.current === sequence) setPlaying(false);
    }
  };
  return (
    <div
      ref={holder}
      className={`home-film home-film--${kind}`}
      data-film-state={failed ? "unavailable" : playing ? "playing" : "paused"}
    >
      <img
        className="home-film-backup"
        src="/images/gtr-premium.webp"
        alt="2018 Nissan GT-R Premium in Super Silver"
        loading={kind === "hero" ? "eager" : "lazy"}
        aria-hidden={!failed}
      />
      <video
        ref={ref}
        className="home-film-video"
        src={`/films/gtr-${kind}.mp4`}
        poster={`/films/gtr-${kind}.webp`}
        muted
        loop
        playsInline
        preload={
          saveData || reducedMotion
            ? "none"
            : kind === "hero"
              ? "auto"
              : "metadata"
        }
        aria-label={`${title} film: an original CGI study of a custom-aero Nissan GT-R R35`}
        onPlaying={() => {
          if (wantsPlayback.current) setPlaying(true);
          else {
            ref.current?.pause();
            setPlaying(false);
          }
        }}
        onPause={() => setPlaying(false)}
        onError={() => {
          setFailed(true);
          setPlaying(false);
        }}
        hidden={failed}
      />
      <div className="home-film-shade" aria-hidden="true" />
      <div className="home-film-controls">
        <button
          type="button"
          className="home-film-toggle"
          onClick={toggle}
          disabled={failed}
          aria-label={
            failed
              ? `${title} film unavailable`
              : `${playing ? "Pause" : "Play"} ${name} film`
          }
        >
          {playing ? (
            <Pause size={16} strokeWidth={1.5} aria-hidden="true" />
          ) : (
            <Play size={16} strokeWidth={1.5} aria-hidden="true" />
          )}
          <span>
            {failed ? "Film unavailable" : playing ? "Pause film" : "Play film"}
          </span>
        </button>
        <Link
          to={failed ? "/credits" : "/credits#films"}
          className="home-film-credit"
        >
          {failed ? "Still photograph" : "R35 CGI study"}{" "}
          <span aria-hidden="true">·</span>{" "}
          {failed ? "Photography credits" : "Film credits"}
        </Link>
      </div>
      {failed && (
        <p className="home-film-error" role="status">
          {title} film unavailable. Showing a still photograph.
        </p>
      )}
    </div>
  );
}
