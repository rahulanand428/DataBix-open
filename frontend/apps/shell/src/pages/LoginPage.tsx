import { LoginError, safeRedirectPath, useAuth, useBranding } from "@databix/sdk";
import { Alert, Button, Field, Input } from "@databix/ui";
import { Bell, ChartLine, LogIn, Sparkles } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";

import { BrandLockup } from "../layout/BrandMark";

export function LoginPage() {
  const { status, login } = useAuth();
  const { branding } = useBranding();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const next = safeRedirectPath(params.get("next"), window.location.origin);

  useEffect(() => {
    document.title = `Sign in · ${branding.product_name}`;
  }, [branding.product_name]);

  if (status === "authenticated") return <Navigate to={next} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate(next, { replace: true });
    } catch (caught) {
      setError(caught instanceof LoginError ? caught.message : "Sign-in failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dbx-login">
      <aside className="dbx-login__aside">
        <div className="dbx-sidebar__brand" style={{ padding: 0 }}>
          <BrandLockup />
        </div>
        <div className="dbx-login__headline">{branding.login_headline}</div>
        <div className="dbx-login__points">
          <div>
            <ChartLine aria-hidden /> Daily NSE short-selling volumes, by symbol and day
          </div>
          <div>
            <Bell aria-hidden /> Watchlists that flag unusual shorting
          </div>
          <div>
            <Sparkles aria-hidden /> Ask questions in plain English
          </div>
        </div>
        <div className="dbx-sidebar__tagline">{branding.footer_text || branding.tagline}</div>
      </aside>
      <main className="dbx-login__panel">
        <form className="dbx-login__form" onSubmit={submit} noValidate>
          <div className="dbx-stack" style={{ ["--dbx-gap" as string]: "6px" }}>
            <h1>Sign in</h1>
            <p className="dbx-secondary">Use the account your administrator created for you.</p>
          </div>
          {error && <Alert tone="critical">{error}</Alert>}
          <Field label="Username" htmlFor="username">
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" icon={LogIn} loading={submitting} disabled={!username || !password} block>
            Sign in
          </Button>
          {branding.support_email && (
            <p className="dbx-muted" style={{ fontSize: 13 }}>
              Need access? Contact <a href={`mailto:${branding.support_email}`}>{branding.support_email}</a>
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
