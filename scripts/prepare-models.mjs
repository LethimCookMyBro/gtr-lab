#!/usr/bin/env node
/** Offline build-time reconstruction of checksum-pinned, licensed model chunks. */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import {
  basename,
  dirname,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const maxModelBytes = 64 * 1024 * 1024;
const maxChunkBytes = 256 * 1024;

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return (
      typeof value === "string" &&
      value === url.href &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function validateManifest(manifest) {
  const fail = (reason) => {
    throw new Error(`Invalid model manifest: ${reason}`);
  };
  if (!Array.isArray(manifest) || !manifest.length)
    fail("expected a nonempty array");
  const destinations = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry !== "object") fail("entry must be an object");
    if (
      typeof entry.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)
    )
      fail("invalid asset id");
    if (entry.path !== `/models/${entry.id}.glb`)
      fail("unsafe or mismatched destination path");
    if (destinations.has(entry.path))
      fail(`duplicate destination ${entry.path}`);
    destinations.add(entry.path);
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 20 ||
      entry.bytes > maxModelBytes
    )
      fail("invalid model byte size");
    if (
      typeof entry.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    )
      fail("invalid model SHA-256");
    if (
      !isText(entry.source?.author) ||
      !isText(entry.source?.title) ||
      !isHttpsUrl(entry.source?.url)
    )
      fail(
        "source requires title, author, and canonical HTTPS URL without credentials",
      );
    if (!isText(entry.license?.name) || !isHttpsUrl(entry.license?.url))
      fail("license requires name and canonical HTTPS URL without credentials");
    if (
      !Array.isArray(entry.chunks) ||
      !entry.chunks.length ||
      entry.chunks.length > 9999
    )
      fail("expected ordered chunks");
    let total = 0;
    for (const [index, chunk] of entry.chunks.entries()) {
      if (
        !chunk ||
        chunk.path !== `${entry.id}/${String(index).padStart(4, "0")}.bin`
      )
        fail("unsafe, duplicate, or out-of-order chunk path");
      if (
        !Number.isSafeInteger(chunk.bytes) ||
        chunk.bytes <= 0 ||
        chunk.bytes > maxChunkBytes
      )
        fail("invalid chunk byte size (maximum 256 KiB)");
      if (
        typeof chunk.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(chunk.sha256)
      )
        fail("invalid chunk SHA-256");
      total += chunk.bytes;
    }
    if (total !== entry.bytes)
      fail(`chunk byte sum does not match ${entry.path}`);
  }
  return manifest;
}

function validateBytes(bytes, entry) {
  if (bytes.length !== entry.bytes)
    throw new Error(
      `Byte count mismatch for ${entry.path}: expected ${entry.bytes}, got ${bytes.length}`,
    );
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(
      `SHA-256 mismatch for ${entry.path}: expected ${entry.sha256}, got ${actual}`,
    );
}

export function validateGlb(bytes, entry) {
  validateBytes(bytes, entry);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67)
    throw new Error(`Invalid GLB magic/header for ${entry.path}`);
  if (bytes.readUInt32LE(4) !== 2)
    throw new Error(`Invalid GLB version for ${entry.path}: expected 2`);
  if (bytes.readUInt32LE(8) !== bytes.length)
    throw new Error(`Invalid GLB declared length for ${entry.path}`);
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length)
      throw new Error(`Invalid GLB truncated chunk header for ${entry.path}`);
    const length = bytes.readUInt32LE(offset);
    if (length % 4 !== 0 || offset + 8 + length > bytes.length)
      throw new Error(`Invalid GLB chunk length/alignment for ${entry.path}`);
    if (offset === 12) {
      if (bytes.readUInt32LE(offset + 4) !== 0x4e4f534a)
        throw new Error(
          `Invalid GLB: first chunk must be JSON for ${entry.path}`,
        );
      try {
        JSON.parse(bytes.toString("utf8", offset + 8, offset + 8 + length));
      } catch (error) {
        throw new Error(`Invalid GLB JSON content for ${entry.path}`, {
          cause: error,
        });
      }
    }
    offset += 8 + length;
  }
}

async function hasValidOutput(file, entry) {
  let info;
  try {
    info = await lstat(file);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (!info.isFile())
    throw new Error(`Refusing non-regular model file: ${file}`);
  if (info.size !== entry.bytes) return false;
  const bytes = await readRegularFile(file, entry.bytes, entry);
  try {
    validateGlb(bytes, entry);
    return true;
  } catch {
    return false;
  }
}

// Inspect every directory component, including configured roots. A symlinked
// parent must never turn a safe manifest path into an out-of-tree read/write.
async function safeDirectory(directory, { create = false } = {}) {
  const absolute = resolve(directory);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) return false;
      try {
        await mkdir(cursor);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      info = await lstat(cursor);
    }
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new Error(
        `Unsafe model directory (symlink or non-directory): ${cursor}`,
      );
  }
  return true;
}

