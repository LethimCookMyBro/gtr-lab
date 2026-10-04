import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
RectAreaLightUniformsLib.init();
import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { ContactShadows } from "@react-three/drei/core/ContactShadows";
import { useEnvironment } from "@react-three/drei/core/useEnvironment";
import { useTexture } from "@react-three/drei/core/Texture";
import { StageGeometry } from "./StageGeometry";
import { RoadsideRocks } from "./RoadsideRocks";
import { CoastalWater } from "./CoastalWater";
import type { RoadsideRockInstance } from "./RoadsideRocks";
import {
  createVenue,
  NIGHT_BAY_PANELS,
  setVenueInspectionCutaway,
} from "./venueGeometry";
import type { SurfaceTextures } from "./venueGeometry";
import type { StudioEnvironment } from "./types";

const SURFACES = [
  "garage_floor",
  "concrete_wall_008",
  "asphalt_pit_lane",
  "aerial_rocks_02",
];
const FILES = [
  ...SURFACES.flatMap((id) =>
    ["diff", "rough", "nor_gl"].map(
      (map) => `/environments/${id}_${map}_1k.jpg`,
    ),
  ),
  "/environments/aerial_rocks_02_disp_1k.jpg",
];
export function clearVenueTextures() {
  useTexture.clear(FILES);
}

const COAST_ROCKS: RoadsideRockInstance[] = [
  { position: [14.8, -0.2, -7], rotation: 0.3, variant: 0 },
  { position: [16.4, -0.16, -2], rotation: 1.4, variant: 3, scale: 1.2 },
  { position: [14.9, -0.2, 6], rotation: 2.1, variant: 1 },
  { position: [19, -0.5, 12], rotation: 0.8, variant: 4, scale: 1.3 },
  { position: [18, -0.25, -18], rotation: 2.8, variant: 2, scale: 1.5 },
  { position: [-16, -1.5, -8], rotation: 1.2, variant: 3, scale: 1.3 },
  { position: [-19, -1.6, 5], rotation: 0.4, variant: 5, scale: 1.5 },
];
const PADDOCK_ROCKS: RoadsideRockInstance[] = [];

const SKY = "/environments/kloofendal_48d_partly_cloudy_puresky_2k.hdr";

