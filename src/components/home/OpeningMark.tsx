import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { GtrWordmark } from "./GtrWordmark";

/** A nonblocking opening: no progress fiction and no minimum display duration. */
export function OpeningMark({
  pending,
  onContinue,
}: {
  pending: boolean;
  onContinue: () => void;
}) {
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pending && document.activeElement === skip.current) onContinue();
  }, [pending, onContinue]);
  return (
    <div
      className="home-opening"
      data-state={pending ? "loading" : "resolved"}
      aria-hidden={!pending}
      inert={!pending}
    >
      <div className="home-opening-center">
        <GtrWordmark sweep={pending} />
        <span className="home-opening-rule" aria-hidden="true" />
        <p role="status" aria-live="polite">
          Opening the hosted film
        </p>
      </div>
      <button
        ref={skip}
        className="home-opening-continue"
        type="button"
        tabIndex={pending ? 0 : -1}
        onClick={onContinue}
      >
        Continue to page{" "}
        <ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
