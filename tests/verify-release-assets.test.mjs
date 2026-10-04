import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import {
  isReleaseCommit,
  verifyReleaseAssets,
} from "../scripts/verify-release-assets.mjs";

const origin = "https://gtr-lab-production.up.railway.app";
const sha = "a".repeat(40);
const html =
  '<!doctype html><html><head><script type="module" src="/assets/index-a.js"></script><link rel="modulepreload" href="/assets/shared-b.js"><link rel="stylesheet" href="/assets/index-c.css"></head><body><div id="root"></div></body></html>';
const assets = {
  "/assets/index-a.js": 'import "./shared-b.js";',
  "/assets/shared-b.js": 'export const version = "release";',
  "/assets/lazy-d.js": 'export const scene = "physical";',
  "/assets/index-c.css": "body{color:#fff}",
};
const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture({
  localHtml = html,
  changes = {},
  status = 200,
  headers = {},
} = {}) {
  const directory = await mkdtemp(join(tmpdir(), "gtr-release-gate-"));
  directories.push(directory);
  await mkdir(join(directory, "assets"));
  await writeFile(join(directory, "index.html"), localHtml);
  await Promise.all(
    Object.entries(assets).map(([path, bytes]) =>
      writeFile(join(directory, path.slice(1)), bytes),
    ),
  );
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const path = new URL(url).pathname;
    const body = Object.hasOwn(changes, path)
      ? changes[path]
      : path === "/"
        ? localHtml
        : assets[path];
    return new Response(body, {
      status,
      headers: {
        "content-type":
          path === "/"
            ? "text/html; charset=utf-8"
            : path.endsWith(".css")
              ? "text/css"
              : "application/javascript",
        ...headers,
      },
    });
  };
  return { directory, calls, fetchImpl, commit: sha };
}

describe("read-only exact release asset verification", () => {
  it("recognizes only the explicit release marker", () => {
    expect(
      isReleaseCommit("Publish reviewed scenes [release-real-environments]"),
    ).toBe(true);
    expect(isReleaseCommit("[stage-real-environments] refine scenes")).toBe(
      false,
    );
    expect(isReleaseCommit("release-real-environments without brackets")).toBe(
      false,
    );
    expect(isReleaseCommit("[release-real-environments-old]")).toBe(false);
  });
  it("matches exact HTML and every JS/CSS bundle including lazy chunks", async () => {
    const f = await fixture();
    const report = await verifyReleaseAssets(f);
    expect(report).toMatchObject({ status: "passed", commit: sha, origin });
    expect(report.assets.map((asset) => asset.path)).toEqual(
      Object.keys(assets).sort(),
    );
    expect(report.html.entryAssets).toEqual([
      "/assets/index-a.js",
      "/assets/index-c.css",
      "/assets/shared-b.js",
    ]);
    expect(report.html.sha256).toBe(
      createHash("sha256").update(html).digest("hex"),
    );
    for (const asset of report.assets) {
      expect(asset.bytes).toBe(Buffer.byteLength(assets[asset.path]));
      expect(asset.sha256).toBe(
        createHash("sha256").update(assets[asset.path]).digest("hex"),
      );
    }
    expect(f.calls).toHaveLength(5);
    expect(
      f.calls.every(
        (call) =>
          call.url.startsWith(origin + "/") &&
          call.options.redirect === "error" &&
          call.options.signal instanceof AbortSignal,
      ),
    ).toBe(true);
  });
  it.each([
    "old HTML",
    html.replace("index-a.js", "index-stale.js"),
    html.replace("/assets/index-a.js", "https://untrusted.test/steal.js"),
  ])(
    "rejects changed public HTML without following its asset references",
    async (publicHtml) => {
      const f = await fixture({ changes: { "/": publicHtml } });
      await expect(verifyReleaseAssets(f)).rejects.toThrow(/HTML.*match/i);
      expect(f.calls.map((call) => call.url)).toEqual([origin + "/"]);
    },
  );
  it("rejects one changed byte in an otherwise same-named bundle", async () => {
    const f = await fixture({
      changes: {
        "/assets/lazy-d.js": assets["/assets/lazy-d.js"].replace(
          "physical",
          "physicaL",
        ),
      },
    });
    await expect(verifyReleaseAssets(f)).rejects.toThrow(
      /asset.*match.*lazy-d\.js/i,
    );
  });
  it.each([301, 404, 503])(
    "rejects non-200 responses, including redirects (%s)",
    async (status) => {
      const f = await fixture({ status });
      await expect(verifyReleaseAssets(f)).rejects.toThrow(/HTTP/);
    },
  );
  it.each([
    "/assets/../secret.js",
    "https://untrusted.test/asset.js",
    "/assets/index-a.js?token=bad",
  ])(
    "rejects unsafe local entry paths before network access: %s",
    async (path) => {
      const f = await fixture({
        localHtml: html.replace("/assets/index-a.js", path),
      });
      await expect(verifyReleaseAssets(f)).rejects.toThrow(/entry|path|asset/i);
      expect(f.calls).toHaveLength(0);
    },
  );
  it("rejects a base URL override in the built HTML", async () => {
    const f = await fixture({
      localHtml: html.replace(
        "<head>",
        '<head><base href="https://untrusted.test/">',
      ),
    });
    await expect(verifyReleaseAssets(f)).rejects.toThrow(/base/i);
    expect(f.calls).toHaveLength(0);
  });
  it("rejects a declared oversized response before reading it", async () => {
    const f = await fixture({ headers: { "content-length": "999999999" } });
    await expect(verifyReleaseAssets(f)).rejects.toThrow(/size|limit|large/i);
  });
  it("bounds streamed bytes even without Content-Length", async () => {
    const f = await fixture({ changes: { "/": "a".repeat(300_000) } });
    await expect(verifyReleaseAssets(f)).rejects.toThrow(/size|limit|large/i);
  });
  it("rejects invalid MIME types despite identical bytes", async () => {
    const f = await fixture({ headers: { "content-type": "image/png" } });
    await expect(verifyReleaseAssets(f)).rejects.toThrow(/content.type|MIME/i);
  });
  it("requires the exact 40-character commit before network access", async () => {
    const f = await fixture();
    await expect(verifyReleaseAssets({ ...f, commit: "main" })).rejects.toThrow(
      /commit|SHA/i,
    );
    expect(f.calls).toHaveLength(0);
  });
});
