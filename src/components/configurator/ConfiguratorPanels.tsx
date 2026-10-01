import { useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Check, Box } from "lucide-react";
import { useConfigurator } from "../../stores/configurator";
import { models } from "../../data/models";
import type { VehicleModel } from "../../data/models";
import { cameraPresets, environments } from "../../data/configuration";
import { Drawer } from "../ui/Drawer";
import { ModelDetails } from "./ModelDetails";
import { useAudio } from "../../hooks/useAudio";
export function ConfiguratorPanels({
  model,
  interactive,
}: {
  model: VehicleModel;
  interactive: boolean;
}) {
  const state = useConfigurator();
  const navigate = useNavigate();
  const audio = useAudio();
  const close = useCallback(
    () => useConfigurator.setState({ panel: null }),
    [],
  );
  if (!state.panel) return null;
  const titles = {
    camera: "A new perspective.",
    environment: "Change the atmosphere.",
    models: "Choose your expression.",
    details: model.name,
    assets: "Behind the experience.",
  };
  return (
    <Drawer
      title={titles[state.panel]}
      onClose={close}
      wide={state.panel === "models"}
    >
      {state.panel === "details" && <ModelDetails model={model} />}
      {state.panel === "models" && (
        <div className="variant-choices">
          {models.map((m) => (
            <button
              key={m.id}
              aria-label={`${m.shortName} ${m.tagline}`}
              className={m.id === model.id ? "selected" : ""}
              onClick={() => {
                audio.play();
                navigate("/configurator/" + m.id);
                close();
              }}
            >
              <img src={m.image.replace(".webp", ".small.webp")} alt="" />
              <span>
                <strong>{m.shortName}</strong>
                <small>{m.tagline}</small>
              </span>
              {m.id === model.id ? (
                <Check size={18} />
              ) : (
                <ArrowRight size={18} />
              )}
            </button>
          ))}
        </div>
      )}
      {state.panel === "camera" && (
        <>
          <p className="panel-intro">
            Find the form from every angle. Drag to orbit; scroll or pinch to
            move closer.
          </p>
          {!interactive && (
            <p className="availability-note">
              Camera controls activate when this model’s licensed 3D asset is
              available.
            </p>
          )}
          <div className="camera-choices">
            {cameraPresets.map((p) => (
              <button
                key={p.id}
                disabled={
                  !interactive || (p.id === "interior" && !model.asset.interior)
                }
                className={state.cameraPreset === p.id ? "selected" : ""}
                onClick={() => {
                  state.setCamera(p.id);
                  audio.play();
                  close();
                }}
              >
                <span>{p.name}</span>
                {p.id === "interior" && !model.asset.interior ? (
                  <small>Detailed cabin required</small>
                ) : state.cameraPreset === p.id ? (
                  <Check size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {state.panel === "environment" && (
        <>
          <p className="panel-intro">
            Lighting, reflections and background change together.
          </p>
          {!interactive && (
            <p className="availability-note">
              Environment controls require a ready 3D scene.
            </p>
          )}
          <div className="environment-choices">
            {environments.map((e) => (
              <button
                key={e.id}
                disabled={!interactive}
                className={state.selectedEnvironment === e.id ? "selected" : ""}
                onClick={() => {
                  state.setEnvironment(e.id);
                  audio.play();
                  close();
                }}
              >
                <span
                  className={"environment-preview " + e.id}
                  style={{ backgroundColor: e.color }}
                />
                <span>
                  <strong>{e.name}</strong>
                  <small>{e.description}</small>
                </span>
                {state.selectedEnvironment === e.id && <Check size={18} />}
              </button>
            ))}
          </div>
        </>
      )}
      {state.panel === "assets" && (
        <div className="asset-explanation">
          <Box size={35} />
          <h3>
            {interactive
              ? "A real-time perspective."
              : model.asset.status === "ready"
                ? "A rendering interruption."
                : "The right model comes first."}
          </h3>
          <p>
            {interactive
              ? "This view uses a licensed GLB vehicle asset rendered live in WebGL."
              : model.asset.status === "ready"
                ? "This model has a licensed 3D asset, but the viewer is not currently rendering it. The visible image is a photographic reference. Retry the scene to restore live interaction."
                : "A production-quality, licensed 3D asset for " +
                  model.name +
                  " has not been integrated yet. The current view is a clearly marked photograph, not an interactive render."}
          </p>
          <p>
            Exterior geometry, detailed cabin, separated paint and light
            materials must all be verified before the complete experience can be
            enabled.
          </p>
          <dl>
            <div>
              <dt>Photography</dt>
              <dd>Available · attributed</dd>
            </div>
            <div>
              <dt>Vehicle geometry</dt>
              <dd>
                {model.asset.status === "ready"
                  ? "Available"
                  : "Pending licensed asset"}
              </dd>
            </div>
            <div>
              <dt>Detailed interior</dt>
              <dd>{model.asset.interior ? "Verified" : "Not yet verified"}</dd>
            </div>
            <div>
              <dt>Headlight materials</dt>
              <dd>{model.asset.lights ? "Verified" : "Not yet verified"}</dd>
            </div>
          </dl>
          <Link to="/credits" className="text-link underlined">
            Credits & asset policy
            <ArrowRight size={18} />
          </Link>
        </div>
      )}
    </Drawer>
  );
}
