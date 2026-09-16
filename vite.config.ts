import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

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
  plugins: [tailwindcss(), tanstackStart({ srcDirectory: "src" }), react(), nitro()],
});
