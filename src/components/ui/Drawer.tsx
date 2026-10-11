import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { isolateModal } from "./modalIsolation";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Drawer({
  open = true,
  title,
  onClose,
  children,
  wide = false,
}: {
  open?: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const reduced = useReducedMotion();
  const [present, setPresent] = useState(open);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (reduced) {
      setPresent(false);
      return;
    }
    const timeout = setTimeout(() => setPresent(false), 280);
    return () => clearTimeout(timeout);
  }, [open, reduced]);
  useLayoutEffect(() => {
    if (!present) return;
    const element = ref.current;
    const layer = layerRef.current;
    if (!element || !layer) return;
    const document = element.ownerDocument;
    const isolation = isolateModal(layer, element);
    element.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (!isolation.isTop()) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab" && element) {
        const elements = [
          ...element.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,[tabindex="0"]',
          ),
        ]
          .filter(
            (e) => e.getClientRects().length > 0 && !e.matches(":disabled"),
          )
          .filter((e, _index, candidates) => {
            // A native radio group has one tab stop: its checked input.
            if (
              !(e instanceof HTMLInputElement) ||
              e.type !== "radio" ||
              !e.name ||
              e.checked
            )
              return true;
            return !candidates.some(
              (other) =>
                other instanceof HTMLInputElement &&
                other.type === "radio" &&
                other.name === e.name &&
                other.form === e.form &&
                other.checked,
            );
          });
        const first = elements[0],
          last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === element)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      isolation.release();
    };
  }, [present]);
  if (!present) return null;
  return (
    <div
      ref={layerRef}
      className="drawer-layer"
      data-phase={open ? "open" : "closing"}
    >
      <button
        className="drawer-backdrop"
        onClick={onClose}
        aria-label="Close panel"
        tabIndex={-1}
      />
      <section
        ref={ref}
        tabIndex={-1}
        className={"drawer " + (wide ? "drawer-wide" : "")}
        data-phase={open ? "open" : "closing"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close panel"
          >
            <X size={22} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </section>
    </div>
  );
}
