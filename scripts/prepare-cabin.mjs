/** Reconstruct the exact full cabin and exterior-only proxy; no network/conversion. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  readFile,
  writeFile,
  rename,
  mkdir,
  rm,
} from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateGlb } from "./prepare-models.mjs";
export const CABIN_SHA256 =
  "5c0a9dcae17b8f2621d82d45d67958b4bd0ae3f7917b76928dac9d4f6fbed326";
/** Separate current appearance increment; the baseline/proxy identity stays closed. */
export const CABIN_CONTACT_AO_ASSET = Object.freeze({
  path: "/models/r35-cabin-contact-ao-static-faces-8645956f.glb",
  bytes: 20195752,
  sha256: "8645956fca144da9e7fffd8269889da4c5acf4270ee04b3d403af395b6d35452",
  gzipBytes: 10194084,
  gzipSha256:
    "efe0ace781740e4b1cec685f02bf6b94eb6654447cccb96cc79769bfd01eee16",
});
export function decodeCabinContactAo(gzip) {
  if (
    gzip.length !== CABIN_CONTACT_AO_ASSET.gzipBytes ||
    digest(gzip) !== CABIN_CONTACT_AO_ASSET.gzipSha256
  )
    throw new Error("Cabin contact AO source checksum mismatch");
  const bytes = gunzipSync(gzip, {
    maxOutputLength: CABIN_CONTACT_AO_ASSET.bytes,
  });
  validateGlb(bytes, CABIN_CONTACT_AO_ASSET);
  return bytes;
}
/** Six red-leather normal-strength scalars only; the original AO source stays pinned. */
export const CABIN_LEATHER_ASSET = Object.freeze({
  path: "/models/r35-cabin-contact-ao-static-faces-leather-da354db8.glb",
  bytes: 20195752,
  sha256: "da354db8b3d40bc569e68262d121cc630f9bdf293c10b40071b6b46b0370b06a",
  gzipBytes: 10194086,
  gzipSha256:
    "9fa0fc0b8eb05287e08e54bef81936954e91665f9e34fe95a7c9002aaf33e817",
});
export function decodeCabinLeather(gzip) {
  if (
    gzip.length !== CABIN_LEATHER_ASSET.gzipBytes ||
    digest(gzip) !== CABIN_LEATHER_ASSET.gzipSha256
  )
    throw new Error("Cabin leather source checksum mismatch");
  const bytes = gunzipSync(gzip, {
    maxOutputLength: CABIN_LEATHER_ASSET.bytes,
  });
  validateGlb(bytes, CABIN_LEATHER_ASSET);
  return bytes;
}
export const CABIN_PROXY_ASSET = Object.freeze({
  path: "/models/r35-exterior-cabin-proxy-49d7c2ab.glb",
  bytes: 956368,
  sha256: "49d7c2ab44461e33ce6621287089eb4a9d54c50ebc339a2932f587ce3d355347",
  gzipBytes: 616928,
  gzipSha256:
    "bd14ba078e08d762158fb3fcc225acae6d2369b7d2c1f2ad1a128f404147733e",
});
const proxyBounds = [
  [-0.8105434775352478, 0.1911861002445221, -1.687026858329773],
  [0.8103712201118469, 1.3625085353851318, 1.0580068826675415],
];
const fullUsedVertexBounds = [
  [-0.810429036617279, 0.19130000472068787, -1.687000036239624],
  [0.810429036617279, 1.363020896911621, 1.0580003261566162],
];
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const gzipSha =
  "70036f4c17601909d4c382a0530501618dace139debb55cd966698e89b8b75f5";
export function decodeCabin(gzip) {
  if (
    gzip.length !== 9798606 ||
    createHash("sha256").update(gzip).digest("hex") !== gzipSha
  )
    throw new Error("Cabin source checksum mismatch");
  const bytes = gunzipSync(gzip, { maxOutputLength: 19170816 });
  validateGlb(bytes, {
    bytes: 19170816,
    sha256: CABIN_SHA256,
    path: "/models/r35-cabin-dashboard-5c0a9dca.glb",
  });
  return bytes;
}

