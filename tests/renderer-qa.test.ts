import { afterEach, describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Box3 } from "three";
import { createFixtureGlb, QA_MATERIAL_ROLES } from "../qa/renderer/fixture";
import {
  copyRendererQaSurfaces,
  rendererQaConfig,
} from "../vite.renderer-qa.config";
import surfaceManifest from "../public/environments/surfaces.json";
import {
  prepareVehicle,
  vehicleCapabilities,
} from "../src/components/three/materialAdapter";

describe("isolated renderer QA build", () => {
  it("refuses the default and production modes", () => {
    expect(() => rendererQaConfig("development")).toThrow(/renderer-qa/);
    expect(() => rendererQaConfig("production")).toThrow(/renderer-qa/);
    const config = rendererQaConfig("renderer-qa");
    expect(config.root).toMatch(/qa\/renderer$/);
    expect(config.publicDir).toBe(false);
    expect(config.build?.outDir).toMatch(/qa-dist$/);
    expect(config.server?.host).toBe("127.0.0.1");
  });
  it("creates a valid test-only GLB with paint and emitter roles", async () => {
    const bytes = createFixtureGlb();
    const gltf = await new GLTFLoader().parseAsync(bytes, "");
    expect(gltf.scene.name).toBe("QA_ONLY_NOT_A_VEHICLE");
    const prepared = prepareVehicle(gltf.scene, QA_MATERIAL_ROLES);
    expect(vehicleCapabilities(prepared.bindings)).toEqual({
      paint: true,
      lights: true,
    });
    const size = new Box3()
      .setFromObject(prepared.scene)
      .getSize(new (await import("three")).Vector3());
    expect(Math.max(size.x, size.z) * prepared.scale).toBeCloseTo(4.7);
    prepared.dispose();
  });
});

const surfaceNames = [
  ...[
    "garage_floor",
    "concrete_wall_008",
    "asphalt_pit_lane",
    "aerial_rocks_02",
  ].flatMap((id) =>
    ["diff", "rough", "nor_gl"].map((map) => `${id}_${map}_1k.jpg`),
  ),
  "aerial_rocks_02_disp_1k.jpg",
];
const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function surfaceFixture() {
  const root = await mkdtemp(join(tmpdir(), "renderer-qa-surfaces-"));
  temporaryDirectories.push(root);
  const source = join(root, "public/environments");
  const destination = join(root, "qa-dist/environments");
  await mkdir(source, { recursive: true });
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0xff, 0xd9]);
  const manifest = surfaceManifest.map((entry) => ({
    ...entry,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  for (const name of surfaceNames) await writeFile(join(source, name), bytes);
  await writeFile(join(source, "surfaces.json"), JSON.stringify(manifest));
  return { source, destination, manifest };
}

describe("isolated renderer surface assets", () => {
  it("requires the terrain displacement map in the exact QA allowlist", async () => {
    const { source, destination, manifest } = await surfaceFixture();
    await writeFile(
      join(source, "surfaces.json"),
      JSON.stringify(manifest.filter(({ map }) => map !== "disp")),
    );
    await expect(copyRendererQaSurfaces(source, destination)).rejects.toThrow(
      /13 venue JPG maps/,
    );
    await expect(readdir(destination)).rejects.toThrow(/ENOENT/);
  });
  it("copies only hash-verified surface JPGs, leaving HDR and catalog assets unavailable", async () => {
    const { source, destination } = await surfaceFixture();
    await writeFile(
      join(source, "kloofendal_48d_partly_cloudy_puresky_2k.hdr"),
      "must not be copied",
    );
    await writeFile(join(source, "vehicle.glb"), "must not be copied");
    await writeFile(join(source, "extra.jpg"), "must not be copied");
    await copyRendererQaSurfaces(source, destination);
    expect((await readdir(destination)).sort()).toEqual(
      [...surfaceNames].sort(),
    );
    for (const name of surfaceNames)
      expect(await readFile(join(destination, name))).toEqual(
        await readFile(join(source, name)),
      );
  });
  it("rejects a changed surface before publishing any files", async () => {
    const { source, destination } = await surfaceFixture();
    await writeFile(join(source, surfaceNames.at(-1)!), "corrupt texture");
    await expect(copyRendererQaSurfaces(source, destination)).rejects.toThrow(
      /mismatch/i,
    );
    await expect(readdir(destination)).rejects.toThrow(/ENOENT/);
  });
  it("rejects a same-size texture with a changed SHA-256", async () => {
    const { source, destination } = await surfaceFixture();
    await writeFile(
      join(source, surfaceNames[0]),
      Buffer.from([0xff, 0xd8, 0xff, 0x02, 0xff, 0xd9]),
    );
    await expect(copyRendererQaSurfaces(source, destination)).rejects.toThrow(
      /SHA-256 mismatch/,
    );
    await expect(readdir(destination)).rejects.toThrow(/ENOENT/);
  });
  it("rejects assets outside the exact venue surface allowlist", async () => {
    const { source, destination, manifest } = await surfaceFixture();
    manifest[0].path = "/environments/../vehicle.glb";
    await writeFile(join(source, "surfaces.json"), JSON.stringify(manifest));
    await expect(copyRendererQaSurfaces(source, destination)).rejects.toThrow(
      /surface manifest/i,
    );
  });
  it("wires the verified copy into the isolated build", () => {
    const config = rendererQaConfig("renderer-qa");
    expect(
      config.plugins
        ?.flat()
        .some(
          (plugin) =>
            plugin &&
            "name" in plugin &&
            plugin.name === "renderer-qa-surface-assets",
        ),
    ).toBe(true);
    expect(config.publicDir).toBe(false);
  });
});