/** The selectable scenes are actual metre-scaled geometry, not a panorama projection. */
export function StudioLighting({
  environment,
}: {
  environment: StudioEnvironment;
  reducedMotion: boolean;
}) {
  const loaded = useTexture(FILES);
  const surfaces = useMemo(() => {
    if (!loaded[12])
      throw new Error("Required coastal displacement texture was not loaded");
    const maps = Object.fromEntries(
      ["floor", "wall", "asphalt", "rock"].map((name, i) => [
        name,
        loaded.slice(i * 3, i * 3 + 3),
      ]),
    ) as SurfaceTextures;
    maps.rock[3] = loaded[12];
    return maps;
  }, [loaded]);
  const venue = useMemo(
    () => createVenue(environment, surfaces),
    [environment, surfaces],
  );
  const reflection = useMemo(() => {
    const copy = venue.group.clone(true);
    copy.position.y = -0.8;
    const proxy = copy.getObjectByName("ocean");
    if (proxy) proxy.visible = true;
    return copy;
  }, [venue]);
  const visibleOcean = venue.group.getObjectByName("ocean");
  if (visibleOcean) visibleOcean.visible = false;
  useEffect(() => () => venue.dispose(), [venue]);
  useFrame(({ camera }) =>
    setVenueInspectionCutaway(venue.group, camera.position.y),
  );
  const outdoors = environment === "forest" || environment === "coast";
  const night = environment === "night";
  const gallery = environment === "gallery";
  return (
    <>
      {outdoors ? (
        <OutdoorLight
          reflection={reflection}
          rocks={environment === "coast" ? COAST_ROCKS : PADDOCK_ROCKS}
        />
      ) : (
        <>
          <color attach="background" args={[night ? "#0e1520" : "#a6b8c5"]} />
          <fog attach="fog" args={[night ? "#0e1520" : "#a6b8c5", 35, 115]} />
          <ambientLight intensity={night ? 0.16 : 0.26} />
          <hemisphereLight
            color="#dbe4ec"
            groundColor="#515052"
            intensity={night ? 0.28 : 0.5}
          />
          <directionalLight
            position={[-9, 9, -4]}
            intensity={night ? 0.38 : gallery ? 2.8 : 2.2}
            color="#f0f5ff"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-20}
            shadow-camera-right={20}
            shadow-camera-top={20}
            shadow-camera-bottom={-20}
            shadow-camera-far={65}
            shadow-bias={-0.00018}
            shadow-normalBias={0.025}
            shadow-radius={3}
            onUpdate={(light) => light.shadow.camera.layers.enable(2)}
          />
          <directionalLight
            position={[5, 4, 7]}
            intensity={night ? 0.28 : 0.9}
            color="#d8e5f3"
          />
          {[-1, 1].map((side) => (
            <rectAreaLight
              key={`area-${side}`}
              position={[side * (gallery ? 5 : 4.5), 4.9, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              width={gallery ? 0.24 : 0.3}
              height={gallery ? 5.2 : 10.1}
              intensity={night ? 9 : 5}
              color={night ? "#f7f3e8" : "#f4f7ff"}
            />
          ))}
          {night &&
            NIGHT_BAY_PANELS.map((panel) => (
              <rectAreaLight
                key={`night-bay-${panel.position[2]}`}
                {...panel}
                rotation={[-Math.PI / 2, 0, 0]}
              />
            ))}
          <Environment
            key={`interior-${environment}`}
            resolution={256}
            frames={1}
            environmentIntensity={night ? 0.82 : 1.0}
          >
            <color attach="background" args={[night ? "#14191e" : "#75828b"]} />
            <ambientLight intensity={night ? 0.2 : 0.45} />
            <directionalLight
              position={[-9, 9, -4]}
              intensity={night ? 0.38 : 2.2}
              color="#f0f5ff"
            />
            <primitive object={reflection} dispose={null} />
            {[-1, 1].map((side) => (
              <group key={`reflected-light-${side}`}>
                <rectAreaLight
                  position={[side * (gallery ? 5 : 4.5), 4.1, 0]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  width={gallery ? 0.24 : 0.3}
                  height={gallery ? 5.2 : 10.1}
                  intensity={night ? 9 : 5}
                  color={night ? "#f7f3e8" : "#f4f7ff"}
                />
                <Lightformer
                  form="rect"
                  intensity={night ? 9 : 5}
                  position={[side * (gallery ? 5 : 4.5), 4.12, 0]}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[0.3, gallery ? 5.2 : 10.1, 1]}
                />
              </group>
            ))}
            {night &&
              NIGHT_BAY_PANELS.map((panel) => (
                <group key={`reflected-night-bay-${panel.position[2]}`}>
                  <rectAreaLight
                    {...panel}
                    position={[
                      panel.position[0],
                      panel.position[1] - 0.8,
                      panel.position[2],
                    ]}
                    rotation={[-Math.PI / 2, 0, 0]}
                  />
                  <Lightformer
                    form="rect"
                    intensity={panel.intensity}
                    color={panel.color}
                    position={[
                      panel.position[0],
                      panel.position[1] - 0.8,
                      panel.position[2],
                    ]}
                    rotation={[Math.PI / 2, 0, 0]}
                    scale={[panel.width, panel.height, 1]}
                  />
                </group>
              ))}
            {!night && (
              <Lightformer
                form="rect"
                intensity={3}
                position={[12, 3.8, 0]}
                rotation={[0, -Math.PI / 2, 0]}
                scale={[1.2, 18, 1]}
              />
            )}
          </Environment>
        </>
      )}
      <StageGeometry>
        <primitive object={venue.group} dispose={null} />
        {environment === "coast" && <CoastalWater />}
        {environment === "coast" && (
          <RoadsideRocks
            instances={environment === "coast" ? COAST_ROCKS : PADDOCK_ROCKS}
          />
        )}
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

function OutdoorLight({
  reflection,
  rocks,
}: {
  reflection: Group;
  rocks: RoadsideRockInstance[];
}) {
  const texture = useEnvironment({ files: SKY });
  return (
    <>
      <Environment map={texture} background="only" backgroundIntensity={0.8} />
      <Environment
        resolution={256}
        frames={1}
        environmentIntensity={0.72}
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
          position={[41.56, 54.93, 28.14]}
          intensity={3.4}
          color="#fff7e8"
        />
        <primitive object={reflection} dispose={null} />
        {rocks.length > 0 && (
          <group position={[0, -0.8, 0]}>
            <RoadsideRocks instances={rocks} />
          </group>
        )}
      </Environment>
      <fog attach="fog" args={["#bbd0de", 180, 620]} />
      <hemisphereLight intensity={0.5} color="#dbeaf3" groundColor="#646357" />
      {/* Aligned to the actual sun in the CC0 sky map (u≈0.595, v≈0.767). */}
      <directionalLight
        position={[41.56, 55.73, 28.14]}
        intensity={3.4}
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
