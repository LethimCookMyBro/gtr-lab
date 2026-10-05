import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppServer } from "../server.mjs";
let server, root, url;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "gtr-server-"));
  await writeFile(join(root, "index.html"), "<h1>GT-R LAB</h1>");
  await writeFile(join(root, "car.glb"), "glTF-test");
  await writeFile(join(root, "film.mp4"), "0123456789abcdef");
  await writeFile(join(root, "film.webm"), "webm-test");
  await writeFile(join(root, "r35.ogg"), "original-audio-test");
  await writeFile(join(root, "heading.ttf"), "font-test");
  server = createAppServer(root);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = "http://127.0.0.1:" + server.address().port;
});
afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (root) await rm(root, { recursive: true, force: true });
});
describe("production static server", () => {
  it("serves the optional original Ogg recording with its audio MIME and nosniff", async () => {
    const response = await fetch(url + "/r35.ogg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/ogg");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("original-audio-test");
  });
  it("serves the self-hosted display font with its declared MIME type", async () => {
    const response = await fetch(url + "/heading.ttf");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/ttf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("font-test");
  });
  it("serves deep routes for React Router", async () => {
    const r = await fetch(url + "/configurator/nismo");
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("GT-R LAB");
  });
  it("returns404 for missing model instead of HTML", async () => {
    const r = await fetch(url + "/missing.glb");
    expect(r.status).toBe(404);
  });
  it("supports HEAD without payload", async () => {
    const r = await fetch(url + "/car.glb", { method: "HEAD" });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-length")).toBe("9");
    expect(await r.text()).toBe("");
  });
  it("has strict static content headers", async () => {
    const r = await fetch(url + "/car.glb");
    expect(r.headers.get("content-type")).toBe("model/gltf-binary");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'wasm-unsafe-eval'",
    );
    expect(r.headers.get("content-security-policy")).not.toContain(
      "'unsafe-eval'",
    );
    expect(r.headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );
  });
  it("allows embedded GLB texture blob fetches without widening external network or script access", async () => {
    const response = await fetch(url + "/car.glb");
    const directives = response.headers
      .get("content-security-policy")
      .split(";")
      .map((value) => value.trim());
    expect(
      directives.filter((value) => value.startsWith("connect-src ")),
    ).toEqual(["connect-src 'self' blob:"]);
    expect(
      directives.filter((value) => value.startsWith("script-src ")),
    ).toEqual(["script-src 'self' 'wasm-unsafe-eval'"]);
    expect(directives).toContain("object-src 'none'");
    expect(
      directives.filter((value) => /https?:|wss?:|\*/.test(value)),
    ).toEqual(["frame-src https://media.flixel.com"]);
  });
  it("serves film types with byte-range support for browser metadata and seeking", async () => {
    const mp4 = await fetch(url + "/film.mp4");
    expect(mp4.headers.get("content-type")).toBe("video/mp4");
    expect(mp4.headers.get("accept-ranges")).toBe("bytes");
    const webm = await fetch(url + "/film.webm");
    expect(webm.headers.get("content-type")).toBe("video/webm");
  });
  it("streams only a requested film byte interval", async () => {
    const response = await fetch(url + "/film.mp4", {
      headers: { Range: "bytes=2-5" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/16");
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("2345");
  });
  it("supports film suffix and open-ended ranges without buffering the full asset", async () => {
    const suffix = await fetch(url + "/film.mp4", {
      headers: { Range: "bytes=-4" },
    });
    expect(suffix.status).toBe(206);
    expect(await suffix.text()).toBe("cdef");
    const tail = await fetch(url + "/film.mp4", {
      headers: { Range: "bytes=12-" },
    });
    expect(tail.status).toBe(206);
    expect(await tail.text()).toBe("cdef");
  });
  it("rejects unsatisfiable or malformed ranges and gives the actual size", async () => {
    for (const range of [
      "bytes=99-100",
      "bytes=7-2",
      "bytes=a-b",
      "bytes=-0",
      "bytes=0-2,5-7",
      "bytes=9007199254740992-",
    ]) {
      const response = await fetch(url + "/film.mp4", {
        headers: { Range: range },
      });
      expect(response.status, range).toBe(416);
      expect(response.headers.get("content-range")).toBe("bytes */16");
    }
  });
  it("supports a ranged HEAD response with no film payload", async () => {
    const response = await fetch(url + "/film.mp4", {
      method: "HEAD",
      headers: { Range: "bytes=4-7" },
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("");
  });
  it("rejects mutation methods", async () => {
    const r = await fetch(url + "/", { method: "POST" });
    expect(r.status).toBe(405);
  });
  it("rejects an encoded traversal outside dist", async () => {
    const r = await fetch(url + "/%2e%2e%2fprivate");
    expect(r.status).toBe(403);
  });
});
