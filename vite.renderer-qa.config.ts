import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import type { UserConfig } from "vite";
import react from "@vitejs/plugin-react";

export function rendererQaConfig(mode: string): UserConfig {
  if (mode !== "renderer-qa")
    throw new Error(
      "Renderer QA requires explicit --mode renderer-qa; it is not a production entrypoint.",
    );
  return {
    root: fileURLToPath(new URL("./qa/renderer", import.meta.url)),
    publicDir: false,
    plugins: [react()],
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
