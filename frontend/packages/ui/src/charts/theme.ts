import { useEffect, useMemo, useState } from "react";

export type ChartTheme = {
  surface: string;
  grid: string;
  axis: string;
  axisText: string;
  ink: string;
  ink2: string;
  muted: string;
  accent: string;
  series: [string, string, string];
};

const read = (): ChartTheme => {
  const css = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    surface: value("--dbx-surface", "#fcfcfb"),
    grid: value("--dbx-chart-grid", "#e1e0d9"),
    axis: value("--dbx-chart-axis", "#c3c2b7"),
    axisText: value("--dbx-chart-axis-text", "#898781"),
    ink: value("--dbx-ink", "#0b0b0b"),
    ink2: value("--dbx-ink-2", "#52514e"),
    muted: value("--dbx-chart-muted", "#c3c2b7"),
    accent: value("--dbx-chart-1", "#2a78d6"),
    series: [
      value("--dbx-series-1", "#2a78d6"),
      value("--dbx-series-2", "#eb6834"),
      value("--dbx-series-3", "#1baf7a"),
    ],
  };
};

/**
 * SVG attributes need concrete colours, so resolve the CSS tokens and re-read
 * them whenever the mode or branding changes (both are stamped on <html>).
 */
export function useChartTheme(): ChartTheme {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((current) => current + 1));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode", "style", "data-sidebar"],
    });
    return () => observer.disconnect();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(read, [version]);
}
