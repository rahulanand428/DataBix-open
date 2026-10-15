import { rmSync } from "node:fs";
import { join } from "node:path";

// Module Federation settings shared by the shell and every remote.
// Libraries that hold React state or context must be singletons so the shell
// and remotes see the same router, query cache, auth session and theme.
const singleton = (requiredVersion) => ({ singleton: true, requiredVersion });

export const shared = {
  react: singleton("^19.2.0"),
  "react-dom": singleton("^19.2.0"),
  "react-router": singleton("^7.9.0"),
  "@tanstack/react-query": singleton("^5.90.0"),
  recharts: singleton("^3.2.0"),
  "@databix/sdk": singleton("^1.0.0"),
  "@databix/ui": singleton("^1.0.0"),
};

/** Base path a remote is served from, e.g. /mfe/overview/ */
export const remoteBase = (name) => `/mfe/${name}/`;

/** Local dev server: proxies the API so the browser stays same-origin. */
export const devServer = (port) => ({
  port,
  strictPort: true,
  proxy: {
    "/api": { target: process.env.DATABIX_API ?? "http://127.0.0.1:8000", changeOrigin: false },
  },
});

/**
 * Remove development-only files from a production build: a remote's
 * standalone index.html, the shell's dev manifest. Runs after the bundle is
 * written because Vite emits HTML late.
 */
export const dropFromBuild = (...files) => ({
  name: "databix-drop-from-build",
  apply: "build",
  enforce: "post",
  writeBundle(options) {
    for (const file of files) rmSync(join(options.dir, file), { force: true });
  },
});
