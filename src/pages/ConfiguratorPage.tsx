import { lazy, Suspense, useEffect, useCallback } from "react";
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
const VehicleScene = lazy(() => import("../components/three/VehicleScene"));
export function ConfiguratorPage() {
  const { model: id = "premium" } = useParams();
  const model = getModel(id);
  const state = useConfigurator();
  const reduced = useReducedMotion();
  const audio = useAudio();
  useEffect(() => {
    state.selectVariant(id);
  }, [id]);
  useEffect(() => {
    if (reduced) useConfigurator.setState({ autoRotate: false });
  }, [reduced]);
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
      useConfigurator.setState({ ready: false, error: message }),
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
  const interactive = hasAsset && state.ready && !state.error;
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
    <main className={"configurator environment-" + state.selectedEnvironment}>
      <header className="config-header">
        <Link to="/models" className="back-link" aria-label="Back to models">
          <ArrowLeft size={19} />
          <span>Back to models</span>
        </Link>
        <Brand />
        <button onClick={() => open("details")} className="model-detail-button">
          Model detail
          <ArrowRight size={18} />
        </button>
      </header>
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
          <button className="study-disclosure" onClick={() => open("assets")}>
            <Info size={14} />
            Model provenance & limitations
          </button>
        )}
      </div>
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
            <VehicleScene
              key={model.id}
              url={model.asset.url!}
              paint={paint.color}
              environment={state.selectedEnvironment}
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
              onProgress={onProgress}
              onManual={onManual}
              onEnvironmentFallback={onEnvironmentFallback}
              onCapabilities={onCapabilities}
            />
          </Suspense>
        ) : (
          <div className="reference-view">
            <img src={model.image} alt={model.imageCaption} />
          </div>
        )}
        {hasAsset && !state.ready && !state.error && (
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
              : "Toggle headlamps and taillamps"
          }
        >
          <Sun />
          <span>Lights {state.lightsEnabled ? "on" : "off"}</span>
        </button>
        <button
          disabled={!interactive || reduced}
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
            {state.cameraPreset === "interior"
              ? "Drag to look around the cabin"
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
      <div
        key={state.selectedEnvironment}
        className="environment-transition"
        aria-hidden="true"
      />
      {state.notice && (
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
      )}
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
