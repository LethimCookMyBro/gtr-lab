import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
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
import type { StudioEnvironment } from "./types";

type SurfaceName = "floor" | "wall" | "asphalt" | "rock";
export type SurfaceTextures = Record<SurfaceName, [Texture, Texture, Texture]>;
type Point = [number, number, number];

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
    return m;
  }
  const floor = surface(
    indoors ? "floor" : "asphalt",
    indoors ? (gallery ? "#d8d7d3" : "#b5b8b9") : "#929594",
    indoors ? 0.72 : 1,
  );
  const wall = surface("wall", gallery ? "#e2dfd7" : "#b7b7b3");
  const concrete = surface("wall", "#b4b4ae");
  const dark = material("#303739", 0.58, 0.65);
  const aluminum = material("#899293", 0.38, 0.78);
  const shutter = material("#707879", 0.54, 0.45);
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
    return mesh(metricUV(new BoxGeometry(...size)), mat, position, name);
  }
  const markingMaterials = new Map<
    MeshStandardMaterial,
    MeshStandardMaterial
  >();
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
    const g = metricUV(new PlaneGeometry(width, depth), tile);
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
      box(
        [4.3, 3.6, 0.035],
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
      box([0.8, 0.22, 0.04], [bx, 4.13, z + depth / 2 + 0.03], white);
      box([0.16, 4.5, 0.24], [bx + 2.6, 2.25, z + depth / 2 + 0.09], dark);
    }
  }

  if (indoors) {
    ground(84, 84, -0.002, floor, "driving-surface");
    for (let i = -7; i <= 7; i++) {
      joint(i * 4, 0, 0.012, 84);
      joint(0, i * 4, 84, 0.012);
    }
    // A clear 40m-wide central workshop/atrium keeps every allowed camera inside the venue.
    // Perimeter roof canopies leave the central daylight well and top inspection view open.
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const sector = new Group();
      const first = group.children.length;
      box([42, 7.2, 0.35], [0, 3.6, -21], wall, "architectural-wall");
      box([42, 0.2, 4], [0, 7.3, -19.5], dark, "perimeter-roof");
      box([42, 0.45, 0.13], [0, 0.35, -20.76], dark);
      box([42, 0.06, 0.09], [0, 1.55, -20.75], red);
      for (let x = -18; x <= 18; x += 6) {
        box([0.24, 7.1, 0.45], [x, 3.55, -20.65], dark, "steel-column");
        box([0.56, 0.22, 0.7], [x, 0.11, -20.65], aluminum);
        box([4.8, 0.07, 0.27], [x + 3, 6.6, -19.9], lamp, "linear-luminaire");
        box([5.5, 1.7, 0.07], [x + 3, 5.3, -20.73], glass, "clerestory-window");
      }
      for (const obj of group.children.slice(first)) {
        group.remove(obj);
        sector.add(obj);
      }
      sector.rotation.y = angle;
      group.add(sector);
    }
    if (gallery) {
      for (const x of [-20, 20]) {
        box([0.3, 4.2, 8], [x, 2.1, -7], wall, "gallery-partition");
        box([0.32, 0.045, 7], [x, 4.24, -7], lamp);
      }
      for (const z of [-20, 20]) {
        box([8, 0.12, 0.75], [0, 0.46, z], dark, "gallery-bench");
        for (const x of [-3.1, 3.1])
          box([0.12, 0.4, 0.6], [x, 0.2, z], aluminum);
      }
    } else {
      // Track-aligned working bay, walkways and authentic-sized equipment establish scale.
      for (const x of [-3.8, 3.8])
        ground(0.065, 9, -0.0015, yellow, "bay-line", x, 0);
      for (const z of [-4.5, 4.5])
        ground(7.65, 0.065, -0.0015, yellow, "bay-line", 0, z);
      for (const x of [-20, 20]) {
        cabinet(x, -7, x < 0 ? Math.PI / 2 : -Math.PI / 2);
        cabinet(x, 4, x < 0 ? Math.PI / 2 : -Math.PI / 2);
        box([0.22, 5.7, 0.32], [x, 2.85, -3.5], dark, "service-gantry");
        box([0.22, 5.7, 0.32], [x, 2.85, 3.5], dark, "service-gantry");
        box([0.4, 0.18, 7.4], [x, 5.6, 0], aluminum);
        box([0.5, 0.06, 6.4], [x, 5.48, 0], lamp);
      }
      building(0, -21, 28, 0.35, 5);
      for (const side of [-1, 1]) {
        box(
          [7, 2.7, 0.14],
          [side * 23, 1.35, 23],
          glass,
          "workshop-office-glass",
        );
        for (let i = -1; i <= 1; i++)
          box([0.09, 2.75, 0.2], [side * 23 + i * 2.2, 1.375, 23.05], aluminum);
      }
    }
  } else {
    ground(
      environment === "coast" ? 44 : 180,
      environment === "coast" ? 1200 : 500,
      -0.002,
      floor,
      "driving-surface",
      0,
      0,
      2,
    );
    if (environment === "forest") {
      building(0, -31, 55, 9, 9);
      building(-47, 9, 24, 14, 4);
      for (const x of [-10, 10])
        ground(0.12, 130, -0.0015, white, "paddock-lane", x, 20);
      for (let z = -22; z < 65; z += 9) {
        ground(7, 0.1, -0.0015, white, "parking-bay", -14, z);
        ground(7, 0.1, -0.0015, white, "parking-bay", 14, z);
      }
      for (const x of [-24, 24]) for (const z of [-16, 12, 40]) pole(x, z, 8);
      for (let x = -28; x <= 28; x += 4) {
        box([0.07, 2.2, 0.07], [x, 1.1, 54], aluminum, "fence-post");
        for (const y of [0.4, 1.4, 2.15])
          box([4, 0.035, 0.035], [x + 2, y, 54], aluminum);
      }
      for (let x = -23; x <= 23; x += 4.2)
        box([3.9, 0.7, 0.55], [x, 0.35, -19], concrete, "pit-wall");
    } else {
      // A broad coastal pull-off. The actual road, curb and sea wall provide near/mid parallax.
      for (const x of [-7.5, 7.5])
        ground(0.13, 160, -0.0015, white, "road-edge", x, 0);
      for (let z = -76; z <= 76; z += 8)
        ground(0.1, 3, -0.0015, yellow, "road-centre", 0, z);
      for (let z = -78; z <= 78; z += 3.2) {
        box([0.44, 0.2, 3.1], [19.5, 0.1, z], concrete, "coast-curb");
        box([0.22, 0.85, 3.1], [20.5, 0.425, z], concrete, "sea-wall");
        box([0.08, 0.28, 3.16], [20.36, 0.83, z], aluminum, "guardrail");
        if (z % 2 < 1) box([0.12, 0.9, 0.14], [20.3, 0.45, z], dark);
      }
      for (const z of [-48, -16, 16, 48]) pole(-18, z, 7);
      const sea = material("#487d8b", 0.28, 0.22);
      ground(1400, 1400, -1.3, sea, "ocean", 720, 0, 40);
    }
    // Fully modelled landscape mesh: no photographed road, verge, rocks or trees on a shell.
    const rock = surface(
      "rock",
      environment === "forest" ? "#69715b" : "#a5a394",
    );
    function hills(side: number) {
      const geometry = new PlaneGeometry(180, 280, 45, 60);
      geometry.rotateX(-Math.PI / 2);
      const p = geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getZ(i);
        const edge = Math.max(0, (x + 90) / 180);
        const height =
          2 +
          edge * edge * 22 +
          Math.sin(z * 0.047 + side) * 5 * edge +
          Math.sin(x * 0.1 + z * 0.033) * 3 * edge +
          Math.sin(z * 0.13) * Math.cos(x * 0.08) * 1.1 * edge;
        p.setY(i, height);
      }
      geometry.computeVertexNormals();
      metricUV(geometry, 50);
      const hill = mesh(
        geometry,
        rock,
        [side * (environment === "coast" ? 110 : 175), -2, -10],
        "landscape-terrain",
      );
      if (side < 0) hill.rotation.y = Math.PI;
    }
    hills(-1);
    if (environment === "forest") hills(1);
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
