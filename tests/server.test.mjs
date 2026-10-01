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
  server = createAppServer(root);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  url = "http://127.0.0.1:" + server.address().port;
});
afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (root) await rm(root, { recursive: true, force: true });
});
describe("production static server", () => {
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
  it("rejects mutation methods", async () => {
    const r = await fetch(url + "/", { method: "POST" });
    expect(r.status).toBe(405);
  });
  it("rejects an encoded traversal outside dist", async () => {
    const r = await fetch(url + "/%2e%2e%2fprivate");
    expect(r.status).toBe(403);
  });
});
