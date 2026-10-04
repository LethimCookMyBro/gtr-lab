import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error Build-only JavaScript asset preparer has no declaration file.
import { validateManifest, validateAsset } from "./scripts/fetch-surfaces.mjs";

const root = fileURLToPath(new URL("./", import.meta.url));
const surfacePaths = new Set([
  ...[
    "garage_floor",
    "concrete_wall_008",
    "asphalt_pit_lane",
    "aerial_rocks_02",
  ].flatMap((id) =>
    ["diff", "rough", "nor_gl"].map(
      (map) => `/environments/${id}_${map}_1k.jpg`,
    ),
  ),
  "/environments/aerial_rocks_02_disp_1k.jpg",
]);

/** Keep the fixture independent of catalog assets and deliberately missing the sky HDR. */
export async function copyRendererQaSurfaces(
  source: string,
  destination: string,
) {
  const manifest: { path: string; bytes: number; sha256: string }[] =
    validateManifest(
      JSON.parse(await readFile(join(source, "surfaces.json"), "utf8")),
    );
  if (
    manifest.length !== surfacePaths.size ||
    manifest.some((entry) => !surfacePaths.has(entry.path))
  )
    throw new Error(
      "Invalid renderer QA surface manifest: expected the 13 venue JPG maps only",
    );
  // Validate every input before publishing any. Never glob/copy the public directory:
  // that would accidentally include real catalog models or defeat missing-HDR tests.
  const verified = await Promise.all(
    manifest.map(async (entry) => {
      const filename = basename(entry.path);
      const path = join(source, filename);
      if (!(await lstat(path)).isFile())
        throw new Error(`Refusing non-regular surface file: ${path}`);
      const bytes = await readFile(path);
      validateAsset(bytes, entry);
      return { filename, bytes };
    }),
  );
  await mkdir(destination, { recursive: true });
  await Promise.all(
    verified.map(({ filename, bytes }) =>
      writeFile(join(destination, filename), bytes),
    ),
  );
}

export function rendererQaConfig(mode: string): UserConfig {
  if (mode !== "renderer-qa")
    throw new Error(
      "Renderer QA requires explicit --mode renderer-qa; it is not a production entrypoint.",
    );
  return {
    root: fileURLToPath(new URL("./qa/renderer", import.meta.url)),
    publicDir: false,
    plugins: [
      react(),
      {
        name: "renderer-qa-surface-assets",
        apply: "build",
        async writeBundle() {
          await copyRendererQaSurfaces(
            join(root, "public/environments"),
            join(root, "qa-dist/environments"),
          );
        },
      },
    ],
    server: { host: "127.0.0.1", port: 4174, strictPort: true },
    preview: { host: "127.0.0.1", port: 4174, strictPort: true },
    build: {
      outDir: fileURLToPath(new URL("./qa-dist", import.meta.url)),
      emptyOutDir: true,
      rollupOptions: {
        input: fileURLToPath(
          new URL("./qa/renderer/index.html", import.meta.url),
        ),
      },
    },
  };
}
export default defineConfig(({ mode }) => rendererQaConfig(mode));
