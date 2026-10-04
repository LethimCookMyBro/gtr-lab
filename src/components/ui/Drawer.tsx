import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
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
    const before = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key === "Tab" && element) {
        const elements = [
          ...element.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input,select,[tabindex="0"]',
          ),
        ].filter((e) => e.getClientRects().length > 0);
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
      if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [present]);
  if (!present) return null;
  return (
    <div className="drawer-layer" data-phase={open ? "open" : "closing"}>
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
        aria-labelledby="drawer-title"
      >
        <header>
          <h2 id="drawer-title">{title}</h2>
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
