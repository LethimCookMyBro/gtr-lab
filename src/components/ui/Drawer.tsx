import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Drawer({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
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
      before?.focus();
    };
  }, [onClose]);
  return (
    <div className="drawer-layer">
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
