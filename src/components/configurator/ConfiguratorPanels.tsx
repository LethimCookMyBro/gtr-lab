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
              An original authored cabin, still in progress. Choosing the
              preview downloads a separate 18.8 MB model. Not a verified factory
              interior.
            </p>
          )}
          <div className="camera-choices">
            {cameraPresets.map((p) => (
              <button
                key={p.id}
                disabled={
                  !interactive ||
                  (p.id === "interior" &&
                    ((!model.asset.interior && !model.asset.cabinPreview) ||
                      state.cabin.phase === "loading"))
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
                className={
                  (
                    p.id === "interior"
                      ? state.cabin.phase === "active"
                      : state.cameraPreset === p.id &&
                        state.cabin.phase !== "active"
                  )
                    ? "selected"
                    : ""
                }
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
                    ? "Cabin preview · work in progress"
                    : p.name}
                </span>
                {p.id === "interior" &&
                !model.asset.interior &&
                !model.asset.cabinPreview ? (
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
      {panel === "environment" && (
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
      {panel === "assets" && (
        <AssetDisclosure model={model} interactive={interactive} />
      )}
    </Drawer>
  );
}
