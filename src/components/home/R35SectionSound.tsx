import { useId } from "react";
import type { RefObject } from "react";
import { useLocation } from "react-router-dom";
import { Volume2, VolumeX } from "lucide-react";
import { r35Recording } from "../../audio/r35Recording";
import { useR35SectionAudio } from "../../audio/useR35SectionAudio";

type Props = {
  sectionRef: RefObject<HTMLElement | null>;
  reducedMotion: boolean;
  saveData: boolean;
};
/** Compact preference control; the recording's identity and full grant stay one link away. */
export function R35SectionSound({
  sectionRef,
  reducedMotion,
  saveData,
}: Props) {
  const location = useLocation();
  const audio = useR35SectionAudio(sectionRef, location.key, {
    reducedMotion,
    saveData,
  });
  const id = useId();
  const enabled = audio.enabled && audio.phase !== "error";
  const Icon = enabled ? Volume2 : VolumeX;
  const status =
    audio.error ??
    (audio.phase === "playing"
      ? "Playing the 7.6-second SpecV acceleration recording."
      : audio.phase === "loading"
        ? "Preparing the R35 recording."
        : enabled
          ? "Sound is on. The recording plays once when you enter this section after interacting with the page."
          : "Sound is off. Choose Sound to enable the recording.");
  return (
    <div className="r35-section-sound" data-audio-phase={audio.phase}>
      <button
        type="button"
        data-r35-sound-control
        aria-pressed={enabled}
        aria-describedby={`${id}-status`}
        onClick={(event) => audio.toggleFromGesture(event.nativeEvent)}
      >
        <Icon size={15} aria-hidden="true" />
        Sound {enabled ? "on" : "off"}
      </button>
      <a
        href={r35Recording.attributionUrl}
        aria-label="Credits for the R35 recording"
      >
        Credits
      </a>
      <span
        id={`${id}-status`}
        className="r35-section-sound__status"
        role="status"
        aria-live="polite"
      >
        {status}
      </span>
    </div>
  );
}
