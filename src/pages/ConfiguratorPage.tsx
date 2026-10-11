import {
  lazy,
  Suspense,
  useEffect,
  useCallback,
  useRef,
  useState,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Sun,
  RotateCw,
  Car,
  Image,
  Info,
  RefreshCw,
  X,
} from "lucide-react";
import { getModel } from "../data/models";
import { paints } from "../data/configuration";
import { useConfigurator } from "../stores/configurator";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useAudio } from "../hooks/useAudio";
import { Brand, SoundButton } from "../components/layout/SiteLayout";
import { ConfiguratorPanels } from "../components/configurator/ConfiguratorPanels";
import { CabinPreviewControls } from "../components/configurator/CabinPreviewControls";
import "../styles/cabin-preview.css";
import type { CabinWindowStatus } from "../components/three/cabinPreview";
const VehicleScene = lazy(() => import("../components/three/VehicleScene"));
export function ConfiguratorPage() {
  const { model: id = "premium" } = useParams();
  const model = getModel(id);
  const currentModel = useRef(id);
  currentModel.current = id;
  const [windowView, setWindowView] = useState<{
    model: string;
    status: CabinWindowStatus;
  }>({ model: id, status: "loading" });
  const onWindowStatus = useCallback(
    (status: CabinWindowStatus) => {
      if (currentModel.current === id) setWindowView({ model: id, status });
    },
    [id],
  );
  const windowStatus = windowView.model === id ? windowView.status : "loading";
  const state = useConfigurator();
  // Initialize the route's model/generation before mounting its expensive Canvas.
  // Otherwise a warm lazy scene mounts once here and again after selectVariant.
  const [initializedModel, setInitializedModel] = useState<string | null>(null);
  const sceneInitialized = initializedModel === id;
  const sceneKey = `${id}:${state.sceneRequest}`;
  const currentScene = useRef(sceneKey);
  currentScene.current = sceneKey;
  const [renderWait, setRenderWait] = useState({
    key: sceneKey,
    pending: false,
  });
  const onRenderPending = useCallback(
    (pending: boolean) => {
      if (currentScene.current === sceneKey)
        setRenderWait({ key: sceneKey, pending });
    },
    [sceneKey],
  );
  const renderPending = renderWait.key === sceneKey && renderWait.pending;
  const reduced = useReducedMotion();
  const audio = useAudio();
  const cameraButton = useRef<HTMLButtonElement>(null);
  const exitCabin = useCallback(() => {
    useConfigurator.getState().exitCabin(!reduced);
    cameraButton.current?.focus({ preventScroll: true });
  }, [reduced]);
  useEffect(() => {
    if (state.cabin.phase === "closed") return;
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        useConfigurator.getState().panel ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      exitCabin();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [state.cabin.phase, exitCabin]);
  useEffect(() => () => useConfigurator.getState().exitCabin(false), []);
  useEffect(() => {
    state.selectVariant(id);
    setInitializedModel(id);
  }, [id]);
  useEffect(() => {
    if (reduced) useConfigurator.setState({ autoRotate: false });
  }, [reduced, state.autoRotate]);
  const onReady = useCallback(
    () =>
      useConfigurator.setState({
        ready: true,
        error: null,
        loadingProgress: 100,
      }),
    [],
  );
  const onError = useCallback(
    (message: string) =>
      useConfigurator.setState({
        ready: false,
        error: message,
        cabin: { phase: "closed" },
      }),
    [],
  );
  const onProgress = useCallback(
    (progress: number) =>
      useConfigurator.setState({ loadingProgress: progress }),
    [],
  );
  const onEnvironmentFallback = useCallback(
    (message: string) =>
      useConfigurator.setState({
        selectedEnvironment: "studio",
        notice: message,
      }),
    [],
  );
  const onCapabilities = useCallback(
    (capabilities: { paint: boolean; lights: boolean }) =>
      useConfigurator.setState({
        paintAvailable: capabilities.paint,
        lightsAvailable: capabilities.lights,
      }),
    [],
  );
  const onManual = useCallback(
    () => useConfigurator.getState().stopAutoRotate(),
    [],
  );
  if (!model)
    return (
      <div className="not-found">
        <h1>That model isn’t in the lab.</h1>
        <Link to="/models" className="outline-button">
          Explore the collection
          <ArrowRight />
        </Link>
      </div>
    );
  const paint = paints.find((p) => p.id === state.selectedPaint)!;
  const hasAsset = model.asset.status === "ready" && !!model.asset.url;
  const interactive =
    hasAsset && sceneInitialized && state.ready && !state.error;
  const sceneName = hasAsset
    ? model.asset.displayName || model.name
    : model.name;
  const open = (
    panel: "camera" | "environment" | "models" | "details" | "assets",
  ) => {
    state.togglePanel(panel);
    audio.play();
  };
  return (
    <main
      className={
        "configurator environment-" +
        state.selectedEnvironment +
        (hasAsset && model.asset.cabinPreview && !state.error
          ? " has-window-view"
          : "") +
        (interactive ? " is-scene-ready" : "")
      }
    >
      <header className="config-information-header">
        <div className="config-header">
          <Link to="/models" className="back-link" aria-label="Back to models">
            <ArrowLeft size={19} />
            <span>Back to models</span>
          </Link>
          <Brand />
          <button
            onClick={() => open("details")}
            className="model-detail-button"
          >
            Model detail
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="config-title">
          <h1>{sceneName}</h1>
          <p>{model.tagline}</p>
          {model.asset.kind === "original-study" && (
            <button className="study-disclosure" onClick={() => open("assets")}>
              <Info size={14} />
              Original R35 study · View limitations
            </button>
          )}
          {hasAsset && model.asset.kind === "licensed-model" && (
            <div
              className={
                model.asset.cabinPreview && !state.error
                  ? "provenance-with-window-status"
                  : undefined
              }
            >
              <button
                className="study-disclosure"
                onClick={() => open("assets")}
              >
                <Info size={14} />
                Model provenance & limitations
              </button>
              {model.asset.cabinPreview && !state.error && (
                <span
                  className="cabin-window-status"
                  hidden={state.cabin.phase === "active"}
                  role="status"
                  aria-live="polite"
                >
                  {windowStatus === "loading"
                    ? "Loading window view…"
                    : windowStatus === "ready"
                      ? "Window view ready · Simplified cabin"
                      : "Window view unavailable"}
                </span>
              )}
            </div>
          )}
        </div>
      </header>
      <div
        className="scene-stage"
        aria-label={
          interactive
            ? "Interactive 3D " + sceneName
            : hasAsset && !state.error
              ? "Loading 3D " + sceneName
              : "Photographic reference of " + model.name
        }
      >
        {hasAsset && !state.error ? (
          <Suspense
            fallback={
              <div className="scene-loading">
                <Brand />
                <p>Preparing your perspective</p>
              </div>
            }
          >
            {sceneInitialized && (
              <VehicleScene
                key={sceneKey}
                url={model.asset.url!}
                paint={paint.color}
                environment={state.selectedEnvironment}
                environmentRequest={state.environmentRequest}
                preset={state.cameraPreset}
                cameraRequest={state.cameraRequest}
                autoRotate={state.autoRotate}
                lights={state.lightsEnabled}
                reducedMotion={reduced}
                materialRoles={model.asset.materialRoles}
                disabledEmissive={model.asset.disabledEmissive}
                cameraViews={model.asset.cameraViews}
                onReady={onReady}
                onError={onError}
                onRenderPending={onRenderPending}
                onProgress={onProgress}
                onManual={onManual}
                onEnvironmentFallback={onEnvironmentFallback}
                onCapabilities={onCapabilities}
                cabin={model.asset.cabinPreview ? state.cabin : undefined}
                onCabinReady={state.cabinReady}
                onCabinError={state.cabinFailed}
                onCabinProgress={state.cabinProgress}
                onWindowStatus={onWindowStatus}
              />
            )}
          </Suspense>
        ) : (
          <div className="reference-view">
            <img src={model.image} alt={model.imageCaption} />
          </div>
        )}
        {hasAsset && (!state.ready || !sceneInitialized) && !state.error && (
          <div className="scene-loading" role="status" aria-live="polite">
            <span className="loading-wordmark">
              GT-R LAB
              <span />
            </span>
            <p>
              {state.loadingProgress >= 99
                ? "Preparing the renderer"
                : "Loading vehicle assets"}
            </p>
            <div className="progress-track">
              <span style={{ width: state.loadingProgress + "%" }} />
            </div>
            <small>{Math.round(state.loadingProgress)}%</small>
          </div>
        )}
      </div>
      <div className="config-toolbar" aria-label="Scene tools">
        <button
          ref={cameraButton}
          onClick={() => open("camera")}
          className={state.panel === "camera" ? "active" : ""}
          aria-expanded={state.panel === "camera"}
          title="Camera presets"
        >
          <Camera />
          <span>Camera</span>
        </button>
        <button
          onClick={() => open("environment")}
          className={state.panel === "environment" ? "active" : ""}
          aria-expanded={state.panel === "environment"}
          title="Environment"
        >
          <Image />
          <span>Environment</span>
        </button>
        <button
          onClick={() => {
            useConfigurator.setState({ lightsEnabled: !state.lightsEnabled });
            audio.play();
          }}
          disabled={
            !interactive || !model.asset.lights || !state.lightsAvailable
          }
          aria-label="Lights"
          aria-pressed={state.lightsEnabled}
          title={
            !interactive
              ? "Lights require a ready 3D model"
              : "Toggle running lights: front LED strips and rear rings"
          }
        >
          <Sun />
          <span>Lights {state.lightsEnabled ? "on" : "off"}</span>
        </button>
        <button
          disabled={!interactive || reduced || state.cabin.phase === "active"}
          onClick={() => {
            useConfigurator.setState({ autoRotate: !state.autoRotate });
            audio.play();
          }}
          aria-label="Rotate"
          aria-pressed={state.autoRotate}
          title={
            reduced ? "Showcase disabled for reduced motion" : "Auto rotate"
          }
        >
          <RotateCw />
          <span>{state.autoRotate ? "Stop rotation" : "Rotate"}</span>
        </button>
        <SoundButton cueOnly />
      </div>
      <div className="scene-bottom">
        <button className="switch-model" onClick={() => open("models")}>
          <Car size={17} />
          <span>Switch model</span>
        </button>
        {interactive ? (
          <p className="interaction-hint">
            {state.cabin.phase === "active" || state.cameraPreset === "interior"
              ? "Drag or use arrow keys to look · Esc to exit"
              : "Drag to orbit · Scroll to zoom"}
          </p>
        ) : (
          <button className="asset-status" onClick={() => open("assets")}>
            <Info size={15} />
            {state.error
              ? "3D unavailable · View details"
              : hasAsset
                ? "Preparing 3D · View details"
                : "Photo reference · 3D asset pending"}
          </button>
        )}
        <span className="scene-count">
          {String(
            ["premium", "nismo", "tspec", "gtr50", "gt3", "gt500"].indexOf(id) +
              1,
          ).padStart(2, "0")}{" "}
          / 06
        </span>
      </div>
      {state.error && (
        <div className="render-error" role="alert">
          <p>{state.error}</p>
          <button
            className="text-link"
            onClick={() => {
              state.retryScene();
            }}
          >
            <RefreshCw size={15} />
            Try again
          </button>
        </div>
      )}
      {state.cabin.phase !== "closed" ? (
        <CabinPreviewControls onExit={exitCabin} reducedMotion={reduced} />
      ) : (
        <footer className="paint-rail">
          <div className="paint-label">
            <span>Exterior / Concept palette</span>
            <strong>
              {interactive ? paint.name : "Select your perspective"}
            </strong>
            <small>
              {interactive
                ? "Illustrative finish, not an official paint catalog"
                : "Paint controls unlock with the 3D model"}
            </small>
          </div>
          <div
            className="paint-swatches"
            role="group"
            aria-label="Exterior paint"
          >
            {paints.map((p) => (
              <button
                key={p.id}
                disabled={!interactive || !state.paintAvailable}
                onClick={() => {
                  state.setPaint(p.id);
                  audio.play();
                }}
                aria-label={p.name}
                aria-pressed={p.id === paint.id}
                className={p.id === paint.id ? "selected" : ""}
                title={p.name}
              >
                <span className="swatch" style={{ backgroundColor: p.color }} />
                <span className="swatch-name">{p.name}</span>
              </button>
            ))}
          </div>
          <button
            className="paint-info icon-button"
            aria-label="Asset information"
            onClick={() => open("assets")}
          >
            <Info size={20} />
          </button>
        </footer>
      )}
      <div
        key={state.selectedEnvironment}
        className="environment-transition"
        aria-hidden="true"
      />
      {renderPending && hasAsset && !state.error ? (
        <div role="status" aria-live="polite" className="scene-notice">
          <p>
            Rendering is taking longer than usual. You can keep waiting or retry
            the viewer.
          </p>
          <button className="text-link" onClick={state.retryScene}>
            <RefreshCw size={15} />
            Retry viewer
          </button>
        </div>
      ) : state.notice ? (
        <div role="status" className="scene-notice">
          <p>{state.notice}</p>
          <button
            aria-label="Dismiss environment notice"
            className="icon-button"
            onClick={() => useConfigurator.setState({ notice: null })}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <ConfiguratorPanels
        key={model.id}
        model={model}
        interactive={interactive}
      />
      {audio.error && (
        <p role="status" className="audio-error">
          {audio.error}
        </p>
      )}
    </main>
  );
}
