#!/usr/bin/env node
/** Build-time, hash-pinned CC0 scan and PBR dependencies. Runtime stays on this site's origin. */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(
  new URL("../public/environments/roadside.json", import.meta.url),
);
const defaultDirectory = join(dirname(manifestPath), "roadside");
const maxAssetBytes = 16 * 1024 * 1024;
const defaultTimeoutMs = 120_000;
const maxTimeoutMs = 300_000;

const assetId = "rock_moss_set_01";
const expectedFiles = [
  `${assetId}_1k.gltf`,
  `${assetId}.bin`,
  ...["diff", "rough", "nor_gl"].map(
    (map) => `textures/${assetId}_${map}_1k.jpg`,
  ),
];

/** Only this five-file CC0 scan is supported; this is not an arbitrary download proxy. */
export function validateManifest(manifest) {
  const fail = (reason) => {
    throw new Error(`Invalid roadside manifest: ${reason}`);
  };
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object")
    fail("expected asset object");
  if (
    manifest.id !== assetId ||
    manifest.path !== `/environments/roadside/${assetId}_1k.gltf`
  )
    fail("unsafe asset id or destination");
  if (manifest.sourceUrl !== `https://polyhaven.com/a/${assetId}`)
    fail("expected official attribution URL");
  if (
    manifest.license !== "CC0-1.0" ||
    manifest.licenseUrl !== "https://polyhaven.com/license"
  )
    fail("expected credited CC0 asset");
  if (
    !manifest.authors ||
    typeof manifest.authors !== "object" ||
    Array.isArray(manifest.authors) ||
    !Object.entries(manifest.authors).length ||
    Object.entries(manifest.authors).some(
      ([name, role]) =>
        !name.trim() || typeof role !== "string" || !role.trim(),
    )
  )
    fail("missing artist attribution");
  if (
    !Array.isArray(manifest.files) ||
    manifest.files.length !== expectedFiles.length
  )
    fail("expected exactly five files");
  const seen = new Set();
  for (const entry of manifest.files) {
    if (!entry || !expectedFiles.includes(entry.file) || seen.has(entry.file))
      fail("unsafe or duplicate destination");
    seen.add(entry.file);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 5 ||
      entry.bytes > maxAssetBytes
    )
      fail("invalid byte size");
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      fail("invalid SHA-256");
    const format = entry.file.endsWith(".jpg")
      ? "jpg/1k"
      : entry.file.endsWith(".bin")
        ? "gltf/8k"
        : "gltf/1k";
    const expectedUrl = `https://dl.polyhaven.org/file/ph-assets/Models/${format}/${assetId}/${basename(entry.file)}`;
    if (entry.sourceDownloadUrl !== expectedUrl)
      fail("expected pinned official HTTPS Poly Haven URL");
  }
  if (
    manifest.files.reduce((sum, file) => sum + file.bytes, 0) >
    24 * 1024 * 1024
  )
    fail("total exceeds roadside budget");
  return manifest;
}

export function validateAsset(bytes, entry, manifest) {
  if (bytes.byteLength !== entry.bytes)
    throw new Error(
      `Byte count mismatch for ${entry.file}: expected ${entry.bytes}, got ${bytes.byteLength}`,
    );
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(
      `SHA-256 mismatch for ${entry.file}: expected ${entry.sha256}, got ${actual}`,
    );
  if (
    entry.file.endsWith(".jpg") &&
    (bytes[0] !== 0xff ||
      bytes[1] !== 0xd8 ||
      bytes[2] !== 0xff ||
      bytes.at(-2) !== 0xff ||
      bytes.at(-1) !== 0xd9)
  )
    throw new Error(`Invalid JPEG header or end marker for ${entry.file}`);
  if (!entry.file.endsWith(".gltf")) return;
  const gltf = JSON.parse(bytes.toString("utf8"));
  if (gltf.asset?.version !== "2.0")
    throw new Error("Expected glTF 2.0 roadside asset");
  // No remote codecs, embedded payloads or extension-defined asset loading.
  if (gltf.extensionsUsed?.length || gltf.extensionsRequired?.length)
    throw new Error("Unpinned glTF extension dependency");
  const buffers = gltf.buffers;
  const images = gltf.images;
  const binary = manifest.files.find((file) => file.file.endsWith(".bin"));
  if (
    !Array.isArray(buffers) ||
    buffers.length !== 1 ||
    buffers[0].uri !== binary.file ||
    buffers[0].byteLength !== binary.bytes
  )
    throw new Error("Unpinned glTF buffer dependency");
  const expectedImages = new Set(
    manifest.files
      .filter((file) => file.file.endsWith(".jpg"))
      .map((file) => file.file),
  );
  if (!Array.isArray(images) || images.length !== expectedImages.size)
    throw new Error("Unpinned glTF image dependency");
  for (const image of images) {
    if (!expectedImages.delete(image.uri) || image.bufferView !== undefined)
      throw new Error("Unpinned glTF image dependency");
  }
}

