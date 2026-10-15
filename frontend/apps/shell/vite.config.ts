import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devServer, dropFromBuild, shared } from "../../mf.shared.mjs";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    dropFromBuild("remotes.dev.json"),
    federation({
      name: "shell",
      // Remotes are registered at runtime from /remotes.json.
      remotes: {},
      shared,
      dts: false,
    }),
  ],
  server: devServer(5173),
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
});
