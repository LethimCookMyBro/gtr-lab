import { useEffect, useMemo } from "react";
import type { Group } from "three";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import { useEnvironment } from "@react-three/drei/core/useEnvironment";
import { useTexture } from "@react-three/drei/core/Texture";
import { StageGeometry } from "./StageGeometry";
import { createVenue } from "./venueGeometry";
import type { SurfaceTextures } from "./venueGeometry";
import type { StudioEnvironment } from "./types";

const SURFACES = [
  "garage_floor",
  "concrete_wall_008",
  "asphalt_pit_lane",
  "aerial_rocks_02",
];
const FILES = SURFACES.flatMap((id) =>
  ["diff", "rough", "nor_gl"].map((map) => `/environments/${id}_${map}_1k.jpg`),
);
export function clearVenueTextures() {
  useTexture.clear(FILES);
}

const SKY = "/environments/kloofendal_43d_clear_puresky_1k.hdr";

/** The selectable scenes are actual metre-scaled geometry, not a panorama projection. */
export function StudioLighting({
  environment,
}: {
  environment: StudioEnvironment;
  reducedMotion: boolean;
}) {
  const loaded = useTexture(FILES);
  const surfaces = useMemo(
    () =>
      Object.fromEntries(
        ["floor", "wall", "asphalt", "rock"].map((name, i) => [
          name,
          loaded.slice(i * 3, i * 3 + 3),
        ]),
      ) as SurfaceTextures,
    [loaded],
  );
  const venue = useMemo(
    () => createVenue(environment, surfaces),
    [environment, surfaces],
  );
  const reflection = useMemo(() => {
    const copy = venue.group.clone(true);
    copy.position.y = -0.8;
    return copy;
  }, [venue]);
  useEffect(() => () => venue.dispose(), [venue]);
  const outdoors = environment === "forest" || environment === "coast";
  const night = environment === "night";
  const gallery = environment === "gallery";
  return (
    <>
      {outdoors ? (
        <OutdoorLight reflection={reflection} />
      ) : (
        <>
          <color attach="background" args={[night ? "#11171b" : "#434b4e"]} />
          <fog attach="fog" args={[night ? "#11171b" : "#525b5e", 35, 115]} />
          <ambientLight intensity={night ? 0.18 : 0.38} />
          <hemisphereLight
            color="#dbe4ec"
            groundColor="#515052"
            intensity={night ? 0.35 : 0.65}
          />
          <directionalLight
            position={[-5, 8, 6]}
            intensity={night ? 1.65 : gallery ? 3.2 : 2.7}
            color="#fff7e9"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-16}
            shadow-camera-right={16}
            shadow-camera-top={16}
            shadow-camera-bottom={-16}
            shadow-camera-far={65}
            shadow-bias={-0.00005}
            shadow-normalBias={0.008}
            onUpdate={(light) => light.shadow.camera.layers.enable(2)}
          />
          <directionalLight
            position={[4, 5, -6]}
            intensity={night ? 0.4 : 1.0}
            color="#d8e5f3"
          />
          <Environment
            key={`interior-${environment}`}
            resolution={256}
            frames={1}
            environmentIntensity={night ? 0.75 : 0.9}
          >
            <color attach="background" args={[night ? "#14191e" : "#75828b"]} />
            <ambientLight intensity={night ? 0.25 : 0.7} />
            <directionalLight
              position={[-5, 8, 6]}
              intensity={2}
              color="#fff7eb"
            />
            <primitive object={reflection} dispose={null} />
            <Lightformer
              form="rect"
              intensity={6}
              position={[0, 7, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={[7, 11, 1]}
            />
            <Lightformer
              form="rect"
              intensity={4}
              position={[-8, 3, 0]}
              rotation={[0, Math.PI / 2, 0]}
              scale={[2, 9, 1]}
            />
            <Lightformer
              form="rect"
              intensity={3}
              position={[8, 4, -5]}
              rotation={[0, -Math.PI / 2, 0]}
              scale={[3, 8, 1]}
            />
          </Environment>
        </>
      )}
      <StageGeometry>
        <primitive object={venue.group} dispose={null} />
        <ContactShadows
          key={`contact-${environment}`}
          position={[0, -0.001, 0]}
          opacity={outdoors ? 0.5 : 0.62}
          scale={12}
          blur={2.1}
          far={4.5}
          resolution={512}
          frames={1}
          color="#000000"
        />
      </StageGeometry>
    </>
  );
}

function OutdoorLight({ reflection }: { reflection: Group }) {
  const texture = useEnvironment({ files: SKY });
  return (
    <>
      <Environment map={texture} background="only" backgroundIntensity={0.8} />
      <Environment
        resolution={256}
        frames={1}
        environmentIntensity={0.85}
        far={700}
      >
        <Environment
          map={texture}
          background
          environmentIntensity={0.65}
          backgroundIntensity={0.8}
        />
        <hemisphereLight
          intensity={0.5}
          color="#dbeaf3"
          groundColor="#646357"
        />
        <directionalLight
          position={[43, 49.2, 31]}
          intensity={2.7}
          color="#fff7e8"
        />
        <primitive object={reflection} dispose={null} />
      </Environment>
      <fog attach="fog" args={["#b3c4cc", 75, 260]} />
      <hemisphereLight intensity={0.5} color="#dbeaf3" groundColor="#646357" />
      {/* Aligned to the actual sun in the CC0 sky map (u≈0.60, v≈0.74). */}
      <directionalLight
        position={[43, 50, 31]}
        intensity={2.7}
        color="#fff7e8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-far={140}
        shadow-bias={-0.00003}
        shadow-normalBias={0.01}
        onUpdate={(light) => light.shadow.camera.layers.enable(2)}
      />
    </>
  );
}

/** Asset-free fallback cannot suspend on the same missing texture as the selected scene. */
export function FallbackStudio() {
  return (
    <>
      <color attach="background" args={["#282d31"]} />
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 7, 5]} intensity={3} />
      <StageGeometry>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.002, 0]}
          receiveShadow
        >
          <planeGeometry args={[150, 150]} />
          <meshStandardMaterial color="#50565a" roughness={0.85} />
        </mesh>
      </StageGeometry>
    </>
  );
}
