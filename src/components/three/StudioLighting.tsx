import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { environmentAsset } from "./sceneHelpers";
import { StageGeometry } from "./StageGeometry";
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import type { StudioEnvironment } from "./types";

const MOODS = {
  studio: {
    background: "#111316",
    floor: "#171a1d",
    ambient: 0.35,
    key: 4.5,
    intensity: 0.9,
  },
  gallery: {
    background: "#b2b0aa",
    floor: "#aaa8a2",
    ambient: 0.75,
    key: 3.2,
    intensity: 1.1,
  },
  night: {
    background: "#050608",
    floor: "#0a0b0e",
    ambient: 0.12,
    key: 2.3,
    intensity: 0.6,
  },
};

/** Original procedural studio panels. No third-party HDRI or network dependency. */
export function StudioLighting({
  environment,
  reducedMotion,
}: {
  environment: StudioEnvironment;
  reducedMotion: boolean;
}) {
  if (environment === "forest" || environment === "coast")
    return (
      <OutdoorEnvironment
        environment={environment}
        reducedMotion={reducedMotion}
      />
    );
  const mood = MOODS[environment];
  return (
    <>
      <color attach="background" args={[mood.background]} />
      <fog attach="fog" args={[mood.background, 18, 45]} />
      <StageGeometry>
        <ambientLight intensity={mood.ambient} />
        <directionalLight
          position={[3, 7, 5]}
          intensity={mood.key}
          color="#fff7ed"
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
          shadow-camera-near={0.1}
          shadow-camera-far={20}
          shadow-bias={-0.0001}
          shadow-normalBias={0.003}
        />
        <directionalLight
          position={[-5, 3, -4]}
          intensity={environment === "night" ? 1.5 : 2.4}
          color="#e7ebed"
        />
        <Environment
          key={environment}
          resolution={256}
          frames={1}
          environmentIntensity={mood.intensity}
        >
          <color
            attach="background"
            args={[environment === "gallery" ? "#6f7071" : "#111316"]}
          />
          <Lightformer
            form="rect"
            intensity={5}
            color="#ffffff"
            position={[0, 6, 0]}
            rotation={[Math.PI / 2, 0, 0]}
            scale={[4, 8, 1]}
          />
          <Lightformer
            form="rect"
            intensity={7}
            color="#f3f2ef"
            position={[-4, 2, 0]}
            rotation={[0, Math.PI / 2, 0]}
            scale={[1.5, 6, 1]}
          />
          <Lightformer
            form="rect"
            intensity={4}
            color="#e9ecee"
            position={[4, 2, -3]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[2, 5, 1]}
          />
          <Lightformer
            form="rect"
            intensity={environment === "night" ? 2 : 4}
            color="#ffffff"
            position={[0, 3, -6]}
            scale={[5, 1, 1]}
          />
        </Environment>
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[150, 150]} />
          <meshStandardMaterial
            color={mood.floor}
            roughness={0.8}
            metalness={0}
          />
        </mesh>
        <ContactShadows
          key={environment}
          position={[0, 0.001, 0]}
          opacity={environment === "gallery" ? 0.55 : 0.68}
          scale={12}
          blur={2.5}
          far={4.5}
          resolution={512}
          frames={1}
          color="#000000"
        />
      </StageGeometry>
    </>
  );
}

function EnvironmentFade({ reducedMotion }: { reducedMotion: boolean }) {
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const elapsed = useRef(0);
  useEffect(() => {
    elapsed.current = reducedMotion ? 0.4 : 0;
    invalidate();
  }, [reducedMotion, invalidate]);
  useFrame((_, delta) => {
    if (elapsed.current >= 0.4) return;
    elapsed.current = Math.min(0.4, elapsed.current + delta);
    const strength =
      0.3 + 0.7 * Math.sin(((elapsed.current / 0.4) * Math.PI) / 2);
    scene.backgroundIntensity = strength;
    scene.environmentIntensity = strength;
    invalidate();
  });
  return null;
}

function OutdoorEnvironment({
  environment,
  reducedMotion,
}: {
  environment: "forest" | "coast";
  reducedMotion: boolean;
}) {
  const width = useThree((state) => state.size.width);
  const file = environmentAsset(environment, width < 768)!;
  return (
    <StageGeometry>
      <Environment
        key={file}
        files={file}
        background
        environmentIntensity={1}
        backgroundIntensity={1}
        ground={{ height: 1.6, radius: 45, scale: 80 }}
      />
      <EnvironmentFade key={file} reducedMotion={reducedMotion} />
      <directionalLight
        position={environment === "forest" ? [4, 8, -3] : [-5, 4, 3]}
        intensity={environment === "forest" ? 1.1 : 1.7}
        color={environment === "forest" ? "#f4f7ef" : "#fff0d9"}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
        shadow-camera-near={0.1}
        shadow-camera-far={20}
        shadow-bias={-0.0001}
        shadow-normalBias={0.003}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.0005, 0]}
        receiveShadow
      >
        <planeGeometry args={[30, 30]} />
        <shadowMaterial transparent opacity={0.28} />
      </mesh>
      <ContactShadows
        key={file}
        position={[0, 0.001, 0]}
        opacity={0.65}
        scale={12}
        blur={2.3}
        far={4.5}
        resolution={512}
        frames={1}
        color="#000000"
      />
    </StageGeometry>
  );
}
