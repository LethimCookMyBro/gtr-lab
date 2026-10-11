import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  Mesh,
  Texture,
  Scene,
  PerspectiveCamera,
  type Material,
  type WebGLRenderer,
} from "three";
import { prepareVehicle } from "../src/components/three/materialAdapter";
import { createCabinPreparationSteps } from "../src/components/three/cabinPreparationSteps";
import { textureAllocation } from "./helpers/cabinTextureAllocation";
afterEach(() => vi.unstubAllGlobals());
const reports: Record<string, unknown>[] = [];
const sources = [
  ["baseline", "qa/cabin-preview/r35-cabin-dashboard.glb.gz", 508950, 10],
  [
    "combined",
    "qa/cabin-preview/r35-cabin-contact-ao-static-faces.glb.gz",
    505664,
    11,
  ],
] as const;
it.each(sources)(
  "accounts exact %s Texture/Source preparation jobs and real Three allocation-cache ownership",
  async (name, path, expectedTriangles, expectedImages) => {
    class Bitmap {
      close = vi.fn();
      constructor(
        readonly width: number,
        readonly height: number,
        readonly sha: string,
      ) {}
    }
    const bitmaps: Bitmap[] = [];
    vi.stubGlobal("self", globalThis);
    vi.stubGlobal("ImageBitmap", Bitmap);
    vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
      const png = Buffer.from(await blob.arrayBuffer());
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      const image = new Bitmap(
        png.readUInt32BE(16),
        png.readUInt32BE(20),
        createHash("sha256").update(png).digest("hex"),
      );
      bitmaps.push(image);
      return image;
    });
    const bytes = gunzipSync(readFileSync(path));
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    const owner = prepareVehicle(
      gltf.scene,
      { paint: [], headlights: [], taillights: [] },
      [],
      true,
    );
    const textures = new Set<Texture>(),
      materials = new Set<Material>(),
      geometries = new Set<Mesh["geometry"]>();
    let triangles = 0,
      aoMeshes = 0;
    owner.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      expect(object.castShadow || object.receiveShadow).toBe(false);
      geometries.add(object.geometry);
      triangles += object.geometry.index!.count / 3;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof Texture) textures.add(value);
        if (material.aoMap) {
          aoMeshes++;
          expect(material.aoMap.channel).toBe(3);
          expect(object.geometry.attributes.uv3.normalized).toBe(true);
        }
      }
    });
    expect(triangles).toBe(expectedTriangles);
    expect(bitmaps).toHaveLength(expectedImages);
    expect(geometries.size).toBe(309);
    expect(materials.size).toBe(46);
    if (name === "combined") {
      expect(textures.size).toBe(62);
      expect(aoMeshes).toBe(105);
    }
    const allocation = textureAllocation();
    const initTexture = vi.fn((texture: Texture) => allocation.upload(texture));
    const renderer = {
      getRenderTarget: () => null,
      initTexture,
    } as unknown as WebGLRenderer;
    const steps = createCabinPreparationSteps(
      renderer,
      new Scene(),
      new PerspectiveCamera(),
      owner,
      { scale: 1, position: [0, 0, 0] },
    );
    const jobs = Object.fromEntries(
      ["compile", "texture", "geometry"].map((kind) => [
        kind,
        steps.filter((step) => step.kind === kind).length,
      ]),
    );
    expect(jobs.compile).toBe(78);
    expect(jobs.geometry).toBe(78);
    expect(jobs.texture).toBe(textures.size);
    for (const step of steps.filter((step) => step.kind === "texture"))
      step.run();
    expect(initTexture).toHaveBeenCalledTimes(textures.size);
    expect(allocation.allocated).toHaveLength(expectedImages);
    expect(allocation.uploads()).toBe(expectedImages);
    expect(new Set([...textures].map((texture) => texture.source)).size).toBe(
      expectedImages,
    );
    const uploads = allocation.uploads();
    for (const texture of textures) allocation.upload(texture);
    expect(allocation.uploads()).toBe(uploads); // Later geometry references already initialized variants.
    const disposals = [...textures, ...materials, ...geometries].map(
      (resource) => vi.spyOn(resource, "dispose"),
    );
    owner.dispose();
    owner.dispose();
    for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
    for (const bitmap of bitmaps) expect(bitmap.close).toHaveBeenCalledTimes(1);
    expect(allocation.deleted).toHaveLength(expectedImages);
    expect(new Set(allocation.deleted).size).toBe(expectedImages);
    expect(allocation.info.memory.textures).toBe(0);
    reports.push({
      name,
      indexedTriangles: triangles,
      textureObjects: textures.size,
      sharedSources: expectedImages,
      jobs,
      nativeBoundaryImageAllocations: allocation.allocated.length,
      nativeBoundaryImageUploads: uploads,
      scope:
        "Actual GLTFLoader, prepare/dispose, job construction and Three cache bookkeeping; native GL and bitmap pixels are test doubles.",
    });
    writeFileSync(
      "../texture-job-accounting.json",
      JSON.stringify(reports, null, 2) + "\n",
    );
  },
);
