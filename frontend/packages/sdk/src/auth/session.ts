/**
 * Browser session: the access token lives only in memory (never localStorage),
 * and the HttpOnly refresh cookie restores it after a reload. Refreshes are
 * single-flight within a tab and serialised across tabs with the Web Locks
 * API, so concurrent tabs never present the same rotated cookie twice.
 */

export type SessionUser = {
  id: number;
  username: string;
  is_admin: boolean;
  is_active: boolean;
};

export type SessionState =
  | { status: "loading"; user: null; accessToken: null; expiresAt: null }
  | { status: "anonymous"; user: null; accessToken: null; expiresAt: null }
  | { status: "authenticated"; user: SessionUser; accessToken: string; expiresAt: number };

type TokenResponse = { access_token: string; expires_in: number };

const CSRF_HEADERS = { "X-Requested-With": "databix" };
const REFRESH_LEAD_MS = 60_000;

export class LoginError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

class Session {
  private state: SessionState = { status: "loading", user: null, accessToken: null, expiresAt: null };
  private listeners = new Set<() => void>();
  private inflight: Promise<boolean> | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  getState = (): SessionState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  get token(): string | null {
    return this.state.accessToken;
  }

  private set(next: SessionState) {
    this.state = next;
    clearTimeout(this.timer);
    if (next.status === "authenticated") {
      const delay = Math.max(5_000, next.expiresAt - Date.now() - REFRESH_LEAD_MS);
      this.timer = setTimeout(() => void this.refresh(), delay);
    }
    this.listeners.forEach((listener) => listener());
  }

  private signOutLocally() {
    this.set({ status: "anonymous", user: null, accessToken: null, expiresAt: null });
  }

  private async adopt(token: TokenResponse): Promise<boolean> {
    const response = await fetch("/api/v1/users/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!response.ok) return false;
    const user = (await response.json()) as SessionUser;
    this.set({
      status: "authenticated",
      user,
      accessToken: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    });
    return true;
  }

  /** Restore a session from the refresh cookie (page load). */
  async bootstrap(): Promise<void> {
    if (!(await this.refresh())) this.signOutLocally();
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch("/api/v1/auth/token", {
      method: "POST",
      credentials: "same-origin",
      // The header asks for the refresh cookie; cross-site forms cannot send it.
      headers: CSRF_HEADERS,
      body: new URLSearchParams({ username, password }),
    });
    if (!response.ok) {
      const message =
        response.status === 401
          ? "Incorrect username or password."
          : response.status === 429
            ? "Too many sign-in attempts. Wait a minute and try again."
            : "Sign-in failed. Try again.";
      throw new LoginError(message, response.status);
    }
    if (!(await this.adopt((await response.json()) as TokenResponse))) {
      throw new LoginError("Sign-in failed. Try again.", 500);
    }
  }

  refresh(): Promise<boolean> {
    if (!this.inflight) {
      const run = async () => {
        try {
          const response = await fetch("/api/v1/auth/refresh", {
            method: "POST",
            credentials: "same-origin",
            headers: CSRF_HEADERS,
          });
          if (!response.ok) {
            if (response.status === 401 || response.status === 403) this.signOutLocally();
            return false;
          }
          return await this.adopt((await response.json()) as TokenResponse);
        } catch {
          return false;
        }
      };
      const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
      const pending = (locks ? locks.request("databix-refresh", run).then((result) => result) : run()).finally(() => {
        this.inflight = null;
      });
      this.inflight = pending;
      return pending;
    }
    return this.inflight;
  }

  async logout(): Promise<void> {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: CSRF_HEADERS,
      });
    } finally {
      this.signOutLocally();
    }
  }
}

export const session = new Session();
