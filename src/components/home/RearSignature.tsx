import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { ArrowDown, RotateCcw } from "lucide-react";
import { GtrWordmark } from "./GtrWordmark";
import { SceneBoundary } from "../three/SceneBoundary";
import { sectionProgress } from "./motion";
const RearVehicleScene = lazy(() => import("./RearVehicleScene"));
function canRenderWebGL() {
  if (typeof WebGLRenderingContext === "undefined") return false;
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
export function RearSignature({
  reducedMotion = false,
  saveData = false,
}: {
  reducedMotion?: boolean;
  saveData?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false),
    [visible, setVisible] = useState(true),
    [optedIn, setOptedIn] = useState(false),
    [supported, setSupported] = useState<boolean | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [requiresReload, setRequiresReload] = useState(false),
    [loaded, setLoaded] = useState(0),
    [progress, setProgress] = useState(0),
    [attempt, setAttempt] = useState(0);
  const onReady = useCallback(() => {
      setReady(true);
      setLoaded(100);
    }, []),
    onError = useCallback((message: string) => {
      setError(message);
      setReady(false);
    }, []),
    onModuleError = useCallback(() => {
      // A rejected React.lazy import is cached. Do not offer an ineffective
      // scene retry; a full page reload obtains the current application chunks.
      setRequiresReload(true);
      setError(
        "The rear viewer could not start. Reload the page to try again.",
      );
      setReady(false);
    }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((e) => e.isIntersecting)),
      { rootMargin: "240px 0px" },
    );
    if (section.current) observer.observe(section.current);
    const visibility = () => setVisible(document.visibilityState !== "hidden");
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  const mount = near && visible && (!saveData || optedIn) && !error;
  useEffect(() => {
    if (mount && supported === null) setSupported(canRenderWebGL());
    if (!mount) setReady(false);
  }, [mount, supported]);
  useEffect(() => {
    if (!near || !visible) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const bounds = el.getBoundingClientRect(),
        height = (el.firstElementChild as HTMLElement).offsetHeight;
      setProgress(
        reducedMotion
          ? 1
          : Number(
              sectionProgress(bounds.top, bounds.height, height).toFixed(3),
            ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [near, visible, reducedMotion]);
  const retry = () => {
    setError("");
    setSupported(null);
    setAttempt((n) => n + 1);
  };
  return (
    <section
      ref={section}
      className="home-signature-runway"
      data-motion-section="signature"
      data-scene-state={
        error
          ? "error"
          : supported === false
            ? "unsupported"
            : ready
              ? "ready"
              : mount
                ? "loading"
                : "idle"
      }
      style={{ "--rear-progress": progress } as import("react").CSSProperties}
      aria-label="The GT-R rear-light signature"
    >
      <div className="home-signature-sticky">
        <div
          className="home-signature-canvas"
          aria-busy={mount && !ready && supported !== false}
        >
          {mount && supported && (
            <SceneBoundary onError={onModuleError}>
              <Suspense fallback={null}>
                <RearVehicleScene
                  key={attempt}
                  progress={progress}
                  reducedMotion={reducedMotion}
                  onReady={onReady}
                  onError={onError}
                  onProgress={setLoaded}
                />
              </Suspense>
            </SceneBoundary>
          )}
        </div>
        {!ready && (
          <div className="home-signature-status" role="status">
            {supported === false ? (
              <>
                <p>A closer look needs WebGL.</p>
                <Link to="/configurator/premium">Explore the R35 details</Link>
              </>
            ) : error ? (
              <>
                <p>{error}</p>
                <button
                  type="button"
                  onClick={
                    requiresReload ? () => window.location.reload() : retry
                  }
                >
                  <RotateCcw size={16} />
                  {requiresReload ? "Reload page" : "Retry 3D view"}
                </button>
              </>
            ) : saveData && !optedIn ? (
              <>
                <p>A real, interactive rear view.</p>
                <button type="button" onClick={() => setOptedIn(true)}>
                  Load 3D view · 8.3 MB
                </button>
              </>
            ) : (
              <>
                <p>Preparing the rear view</p>
                <span>{loaded}%</span>
              </>
            )}
          </div>
        )}
        <header className="home-signature-identity">
          <p>THE R35 SIGNATURE</p>
          <h2 aria-label="NISSAN GT-R">
            <GtrWordmark />
          </h2>
        </header>
        <div className="home-signature-caption">
          <p>Four lights. One unmistakable signature.</p>
          <span>From racing instinct to a presence all its own.</span>
        </div>
        <div className="home-signature-footer">
          <Link to="/credits#models">
            Custom-aero R35 by Ciasny · CC BY 4.0
          </Link>
          <a href="#home-lineup">
            Meet the family
            <ArrowDown size={18} aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
