import { ReferenceUnavailable } from "../ReferenceUnavailable";
import { AssetDisclosure } from "./AssetDisclosure";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
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
  const selectedCamera =
    state.cabin.phase === "active" ? "interior" : state.cameraPreset;
  const [lastPanel, setLastPanel] = useState(state.panel);
  useEffect(() => {
    if (state.panel) setLastPanel(state.panel);
  }, [state.panel]);
  const panel = state.panel ?? lastPanel;
  const navigate = useNavigate();
  const audio = useAudio();
  const close = useCallback(
    () => useConfigurator.setState({ panel: null }),
    [],
  );
  if (!panel) return null;
  const titles = {
    camera: "A new perspective.",
    environment: "Change the atmosphere.",
    models: "Choose your expression.",
    details: model.name,
    assets: "Behind the experience.",
  };
  return (
    <Drawer
      open={state.panel !== null}
      title={titles[panel]}
      onClose={close}
      wide={panel === "models"}
    >
      {panel === "details" && <ModelDetails model={model} />}
      {panel === "models" && (
        <div className="variant-choices">
          {models.map((m) => (
            <button
              key={m.id}
              aria-label={`${m.shortName} ${m.tagline}`}
              aria-current={m.id === model.id ? "page" : undefined}
              className={m.id === model.id ? "selected" : ""}
              onClick={() => {
                audio.play();
                navigate("/configurator/" + m.id);
                close();
              }}
            >
              {m.image ? (
                <img src={m.image.replace(".webp", ".small.webp")} alt="" />
              ) : (
                <ReferenceUnavailable model={m} />
              )}
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
      {panel === "camera" && (
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
          {interactive &&
            !model.asset.interior &&
            !model.asset.cabinPreview && (
              <p className="availability-note" id="cabin-availability">
                Exterior-only model. A detailed cabin is not included in this
                asset, so Interior is unavailable.
              </p>
            )}
          {model.asset.cabinPreview && (
            <p className="availability-note" id="cabin-preview-note">
              An original authored cabin, still in progress. Prepared with the
              vehicle so Interior opens directly when ready. Not a verified
              factory interior. Displays and dial faces are static
              illustrations.
            </p>
          )}
          <div className="camera-choices">
            {cameraPresets.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === selectedCamera}
                disabled={
                  !interactive ||
                  (p.id === "interior" &&
                    ((!model.asset.interior && !model.asset.cabinPreview) ||
                      (model.asset.cabinPreview &&
                        state.cabinPreparation.phase !== "ready")))
                }
                aria-describedby={
                  p.id === "interior" && model.asset.cabinPreview
                    ? "cabin-preview-note"
                    : p.id === "interior" &&
                        interactive &&
                        !model.asset.interior
                      ? "cabin-availability"
                      : undefined
                }
                className={p.id === selectedCamera ? "selected" : ""}
                onClick={() => {
                  if (p.id === "interior" && model.asset.cabinPreview)
                    state.beginCabin();
                  else state.setCamera(p.id);
                  audio.play();
                  close();
                }}
              >
                <span>
                  {p.id === "interior" && model.asset.cabinPreview
                    ? "Interior"
                    : p.name}
                </span>
                {p.id === "interior" &&
                !model.asset.interior &&
                !model.asset.cabinPreview ? (
                  <small>Detailed cabin required</small>
                ) : p.id === selectedCamera ? (
                  <Check size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}
              </button>
            ))}
          </div>
        </>
      )}
      {panel === "environment" && (
        <>
          <fieldset
            className="render-quality"
            disabled={model.asset.status !== "ready" || !model.asset.url}
            aria-describedby="render-quality-note"
          >
            <legend>Rendering quality</legend>
            <label>
              <input
                type="radio"
                name="render-quality"
                value="standard"
                checked={state.renderQuality === "standard"}
                onChange={() => state.setRenderQuality("standard")}
              />
              <span>
                <strong>Standard</strong>
                <small>
                  Up to 2 million pixels · More fine detail (default)
                </small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="render-quality"
                value="reduced"
                checked={state.renderQuality === "reduced"}
                onChange={() => state.setRenderQuality("reduced")}
              />
              <span>
                <strong>Reduced</strong>
                <small>
                  Up to 1 million pixels · Less pixel work, softer fine detail
                </small>
              </span>
            </label>
            <p id="render-quality-note">
              May help on larger screens. Small screens may look and perform the
              same. Both keep anti-aliasing. Kept for this visit; reload
              restores Standard.
            </p>
            {(model.asset.status !== "ready" || !model.asset.url) && (
              <p>Quality applies to 3D models, not photo references.</p>
            )}
          </fieldset>
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
                aria-pressed={state.selectedEnvironment === e.id}
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
      {panel === "assets" && (
        <AssetDisclosure model={model} interactive={interactive} />
      )}
    </Drawer>
  );
}
