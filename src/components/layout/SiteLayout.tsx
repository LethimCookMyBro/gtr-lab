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
export function SoundButton({
  compact = false,
  cueOnly = false,
}: {
  compact?: boolean;
  cueOnly?: boolean;
}) {
  const audio = useAudio();
  return (
    <button
      className={compact ? "icon-button" : "sound-button"}
      onClick={audio.toggle}
      aria-label={audio.enabled ? "Turn sound off" : "Turn sound on"}
      aria-pressed={audio.enabled}
      title={
        cueOnly
          ? "Interface click cues · No engine recording"
          : audio.enabled
            ? "Sound on"
            : "Sound off"
      }
    >
      {audio.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}{" "}
      {!compact && (
        <span>
          {cueOnly ? "UI sound" : "Sound"} {audio.enabled ? "on" : "off"}
        </span>
      )}
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
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestClose = useCallback(() => {
    if (closeTimer.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 260);
  }, [onClose]);
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
        requestClose();
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
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [requestClose]);
  return (
    <dialog
      ref={ref}
      className="home-menu-dialog"
      data-phase={closing ? "closing" : "open"}
      aria-labelledby="home-menu-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
    >
      <div className="home-menu-underlays" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="home-menu-top">
        <button type="button" onClick={requestClose} aria-label="Close menu">
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
            <span>
              <small aria-hidden="true">01</small>Models
            </span>{" "}
            <ArrowUpRight strokeWidth={1} />
          </Link>
          <Link to="/heritage" onClick={onClose}>
            <span>
              <small aria-hidden="true">02</small>Heritage
            </span>{" "}
            <ArrowUpRight strokeWidth={1} />
          </Link>
          <Link to="/configurator/premium" onClick={onClose}>
            <span>
              <small aria-hidden="true">03</small>Enter the lab
            </span>{" "}
            <ArrowUpRight strokeWidth={1} />
          </Link>
        </nav>
        <nav aria-label="Model navigation" className="home-menu-models">
          {models.map((model) => (
            <Link
              key={model.id}
              to={`/configurator/${model.id}`}
              onClick={onClose}
            >
              <span>{model.shortName}</span>
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
        <div className="home-footer-about" id="about-project">
          <p className="home-footer-eyebrow">ENGINEERING · CULTURE · MOTION</p>
          <Brand />
          <p>
            An independent digital exhibition of the GT-R. Explore its history,
            its different expressions and the details that make it unmistakable.
          </p>
          <Link to="/models" className="home-footer-enter">
            Find your expression <ArrowUpRight size={22} />
          </Link>
        </div>
        <div className="home-footer-columns">
          <nav aria-label="Road models">
            <h2>Road</h2>
            {models
              .filter((m) => m.category === "Road")
              .map((m) => (
                <Link key={m.id} to={`/configurator/${m.id}`}>
                  {m.shortName}
                </Link>
              ))}
          </nav>
          <nav aria-label="Bespoke and motorsport models">
            <h2>Beyond the road</h2>
            {models
              .filter((m) => m.category !== "Road")
              .map((m) => (
                <Link key={m.id} to={`/configurator/${m.id}`}>
                  {m.shortName}
                </Link>
              ))}
          </nav>
          <nav aria-label="Footer navigation">
            <h2>Explore</h2>
            <Link to="/models">All models</Link>
            <Link to="/heritage">Heritage</Link>
            <Link to="/credits">Credits & sources</Link>
          </nav>
        </div>
      </div>
      <div className="home-footer-bottom">
        <p>
          Independent fan project. Not affiliated with or endorsed by Nissan,
          NISMO or Italdesign.
        </p>
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
