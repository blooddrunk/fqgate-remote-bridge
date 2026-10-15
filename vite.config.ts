import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import process from "node:process";
import { isAbsolute } from "node:path";

const stagingDirectory = process.env.FQGATE_BRIDGE_BUILD_DIRECTORY;
if (stagingDirectory !== undefined && !isAbsolute(stagingDirectory))
  throw new Error("FQGATE_BRIDGE_BUILD_DIRECTORY must be an absolute output directory");

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 17282,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 17282,
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({ srcDirectory: "src" }),
    react(),
    nitro({
      ...(stagingDirectory === undefined ? {} : { output: { dir: stagingDirectory } }),
      errorHandler: "./server/error-handler.ts",
      plugins: ["./server/plugins/runtime.ts"],
    }),
  ],
});
