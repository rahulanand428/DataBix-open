import "@databix/ui/styles.css";

import { BrandingProvider, DateRangeProvider, LoginError, useAuth } from "@databix/sdk";
import { Alert, Button, Field, Input, Spinner, ToastProvider } from "@databix/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ComponentType, type FormEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

function Gate({ children }: { children: ReactNode }) {
  const { status, login, user, logout } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (status === "loading") return <Spinner />;
  if (status === "anonymous") {
    const submit = async (event: FormEvent) => {
      event.preventDefault();
      try {
        await login(username, password);
      } catch (caught) {
        setError(caught instanceof LoginError ? caught.message : "Sign-in failed");
      }
    };
    return (
      <form onSubmit={submit} className="dbx-page" style={{ maxWidth: 380 }}>
        <h1>Remote dev host</h1>
        {error && <Alert tone="critical">{error}</Alert>}
        <Field label="Username" htmlFor="devhost-username">
          <Input id="devhost-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </Field>
        <Field label="Password" htmlFor="devhost-password">
          <Input id="devhost-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <Button type="submit" variant="primary">Sign in</Button>
      </form>
    );
  }
  return (
    <>
      <div className="dbx-topbar" style={{ position: "static" }}>
        <strong>Standalone remote</strong>
        <span className="dbx-spacer" />
        <span className="dbx-muted">{user?.username}</span>
        <Button size="sm" onClick={() => void logout()}>Sign out</Button>
      </div>
      {children}
    </>
  );
}

/**
 * Mount a remote's App with the same providers the shell supplies. The dev
 * server serves the remote under its base path (e.g. /mfe/symbols/), so the
 * router uses it as basename and "/" redirects to the remote's home route.
 */
export function mountStandalone(App: ComponentType, { home, base }: { home: string; base: string }) {
  const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={client}>
      <BrandingProvider>
        <ToastProvider>
          <BrowserRouter basename={base.replace(/\/$/, "")}>
            <DateRangeProvider>
              <Gate>
                <Routes>
                  <Route path="/" element={<Navigate to={home} replace />} />
                  <Route path="*" element={<App />} />
                </Routes>
              </Gate>
            </DateRangeProvider>
          </BrowserRouter>
        </ToastProvider>
      </BrandingProvider>
    </QueryClientProvider>,
  );
}
