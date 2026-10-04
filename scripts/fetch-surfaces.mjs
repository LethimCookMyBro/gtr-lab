#!/usr/bin/env node
/** Build-time, hash-pinned CC0 PBR maps. Runtime requests stay on this site's origin. */
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
  new URL("../public/environments/surfaces.json", import.meta.url),
);
const defaultDirectory = dirname(manifestPath);
const maxAssetBytes = 16 * 1024 * 1024;
const defaultTimeoutMs = 120_000;
const maxTimeoutMs = 300_000;

export function validateManifest(manifest) {
  const fail = (reason) => {
    throw new Error(`Invalid surface manifest: ${reason}`);
  };
  if (!Array.isArray(manifest) || manifest.length === 0)
    fail("expected a nonempty array");
  const destinations = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry !== "object") fail("entry must be an object");
    if (typeof entry.id !== "string" || !/^[a-z0-9_]{1,100}$/.test(entry.id))
      fail("invalid asset id");
    if (!["diff", "rough", "nor_gl", "disp"].includes(entry.map))
      fail("unsupported PBR map");
    if (entry.resolution !== "1k") fail("unsupported resolution");
    const filename = `${entry.id}_${entry.map}_${entry.resolution}.jpg`;
    if (entry.path !== `/environments/${filename}`)
      fail("unsafe or mismatched destination path");
    if (destinations.has(entry.path))
      fail(`duplicate destination ${entry.path}`);
    destinations.add(entry.path);
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
    // Exact equality disallows credentials, lookalike hosts, ports, queries and traversal.
    const expectedUrl = `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${entry.id}/${filename}`;
    if (entry.sourceDownloadUrl !== expectedUrl)
      fail("expected pinned official HTTPS Poly Haven URL");
    if (entry.sourceUrl !== `https://polyhaven.com/a/${entry.id}`)
      fail("expected official Poly Haven attribution URL");
    if (
      entry.license !== "CC0-1.0" ||
      entry.licenseUrl !== "https://polyhaven.com/license"
    )
      fail("expected credited CC0 asset");
    if (
      !entry.authors ||
      typeof entry.authors !== "object" ||
      Array.isArray(entry.authors) ||
      Object.entries(entry.authors).length === 0 ||
      Object.entries(entry.authors).some(
        ([name, role]) =>
          !name.trim() || typeof role !== "string" || !role.trim(),
      )
    )
      fail("missing artist attribution");
  }
  return manifest;
}

export function validateAsset(bytes, entry) {
  if (bytes.byteLength !== entry.bytes)
    throw new Error(
      `Byte count mismatch for ${entry.path}: expected ${entry.bytes}, got ${bytes.byteLength}`,
    );
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(
      `SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
    );
  if (
    bytes.length < 5 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  )
    throw new Error(`Invalid JPEG header or end marker for ${entry.path}`);
}

async function checkDirectory(directory) {
  try {
    if (!(await lstat(directory)).isDirectory())
      throw new Error(
        `Refusing non-directory or symlink surface directory: ${directory}`,
      );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function hasValidLocalFile(file, entry) {
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile())
    throw new Error(`Refusing non-regular surface file: ${file}`);
  if (info.size !== entry.bytes) return false;
  // Do not follow a symlink or block on a FIFO if the path changes after lstat.
  const handle = await open(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile())
      throw new Error(`Refusing non-regular surface file: ${file}`);
    if (opened.size !== entry.bytes) return false;
    const bytes = await handle.readFile(); // Permission/I/O failures must propagate.
    try {
      validateAsset(bytes, entry);
      return true;
    } catch {
      return false;
    }
  } finally {
    await handle.close();
  }
}

async function downloadAsset(entry, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timer;
  let reader;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Download timed out after ${timeoutMs} ms for ${entry.path}`,
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
      headers: { "User-Agent": "GT-R-LAB-build/1.0", Accept: "image/jpeg" },
    });
    if (controller.signal.aborted) {
      response.body?.cancel().catch(() => {});
      throw controller.signal.reason;
    }
    reader = response.body?.getReader();
    if (!response.ok)
      throw new Error(`HTTP ${response.status} downloading ${entry.path}`);
    const declaredLength = response.headers.get("content-length");
    if (
      declaredLength !== null &&
      (!/^\d+$/.test(declaredLength) || Number(declaredLength) !== entry.bytes)
    )
      throw new Error(
        `Content-Length mismatch for ${entry.path}: expected ${entry.bytes}, got ${declaredLength}`,
      );
    if (!reader) throw new Error(`Empty download body for ${entry.path}`);
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (controller.signal.aborted) throw controller.signal.reason;
      if (done) break;
      total += value.byteLength;
      if (total > entry.bytes)
        throw new Error(`Download exceeds pinned byte size for ${entry.path}`);
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks, total);
    validateAsset(bytes, entry);
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

export async function ensureSurface(
  entry,
  {
    directory = defaultDirectory,
    fetchImpl = globalThis.fetch,
    timeoutMs = defaultTimeoutMs,
    log = console.log,
  } = {},
) {
  validateManifest([entry]);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    timeoutMs > maxTimeoutMs
  )
    throw new Error(
      `Surface timeout must be an integer from 1 to ${maxTimeoutMs} milliseconds`,
    );
  await checkDirectory(directory);
  const file = join(directory, basename(entry.path));
  if (await hasValidLocalFile(file, entry)) {
    log(`[surfaces] verified ${basename(file)} (${entry.bytes} bytes)`);
    return { path: file, status: "verified" };
  }
  log(`[surfaces] fetching ${basename(file)} from Poly Haven`);
  const bytes = await downloadAsset(entry, fetchImpl, timeoutMs);
  await mkdir(directory, { recursive: true });
  await checkDirectory(directory);
  const temporaryFile = join(
    directory,
    `.${basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryFile, bytes, { flag: "wx", mode: 0o644 });
    await rename(temporaryFile, file); // Publish only a complete, verified same-directory file.
  } finally {
    await rm(temporaryFile, { force: true }).catch(() => {});
  }
  log(
    `[surfaces] downloaded and verified ${basename(file)} (${entry.bytes} bytes)`,
  );
  return { path: file, status: "downloaded" };
}

export async function prepareSurfaces(manifest, options = {}) {
  validateManifest(manifest); // Reject the whole manifest before network access or writes.
  const results = [];
  for (const entry of manifest)
    results.push(await ensureSurface(entry, options));
  return results;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const timeoutMs =
      process.env.SURFACE_FETCH_TIMEOUT_MS === undefined
        ? defaultTimeoutMs
        : Number(process.env.SURFACE_FETCH_TIMEOUT_MS);
    await prepareSurfaces(manifest, { timeoutMs });
    console.log(
      `[surfaces] ready: ${manifest.length} pinned maps, served locally at runtime`,
    );
  } catch (error) {
    console.error(`[surfaces] asset preparation failed: ${error.message}`);
    console.error(
      "Build stopped. Check Poly Haven connectivity and pinned surfaces.json; retry npm run prepare:assets. No unchecked download was published.",
    );
    process.exitCode = 1;
  }
}
