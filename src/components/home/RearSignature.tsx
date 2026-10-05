import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { ArrowDown, RotateCcw } from "lucide-react";
import { GtrWordmark } from "./GtrWordmark";
import { R35SoundPreview } from "../R35SoundPreview";
import "../../styles/home-audio.css";
import { SceneBoundary } from "../three/SceneBoundary";
import { sectionProgress } from "./motion";
import {
  formatModelBytes,
  sceneLoadLabel,
  SCENE_STAGE_TIMEOUT,
} from "./homeReadiness";
import type { HomeSceneLoadState } from "./homeReadiness";
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
type RearSignatureProps = {
  reducedMotion?: boolean;
  saveData?: boolean;
  disabled?: boolean;
  attempt?: number;
  onLoadState?: (state: HomeSceneLoadState) => void;
};
export function RearSignature(props: RearSignatureProps) {
  const [retry, setRetry] = useState(0);
  const [optedIn, setOptedIn] = useState(false);
  return (
    <>
      <RearSignatureAttempt
        key={`${props.attempt ?? 0}:${retry}`}
        {...props}
        optedIn={optedIn}
        onOptIn={() => setOptedIn(true)}
        onRetry={() => setRetry((value) => value + 1)}
      />
      <R35SoundPreview className="home-signature-sound" />
    </>
  );
}
function RearSignatureAttempt({
  reducedMotion = false,
  saveData = false,
  disabled = false,
  onLoadState,
  onRetry,
  optedIn,
  onOptIn,
}: RearSignatureProps & {
  onRetry: () => void;
  optedIn: boolean;
  onOptIn: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(
    () =>
      typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  const [supported, setSupported] = useState<boolean | null>(null);
  const [state, setState] = useState<HomeSceneLoadState>({ phase: "module" });
  const [progress, setProgress] = useState(0);
  const callback = useRef(onLoadState);
  callback.current = onLoadState;
  // Each attempt owns its lazy boundary as well as its one parsed scene.
  const RearVehicleScene = useMemo(
    () => lazy(() => import("./RearVehicleScene")),
    [],
  );
  const permitted = !disabled && (!saveData || optedIn);
  const reported: HomeSceneLoadState = disabled
    ? { phase: "skipped" }
    : !permitted
      ? { phase: "deferred" }
      : state;
  const ready = state.phase === "ready";
  const error = state.phase === "error";
  const mount = permitted && supported === true && !error;
  const active = visible && (!ready || near);
  useEffect(() => {
    callback.current?.(reported);
  }, [state, disabled, permitted]);
  const onReady = useCallback(() => setState({ phase: "ready" }), []);
  const onError = useCallback(
    (message: string) =>
      setState({ phase: "error", message, recovery: "retry" }),
    [],
  );
  const onModuleError = useCallback(
    () =>
      setState({
        phase: "error",
        message:
          "The rear viewer could not start. Reload the page to try again.",
        recovery: "reload",
      }),
    [],
  );
  const ignoreLegacyProgress = useCallback(() => {}, []);
  useEffect(() => {
    if (!permitted || supported !== null) return;
    const available = canRenderWebGL();
    setSupported(available);
    if (!available)
      setState({
        phase: "error",
        message:
          "A closer look needs WebGL. Continue without 3D or enable hardware acceleration and retry.",
        recovery: "retry",
      });
  }, [permitted, supported]);
  useEffect(() => {
    if (
      !mount ||
      !visible ||
      (state.phase !== "module" && state.phase !== "preparing")
    )
      return;
    const phase = state.phase;
    const timer = window.setTimeout(
      () =>
        setState({
          phase: "error",
          message:
            phase === "module"
              ? "The 3D viewer took too long to start. Reload the page to try again."
              : "The 3D render took too long to prepare. Please retry.",
          recovery: phase === "module" ? "reload" : "retry",
        }),
      SCENE_STAGE_TIMEOUT,
    );
    return () => window.clearTimeout(timer);
  }, [mount, visible, state.phase]);
  useEffect(() => {
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(
            (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
            { rootMargin: "240px 0px" },
          );
    if (section.current) observer?.observe(section.current);
    const visibility = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
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
  return (
    <section
      ref={section}
      className="home-signature-runway"
      data-motion-section="signature"
      data-scene-state={
        !permitted
          ? reported.phase
          : error
            ? "error"
            : ready
              ? "ready"
              : "loading"
      }
      data-load-phase={reported.phase}
      data-render-active={mount && active}
      style={{ "--rear-progress": progress } as import("react").CSSProperties}
      aria-label="The GT-R rear-light signature"
    >
      <div className="home-signature-sticky">
        <div className="home-signature-canvas" aria-busy={mount && !ready}>
          {mount && (
            <SceneBoundary onError={onModuleError}>
              <Suspense fallback={null}>
                <RearVehicleScene
                  progress={progress}
                  reducedMotion={reducedMotion}
                  active={active}
                  onReady={onReady}
                  onError={onError}
                  onProgress={ignoreLegacyProgress}
                  onLoadState={setState}
                />
              </Suspense>
            </SceneBoundary>
          )}
        </div>
        {(!ready || !permitted) && (
          <div
            className="home-signature-status"
            role="status"
            aria-label="R35 3D loading status"
          >
            {disabled ? (
              <>
                <p>3D view skipped for this visit.</p>
                <Link to="/configurator/premium">Explore the R35 details</Link>
              </>
            ) : !permitted ? (
              <>
                <p>A real, interactive rear view.</p>
                <button type="button" onClick={onOptIn}>
                  Load 3D view · 8.3 MB
                </button>
              </>
            ) : state.phase === "error" ? (
              <>
                <p>{state.message}</p>
                {supported === false && (
                  <Link to="/configurator/premium">
                    Explore the R35 details
                  </Link>
                )}
                <button
                  type="button"
                  onClick={
                    state.recovery === "reload"
                      ? () => window.location.reload()
                      : onRetry
                  }
                >
                  <RotateCcw size={16} />
                  {state.recovery === "reload"
                    ? "Reload page"
                    : "Retry 3D view"}
                </button>
              </>
            ) : (
              <>
                <p>{sceneLoadLabel(state)}</p>
                {state.phase === "downloading" && (
                  <span>
                    {formatModelBytes(state.loadedBytes)}
                    {state.totalBytes
                      ? ` / ${formatModelBytes(state.totalBytes)}`
                      : " received"}
                  </span>
                )}
              </>
            )}
          </div>
        )}
        <header className="home-signature-identity">
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
