import { federation } from "@module-federation/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { devServer, dropFromBuild, remoteBase, shared } from "../../mf.shared.mjs";

export default defineConfig({
  base: remoteBase("symbols"),
  plugins: [
    react(),
    dropFromBuild("index.html"),
    federation({
      name: "symbols",
      filename: "remoteEntry.js",
      exposes: { "./App": "./src/App.tsx" },
      shared,
      dts: false,
    }),
  ],
  server: devServer(5176),
  build: { target: "es2022", chunkSizeWarningLimit: 700 },
});
