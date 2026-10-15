/**
 * Contract between the shell and its remotes, served at runtime as
 * /remotes.json so remotes can be added or moved without rebuilding the shell.
 */
export type RemoteDefinition = {
  /** Module Federation name; the remote exposes "./App". */
  name: string;
  /** URL of the remote's remoteEntry.js. */
  entry: string;
  /** Path prefixes this remote renders (e.g. ["/symbols", "/watchlist"]). */
  routes: string[];
  /** Path prefixes where the global date-range filter applies (shown in the top bar). */
  rangeScoped?: string[];
  adminOnly?: boolean;
};

export type NavItem = {
  title: string;
  path: string;
  /** lucide icon name, kebab-case (e.g. "layout-dashboard"). */
  icon: string;
  adminOnly?: boolean;
  badge?: "alerts";
};

export type NavSection = { title: string; items: NavItem[] };

export type ShellManifest = { remotes: RemoteDefinition[]; navigation: NavSection[] };