async function checkDirectory(directory) {
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error(
        `Refusing non-directory or symlink roadside directory: ${directory}`,
      );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function hasValidLocalFile(file, entry, manifest) {
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile())
    throw new Error(`Refusing non-regular roadside file: ${file}`);
  if (info.size !== entry.bytes) return false;
  // Do not follow a symlink or block on a FIFO if the path changes after lstat.
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile())
      throw new Error(`Refusing non-regular roadside file: ${file}`);
    if (opened.size !== entry.bytes) return false;
    const bytes = await handle.readFile(); // Permission/I/O failures must propagate.
    try {
      validateAsset(bytes, entry, manifest);
      return true;
    } catch {
      return false;
    }
  } finally {
    await handle.close();
  }
}

async function downloadAsset(entry, manifest, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let reader;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Download timed out after ${timeoutMs} ms for ${entry.file}`,
      );
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  const transfer = async () => {
    const response = await fetchImpl(entry.sourceDownloadUrl, {
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      headers: {
        "User-Agent": "GT-R-LAB-build/1.0",
        Accept: "application/octet-stream, model/gltf+json, image/jpeg",
      },
    });
    if (controller.signal.aborted) {
      response.body?.cancel().catch(() => {});
      throw controller.signal.reason;
    }
    reader = response.body?.getReader();
    if (!response.ok)
      throw new Error(`HTTP ${response.status} downloading ${entry.file}`);
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== entry.bytes)
    )
      throw new Error(
        `Content-Length mismatch for ${entry.file}: expected ${entry.bytes}, got ${declaredLength}`,
      );
    if (!reader) throw new Error(`Empty download body for ${entry.file}`);
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (done) break;
      total += value.byteLength;
      if (total > entry.bytes)
        throw new Error(`Download exceeds pinned byte size for ${entry.file}`);
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, total);
    validateAsset(bytes, entry, manifest);
    return bytes;
  };
  try {
    // Race the complete transfer, so both connection and body consumption are bounded.
    return await Promise.race([transfer(), timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    reader?.cancel().catch(() => {});
  }
}

async function ensureRoadside(
  entry,
  manifest,
  {
    directory = defaultDirectory,
    fetchImpl = globalThis.fetch,
    timeoutMs = defaultTimeoutMs,
    log = console.log,
  } = {},
) {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > maxTimeoutMs
  )
    throw new Error(
      `Roadside timeout must be an integer from 1 to ${maxTimeoutMs} milliseconds`,
    );
  await checkDirectory(directory);
  const file = join(directory, entry.file);
  await checkDirectory(dirname(file));
  if (await hasValidLocalFile(file, entry, manifest)) {
    log(`[roadside] verified ${basename(file)} (${entry.bytes} bytes)`);
    return { path: file, status: "verified" };
  }
  log(`[roadside] fetching ${basename(file)} from Poly Haven`);
  const bytes = await downloadAsset(entry, manifest, fetchImpl, timeoutMs);
  await mkdir(dirname(file), { recursive: true });
  await checkDirectory(directory);
  await checkDirectory(dirname(file));
  const temporaryFile = join(
    dirname(file),
    `.${basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryFile, bytes, { flag: "wx", mode: 0o644 });
    await rename(temporaryFile, file); // Publish only a complete, verified same-directory file.
  } finally {
    await rm(temporaryFile, { force: true }).catch(() => {});
  }
  log(
    `[roadside] downloaded and verified ${basename(file)} (${entry.bytes} bytes)`,
  );
  return { path: file, status: "downloaded" };
}

export async function prepareRoadside(manifest, options = {}) {
  validateManifest(manifest); // Reject every path, URL and pin before network access or writes.
  const directory = options.directory ?? defaultDirectory;
  await checkDirectory(directory);
  await checkDirectory(join(directory, "textures"));
  const results = [];
  for (const entry of manifest.files)
    results.push(await ensureRoadside(entry, manifest, options));
  return results;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const timeoutMs =
      process.env.ROADSIDE_FETCH_TIMEOUT_MS === undefined
        ? defaultTimeoutMs
        : Number(process.env.ROADSIDE_FETCH_TIMEOUT_MS);
    await prepareRoadside(manifest, { timeoutMs });
    console.log(
      `[roadside] ready: ${manifest.files.length} pinned model files, served locally at runtime`,
    );
  } catch (error) {
    console.error(`[roadside] asset preparation failed: ${error.message}`);
    console.error(
      "Build stopped. Check Poly Haven connectivity and pinned roadside.json; retry npm run prepare:assets. No unchecked download was published.",
    );
    process.exitCode = 1;
  }
}
