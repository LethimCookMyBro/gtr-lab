import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { models } from "../../data/models";
import type { VehicleModel } from "../../data/models";
import "../../styles/home-opening-cards.css";

const finePointerQuery = "(hover: hover) and (pointer: fine)";
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
const motionAllowed = () =>
  typeof matchMedia === "function" &&
  matchMedia(finePointerQuery).matches &&
  !matchMedia(reducedMotionQuery).matches;

function useCardMotion() {
  const [enabled, setEnabled] = useState(motionAllowed);
  useEffect(() => {
    const pointer = matchMedia(finePointerQuery);
    const motion = matchMedia(reducedMotionQuery);
    const update = () => setEnabled(pointer.matches && !motion.matches);
    update();
    pointer.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => {
      pointer.removeEventListener("change", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}

const pointerProperties = [
  "--card-pointer-x",
  "--card-pointer-y",
  "--card-image-x",
  "--card-image-y",
  "--card-rotate-x",
  "--card-rotate-y",
];
function ModelInvitation({
  model,
  index,
  motion,
}: {
  model: VehicleModel;
  index: number;
  motion: boolean;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const frame = useRef(0);
  const pointer = useRef({ x: 0, y: 0, width: 1, height: 1 });
  const has3D = model.asset.status === "ready" && Boolean(model.asset.url);
  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    link.current?.removeAttribute("data-pointer-active");
    pointerProperties.forEach((property) =>
      link.current?.style.removeProperty(property),
    );
  }, []);
  useEffect(() => {
    if (!motion) reset();
    return reset;
  }, [motion, reset]);
  const followPointer = (event: PointerEvent<HTMLAnchorElement>) => {
    if (!motion || event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pointer.current = {
      x: Math.min(bounds.width, Math.max(0, event.clientX - bounds.left)),
      y: Math.min(bounds.height, Math.max(0, event.clientY - bounds.top)),
      width: bounds.width,
      height: bounds.height,
    };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const card = link.current;
      if (!card) return;
      const { x, y, width, height } = pointer.current;
      const horizontal = x / width - 0.5;
      const vertical = y / height - 0.5;
      const inset = Math.min(58, width / 2, height / 2);
      card.style.setProperty(
        "--card-pointer-x",
        `${Math.min(width - inset, Math.max(inset, x))}px`,
      );
      card.style.setProperty(
        "--card-pointer-y",
        `${Math.min(height - inset, Math.max(inset, y))}px`,
      );
      card.style.setProperty("--card-image-x", `${horizontal * 16}px`);
      card.style.setProperty("--card-image-y", `${vertical * 12}px`);
      card.style.setProperty("--card-rotate-x", `${vertical * -3}deg`);
      card.style.setProperty("--card-rotate-y", `${horizontal * 3}deg`);
      card.dataset.pointerActive = "true";
    });
  };
  return (
    <Link
      ref={link}
      to={`/configurator/${model.id}`}
      className={`home-model-invitation home-model-invitation--${model.id}`}
      aria-label={`Explore ${model.shortName}`}
      aria-describedby={`home-model-experience-${model.id}`}
      data-motion-anchor={`model-${model.id}`}
      data-experience={has3D ? "3d" : "photography"}
      onPointerMove={followPointer}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onBlur={reset}
    >
      <img
        src={model.image}
        srcSet={`/images/gtr-${model.id}.small.webp 800w, ${model.image} 1920w`}
        sizes="(max-width: 700px) 92vw, (max-width: 1050px) 90vw, 46vw"
        alt={model.imageCaption}
        style={{ objectPosition: model.imagePosition }}
        loading="lazy"
      />
      <span className="home-invitation-meta">
        {String(index + 1).padStart(2, "0")} / {model.category}
      </span>
      <div className="home-invitation-copy">
        <h3>{model.shortName}</h3>
        <p>{model.tagline}</p>
      </div>
      <span
        className="home-invitation-cta"
        id={`home-model-experience-${model.id}`}
      >
        <span>{has3D ? "View in 3D" : "Explore model"}</span>
        <span className="home-invitation-format">
          {has3D ? "Artist-built R35" : "Photography & specifications"}
        </span>
        <ArrowRight size={24} strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className="home-invitation-cursor" aria-hidden="true">
        <ArrowUpRight size={21} strokeWidth={1.4} />
        <span>
          {has3D ? "View in" : "Explore"}
          <b>{has3D ? "3D" : "model"}</b>
        </span>
      </span>
    </Link>
  );
}
export function ModelInvitations() {
  const motion = useCardMotion();
  return (
    <section
      id="home-lineup"
      className="home-invitations"
      data-motion-section="lineup"
      aria-labelledby="home-models-title"
    >
      <header>
        <h2 id="home-models-title">
          Six expressions.
          <br />
          One obsession.
        </h2>
      </header>
      <nav aria-label="Explore all six models">
        {models.map((model, index) => (
          <ModelInvitation
            key={model.id}
            model={model}
            index={index}
            motion={motion}
          />
        ))}
      </nav>
    </section>
  );
}
