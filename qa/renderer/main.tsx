import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { HousingReviewHarness } from "./housing";
import VehicleScene from "../../src/components/three/VehicleScene";
import type { StudioEnvironment } from "../../src/components/three/types";
import { createFixtureGlb, QA_MATERIAL_ROLES } from "./fixture";

// A second gate protects accidental direct execution via an ordinary Vite dev server.
if (import.meta.env.MODE !== "renderer-qa")
  throw new Error("QA harness disabled outside renderer-qa mode.");

function Harness() {
  const [urls] = useState(() => ({
    valid: URL.createObjectURL(
      new Blob([createFixtureGlb()], { type: "model/gltf-binary" }),
    ),
    invalid: URL.createObjectURL(
      new Blob(["not a glb"], { type: "application/octet-stream" }),
    ),
  }));
  useEffect(
    () => () => {
      URL.revokeObjectURL(urls.valid);
      URL.revokeObjectURL(urls.invalid);
    },
    [urls],
  );
  const [invalid, setInvalid] = useState(
    new URLSearchParams(location.search).get("case") === "invalid",
  );
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const [capabilities, setCapabilities] = useState({
    paint: false,
    lights: false,
  });
  const [paint, setPaint] = useState("#136ddf");
  const [lights, setLights] = useState(false);
  const [preset, setPreset] = useState("hero");
  const [autoRotate, setAutoRotate] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [manual, setManual] = useState(0);
  const [environment, setEnvironment] = useState<StudioEnvironment>("studio");
  const [notice, setNotice] = useState("");
  const onReady = useCallback(() => {
    setReady(true);
    setProgress(100);
  }, []);
  const onError = useCallback((message: string) => {
    setError(message);
    setReady(false);
  }, []);
  const onManual = useCallback(() => {
    setManual((value) => value + 1);
    setAutoRotate(false);
  }, []);
  const onFallback = useCallback((message: string) => {
    setEnvironment("studio");
    setNotice(message);
  }, []);
  function retry(valid: boolean) {
    if (valid) setInvalid(false);
    setRevision((value) => value + 1);
    setError(null);
    setReady(false);
    setProgress(0);
    setEnvironment("studio");
    setNotice("");
  }
  return (
    <main
      style={{
        color: "#fff",
        background: "#111316",
        minHeight: "100vh",
        font: "14px system-ui",
      }}
    >
      <header style={{ padding: "12px 20px" }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>
          RENDERER QA ONLY · SYNTHETIC GEOMETRY · NOT A VEHICLE
        </h1>
        <p>
          No catalog model, realism or interior quality is represented by this
          fixture.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setPaint("#e32636")}>Paint red</button>
          <button onClick={() => setPaint("#136ddf")}>Paint blue</button>
          <button onClick={() => setLights((value) => !value)}>
            Toggle lamps
          </button>
          <button
            onClick={() => {
              setReducedMotion(false);
              setAutoRotate(true);
            }}
          >
            Start rotation
          </button>
          <button onClick={() => setPreset("front")}>Front view</button>
          <button onClick={() => setPreset("side")}>Side view</button>
          <button onClick={() => setPreset("top")}>Top view</button>
          <button onClick={() => setEnvironment("forest")}>
            Forest environment
          </button>
          <button onClick={() => retry(false)}>Retry viewer</button>
          <button onClick={() => retry(true)}>Load valid fixture</button>
        </div>
      </header>
      <section
        style={{ width: "100%", height: 520, position: "relative" }}
        aria-label="Synthetic GLB test stage"
      >
        {!error && (
          <VehicleScene
            key={revision}
            url={invalid ? urls.invalid : urls.valid}
            paint={paint}
            environment={environment}
            preset={preset}
            autoRotate={autoRotate}
            lights={lights}
            reducedMotion={reducedMotion}
            materialRoles={QA_MATERIAL_ROLES}
            onReady={onReady}
            onError={onError}
            onProgress={setProgress}
            onManual={onManual}
            onCapabilities={setCapabilities}
            onEnvironmentFallback={onFallback}
          />
        )}
        {error && (
          <p role="alert" style={{ padding: 30 }}>
            {error}
          </p>
        )}
      </section>
      <footer
        style={{
          padding: "12px 20px",
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <output data-testid="status">
          {error ? "error" : ready ? "ready" : "loading"}
        </output>
        <output data-testid="progress">{progress}</output>
        <output data-testid="paint-capability">
          {String(capabilities.paint)}
        </output>
        <output data-testid="lights-capability">
          {String(capabilities.lights)}
        </output>
        <output data-testid="manual-count">{manual}</output>
        <output data-testid="rotation">{String(autoRotate)}</output>
        <output data-testid="environment">{environment}</output>
        <output data-testid="environment-notice" role="status">
          {notice}
        </output>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("review") === "housing" ? (
    <HousingReviewHarness />
  ) : (
    <Harness />
  ),
);
