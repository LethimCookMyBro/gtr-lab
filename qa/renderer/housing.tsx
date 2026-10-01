import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ACESFilmicToneMapping,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  SRGBColorSpace,
} from "three";
import { useVehicleAsset } from "../../src/components/three/useVehicleAsset";
import {
  applyVehicleAppearance,
  type PreparedVehicle,
} from "../../src/components/three/materialAdapter";
import { StudioLighting } from "../../src/components/three/StudioLighting";
import { getModel } from "../../src/data/models";
import { createHousingReview } from "./housingReview";

if (import.meta.env.MODE !== "renderer-qa")
  throw new Error("Housing review is QA-only");
const manifest = getModel("premium")!.asset;

function materialSnapshot(asset: PreparedVehicle) {
  const meshes: Array<Record<string, unknown>> = [];
  asset.scene.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = (
      Array.isArray(object.material) ? object.material : [object.material]
    ).map((m) => ({
      name: m.name,
      uuid: m.uuid,
      opacity: m.opacity,
      transparent: m.transparent,
      side: m.side,
      ...(m instanceof MeshStandardMaterial
        ? {
            color: m.color.toArray(),
            metalness: m.metalness,
            roughness: m.roughness,
            emissive: m.emissive.toArray(),
            emissiveIntensity: m.emissiveIntensity,
          }
        : {}),
      ...(m instanceof MeshPhysicalMaterial
        ? { transmission: m.transmission }
        : {}),
    }));
    meshes.push({
      name: object.name,
      sourceName: object.userData.name,
      geometry: object.geometry.uuid,
      matrix: object.matrix.toArray(),
      materials,
    });
  });
  return { scale: asset.scale, position: asset.position, meshes };
}

function Model({
  asset,
  candidate,
  lamps,
  onReady,
}: {
  asset: PreparedVehicle;
  candidate: boolean;
  lamps: boolean;
  onReady: (metrics: unknown) => void;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const review = useRef<ReturnType<typeof createHousingReview> | null>(null);
  useLayoutEffect(() => {
    review.current = createHousingReview(asset.scene);
    return () => {
      review.current?.dispose();
      review.current = null;
    };
  }, [asset]);
  useLayoutEffect(() => {
    camera.position.set(1.7, 1.1, 3.05);
    camera.lookAt(0.65, 0.78, 1.86);
    camera.updateMatrixWorld();
    review.current?.setCandidate(candidate);
    applyVehicleAppearance(asset.bindings, "#aeb2b4", lamps);
    frames.current = 0;
    invalidate();
  }, [asset, candidate, lamps, camera, invalidate]);
  useFrame(() => {
    if (frames.current >= 6) return;
    frames.current++;
    if (frames.current === 6)
      onReady({
        candidate,
        lamps,
        matches: review.current?.count,
        camera: {
          position: camera.position.toArray(),
          matrix: camera.matrixWorld.toArray(),
        },
        ...materialSnapshot(asset),
      });
    else invalidate();
  });
  return (
    <group scale={asset.scale} position={asset.position} dispose={null}>
      <primitive object={asset.scene} dispose={null} />
    </group>
  );
}

export function HousingReviewHarness() {
  const [candidate, setCandidate] = useState(false);
  const [lamps, setLamps] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<unknown>(null);
  const progress = useCallback(() => {}, []);
  const fail = useCallback((message: string) => {
    setError(message);
    setReady(false);
  }, []);
  const asset = useVehicleAsset(
    "/published-car.glb",
    manifest.materialRoles,
    progress,
    fail,
    manifest.disabledEmissive,
  );
  const onReady = useCallback((data: unknown) => {
    setMetrics(data);
    setReady(true);
  }, []);
  const change = (nextCandidate: boolean, nextLamps: boolean) => {
    setReady(false);
    setCandidate(nextCandidate);
    setLamps(nextLamps);
  };
  return (
    <main
      style={{
        height: "100vh",
        background: "#111316",
        color: "#fff",
        font: "14px system-ui",
      }}
    >
      <header
        style={{ height: 88, padding: "12px 20px", boxSizing: "border-box" }}
      >
        <strong>
          ISOLATED MATERIAL REVIEW · EXISTING PUBLISHED GLB · NO PRODUCTION
          CHANGE
        </strong>
        <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
          <button onClick={() => change(false, lamps)} disabled={!candidate}>
            Baseline housing
          </button>
          <button onClick={() => change(true, lamps)} disabled={candidate}>
            Opaque housing candidate
          </button>
          <button onClick={() => change(candidate, !lamps)}>
            Lamps {lamps ? "OFF" : "ON"}
          </button>
          <span data-testid="status">
            {error ? "error" : ready ? "ready" : "rendering"}
          </span>
          <span>
            {candidate ? "Candidate" : "Baseline"} · lamps{" "}
            {lamps ? "ON" : "OFF"}
          </span>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div style={{ height: "calc(100vh - 88px)" }}>
        <Canvas
          shadows
          frameloop="demand"
          dpr={1}
          camera={{ position: [1.7, 1.1, 3.05], fov: 32, near: 0.02, far: 150 }}
          gl={{ antialias: true, alpha: false }}
          onCreated={({ gl }) => {
            gl.setClearAlpha(0);
            gl.outputColorSpace = SRGBColorSpace;
            gl.toneMapping = ACESFilmicToneMapping;
            gl.toneMappingExposure = 1;
            gl.shadowMap.type = PCFSoftShadowMap;
          }}
        >
          {asset && (
            <>
              <StudioLighting environment="studio" reducedMotion />
              <Model
                asset={asset}
                candidate={candidate}
                lamps={lamps}
                onReady={onReady}
              />
            </>
          )}
        </Canvas>
      </div>
      <output data-testid="metrics" hidden>
        {JSON.stringify(metrics)}
      </output>
    </main>
  );
}
