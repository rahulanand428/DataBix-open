import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, unwrap } from "../api/client";
import { applyBranding, DEFAULT_BRANDING, type Branding } from "./apply";
import type { Mode } from "./color";

type ThemePreference = "system" | "light" | "dark";
type ThemeApi = { preference: ThemePreference; mode: Mode; setPreference: (preference: ThemePreference) => void };
type BrandingApi = { branding: Branding; loading: boolean };

const STORAGE_KEY = "dbx-theme";
const BrandingContext = createContext<BrandingApi>({ branding: DEFAULT_BRANDING, loading: true });
const ThemeContext = createContext<ThemeApi>({ preference: "system", mode: "light", setPreference: () => undefined });

const readStored = (): ThemePreference | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : null;
  } catch {
    return null;
  }
};

const systemMode = (): Mode =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

/**
 * Loads the public branding, resolves light/dark mode (the viewer's choice,
 * else the brand default, else the OS), and stamps both onto <html>.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["branding"],
    queryFn: async () => unwrap(await api.GET("/api/v1/branding")),
    staleTime: 60_000,
    retry: 1,
  });
  const branding = query.data ?? DEFAULT_BRANDING;

  const [stored, setStored] = useState<ThemePreference | null>(readStored);
  const [system, setSystem] = useState<Mode>(systemMode);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystem(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const preference: ThemePreference = stored ?? (branding.default_theme as ThemePreference) ?? "system";
  const mode: Mode = preference === "system" ? system : preference;

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    applyBranding(branding, mode);
  }, [branding, mode]);

  const setPreference = useCallback((next: ThemePreference) => {
    setStored(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable: keep the choice for this page only */
    }
  }, []);

  const theme = useMemo(() => ({ preference, mode, setPreference }), [preference, mode, setPreference]);
  const brandingValue = useMemo(() => ({ branding, loading: query.isLoading }), [branding, query.isLoading]);

  return (
    <BrandingContext.Provider value={brandingValue}>
      <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
export const useTheme = () => useContext(ThemeContext);
