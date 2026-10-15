import { DateRangeProvider, BrandingProvider, useAuth, type ShellManifest } from "@databix/sdk";
import { Spinner, ToastProvider } from "@databix/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";

import { AppLayout } from "./layout/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { RemoteOutlet } from "./remotes/RemoteOutlet";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Client errors (4xx) will not succeed on retry.
      retry: (count, error) => {
        const status = (error as { status?: number }).status ?? 0;
        return status >= 500 || status === 0 ? count < 2 : false;
      },
    },
  },
});

function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spinner label="Restoring your session" />
      </div>
    );
  }
  if (status === "anonymous") {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}

export function App({ manifest }: { manifest: ShellManifest }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrandingProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <DateRangeProvider>
                      <AppLayout manifest={manifest} />
                    </DateRangeProvider>
                  </RequireAuth>
                }
              >
                <Route index element={<Navigate to="/overview" replace />} />
                <Route path="*" element={<RemoteOutlet manifest={manifest} />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}
