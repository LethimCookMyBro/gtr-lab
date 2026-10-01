import http from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { pipeline } from "node:stream";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".glb": "model/gltf-binary",
  ".hdr": "application/octet-stream",
  ".woff2": "font/woff2",
};
// ImageBitmapLoader fetches temporary blob URLs created from embedded GLB textures.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
/** One bounded byte range; browsers use these for film metadata and seeking. */
function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if (
    [first, last].some(
      (value) => value !== undefined && !Number.isSafeInteger(value),
    )
  )
    return null;
  if (first === undefined) {
    if (!last || last <= 0) return null;
    return { start: Math.max(0, size - last), end: size - 1 };
  }
  if (first >= size || (last !== undefined && last < first)) return null;
  return { start: first, end: Math.min(last ?? size - 1, size - 1) };
}
export function createAppServer(directory = resolve("dist")) {
  const root = resolve(directory);
  return http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Content-Security-Policy", CSP);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    try {
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let file = resolve(root, "." + path);
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let info;
      try {
        info = await stat(file);
        if (!info.isFile()) throw new Error("not file");
      } catch {
        if (extname(path)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        file = resolve(root, "index.html");
        info = await stat(file);
      }
      const extension = extname(file);
      const rangeHeader = req.headers.range;
      const range = rangeHeader ? byteRange(rangeHeader, info.size) : undefined;
      if (rangeHeader && !range) {
        res.writeHead(416, {
          "Content-Range": `bytes */${info.size}`,
          "Accept-Ranges": "bytes",
        });
        res.end();
        return;
      }
      res.writeHead(range ? 206 : 200, {
        "Content-Type": MIME[extension] || "application/octet-stream",
        "Content-Length": range ? range.end - range.start + 1 : info.size,
        "Accept-Ranges": "bytes",
        ...(range
          ? {
              "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
            }
          : {}),
        "Cache-Control":
          extension === ".html"
            ? "no-cache"
            : file.includes(sep + "assets" + sep)
              ? "public,max-age=31536000,immutable"
              : "public,max-age=3600",
      });
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      pipeline(createReadStream(file, range || undefined), res, (error) => {
        if (error && !res.destroyed) res.destroy(error);
      });
    } catch {
      if (!res.headersSent) res.writeHead(400);
      res.end("Bad request");
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  createAppServer().listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
    console.log("GT-R LAB ready"),
  );
}
