import { Component, useEffect, lazy, Suspense } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { SiteLayout } from "./components/layout/SiteLayout";
import { HomePage } from "./pages/HomePage";
import { ModelsPage } from "./pages/ModelsPage";
import { HeritagePage } from "./pages/HeritagePage";
import { CreditsPage } from "./pages/CreditsPage";
const Configurator = lazy(() =>
  import("./pages/ConfiguratorPage").then((m) => ({
    default: m.ConfiguratorPage,
  })),
);
function RouteEffects() {
  const location = useLocation();
  useEffect(() => {
    if (location.hash) {
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView(),
      );
    } else window.scrollTo(0, 0);
    document.title = location.pathname.startsWith("/configurator")
      ? "GT-R LAB — Configurator"
      : "GT-R LAB — Engineered to defy.";
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
      </Suspense>
    </ErrorBoundary>
  );
}