/** Geometry inspection is separate from identity; decodeCabinProxy enforces both. */
export function inspectCabinProxy(bytes) {
  assert(bytes.length <= 2 * 1024 * 1024, "Proxy inspection byte limit");
  validateGlb(bytes, {
    bytes: bytes.length,
    sha256: digest(bytes),
    path: CABIN_PROXY_ASSET.path,
  });
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength));
  assert.equal(
    bytes.readUInt32LE(24 + jsonLength),
    0x004e4942,
    "Proxy binary chunk",
  );
  const binary = bytes.subarray(28 + jsonLength);
  assert.equal(
    bytes.readUInt32LE(20 + jsonLength),
    binary.length,
    "Proxy binary chunk bounds",
  );
  assert.equal(
    json.asset?.extras?.sourceSHA256,
    CABIN_SHA256,
    "Proxy source identity",
  );
  for (const key of [
    "images",
    "textures",
    "animations",
    "skins",
    "cameras",
    "extensions",
    "extensionsRequired",
    "extensionsUsed",
  ])
    assert(
      !json[key] || Object.keys(json[key]).length === 0,
      `Proxy must have no ${key}`,
    );
  assert.deepEqual(
    json.buffers,
    [{ byteLength: 921704 }],
    "Proxy uses only its exact embedded buffer",
  );
  assert.equal(binary.length, 921704, "Proxy embedded buffer bounds");
  assert.equal(json.scene, 0, "Proxy scene identity");
  assert.deepEqual(
    json.scenes,
    [{ nodes: [0, 1, 2, 3, 4, 5, 6, 7] }],
    "Proxy static scene nodes",
  );
  assert.equal(json.nodes.length, 8, "Proxy mesh-node budget");
  assert.equal(json.meshes.length, 8, "Proxy mesh budget");
  assert.equal(json.materials.length, 8, "Proxy material budget");
  assert.equal(json.accessors.length, 24, "Proxy accessor budget");
  assert.equal(json.bufferViews.length, 24, "Proxy buffer-view budget");
  for (const [index, node] of json.nodes.entries()) {
    assert.equal(node.mesh, index, "Proxy static mesh identity");
    assert.equal(node.extras?.staticOnly, true, "Proxy static-only identity");
    assert.equal(node.extras?.castShadow, false, "Proxy must not cast shadows");
    assert.equal(
      node.extras?.receiveShadow,
      false,
      "Proxy must not receive shadows",
    );
    for (const key of [
      "matrix",
      "translation",
      "rotation",
      "scale",
      "children",
      "camera",
      "skin",
      "extensions",
    ])
      assert.equal(
        node[key],
        undefined,
        `Proxy native frame must have no ${key} transform/hierarchy`,
      );
  }
  for (const material of json.materials) {
    assert.equal(
      material.alphaMode ?? "OPAQUE",
      "OPAQUE",
      "Proxy materials must stay opaque",
    );
    assert.equal(
      material.pbrMetallicRoughness?.baseColorFactor?.[3],
      1,
      "Proxy opaque material alpha",
    );
    assert.equal(
      material.extensions,
      undefined,
      "Proxy material has no extensions",
    );
    assert(
      !JSON.stringify(material).includes("Texture"),
      "Proxy material has no texture slots",
    );
  }
  function accessor(index, type, componentType) {
    const a = json.accessors[index];
    assert(
      a &&
        a.type === type &&
        a.componentType === componentType &&
        !a.sparse &&
        !a.normalized,
      "Proxy accessor format",
    );
    assert(
      Number.isSafeInteger(a.count) && a.count > 0 && a.count <= 120000,
      "Proxy accessor count",
    );
    const view = json.bufferViews[a.bufferView];
    const width = type === "VEC3" ? 12 : 2;
    assert(
      view && view.buffer === 0 && view.byteStride === undefined,
      "Proxy packed buffer view",
    );
    const offset = a.byteOffset ?? 0;
    const start = (view.byteOffset ?? 0) + offset;
    assert(
      [offset, start, view.byteLength].every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      ),
      "Proxy accessor byte bounds",
    );
    assert(
      offset + a.count * width <= view.byteLength &&
        start + a.count * width <= binary.length,
      "Proxy accessor byte bounds",
    );
    return { count: a.count, start, width };
  }
  let triangles = 0;
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const [meshIndex, mesh] of json.meshes.entries()) {
    assert.equal(mesh.primitives.length, 1, "Proxy primitive budget");
    const p = mesh.primitives[0];
    assert.equal(p.mode ?? 4, 4, "Proxy triangle primitive");
    assert.deepEqual(
      Object.keys(p.attributes).sort(),
      ["NORMAL", "POSITION"],
      "Proxy attributes must be texture-free",
    );
    assert.equal(p.material, meshIndex, "Proxy batch material identity");
    assert.equal(p.targets, undefined, "Proxy has no morph targets");
    const positions = accessor(p.attributes.POSITION, "VEC3", 5126);
    const normals = accessor(p.attributes.NORMAL, "VEC3", 5126);
    const indices = accessor(p.indices, "SCALAR", 5123);
    assert.equal(positions.count, normals.count, "Proxy normal count");
    assert.equal(indices.count % 3, 0, "Proxy triangle index count");
    triangles += indices.count / 3;
    for (let i = 0; i < positions.count; i++) {
      let lengthSquared = 0;
      for (let axis = 0; axis < 3; axis++) {
        const position = binary.readFloatLE(
          positions.start + i * 12 + axis * 4,
        );
        const normal = binary.readFloatLE(normals.start + i * 12 + axis * 4);
        assert(
          Number.isFinite(position) && Number.isFinite(normal),
          "Proxy vertex/normal must be finite",
        );
        lengthSquared += normal * normal;
      }
      assert(
        Math.abs(lengthSquared - 1) < 0.01,
        "Proxy normals must be unit length",
      );
    }
    for (let i = 0; i < indices.count; i++) {
      const vertex = binary.readUInt16LE(indices.start + i * 2);
      assert(vertex < positions.count, "Proxy vertex index bounds");
      for (let axis = 0; axis < 3; axis++) {
        const value = binary.readFloatLE(
          positions.start + vertex * 12 + axis * 4,
        );
        bounds[0][axis] = Math.min(bounds[0][axis], value);
        bounds[1][axis] = Math.max(bounds[1][axis], value);
      }
    }
  }
  assert.equal(triangles, 37749, "Proxy triangle budget");
  for (let side = 0; side < 2; side++)
    for (let axis = 0; axis < 3; axis++) {
      assert(
        Math.abs(bounds[side][axis] - proxyBounds[side][axis]) < 1e-7,
        "Proxy actual native bounds changed",
      );
      assert(
        Math.abs(bounds[side][axis] - fullUsedVertexBounds[side][axis]) <
          0.000513,
        "Proxy bounds differ from full native frame",
      );
    }
  return { meshNodes: 8, primitives: 8, materials: 8, triangles, bounds };
}

