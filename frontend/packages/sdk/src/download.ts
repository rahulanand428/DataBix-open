import { authFetch } from "./api/client";

/** Download the CSV export for the current filters (authenticated, streamed by the API). */
export async function downloadExport(query: Record<string, string | null | undefined>): Promise<{ rows: number; truncated: boolean }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const response = await authFetch(new Request(`/api/v1/short-selling/export?${params}`));
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "short-selling.csv";
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return {
    rows: Number(response.headers.get("x-export-rows") ?? 0),
    truncated: response.headers.get("x-export-truncated") === "true",
  };
}