async function readRegularFile(file, maximumBytes, entry) {
  let handle;
  try {
    const info = await lstat(file);
    if (!info.isFile())
      throw new Error(`Refusing non-regular model file: ${file}`);
    // NOFOLLOW protects the final component even if it changes after lstat;
    // NONBLOCK prevents a concurrently substituted FIFO from hanging a build.
    handle = await open(
      file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const openedInfo = await handle.stat();
    if (!openedInfo.isFile())
      throw new Error(`Refusing non-regular model file: ${file}`);
    if (entry && openedInfo.size !== entry.bytes)
      throw new Error(
        `Byte count mismatch for ${entry.path}: expected ${entry.bytes}, got ${openedInfo.size}`,
      );
    if (openedInfo.size > maximumBytes)
      throw new Error(`Model file exceeds maximum byte count: ${file}`);
    // Bound reads even if another process grows the file during preparation.
    const buffer = Buffer.alloc(maximumBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        length,
        buffer.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > maximumBytes)
      throw new Error(`Model file exceeds maximum byte count: ${file}`);
    return buffer.subarray(0, length);
  } catch (error) {
    if (error.code === "ENOENT")
      throw new Error(`Missing model file: ${file}`, { cause: error });
    if (error.code === "ELOOP")
      throw new Error(`Unsafe symlink model file: ${file}`, { cause: error });
    throw error;
  } finally {
    await handle?.close();
  }
}

function contains(parent, child) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !parse(path).root)
  );
}

export async function prepareModels(
  manifest,
  {
    directory = join(projectRoot, "modeldata"),
    publicDirectory = join(projectRoot, "public"),
    log = console.log,
  } = {},
) {
  validateManifest(manifest);
  directory = resolve(directory);
  publicDirectory = resolve(publicDirectory);
  if (
    contains(publicDirectory, directory) ||
    contains(directory, publicDirectory)
  )
    throw new Error(
      "Model chunk directory must be outside public; roots must not overlap",
    );
  await safeDirectory(join(publicDirectory, "models"));
  const results = [];
  for (const entry of manifest) {
    const output = join(publicDirectory, entry.path);
    if (await hasValidOutput(output, entry)) {
      log(`[models] verified ${basename(output)} (${entry.bytes} bytes)`);
      results.push({ path: output, status: "verified" });
      continue;
    }
    const parts = [];
    if (!(await safeDirectory(join(directory, entry.id))))
      throw new Error(
        `Missing model chunk directory: ${join(directory, entry.id)}`,
      );
    for (const chunk of entry.chunks) {
      const bytes = await readRegularFile(
        join(directory, chunk.path),
        chunk.bytes,
        chunk,
      );
      validateBytes(bytes, chunk);
      parts.push(bytes);
    }
    const bytes = Buffer.concat(parts, entry.bytes);
    validateGlb(bytes, entry);
    await safeDirectory(dirname(output), { create: true });
    const temporaryFile = join(
      dirname(output),
      `.${basename(output)}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporaryFile, bytes, { flag: "wx", mode: 0o644 });
      await rename(temporaryFile, output);
    } finally {
      await rm(temporaryFile, { force: true });
    }
    log(
      `[models] reconstructed and verified ${basename(output)} (${entry.bytes} bytes)`,
    );
    results.push({ path: output, status: "reconstructed" });
  }
  return results;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const directory = join(projectRoot, "modeldata");
    if (!(await safeDirectory(directory)))
      throw new Error(`Missing modeldata directory: ${directory}`);
    const bytes = await readRegularFile(
      join(directory, "manifest.json"),
      4 * 1024 * 1024,
    );
    const manifest = JSON.parse(bytes.toString("utf8"));
    await prepareModels(manifest);
    console.log(
      `[models] ready: ${manifest.length} pinned assets, served locally at runtime`,
    );
  } catch (error) {
    console.error(`[models] asset preparation failed: ${error.message}`);
    console.error(
      "Build stopped. Restore modeldata/manifest.json and its complete pinned chunks, then retry node scripts/prepare-models.mjs. No unverified model was published.",
    );
    process.exitCode = 1;
  }
}
