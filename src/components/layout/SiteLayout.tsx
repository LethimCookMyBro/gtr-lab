import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useAudio } from "../../hooks/useAudio";
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
export function SiteLayout() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