export function decodeCabinProxy(gzip) {
  if (
    gzip.length !== CABIN_PROXY_ASSET.gzipBytes ||
    digest(gzip) !== CABIN_PROXY_ASSET.gzipSha256
  )
    throw new Error("Cabin proxy source checksum mismatch");
  const bytes = gunzipSync(gzip, { maxOutputLength: CABIN_PROXY_ASSET.bytes });
  validateGlb(bytes, CABIN_PROXY_ASSET);
  inspectCabinProxy(bytes);
  return bytes;
}

export async function prepareCabin({
  root = fileURLToPath(new URL("../", import.meta.url)),
  log = console.log,
} = {}) {
  // Verify all inputs before writing. Baseline and proxy remain recoverable.
  const assets = [
    {
      source: "r35-cabin-contact-ao-static-faces-leather.glb.gz",
      gzipBytes: CABIN_LEATHER_ASSET.gzipBytes,
      filename: CABIN_LEATHER_ASSET.path.slice("/models/".length),
      decode: decodeCabinLeather,
      sha256: CABIN_LEATHER_ASSET.sha256,
    },
    {
      source: "r35-cabin-contact-ao-static-faces.glb.gz",
      gzipBytes: CABIN_CONTACT_AO_ASSET.gzipBytes,
      filename: CABIN_CONTACT_AO_ASSET.path.slice("/models/".length),
      decode: decodeCabinContactAo,
      sha256: CABIN_CONTACT_AO_ASSET.sha256,
    },
    {
      source: "r35-cabin-dashboard.glb.gz",
      gzipBytes: 9798606,
      filename: "r35-cabin-dashboard-5c0a9dca.glb",
      decode: decodeCabin,
      sha256: CABIN_SHA256,
    },
    {
      source: "r35-exterior-cabin-proxy.glb.gz",
      gzipBytes: CABIN_PROXY_ASSET.gzipBytes,
      filename: CABIN_PROXY_ASSET.path.slice("/models/".length),
      decode: decodeCabinProxy,
      sha256: CABIN_PROXY_ASSET.sha256,
    },
  ];
  for (const asset of assets) {
    const source = resolve(root, "qa/cabin-preview", asset.source);
    const info = await lstat(source);
    if (!info.isFile()) throw new Error("Cabin source must be a regular file");
    if (info.size !== asset.gzipBytes)
      throw new Error("Cabin source byte count mismatch");
    asset.gzip = await readFile(source);
    asset.bytes = asset.decode(asset.gzip);
  }
  const directory = resolve(root, "public/models");
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory())
    throw new Error("Cabin output must be a regular directory");
  for (const asset of assets) {
    // Retain the already verified encoding rather than spending CPU to
    // recompress each request. Both representations decode to the same model.
    for (const [filename, bytes] of [
      [asset.filename, asset.bytes],
      [asset.filename + ".gz", asset.gzip],
    ]) {
      const output = resolve(directory, filename);
      const temporary = output + "." + randomUUID() + ".prepared";
      try {
        await writeFile(temporary, bytes, { flag: "wx" });
        await rename(temporary, output);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    log(
      `[cabin] verified ${asset.filename}: ${asset.bytes.length} bytes, ${asset.sha256}`,
    );
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  prepareCabin().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
