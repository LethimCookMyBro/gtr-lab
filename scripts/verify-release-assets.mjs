/** Read-only release gate. Never deploys or accepts URLs supplied by a response. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const origin = "https://gtr-lab-production.up.railway.app";
const htmlLimit = 256 * 1024;
const assetLimit = 8 * 1024 * 1024;
const totalLimit = 32 * 1024 * 1024;
const assetPath = /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css)$/;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function isReleaseCommit(message) {
  return (
    typeof message === "string" &&
    message.includes("[release-real-environments]") &&
    !message.includes("[stage-real-environments]")
  );
}

async function localFile(path, limit) {
  const info = await lstat(path);
  assert(
    info.isFile() && !info.isSymbolicLink(),
    `Expected a regular build file: ${path}`,
  );
  assert(
    info.size > 0 && info.size <= limit,
    `Build file size exceeds limit: ${path}`,
  );
  const bytes = await readFile(path);
  assert(bytes.length <= limit, `Build file size exceeds limit: ${path}`);
  return bytes;
}

function entryAssets(html) {
  // Parse only the locally built HTML. No scripts/resources execute in JSDOM.
  // Public HTML must first match those bytes; its URLs are never followed.
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    assert(
      !document.querySelector("base"),
      "Unexpected base URL in built HTML",
    );
    const entries = [
      ...document.querySelectorAll(
        'script[src], link[rel~="stylesheet"], link[rel~="modulepreload"]',
      ),
    ].map((element) => {
      const path = element.getAttribute(
        element.tagName === "SCRIPT" ? "src" : "href",
      );
      assert(
        assetPath.test(path ?? ""),
        `Unsafe build entry asset path: ${path}`,
      );
      const expectedExtension = element
        .getAttribute("rel")
        ?.split(/\s+/)
        .includes("stylesheet")
        ? ".css"
        : ".js";
      assert(
        path.endsWith(expectedExtension),
        `Invalid build entry asset type: ${path}`,
      );
      return path;
    });
    assert(
      entries.length > 0 &&
        entries.length <= 64 &&
        entries.some((path) => path.endsWith(".js")) &&
        entries.some((path) => path.endsWith(".css")),
      "Expected bounded JS and CSS build entries",
    );
    assert(
      new Set(entries).size === entries.length,
      "Duplicate build entry assets",
    );
    return entries.sort();
  } finally {
    dom.window.close();
  }
}

async function publicFile(path, limit, fetchImpl, deadline) {
  const url = origin + path;
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { "Cache-Control": "no-cache" },
    signal: AbortSignal.any([deadline, AbortSignal.timeout(20_000)]),
  });
  try {
    assert(
      response.status === 200,
      `Release response HTTP ${response.status}: ${path}`,
    );
    assert(
      !response.redirected && (!response.url || response.url === url),
      `Unexpected response URL: ${path}`,
    );
    const mime = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    assert(
      path === "/"
        ? mime === "text/html"
        : path.endsWith(".css")
          ? mime === "text/css"
          : [
              "application/javascript",
              "text/javascript",
              "application/ecmascript",
              "text/ecmascript",
            ].includes(mime),
      `Unexpected content-type for ${path}: ${mime}`,
    );
    const declaredSize = response.headers.get("content-length");
    assert(
      declaredSize === null ||
        (/^\d+$/.test(declaredSize) && Number(declaredSize) <= limit),
      `Response size exceeds limit: ${path}`,
    );
    assert(response.body, `Missing response body: ${path}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      assert(size <= limit, `Response size exceeds limit: ${path}`);
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, size);
  } finally {
    if (response.body && !response.body.locked)
      await response.body.cancel().catch(() => {});
  }
}

export async function verifyReleaseAssets({
  directory = resolve("dist"),
  commit = process.env.GITHUB_SHA,
  fetchImpl = fetch,
} = {}) {
  assert(
    /^[a-f0-9]{40}$/.test(commit ?? ""),
    "Expected an exact 40-character commit SHA",
  );
  const localHtml = await localFile(join(directory, "index.html"), htmlLimit);
  const entries = entryAssets(localHtml.toString("utf8"));
  const files = (await readdir(join(directory, "assets")))
    .filter((name) => /\.(?:js|css)$/.test(name))
    .sort();
  assert(
    files.length > 0 && files.length <= 64,
    "Build asset count exceeds limit",
  );
  assert(
    files.every((name) => assetPath.test(`/assets/${name}`)),
    "Unsafe build asset filename",
  );
  assert(
    entries.every((path) => files.includes(path.slice("/assets/".length))),
    "HTML entry asset is missing from dist",
  );
  const expected = [];
  let total = localHtml.length;
  for (const name of files) {
    const bytes = await localFile(join(directory, "assets", name), assetLimit);
    total += bytes.length;
    assert(total <= totalLimit, "Total build asset size exceeds limit");
    expected.push({ path: `/assets/${name}`, bytes });
  }
  const deadline = AbortSignal.timeout(180_000);
  const liveHtml = await publicFile("/", htmlLimit, fetchImpl, deadline);
  assert(
    liveHtml.equals(localHtml),
    "Public HTML does not match this commit's freshly built dist/index.html",
  );
  const verified = [];
  for (const asset of expected) {
    const live = await publicFile(asset.path, assetLimit, fetchImpl, deadline);
    assert(
      live.equals(asset.bytes),
      `Public asset does not match freshly built dist: ${asset.path}`,
    );
    verified.push({
      path: asset.path,
      url: origin + asset.path,
      bytes: live.length,
      sha256: digest(live),
    });
  }
  return {
    status: "passed",
    commit,
    origin,
    verifiedAt: new Date().toISOString(),
    html: {
      path: "/",
      bytes: liveHtml.length,
      sha256: digest(liveHtml),
      entryAssets: entries,
    },
    assets: verified,
  };
}

async function main() {
  if (process.argv.includes("--mode")) {
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      maxBuffer: 65536,
    }).trim();
    assert(
      /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
        head === process.env.GITHUB_SHA,
      "Release mode must inspect exactly GITHUB_SHA",
    );
    const message = execFileSync("git", ["log", "-1", "--format=%B"], {
      encoding: "utf8",
      maxBuffer: 65536,
    });
    const release =
      process.env.GITHUB_REF === "refs/heads/main" && isReleaseCommit(message);
    if (process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT, `release_mode=${release}\n`);
    console.log(
      `[release verification] mode=${release ? "public exact-release" : "local staging"}; commit=${head}`,
    );
    return;
  }
  const output = "environment-release-verification";
  await mkdir(output, { recursive: true });
  let report;
  try {
    report = await verifyReleaseAssets();
    console.log(
      `[release verification] ${report.commit}: exact HTML and ${report.assets.length} JS/CSS assets match ${origin}`,
    );
  } catch (error) {
    report = {
      status: "failed",
      commit: process.env.GITHUB_SHA,
      origin,
      error: String(error),
    };
    process.exitCode = 1;
    console.error(`[release verification] ${error.message}`);
  }
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
