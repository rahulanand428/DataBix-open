import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";

import { session, type SessionState } from "./session";

let bootstrapped = false;

/** Session state for React; the first mount restores the session from the refresh cookie. */
export function useAuth() {
  const state: SessionState = useSyncExternalStore(session.subscribe, session.getState);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!bootstrapped) {
      bootstrapped = true;
      void session.bootstrap();
    }
  }, []);

  const login = useCallback((username: string, password: string) => session.login(username, password), []);
  const logout = useCallback(async () => {
    await session.logout();
    queryClient.clear();
  }, [queryClient]);

  return useMemo(() => ({ ...state, login, logout }), [state, login, logout]);
}
