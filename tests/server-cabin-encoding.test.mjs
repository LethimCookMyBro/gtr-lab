import { afterEach, expect, it } from "vitest";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Writable } from "node:stream";
import { gzipSync, gunzipSync } from "node:zlib";
import { createAppServer } from "../server.mjs";

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture({ sidecar = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "gtr-encoding-"));
  directories.push(root);
  await mkdir(join(root, "models"));
  const raw = Buffer.from("glTF-cabin-" + "authored-source-".repeat(200));
  const gzip = gzipSync(raw);
  await writeFile(join(root, "models/cabin.glb"), raw);
  if (sidecar) await writeFile(join(root, "models/cabin.glb.gz"), gzip);
  await writeFile(
    join(root, "index.html"),
    "<h1>Exterior remains available</h1>",
  );
  await writeFile(join(root, "film.mp4"), "0123456789abcdef");
  const server = createAppServer(root); // Never listens or opens a socket.
  async function request(
    headers = {},
    method = "GET",
    url = "/models/cabin.glb",
  ) {
    const chunks = [],
      result = { headers: {}, status: null };
    const response = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    response.setHeader = (key, value) => {
      result.headers[key.toLowerCase()] = String(value);
    };
    response.writeHead = (status, values = {}) => {
      result.status = status;
      for (const [key, value] of Object.entries(values))
        response.setHeader(key, value);
    };
    const completed = new Promise((resolve, reject) => {
      response.on("finish", resolve);
      response.on("error", reject);
    });
    server.emit("request", { method, url, headers }, response);
    await completed;
    return { ...result, body: Buffer.concat(chunks) };
  }
  return { raw, gzip, request };
}
it("negotiates a verified precompressed GLB representation without changing decoded model identity", async () => {
  const f = await fixture(),
    response = await f.request({ "accept-encoding": "gzip, br" });
  expect(response.status).toBe(200);
  expect(response.headers["content-encoding"]).toBe("gzip");
  expect(response.headers["content-length"]).toBe(String(f.gzip.length));
  expect(response.headers.vary).toBe("Accept-Encoding");
  expect(response.headers["content-type"]).toBe("model/gltf-binary");
  expect(response.headers["cache-control"]).toBe("public,max-age=3600");
  expect(response.body).toEqual(f.gzip);
  expect(gunzipSync(response.body)).toEqual(f.raw);
});
it.each([
  undefined,
  "identity",
  "gzip;q=0",
  "br",
  "gzip;q=0, *;q=1",
  "gzip;q=.5, identity;q=1",
  "gzip;q=invalid",
])(
  "keeps identity for an absent, forbidden or less preferred gzip encoding: %s",
  async (encoding) => {
    const f = await fixture(),
      response = await f.request(
        encoding ? { "accept-encoding": encoding } : {},
      );
    expect(response.status).toBe(200);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.body).toEqual(f.raw);
    expect(response.headers.vary).toBe("Accept-Encoding");
  },
);
it.each([
  "GZip",
  "br;q=1, gzip;q=0.8, identity;q=0.2",
  "*;q=1",
  "gzip;q=1, identity;q=0",
])("honors acceptable encoding quality and case: %s", async (encoding) => {
  const f = await fixture(),
    response = await f.request({ "accept-encoding": encoding });
  expect(response.headers["content-encoding"]).toBe("gzip");
});
it("serves compressed HEAD metadata without a body", async () => {
  const f = await fixture(),
    response = await f.request({ "accept-encoding": "gzip" }, "HEAD");
  expect(response.status).toBe(200);
  expect(response.headers["content-encoding"]).toBe("gzip");
  expect(response.headers["content-length"]).toBe(String(f.gzip.length));
  expect(response.body.length).toBe(0);
});
it.each(["GET", "HEAD"])(
  "keeps %s byte ranges in the original identity representation",
  async (method) => {
    const f = await fixture(),
      response = await f.request(
        { "accept-encoding": "gzip", range: "bytes=2-8" },
        method,
      );
    expect(response.status).toBe(206);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.headers["content-range"]).toBe(`bytes 2-8/${f.raw.length}`);
    expect(response.headers["content-length"]).toBe("7");
    expect(response.body).toEqual(
      method === "HEAD" ? Buffer.alloc(0) : f.raw.subarray(2, 9),
    );
  },
);
it("preserves malformed range rejection and film seeking", async () => {
  const f = await fixture(),
    bad = await f.request({ "accept-encoding": "gzip", range: "bytes=99999-" });
  expect(bad.status).toBe(416);
  expect(bad.headers["content-range"]).toBe(`bytes */${f.raw.length}`);
  const film = await f.request(
    { "accept-encoding": "gzip", range: "bytes=-4" },
    "GET",
    "/film.mp4",
  );
  expect(film.status).toBe(206);
  expect(film.headers["content-encoding"]).toBeUndefined();
  expect(film.body.toString()).toBe("cdef");
});
it("falls back when no gzip sidecar is present", async () => {
  const f = await fixture({ sidecar: false }),
    response = await f.request({ "accept-encoding": "gzip" });
  expect(response.status).toBe(200);
  expect(response.body).toEqual(f.raw);
});
it.each([
  [{ "accept-encoding": "gzip;q=0, identity;q=0" }, true],
  [{ "accept-encoding": "*;q=0" }, true],
  [{ "accept-encoding": "gzip, identity;q=0", range: "bytes=1-2" }, true],
  [{ "accept-encoding": "gzip, identity;q=0" }, false],
])(
  "does not send a representation the client forbids: %j",
  async (headers, sidecar) => {
    const f = await fixture({ sidecar }),
      response = await f.request(headers);
    expect(response.status).toBe(406);
    expect(response.body.length).toBe(0);
  },
);
