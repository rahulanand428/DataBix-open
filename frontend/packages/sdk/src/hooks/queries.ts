import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, unwrap } from "../api/client";
import type { components } from "../api/schema";

export type Schemas = components["schemas"];
type Range = { from: string | null; to: string | null };

const rangeQuery = ({ from, to }: Range) => ({
  ...(from ? { date_from: from } : {}),
  ...(to ? { date_to: to } : {}),
});

/* ---------- Short-selling analytics ---------- */

export const useCoverage = () =>
  useQuery({
    queryKey: ["coverage"],
    queryFn: async () => unwrap(await api.GET("/api/v1/short-selling/coverage")),
    staleTime: 5 * 60_000,
  });

export const useSummary = (range: Range, enabled = true) =>
  useQuery({
    queryKey: ["summary", range.from, range.to],
    queryFn: async () => unwrap(await api.GET("/api/v1/short-selling/summary", { params: { query: rangeQuery(range) } })),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useDailyTotals = (range: Range, enabled = true) =>
  useQuery({
    queryKey: ["daily-totals", range.from, range.to],
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/short-selling/daily-totals", { params: { query: rangeQuery(range) } })),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useTopSymbols = (range: Range, limit = 10, enabled = true) =>
  useQuery({
    queryKey: ["top-symbols", range.from, range.to, limit],
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/short-selling/top-symbols", { params: { query: { ...rangeQuery(range), limit } } })),
    placeholderData: keepPreviousData,
    enabled,
  });

export type SortOrder = "-date" | "date" | "symbol" | "-symbol" | "quantity" | "-quantity";
export type RecordFilters = Range & { symbol?: string | null; sort?: SortOrder; limit: number; offset: number };

export const useRecords = (filters: RecordFilters, enabled = true) =>
  useQuery({
    queryKey: ["records", filters],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/short-selling", {
          params: {
            query: {
              ...rangeQuery(filters),
              ...(filters.symbol ? { symbol: filters.symbol } : {}),
              sort: filters.sort ?? "-date",
              limit: filters.limit,
              offset: filters.offset,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSymbols = (q: string, limit = 20, offset = 0, enabled = true) =>
  useQuery({
    queryKey: ["symbols", q, limit, offset],
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/short-selling/symbols", { params: { query: { ...(q ? { q } : {}), limit, offset } } })),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useSymbolStats = (symbol: string | null | undefined) =>
  useQuery({
    queryKey: ["symbol-stats", symbol],
    queryFn: async () =>
      unwrap(await api.GET("/api/v1/short-selling/symbols/{symbol}", { params: { path: { symbol: symbol! } } })),
    enabled: Boolean(symbol),
    retry: (count, error) => (error as { status?: number }).status !== 404 && count < 2,
  });

export const useSymbolSeries = (symbol: string | null | undefined, range: Range, enabled = true) =>
  useQuery({
    queryKey: ["symbol-series", symbol, range.from, range.to],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/v1/short-selling/symbols/{symbol}/series", {
          params: { path: { symbol: symbol! }, query: rangeQuery(range) },
        }),
      ),
    enabled: Boolean(symbol) && enabled,
    placeholderData: keepPreviousData,
  });

/* ---------- Watchlist & alerts ---------- */

export const useWatchlist = () =>
  useQuery({ queryKey: ["watchlist"], queryFn: async () => unwrap(await api.GET("/api/v1/me/watchlist")) });

export const useAlerts = (days = 14, threshold = 2) =>
  useQuery({
    queryKey: ["alerts", days, threshold],
    queryFn: async () => unwrap(await api.GET("/api/v1/me/alerts", { params: { query: { days, threshold } } })),
    placeholderData: keepPreviousData,
  });

export function useWatchlistMutations() {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["watchlist"] });
    void client.invalidateQueries({ queryKey: ["alerts"] });
  };
  const add = useMutation({
    mutationFn: async (symbol: string) => unwrap(await api.POST("/api/v1/me/watchlist", { body: { symbol } })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: async (symbol: string) =>
      unwrap(await api.DELETE("/api/v1/me/watchlist/{symbol}", { params: { path: { symbol } } })),
    onSuccess: refresh,
  });
  return { add, remove };
}

/* ---------- Assistant ---------- */

export const useAssistantStatus = () =>
  useQuery({ queryKey: ["assistant-status"], queryFn: async () => unwrap(await api.GET("/api/v1/assistant/status")) });

export const useAskAssistant = () =>
  useMutation({
    mutationFn: async (body: Schemas["AskRequest"]) => unwrap(await api.POST("/api/v1/assistant/ask", { body })),
  });

/* ---------- Admin ---------- */

export const useSystemStatus = () =>
  useQuery({
    queryKey: ["admin", "status"],
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/status")),
    refetchInterval: 30_000,
  });

export const useSources = () =>
  useQuery({ queryKey: ["admin", "sources"], queryFn: async () => unwrap(await api.GET("/api/v1/admin/sources")) });

export const useIngestions = (limit = 50) =>
  useQuery({
    queryKey: ["admin", "ingestions", limit],
    queryFn: async () => unwrap(await api.GET("/api/v1/admin/ingestions", { params: { query: { limit } } })),
  });

/** Branding plus who changed it last (administrators only). */
export const useBrandingDetails = () =>
  useQuery({ queryKey: ["admin", "branding"], queryFn: async () => unwrap(await api.GET("/api/v1/admin/branding")) });

export const useUsers = () =>
  useQuery({ queryKey: ["admin", "users"], queryFn: async () => unwrap(await api.GET("/api/v1/admin/users")) });

export function useAdminMutations() {
  const client = useQueryClient();
  const invalidate = (...keys: string[][]) => keys.forEach((queryKey) => void client.invalidateQueries({ queryKey }));
  return {
    runIngestion: useMutation({
      mutationFn: async (filename: string | null) =>
        unwrap(await api.POST("/api/v1/short-selling/ingest", { params: { query: filename ? { filename } : {} } })),
      onSettled: () => {
        // New rows change every analytics view.
        void client.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "branding" });
      },
    }),
    createUser: useMutation({
      mutationFn: async (body: Schemas["AdminUserCreate"]) => unwrap(await api.POST("/api/v1/admin/users", { body })),
      onSuccess: () => invalidate(["admin", "users"]),
    }),
    updateUser: useMutation({
      mutationFn: async ({ id, ...body }: Schemas["AdminUserUpdate"] & { id: number }) =>
        unwrap(await api.PATCH("/api/v1/admin/users/{user_id}", { params: { path: { user_id: id } }, body })),
      onSuccess: () => invalidate(["admin", "users"]),
    }),
    resetPassword: useMutation({
      mutationFn: async ({ id, password }: { id: number; password: string }) =>
        unwrap(await api.POST("/api/v1/admin/users/{user_id}/password", { params: { path: { user_id: id } }, body: { password } })),
    }),
    saveBranding: useMutation({
      mutationFn: async (body: Schemas["BrandingConfig"]) => unwrap(await api.PUT("/api/v1/admin/branding", { body })),
      onSuccess: (data) => {
        client.setQueryData(["admin", "branding"], data);
        void client.invalidateQueries({ queryKey: ["branding"] });
      },
    }),
    resetBranding: useMutation({
      mutationFn: async () => unwrap(await api.DELETE("/api/v1/admin/branding")),
      onSuccess: (data) => {
        client.setQueryData(["admin", "branding"], data);
        void client.invalidateQueries({ queryKey: ["branding"] });
      },
    }),
  };
}
