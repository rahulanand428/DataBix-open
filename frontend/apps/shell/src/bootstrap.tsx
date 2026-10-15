import "@databix/ui/styles.css";

import type { ShellManifest } from "@databix/sdk";
import { registerRemotes } from "@module-federation/runtime";
import { createRoot } from "react-dom/client";

import { App } from "./App";

// `vite dev` loads each remote from its own dev server (see remotes.dev.json).
const MANIFEST_URL = import.meta.env.VITE_REMOTES_URL ?? (import.meta.env.DEV ? "/remotes.dev.json" : "/remotes.json");

async function loadManifest(): Promise<ShellManifest> {
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-cache" });
    if (response.ok) return (await response.json()) as ShellManifest;
  } catch {
    /* fall through: the shell still renders and reports missing sections */
  }
  return { remotes: [], navigation: [] };
}

const manifest = await loadManifest();
registerRemotes(manifest.remotes.map(({ name, entry }) => ({ name, entry, type: "module" })));

createRoot(document.getElementById("root")!).render(<App manifest={manifest} />);
