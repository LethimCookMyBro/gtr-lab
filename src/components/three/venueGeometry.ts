import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  RingGeometry,
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  Vector2,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { StudioEnvironment } from "./types";

type SurfaceName = "floor" | "wall" | "asphalt" | "rock";
export type SurfaceTextures = Record<SurfaceName, [Texture, Texture, Texture]>;
type Point = [number, number, number];

const inspectionOverheads = new WeakMap<
  Group,
  { meshes: Mesh[]; cut: boolean }
>();
/** High inspection views deliberately cut the roof/services away before entering them. */
export function setVenueInspectionCutaway(group: Group, cameraHeight: number) {
  let entry = inspectionOverheads.get(group);
  if (!entry) {
    const meshes: Mesh[] = [];
    group.traverse((object) => {
      if (
        object instanceof Mesh &&
        /^(overhead-|luminaire-|perimeter-roof|gallery-skylight)/.test(
          object.name,
        )
      )
        meshes.push(object);
    });
    entry = { meshes, cut: false };
    inspectionOverheads.set(group, entry);
  }
  const cut = cameraHeight > 3.8;
  if (entry.cut === cut) return;
  entry.cut = cut;
  entry.meshes.forEach((mesh) => {
    mesh.visible = !cut;
  });
}

/** Original metre-scaled architecture; asset maps remain cached and are never mutated. */
export function createVenue(
  environment: StudioEnvironment,
  sources: SurfaceTextures,
) {
  const group = new Group();
  group.name = `venue-${environment}`;
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshStandardMaterial>();
  const textures = new Set<Texture>();
  const indoors = !["forest", "coast"].includes(environment);
  const night = environment === "night";
  const gallery = environment === "gallery";
  function material(color: string, roughness = 0.7, metalness = 0) {
    const m = new MeshStandardMaterial({ color, roughness, metalness });
    materials.add(m);
    return m;
  }
  function surface(name: SurfaceName, color = "#ffffff", roughness = 1) {
    const maps = sources[name].map((source, i) => {
      const map = source.clone();
      map.wrapS = map.wrapT = RepeatWrapping;
      map.anisotropy = 8;
      map.colorSpace = i === 0 ? SRGBColorSpace : "";
      map.needsUpdate = true;
      textures.add(map);
      return map;
    });
    const m = material(color, roughness);
    [m.map, m.roughnessMap, m.normalMap] = maps;
    m.normalScale = new Vector2(
      name === "asphalt" ? 0.4 : 0.55,
      name === "asphalt" ? 0.4 : 0.55,
    );
    if (name === "floor" || name === "wall") {
      // Preserve photographed variation while removing the warm cast of the scan.
      m.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
float surfaceGrey = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
diffuseColor.rgb = mix(vec3(surfaceGrey), diffuseColor.rgb, 0.12);`,
        );
      };
      m.customProgramCacheKey = () => "neutral-scanned-concrete-v1";
    }
    return m;
  }
  const floor = surface(
    indoors ? "floor" : "asphalt",
    indoors ? (gallery ? "#e7ecf0" : "#b9c5cf") : "#bac1c7",
    indoors ? (gallery ? 0.42 : 0.58) : 0.93,
  );
  const wall = surface("wall", gallery ? "#f4f5f5" : "#d2d8de");
  const concrete = surface("wall", "#c6ccd0");
  const dark = material("#505b63", 0.42, 0.6);
  const aluminum = material("#899293", 0.38, 0.78);
  const shutter = material("#a4adb4", 0.46, 0.42);
  const red = material("#771820", 0.5, 0.2);
  const white = material("#d8d8ce", 0.78);
  const rubber = material("#171a1a", 0.96);
  const yellow = material("#bba965", 0.86);
  const glass = material(night ? "#252e38" : "#8dabb3", 0.2, 0.48);
  const lamp = material("#f4f4eb", 0.2);
  lamp.emissive = new Color("#fcf5e4");
  lamp.emissiveIntensity = night ? 3.5 : 1.4;

  function metricUV(geometry: BufferGeometry, metres = 2) {
    const p = geometry.getAttribute("position"),
      n = geometry.getAttribute("normal");
    const uv = [];
    for (let i = 0; i < p.count; i++) {
      const x = Math.abs(n.getX(i)),
        y = Math.abs(n.getY(i)),
        z = Math.abs(n.getZ(i));
      uv.push(
        (x > y && x > z ? p.getZ(i) : p.getX(i)) / metres,
        (y > x && y > z ? p.getZ(i) : p.getY(i)) / metres,
      );
    }
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    return geometry;
  }
  function mesh(
    geometry: BufferGeometry,
    mat: MeshStandardMaterial,
    position: Point,
    name = "",
  ) {
    geometries.add(geometry);
    const object = new Mesh(geometry, mat);
    object.position.set(...position);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    group.add(object);
    return object;
  }
  function box(size: Point, position: Point, mat = dark, name = "") {
    const geometry =
      Math.min(...size) > 0.075
        ? new RoundedBoxGeometry(
            ...size,
            1,
            Math.min(0.028, Math.min(...size) * 0.18),
          )
        : new BoxGeometry(...size);
    return mesh(
      metricUV(geometry, mat === wall || mat === concrete ? 2.71 : 2),
      mat,
      position,
      name,
    );
  }
  const markingMaterials = new Map<
    MeshStandardMaterial,
    MeshStandardMaterial
  >();
  const coastBend = (z: number) =>
    Math.sign(z) *
    Math.min(80, Math.pow(Math.max(0, Math.abs(z) - 12), 2) * 0.003);
  function ground(
    width: number,
    depth: number,
    y: number,
    mat: MeshStandardMaterial,
    name = "",
    x = 0,
    z = 0,
    tile = 1.88644,
  ) {
    const geometry = new PlaneGeometry(
      width,
      depth,
      1,
      name === "driving-surface" && environment === "coast" ? 240 : 1,
    );
    if (name === "driving-surface" && environment === "coast") {
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++)
        p.setX(i, p.getX(i) + coastBend(-p.getY(i)));
    }
    const g = metricUV(geometry, tile);
    let renderedMaterial = mat;
    if (
      [
        "floor-expansion-joint",
        "bay-line",
        "paddock-lane",
        "parking-bay",
        "road-edge",
        "road-centre",
      ].includes(name)
    ) {
      if (!markingMaterials.has(mat)) {
        const mark = mat.clone();
        mark.polygonOffset = true;
        mark.polygonOffsetFactor = -1;
        mark.polygonOffsetUnits = -2;
        materials.add(mark);
        markingMaterials.set(mat, mark);
      }
      renderedMaterial = markingMaterials.get(mat)!;
    }
    const object = mesh(g, renderedMaterial, [x, y, z], name);
    object.rotation.x = -Math.PI / 2;
    object.castShadow = false;
    return object;
  }
  function pole(x: number, z: number, height = 7) {
    mesh(new CylinderGeometry(0.07, 0.12, height, 10), aluminum, [
      x,
      height / 2,
      z,
    ]);
    box([1.1, 0.07, 0.34], [x + 0.4, height, z], dark);
    box([0.8, 0.015, 0.28], [x + 0.45, height - 0.04, z], lamp);
  }
  function joint(x: number, z: number, width: number, depth: number) {
    ground(width, depth, -0.0017, rubber, "floor-expansion-joint", x, z);
  }
  function cabinet(x: number, z: number, rotation = 0) {
    const start = group.children.length;
    box([2.1, 0.95, 0.65], [x, 0.56, z], red, "tool-cabinet");
    box([2.18, 0.065, 0.72], [x, 1.065, z], aluminum);
    for (let row = 0; row < 5; row++) {
      box([2, 0.018, 0.018], [x, 0.3 + row * 0.15, z + 0.337], rubber);
      box([1.65, 0.025, 0.035], [x, 0.37 + row * 0.15, z + 0.35], aluminum);
    }
    for (const dx of [-0.83, 0.83])
      box([0.12, 0.14, 0.38], [x + dx, 0.11, z], rubber);
    if (rotation)
      for (const object of group.children.slice(start)) {
        const px = object.position.x - x,
          pz = object.position.z - z;
        object.position.x =
          x + px * Math.cos(rotation) + pz * Math.sin(rotation);
        object.position.z =
          z + pz * Math.cos(rotation) - px * Math.sin(rotation);
        object.rotation.y = rotation;
      }
  }
  function building(
    x: number,
    z: number,
    width: number,
    depth: number,
    bays: number,
  ) {
    box([width, 5.6, depth], [x, 2.8, z], wall, "pit-building");
    box([width + 0.4, 0.2, depth + 0.5], [x, 5.65, z], dark);
    box([width + 0.5, 0.1, 1.9], [x, 4.5, z + depth / 2 + 0.7], dark);
    for (let i = 0; i < bays; i++) {
      const bx = x + (i - (bays - 1) / 2) * 5.5;
      for (const dx of [-2.25, 2.25])
        box(
          [0.22, 3.95, 0.3],
          [bx + dx, 1.975, z + depth / 2 + 0.16],
          aluminum,
          "door-jamb",
        );
      box(
        [4.7, 0.25, 0.32],
        [bx, 3.98, z + depth / 2 + 0.16],
        aluminum,
        "door-jamb",
      );
      box(
        [4.28, 0.065, 0.5],
        [bx, 0.03, z + depth / 2 + 0.18],
        dark,
        "door-threshold",
      );
      box(
        [4.3, 3.6, 0.08],
        [bx, 1.85, z + depth / 2 + 0.025],
        shutter,
        "pit-door",
      );
      for (let n = 0; n < 15; n++)
        box(
          [4.25, 0.022, 0.045],
          [bx, 0.22 + n * 0.24, z + depth / 2 + 0.065],
          dark,
        );
      box(
        [1.35, 0.17, 0.28],
        [bx, 4.3, z + depth / 2 + 0.19],
        dark,
        "luminaire-housing",
      );
      box(
        [1.17, 0.035, 0.21],
        [bx, 4.205, z + depth / 2 + 0.19],
        lamp,
        "luminaire-diffuser",
      );
      box([0.16, 4.5, 0.24], [bx + 2.6, 2.25, z + depth / 2 + 0.09], dark);
    }
  }

  if (indoors) {
    ground(32, 34, -0.002, floor, "driving-surface");
    for (let i = -4; i <= 4; i++) {
      joint(i * 4, 0, 0.006, 34);
      joint(0, i * 4, 32, 0.006);
    }
    if (gallery) {
      const plaster = material("#dce1e2", 0.83);
      plaster.side = DoubleSide;
      mesh(
        new CylinderGeometry(
          13.4,
          13.4,
          5.6,
          96,
          1,
          true,
          Math.PI / 2,
          Math.PI,
        ),
        plaster,
        [0, 2.8, 0],
        "gallery-curved-wall",
      );
      const ring = mesh(
        new RingGeometry(7.8, 14.2, 96),
        white,
        [0, 5.65, 0],
        "gallery-skylight-surround",
      );
      ring.rotation.x = Math.PI / 2;
      for (const x of [-11.8, 11.8])
        for (const z of [-4, 5, 10]) {
          mesh(
            new CylinderGeometry(0.16, 0.16, 5.6, 24),
            white,
            [x, 2.8, z],
            "gallery-column",
          );
          mesh(new CylinderGeometry(0.25, 0.25, 0.075, 24), aluminum, [
            x,
            0.04,
            z,
          ]);
        }
      for (let x = -12; x <= 12; x += 3) {
        box([0.07, 5.4, 0.12], [x, 2.7, 12.8], aluminum, "gallery-mullion");
        box(
          [2.88, 5.2, 0.045],
          [x + 1.5, 2.7, 12.84],
          glass,
          "gallery-glazing",
        );
      }
      box([26, 0.12, 0.18], [0, 5.4, 12.8], aluminum);
      box([5, 0.16, 0.8], [0, 0.48, -11.5], dark, "gallery-bench");
      for (const x of [-2, 2])
        box([0.16, 0.42, 0.55], [x, 0.21, -11.5], aluminum);
      for (const x of [-5, 5]) {
        box([0.3, 0.13, 5.4], [x, 5, 0], white, "luminaire-housing");
        box([0.24, 0.025, 5.2], [x, 4.92, 0], lamp, "luminaire-diffuser");
      }
      for (let i = 0; i < 12; i++) {
        const angle = Math.PI / 2 + (i * Math.PI) / 11;
        box(
          [0.015, 5.45, 0.04],
          [Math.sin(angle) * 13.3, 2.75, Math.cos(angle) * 13.3],
          aluminum,
          "gallery-panel-joint",
        ).rotation.y = angle;
      }
    } else {
      // Vehicle development workshops inform the scale, framing and suspended services.
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const sector = new Group();
        const first = group.children.length;
        box([27, 6, 0.26], [0, 3, -13.4], wall, "architectural-wall");
        box([27, 0.16, 2.8], [0, 6.1, -12.2], dark, "perimeter-roof");
        box([27, 0.24, 0.12], [0, 0.15, -13.21], aluminum, "wall-plinth");
        for (let x = -12; x <= 12; x += 4) {
          // I-section columns, base plates and the small connection plates cast real relief shadows.
          box([0.095, 6, 0.34], [x, 3, -13.03], dark, "steel-column");
          for (const dz of [-0.2, 0.2])
            box([0.32, 6, 0.055], [x, 3, -13.03 + dz], dark, "column-flange");
          box(
            [0.55, 0.08, 0.64],
            [x, 0.04, -13.02],
            aluminum,
            "column-base-plate",
          );
          box(
            [0.45, 0.46, 0.04],
            [x, 5.45, -12.77],
            aluminum,
            "column-connection",
          );
          if (x < 12) {
            box(
              [3.65, 1.2, 0.07],
              [x + 2, 4.6, -13.2],
              glass,
              "clerestory-window",
            );
            box(
              [3.8, 0.065, 0.16],
              [x + 2, 3.98, -13.13],
              aluminum,
              "window-sill",
            );
            box(
              [0.02, 3.9, 0.018],
              [x + 2, 1.95, -13.255],
              dark,
              "wall-panel-joint",
            );
          }
        }
        for (const object of group.children.slice(first)) {
          group.remove(object);
          sector.add(object);
        }
        sector.rotation.y = angle;
        group.add(sector);
      }
      building(0, -13.4, 25, 0.35, 4);
      for (const x of [-12, 12]) {
        cabinet(x, -5, x < 0 ? Math.PI / 2 : -Math.PI / 2);
        cabinet(x, 4, x < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
      for (const z of [-5, 5]) {
        box([25, 0.25, 0.18], [0, 5.85, z], dark, "overhead-cross-member");
        for (const x of [-4.5, 4.5]) {
          box(
            [0.025, 0.7, 0.025],
            [x, 5.45, z],
            aluminum,
            "luminaire-suspension",
          );
        }
      }
      for (const x of [-4.5, 4.5]) {
        box([0.42, 0.16, 10.4], [x, 5.02, 0], dark, "luminaire-housing");
        box([0.3, 0.03, 10.1], [x, 4.92, 0], lamp, "luminaire-diffuser");
        for (const z of [-3.7, 0, 3.7])
          box([0.43, 0.18, 0.06], [x, 5.02, z], aluminum, "luminaire-end-cap");
      }
      for (const x of [-3.6, 3.6])
        ground(0.035, 8, -0.0015, white, "bay-line", x, 0);
      for (const z of [-4, 4])
        ground(7.25, 0.035, -0.0015, white, "bay-line", 0, z);
    }
  } else {
    ground(
      environment === "coast" ? 28 : 80,
      1200,
      -0.002,
      floor,
      "driving-surface",
      0,
      0,
      2,
    );
    if (environment === "forest") {
      building(0, -19, 30, 7, 5);
      building(-29, 13, 18, 10, 3);
      for (const x of [-10, 10])
        ground(0.12, 130, -0.0015, white, "paddock-lane", x, 20);
      for (let z = -22; z < 65; z += 9) {
        ground(7, 0.1, -0.0015, white, "parking-bay", -14, z);
        ground(7, 0.1, -0.0015, white, "parking-bay", 14, z);
      }
      for (const x of [-16, 18]) for (const z of [-10, 18, 44]) pole(x, z, 8);
      for (let x = -28; x <= 28; x += 4) {
        box([0.07, 2.2, 0.07], [x, 1.1, 40], aluminum, "fence-post");
        for (const y of [0.4, 1.4, 2.15])
          box([4, 0.035, 0.035], [x + 2, y, 40], aluminum);
      }
      for (let x = -23; x <= 23; x += 4.2)
        box([3.9, 0.7, 0.55], [x, 0.35, -12.6], concrete, "pit-wall");
    } else {
      // A coastal lay-by and engineered shoulder, informed by Japanese coastal-road references.
      for (let z = -100; z <= 100; z += 2) {
        const bend = coastBend(z);
        const yaw = Math.atan((coastBend(z + 0.2) - coastBend(z - 0.2)) / 0.4);
        for (const x of [-4.2, 4.2])
          ground(
            0.12,
            2.04,
            -0.0015,
            white,
            "road-edge",
            x + bend,
            z,
          ).rotation.z = yaw;
        if (Math.abs(z) % 8 < 3 && Math.abs(z) > 4)
          ground(0.1, 2.01, -0.0015, white, "road-centre", bend, z).rotation.z =
            yaw;
        ground(
          1.4,
          2.04,
          -0.0018,
          concrete,
          "coastal-shoulder",
          -10.8 + bend,
          z,
          2.71,
        ).rotation.z = yaw;
      }
      for (let z = -100; z <= 100; z += 2.5) {
        const bend = coastBend(z),
          yaw = Math.atan((coastBend(z + 0.2) - coastBend(z - 0.2)) / 0.4);
        box(
          [0.4, 0.16, 2.48],
          [-11.8 + bend, 0.08, z],
          concrete,
          "coast-curb",
        ).rotation.y = yaw;
        box(
          [0.35, 2.5, 2.5],
          [-12.8 + bend, -0.93, z],
          concrete,
          "retaining-sea-wall",
        ).rotation.y = yaw;
        box(
          [0.11, 0.48, 2.51],
          [-12.63 + bend, 0.67, z],
          aluminum,
          "sea-wall",
        ).rotation.y = yaw;
        box(
          [0.12, 1.03, 0.12],
          [-12.63 + bend, 0.52, z],
          aluminum,
          "guardrail-support",
        ).rotation.y = yaw;
      }
      for (const z of [-48, 24, 64]) pole(13 + coastBend(z), z, 6);
      const sea = material("#377a92", 0.24, 0.32);
      const waveData = new Uint8Array(64 * 64 * 4);
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++) {
          const u = (x / 64) * Math.PI * 2,
            v = (y / 64) * Math.PI * 2;
          const i = (y * 64 + x) * 4;
          waveData[i] =
            128 + Math.round(18 * Math.cos(u * 3 + v) + 6 * Math.sin(v * 7));
          waveData[i + 1] =
            128 + Math.round(13 * Math.sin(v * 4 - u) + 5 * Math.cos(u * 8));
          waveData[i + 2] = 251;
          waveData[i + 3] = 255;
        }
      const waves = new DataTexture(
        waveData,
        64,
        64,
        RGBAFormat,
        UnsignedByteType,
      );
      waves.wrapS = waves.wrapT = RepeatWrapping;
      waves.magFilter = LinearFilter;
      waves.minFilter = LinearMipmapLinearFilter;
      waves.generateMipmaps = true;
      waves.repeat.set(8, 8);
      waves.needsUpdate = true;
      textures.add(waves);
      sea.normalMap = waves;
      sea.normalScale.set(0.55, 0.55);
      ground(2000, 1400, -1.8, sea, "ocean", -650, 0, 40);
    }
    // Fully modelled landscape mesh: no photographed road, verge, rocks or trees on a shell.
    const rock = surface(
      "rock",
      environment === "forest" ? "#69715b" : "#a5a394",
    );
    function hills(side: number) {
      const geometry = new PlaneGeometry(180, 1200, 72, 160);
      geometry.rotateX(-Math.PI / 2);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getZ(i);
        const edge = Math.max(0, (x + 90) / 180);
        const height =
          2 +
          edge * edge * 6 +
          Math.sin(z * 0.018 + side) * 2.5 * edge +
          Math.sin(x * 0.06 + z * 0.015) * 1.6 * edge +
          Math.sin(z * 0.13) * Math.cos(x * 0.08) * 1.1 * edge;
        p.setY(i, height);
        if (environment === "coast") p.setX(i, x + coastBend(z - 10));
      }
      geometry.computeVertexNormals();
      metricUV(geometry, 50);
      const hill = mesh(
        geometry,
        rock,
        [side * (environment === "coast" ? 104 : 126), -2, -10],
        "landscape-terrain",
      );
      if (side < 0) hill.rotation.y = Math.PI;
    }
    if (environment === "forest") {
      hills(-1);
      hills(1);
    } else hills(1);
  }
  group.updateMatrixWorld(true);
  return {
    group,
    dispose() {
      // React StrictMode can dispose, render/upload again, then unmount.
      // Three disposal is repeatable; never suppress the final release.
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
