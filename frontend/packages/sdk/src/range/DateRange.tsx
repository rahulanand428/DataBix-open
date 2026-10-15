import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";

import { useCoverage } from "../hooks/queries";

export const RANGE_PRESETS = [
  { id: "1m", label: "Last month", months: 1 },
  { id: "3m", label: "Last 3 months", months: 3 },
  { id: "6m", label: "Last 6 months", months: 6 },
  { id: "1y", label: "Last 12 months", months: 12 },
  { id: "all", label: "All data", months: 0 },
] as const;

const DEFAULT_PRESET = "3m";
const RANGE_PARAMS = ["range", "from", "to"] as const;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export type DateRangeApi = {
  preset: string;
  /** Inclusive ISO dates; null means unbounded. */
  from: string | null;
  to: string | null;
  /** False until the data's latest date is known (presets are anchored to it). */
  ready: boolean;
  earliest: string | null;
  latest: string | null;
  setPreset: (preset: string) => void;
  setCustom: (from: string, to: string) => void;
  /** Current range as a query string, to carry it across pages. */
  search: string;
};

const RangeContext = createContext<DateRangeApi | null>(null);

const minusMonths = (iso: string, months: number): string => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

/**
 * One date range scopes every page (dataviz rule: one filter row, everything
 * below re-renders against the same slice). Presets are anchored to the latest
 * date in the data, not today, so "last 3 months" is never empty.
 */
export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const coverage = useCoverage();
  const latest = coverage.data?.latest_date ?? null;
  const earliest = coverage.data?.earliest_date ?? null;

  const rawFrom = params.get("from");
  const rawTo = params.get("to");
  const custom = params.get("range") === "custom" && rawFrom && rawTo && ISO.test(rawFrom) && ISO.test(rawTo) && rawFrom <= rawTo;
  const requested = params.get("range");
  const preset = custom
    ? "custom"
    : RANGE_PRESETS.some((option) => option.id === requested)
      ? (requested as string)
      : DEFAULT_PRESET;

  const value = useMemo<DateRangeApi>(() => {
    let from: string | null = null;
    let to: string | null = null;
    let ready = true;
    if (preset === "custom") {
      from = rawFrom;
      to = rawTo;
    } else if (preset !== "all") {
      const months = RANGE_PRESETS.find((option) => option.id === preset)?.months ?? 3;
      ready = Boolean(latest) || coverage.isError;
      if (latest) {
        to = latest;
        from = minusMonths(latest, months);
      }
    }
    const search = new URLSearchParams();
    if (preset === "custom" && from && to) {
      search.set("range", "custom");
      search.set("from", from);
      search.set("to", to);
    } else if (preset !== DEFAULT_PRESET) {
      search.set("range", preset);
    }
    return {
      preset,
      from,
      to,
      ready,
      earliest,
      latest,
      search: search.toString(),
      setPreset: () => undefined,
      setCustom: () => undefined,
    };
  }, [preset, rawFrom, rawTo, latest, earliest, coverage.isError]);

  const update = useCallback(
    (entries: Record<string, string | null>) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const key of RANGE_PARAMS) next.delete(key);
          for (const [key, entry] of Object.entries(entries)) if (entry) next.set(key, entry);
          // Ranged lists restart at the first page.
          next.delete("page");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const api = useMemo<DateRangeApi>(
    () => ({
      ...value,
      setPreset: (next) => update({ range: next === DEFAULT_PRESET ? null : next }),
      setCustom: (from, to) => update({ range: "custom", from, to }),
    }),
    [value, update],
  );

  return <RangeContext.Provider value={api}>{children}</RangeContext.Provider>;
}

export function useDateRange(): DateRangeApi {
  const context = useContext(RangeContext);
  if (!context) throw new Error("useDateRange must be used inside DateRangeProvider (provided by the shell)");
  return context;
}
