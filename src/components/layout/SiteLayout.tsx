import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  Volume2,
  VolumeX,
  X,
  ArrowUp,
} from "lucide-react";
import { useAudio } from "../../hooks/useAudio";
import { models } from "../../data/models";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="GT-R LAB home">
      GT-R LAB
      <span aria-hidden="true" />
    </Link>
  );
}
export function SoundButton({ compact = false }: { compact?: boolean }) {
  const audio = useAudio();
  return (
    <button
      className={compact ? "icon-button" : "sound-button"}
      onClick={audio.toggle}
      aria-label={audio.enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={audio.enabled}
      title={audio.enabled ? "Sound on" : "Sound off"}
    >
      {audio.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}{" "}
      {!compact && <span>Sound {audio.enabled ? "on" : "off"}</span>}
    </button>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <header className="site-header">
      <Brand />
      <nav
        aria-label="Main navigation"
        className={open ? "main-nav open" : "main-nav"}
        key={location.pathname}
      >
        <NavLink to="/models" onClick={() => setOpen(false)}>
          Models
        </NavLink>
        <NavLink to="/heritage" onClick={() => setOpen(false)}>
          Heritage
        </NavLink>
        <Link
          className="outline-button"
          to="/configurator/premium"
          onClick={() => setOpen(false)}
        >
          Enter configurator
          <ArrowRight size={18} />
        </Link>
      </nav>
      <button
        className="mobile-menu icon-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X /> : <Menu />}
      </button>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <Brand />
        <Link to="/models" className="text-link">
          Find your expression
          <ArrowUpRight size={18} />
        </Link>
      </div>
      <div className="footer-bottom">
        <p>
          Independent fan project. Not affiliated with or endorsed by Nissan,
          NISMO or Italdesign.
        </p>
        <div>
          <Link to="/credits">Credits & sources</Link>
          <SoundButton />
        </div>
      </div>
    </footer>
  );
}

function HomeMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (typeof dialog?.showModal === "function") dialog.showModal();
    else dialog?.setAttribute("open", "");
    document.body.style.overflow = "hidden";
    dialog?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          "a[href], button:not(:disabled)",
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handleKey);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className="home-menu-dialog"
      aria-labelledby="home-menu-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="home-menu-top">
        <button type="button" onClick={onClose} aria-label="Close menu">
          <X size={26} strokeWidth={1.5} />
          <span>Close</span>
        </button>
        <Brand />
      </div>
      <h2 id="home-menu-title" className="home-visually-hidden">
        Explore GT-R LAB
      </h2>
      <div className="home-menu-body">
        <nav aria-label="Main navigation" className="home-menu-primary">
          <Link to="/models" onClick={onClose}>
            Models <ArrowUpRight strokeWidth={1} />
          </Link>
          <Link to="/heritage" onClick={onClose}>
            Heritage <ArrowUpRight strokeWidth={1} />
          </Link>
          <Link to="/configurator/premium" onClick={onClose}>
            Enter the lab <ArrowUpRight strokeWidth={1} />
          </Link>
        </nav>
        <nav aria-label="Model navigation" className="home-menu-models">
          {models.map((model) => (
            <Link
              key={model.id}
              to={`/configurator/${model.id}`}
              onClick={onClose}
            >
              {model.shortName}
              <ArrowRight size={19} strokeWidth={1.5} />
            </Link>
          ))}
        </nav>
      </div>
      <div className="home-menu-bottom">
        <span>An independent exploration of an icon.</span>
        <Link to="/credits" onClick={onClose}>
          Credits & sources
        </Link>
      </div>
    </dialog>
  );
}

export function HomeHeader() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <header className="home-header">
      <button
        type="button"
        className="home-menu-trigger"
        aria-label="Open menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="home-menu-lines" aria-hidden="true" />
        <span>Menu</span>
      </button>
      <Brand />
      {open && <HomeMenu onClose={close} />}
    </header>
  );
}

export function HomeFooter() {
  const backToTop = () =>
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  return (
    <footer className="home-footer">
      <div className="home-footer-top">
        <Brand />
        <nav aria-label="Footer navigation">
          <Link to="/models">Models</Link>
          <Link to="/heritage">Heritage</Link>
          <Link to="/configurator/premium">Enter configurator</Link>
        </nav>
      </div>
      <div className="home-footer-bottom">
        <p>Independent fan project. Not affiliated with Nissan.</p>
        <Link to="/credits">Credits & sources</Link>
        <button type="button" onClick={backToTop}>
          Back to top
          <ArrowUp size={20} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>
    </footer>
  );
}

export function SiteLayout() {
  const isHome = useLocation().pathname === "/";
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {isHome ? <HomeHeader /> : <Header />}
      <main id="main-content">
        <Outlet />
      </main>
      {isHome ? <HomeFooter /> : <Footer />}
    </>
  );
}
