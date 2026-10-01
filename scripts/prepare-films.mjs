#!/usr/bin/env node
/** Offline, bounded-memory reconstruction of checksum-pinned CGI film chunks. */
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import { basename, join, parse, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const chunkBytes = 64 * 1024;
const maximumFilmBytes = 2 * 1024 * 1024;
const isText = (value) => typeof value === "string" && value.trim().length > 0;
const isHash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function isHttps(value) {
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

export function validateFilmManifest(manifest) {
  const fail = (message) => {
    throw new Error(`Invalid film manifest: ${message}`);
  };
  if (!Array.isArray(manifest) || !manifest.length || manifest.length > 2)
    fail("expected one or two films");
  const ids = new Set();
  for (const entry of manifest) {
    if (
      !entry ||
      !["gtr-hero", "gtr-detail"].includes(entry.id) ||
      ids.has(entry.id)
    )
      fail("invalid or duplicate film id");
    ids.add(entry.id);
    if (entry.path !== `/films/${entry.id}.mp4`)
      fail("unsafe or mismatched destination");
    if (
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 24 ||
      entry.bytes > maximumFilmBytes
    )
      fail("film byte size must be 24 bytes through 2 MiB");
    if (!isHash(entry.sha256)) fail("invalid film SHA-256");
    if (
      !isText(entry.source?.title) ||
      !isText(entry.source?.author) ||
      !isHttps(entry.source?.url)
    )
      fail(
        "source requires title, author and canonical HTTPS URL without credentials",
      );
    if (!isText(entry.license?.name) || !isHttps(entry.license?.url))
      fail("license requires name and canonical HTTPS URL without credentials");
    if (
      !Array.isArray(entry.changes) ||
      !entry.changes.length ||
      !entry.changes.every(isText)
    )
      fail("modification notice is required");
    if (
      !Array.isArray(entry.chunks) ||
      entry.chunks.length !== Math.ceil(entry.bytes / chunkBytes)
    )
      fail("incorrect chunk count");
    for (const [index, chunk] of entry.chunks.entries()) {
      if (
        !chunk ||
        chunk.path !== `${entry.id}/${String(index).padStart(4, "0")}.bin`
      )
        fail("unsafe, duplicate or out-of-order chunk path");
      if (
        chunk.bytes !== Math.min(chunkBytes, entry.bytes - index * chunkBytes)
      )
        fail(
          "incorrect chunk byte size; use 64 KiB parts and a bounded final part",
        );
      if (!isHash(chunk.sha256)) fail("invalid chunk SHA-256");
    }
  }
  return manifest;
}

// Check every ancestor, including configured roots, before reads and writes.
async function safeDirectory(directory, create = false) {
  const absolute = resolve(directory);
  let cursor = parse(absolute).root;
  for (const part of absolute.slice(cursor.length).split(sep).filter(Boolean)) {
    cursor = join(cursor, part);
    let info;
    try {
      info = await lstat(cursor);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create)
        throw new Error(`Missing film directory: ${cursor}`, { cause: error });
      try {
        await mkdir(cursor);
      } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      info = await lstat(cursor);
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(
        `Unsafe film directory (symlink or non-directory): ${cursor}`,
      );
  }
}

async function regularFile(file, optional = false) {
  try {
    const info = await lstat(file);
    if (!info.isFile())
      throw new Error(`Refusing non-regular or symlink film file: ${file}`);
    return info;
  } catch (error) {
    if (error.code === "ENOENT") {
      if (optional) return null;
      throw new Error(`Missing film file: ${file}`, { cause: error });
    }
    throw error;
  }
}

async function readBounded(file, limit, expected) {
  await regularFile(file);
  let handle;
  try {
    // NOFOLLOW closes the final-component symlink race; NONBLOCK avoids a FIFO hang.
    handle = await open(
      file,
      constants.O_RDONLY |
        (constants.O_NOFOLLOW ?? 0) |
        (constants.O_NONBLOCK ?? 0),
    );
    const info = await handle.stat();
    if (!info.isFile())
      throw new Error(`Refusing non-regular film file: ${file}`);
    if ((expected && info.size !== expected.bytes) || info.size > limit)
      throw new Error(
        `Film byte count exceeds or differs from manifest: ${file}`,
      );
    const bytes = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit || (expected && length !== expected.bytes))
      throw new Error(
        `Film byte count exceeds or differs from manifest: ${file}`,
      );
    const result = bytes.subarray(0, length);
    if (
      expected &&
      createHash("sha256").update(result).digest("hex") !== expected.sha256
    )
      throw new Error(`SHA-256 mismatch for film chunk: ${file}`);
    return result;
  } finally {
    await handle?.close();
  }
}

function overlaps(parent, child) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith(`..${sep}`) && !parse(path).root)
  );
}

export async function prepareFilms(
  manifest,
  {
    directory = join(projectRoot, "filmdata"),
    publicDirectory = join(projectRoot, "public"),
    log = console.log,
  } = {},
) {
  validateFilmManifest(manifest);
  directory = resolve(directory);
  publicDirectory = resolve(publicDirectory);
  if (
    overlaps(publicDirectory, directory) ||
    overlaps(directory, publicDirectory)
  )
    throw new Error(
      "Film chunk directory must be outside public; roots must not overlap",
    );
  await safeDirectory(directory);
  const results = [];
  for (const entry of manifest) {
    await safeDirectory(join(directory, entry.id));
    const outputDirectory = join(publicDirectory, "films");
    await safeDirectory(outputDirectory, true);
    const output = join(outputDirectory, `${entry.id}.mp4`);
    await regularFile(output, true);
    const temporary = join(
      outputDirectory,
      `.${basename(output)}.${randomUUID()}.tmp`,
    );
    let handle;
    try {
      handle = await open(temporary, "wx", 0o644);
      const hash = createHash("sha256");
      for (const [index, chunk] of entry.chunks.entries()) {
        const bytes = await readBounded(
          join(directory, chunk.path),
          chunk.bytes,
          chunk,
        );
        if (
          index === 0 &&
          (bytes.length < 24 ||
            !bytes.subarray(4, 8).equals(Buffer.from("ftyp")) ||
            bytes.readUInt32BE(0) < 24 ||
            bytes.readUInt32BE(0) > bytes.length)
        )
          throw new Error(`Invalid MP4 ftyp header: ${entry.path}`);
        hash.update(bytes);
        await handle.writeFile(bytes);
      }
      if (hash.digest("hex") !== entry.sha256)
        throw new Error(
          `SHA-256 mismatch for reconstructed film: ${entry.path}`,
        );
      if ((await handle.stat()).size !== entry.bytes)
        throw new Error(`Film byte count mismatch: ${entry.path}`);
      await handle.close();
      handle = null;
      await rename(temporary, output);
    } finally {
      await handle?.close();
      await rm(temporary, { force: true });
    }
    log(
      `[films] reconstructed and verified ${basename(output)} (${entry.bytes} bytes)`,
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
    const directory = join(projectRoot, "filmdata");
    await safeDirectory(directory);
    const bytes = await readBounded(
      join(directory, "manifest.json"),
      64 * 1024,
    );
    const manifest = JSON.parse(bytes.toString("utf8"));
    await prepareFilms(manifest);
    console.log(
      `[films] ready: ${manifest.length} pinned CGI films, served locally at runtime`,
    );
  } catch (error) {
    console.error(`[films] asset preparation failed: ${error.message}`);
    console.error(
      "Build stopped. Restore filmdata/manifest.json and its complete pinned chunks, then retry node scripts/prepare-films.mjs. No unverified film was published.",
    );
    process.exitCode = 1;
  }
}
