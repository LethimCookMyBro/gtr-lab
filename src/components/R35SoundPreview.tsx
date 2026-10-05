import { useId } from "react";
import { useLocation } from "react-router-dom";
import { r35Recording } from "../audio/r35Recording";
import { useR35Audio } from "../audio/useR35Audio";

type R35SoundPreviewProps = {
  className?: string;
  buttonClassName?: string;
};

/** Standalone listening control, never synchronized with visual transitions. */
export function R35SoundPreview({
  className = "",
  buttonClassName = "",
}: R35SoundPreviewProps) {
  const location = useLocation();
  const audio = useR35Audio(location.key);
  const id = useId();
  const active = audio.phase === "loading" || audio.phase === "playing";
  const label =
    audio.phase === "loading"
      ? "Cancel loading"
      : audio.phase === "playing"
        ? "Stop recording"
        : audio.phase === "error"
          ? "Retry R35 sound"
          : "Hear the R35";
  const status =
    audio.error ??
    (audio.muted
      ? "Sample muted. Unmute, then choose Hear to listen."
      : audio.phase === "loading"
        ? "Loading the original R35 recording…"
        : audio.phase === "playing"
          ? "Playing the 7.6-second field recording."
          : "Optional sound · 7.6 seconds · Starts only when you choose Hear.");
  return (
    <div
      className={`r35-sound-preview ${className}`.trim()}
      data-audio-phase={audio.phase}
    >
      <div className="r35-sound-preview__controls">
        <button
          type="button"
          className={`r35-sound-preview__play ${buttonClassName}`.trim()}
          aria-describedby={`${id}-status ${id}-credit`}
          disabled={audio.muted}
          onClick={active ? audio.stop : audio.playFromGesture}
        >
          {label}
        </button>
        <button
          type="button"
          className="r35-sound-preview__mute"
          aria-pressed={audio.muted}
          onClick={() => audio.setMuted(!audio.muted)}
        >
          {audio.muted ? "Unmute sample" : "Mute sample"}
        </button>
      </div>
      <p
        id={`${id}-status`}
        className="r35-sound-preview__status"
        role="status"
        aria-label="R35 recording status"
        aria-live="polite"
      >
        {status}
      </p>
      <p id={`${id}-credit`} className="r35-sound-preview__credit">
        <a href={r35Recording.sourceUrl} target="_blank" rel="noreferrer">
          SpecV acceleration · Goodwood 2009
        </a>
        {" · "}
        <a href={r35Recording.authorUrl} target="_blank" rel="noreferrer">
          {r35Recording.author}
        </a>
        {" · "}
        <a href={r35Recording.licenseUrl} target="_blank" rel="noreferrer">
          {r35Recording.license}
        </a>
        <span className="r35-sound-preview__adaptation">
          {" · "}Playback volume reduced; fades added.{" "}
        </span>
        <a href={r35Recording.attributionUrl} target="_blank" rel="noreferrer">
          Recording notes
        </a>
      </p>
    </div>
  );
}
