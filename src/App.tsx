import { Component, useEffect, useRef, lazy, Suspense } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { SiteLayout } from "./components/layout/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { ModelsPage } from "./pages/ModelsPage";
import { HeritagePage } from "./pages/HeritagePage";
import { CreditsPage } from "./pages/CreditsPage";
import { getModel } from "./data/models";
const Configurator = lazy(() =>
  import("./pages/ConfiguratorPage").then((m) => ({
    default: m.ConfiguratorPage,
  })),
);
function routeTitle(pathname: string) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "GT-R LAB — Engineered to defy.";
  if (path === "/models") return "GT-R LAB — Models";
  if (path === "/heritage" || path === "/about") return "GT-R LAB — Heritage";
  if (path === "/credits") return "GT-R LAB — Credits & sources";
  const match = /^\/configurator(?:\/([^/]+))?$/.exec(path);
  if (match) {
    const model = getModel(match[1] || "premium");
    return model
      ? `GT-R LAB — ${model.shortName} configurator`
      : "GT-R LAB — Model not found";
  }
  return "GT-R LAB — Page not found";
}

// Inside Suspense: focus only after the destination has actually committed.
// Initial visits and same-page query/hash changes retain native focus behavior.
function RouteFocus() {
  const { pathname, hash } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    // An opening/loading dialog owns focus until its own completion handler.
    if (
      document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
    )
      return;
    const fragment = hash ? document.getElementById(hash.slice(1)) : null;
    const destination =
      fragment?.querySelector<HTMLElement>("h1, h2, h3") ??
      fragment ??
      document.querySelector<HTMLElement>("main h1, .not-found h1");
    if (!destination || destination.closest("[inert]")) return;
    destination.tabIndex = -1;
    destination.focus({ preventScroll: true });
  }, [pathname, hash]);
  return null;
}
function RouteEffects() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView(),
      );
    } else window.scrollTo(0, 0);
    document.title = routeTitle(location.pathname);
  }, [location]);
  return null;
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("GT-R LAB render error", error, info.componentStack);
  }
  render() {
    return this.state.error ? (
      <main className="not-found">
        <h1>A brief interruption.</h1>
        <p>The experience couldn’t start. Refresh to try again.</p>
        <button className="outline-button" onClick={() => location.reload()}>
          Restart the experience
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <RouteEffects />
      <Suspense
        fallback={
          <div className="route-loader">
            <span className="loading-wordmark">GT-R LAB</span>
            <p>Opening the lab</p>
          </div>
        }
      >
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="heritage" element={<HeritagePage />} />
            <Route path="about" element={<HeritagePage />} />
            <Route path="credits" element={<CreditsPage />} />
          </Route>
          <Route path="configurator/:model" element={<Configurator />} />
          <Route path="configurator" element={<Configurator />} />
          <Route
            path="*"
            element={
              <main className="not-found">
                <h1>A road less traveled.</h1>
                <p>This page isn’t part of the lab.</p>
                <Link to="/" className="outline-button">
                  Return home
                </Link>
              </main>
            }
          />
        </Routes>
        <RouteFocus />
      </Suspense>
    </ErrorBoundary>
  );
}
