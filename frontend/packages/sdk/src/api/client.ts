import createClient from "openapi-fetch";

import { session } from "../auth/session";
import type { paths } from "./schema";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const isAuthRequest = (url: string) => new URL(url, window.location.origin).pathname.startsWith("/api/v1/auth/");

const withToken = (request: Request): Request => {
  const token = session.token;
  if (!token) return request;
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(request, { headers });
};

/** fetch that attaches the access token and, on a 401, refreshes once and retries. */
export async function authFetch(input: Request): Promise<Response> {
  const retry = input.clone();
  const response = await fetch(withToken(input));
  if (response.status !== 401 || isAuthRequest(input.url) || !session.token) return response;
  if (!(await session.refresh())) return response;
  return fetch(withToken(retry));
}

export const api = createClient<paths>({ baseUrl: "", fetch: authFetch });

const detailOf = (error: unknown): string | null => {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0] && typeof detail[0] === "object" && "msg" in detail[0]) {
      return String((detail[0] as { msg: unknown }).msg).replace(/^Value error, /, "");
    }
  }
  return null;
};

/** Unwrap an openapi-fetch result, turning API errors into ApiError with the server's message. */
export function unwrap<T>(result: { data?: T; error?: unknown; response: Response }): T {
  if (result.error !== undefined || !result.response.ok) {
    const status = result.response.status;
    const message =
      detailOf(result.error) ??
      (status === 403 ? "You don't have access to this." : status === 429 ? "Too many requests; slow down a little." : `Request failed (${status}).`);
    throw new ApiError(message, status);
  }
  return result.data as T;
}
