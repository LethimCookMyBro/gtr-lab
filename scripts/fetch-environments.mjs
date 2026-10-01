#!/usr/bin/env node
/** Reproducible build-time CC0 HDRI preparation. Never used by the runtime server. */
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const manifestPath = join(projectRoot, "public/environments/downloads.json");
const defaultDirectory = dirname(manifestPath);
const maxAssetBytes = 64 * 1024 * 1024;
const defaultTimeoutMs = 120_000;

export function validateManifest(manifest) {
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("Invalid environment manifest: expected a nonempty array");
  }
  const destinations = new Set();
  for (const entry of manifest) {
    const fail = (reason) => {
      throw new Error(`Invalid environment manifest: ${reason}`);
    };
    if (!entry || typeof entry !== "object") fail("entry must be an object");
    if (!/^[a-z0-9_]+$/.test(entry.id ?? "")) fail("invalid asset id");
    if (!["1k", "2k"].includes(entry.resolution))
      fail("unsupported resolution");
    const names = [
      `/environments/${entry.id}.hdr`,
      `/environments/${entry.id}_${entry.resolution}.hdr`,
    ];
    if (!names.includes(entry.path))
      fail("unsafe or mismatched destination path");
    if (destinations.has(entry.path))
      fail(`duplicate destination ${entry.path}`);
    destinations.add(entry.path);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      entry.bytes > maxAssetBytes
    )
      fail("invalid byte size");
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? "")) fail("invalid SHA-256");
    if (!/^-Y [1-9]\d* \+X [1-9]\d*$/.test(entry.dimensionsHeader ?? ""))
      fail("missing HDR dimensions");
    const expectedUrl = `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${entry.resolution}/${entry.id}_${entry.resolution}.hdr`;
    // Exact canonical URL excludes credentials, other hosts/ports, redirects, queries and traversal.
    if (entry.sourceDownloadUrl !== expectedUrl)
      fail("expected pinned official HTTPS Poly Haven URL");
  }
  return manifest;
}

export function validateAsset(bytes, entry) {
  if (bytes.byteLength !== entry.bytes) {
    throw new Error(
      `Byte count mismatch for ${entry.path}: expected ${entry.bytes}, got ${bytes.byteLength}`,
    );
  }
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(
      `SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
    );
  const header = bytes.subarray(0, 4096).toString("ascii");
  if (
    !header.startsWith("#?RADIANCE\n") ||
    !header.includes(`\n${entry.dimensionsHeader}\n`)
  ) {
    throw new Error(
      `Invalid Radiance HDR header or dimensions for ${entry.path}`,
    );
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
    throw new Error(`Refusing non-regular environment file: ${file}`);
  if (info.size !== entry.bytes) return false;
  const bytes = await readFile(file); // Permission/I/O errors propagate rather than triggering replacement.
  try {
    validateAsset(bytes, entry);
    return true;
  } catch {
    return false;
  }
}

async function downloadAsset(entry, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error("Download timed out")),
    timeoutMs,
  );
  try {
    const response = await fetchImpl(entry.sourceDownloadUrl, {
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      headers: {
        "User-Agent": "GT-R-LAB-build/1.0",
        Accept: "application/octet-stream",
      },
    });
    if (!response.ok)
      throw new Error(`HTTP ${response.status} downloading ${entry.path}`);
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && Number(declaredLength) !== entry.bytes) {
      await response.body?.cancel();
      throw new Error(
        `Content-Length mismatch for ${entry.path}: expected ${entry.bytes}, got ${declaredLength}`,
      );
    }
    if (!response.body)
      throw new Error(`Empty download body for ${entry.path}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > entry.bytes)
        throw new Error(`Download exceeds pinned byte size for ${entry.path}`);
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks, total);
    validateAsset(bytes, entry);
    return bytes;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        `Download timed out after ${timeoutMs} ms for ${entry.path}`,
        { cause: error },
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function ensureEnvironment(
  entry,
  {
    directory = defaultDirectory,
    fetchImpl = globalThis.fetch,
    timeoutMs = defaultTimeoutMs,
    log = console.log,
  } = {},
) {
  validateManifest([entry]);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0)
    throw new Error("HDRI timeout must be a positive integer in milliseconds");
  const file = join(directory, basename(entry.path));
  if (await hasValidLocalFile(file, entry)) {
    log(`[environments] verified ${basename(file)} (${entry.bytes} bytes)`);
    return { path: file, status: "verified" };
  }
  log(`[environments] fetching ${basename(file)} from Poly Haven`);
  const bytes = await downloadAsset(entry, fetchImpl, timeoutMs);
  await mkdir(directory, { recursive: true });
  const temporaryFile = join(
    directory,
    `.${basename(file)}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryFile, bytes, { flag: "wx", mode: 0o644 });
    await rename(temporaryFile, file); // Same-directory rename publishes only a fully validated file.
  } finally {
    await rm(temporaryFile, { force: true }).catch(() => {});
  }
  log(
    `[environments] downloaded and verified ${basename(file)} (${entry.bytes} bytes)`,
  );
  return { path: file, status: "downloaded" };
}

export async function prepareEnvironments(manifest, options = {}) {
  validateManifest(manifest); // Fail the entire manifest before any network or filesystem writes.
  const results = [];
  for (const entry of manifest)
    results.push(await ensureEnvironment(entry, options));
  return results;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const timeoutMs =
      process.env.HDRI_FETCH_TIMEOUT_MS === undefined
        ? defaultTimeoutMs
        : Number(process.env.HDRI_FETCH_TIMEOUT_MS);
    await prepareEnvironments(manifest, { timeoutMs });
    console.log(
      `[environments] ready: ${manifest.length} pinned assets, served locally at runtime`,
    );
  } catch (error) {
    console.error(`[environments] asset preparation failed: ${error.message}`);
    console.error(
      "Build stopped. Check Poly Haven connectivity and the pinned downloads.json; retry npm run prepare:assets. No unchecked download was published.",
    );
    process.exitCode = 1;
  }
}
