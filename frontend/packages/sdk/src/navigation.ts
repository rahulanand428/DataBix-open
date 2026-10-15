/**
 * Post-login destination from an untrusted ?next= value: only a path on this
 * origin, never another site. Parsing with URL (rather than prefix checks)
 * also catches tricks like "/\\evil.example" or "/%09/evil.example".
 */
export function safeRedirectPath(value: string | null | undefined, origin: string, fallback = "/overview"): string {
  if (!value || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return fallback;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Routers decode the path before navigating, so judge the decoded form:
    // "/%09/evil.example" decodes to a tab and then reads as "//evil.example".
    const decoded = decodeURIComponent(url.pathname);
    if (/[\u0000-\u001f\u007f\\]/.test(decoded) || decoded.startsWith("//")) return fallback;
    return path.startsWith("//") || url.pathname.startsWith("/login") ? fallback : path;
  } catch {
    return fallback;
  }
}
