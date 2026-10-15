import { useAuth, type RemoteDefinition, type ShellManifest } from "@databix/sdk";
import { Alert, Button, EmptyState, Page, Skeleton, Stack } from "@databix/ui";
import { loadRemote } from "@module-federation/runtime";
import { Compass, ShieldAlert } from "lucide-react";
import { Component, lazy, Suspense, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from "react";
import { Link, useLocation } from "react-router";

const cache = new Map<string, LazyExoticComponent<ComponentType>>();

function remoteApp(name: string): LazyExoticComponent<ComponentType> {
  let component = cache.get(name);
  if (!component) {
    component = lazy(async () => {
      const module = await loadRemote<{ default: ComponentType }>(`${name}/App`);
      if (!module?.default) throw new Error(`Remote "${name}" did not expose ./App`);
      return module;
    });
    cache.set(name, component);
  }
  return component;
}

export const matchRemote = (remotes: RemoteDefinition[], pathname: string) =>
  remotes.find((remote) => remote.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`)));

/** Isolates a failing remote: the shell and other sections keep working. */
class RemoteBoundary extends Component<{ name: string; onRetry: () => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(`Remote "${this.props.name}" failed`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Page>
        <Alert
          tone="critical"
          title="This section could not be loaded"
          action={
            <Button
              size="sm"
              onClick={() => {
                cache.delete(this.props.name);
                this.setState({ error: null });
                this.props.onRetry();
              }}
            >
              Try again
            </Button>
          }
        >
          The “{this.props.name}” module is unavailable right now. Other sections still work.
        </Alert>
      </Page>
    );
  }
}

function PageSkeleton() {
  return (
    <Page aria-busy>
      <Stack gap={10}>
        <Skeleton width={180} height={14} />
        <Skeleton width={320} height={26} />
      </Stack>
      <div className="dbx-grid dbx-grid--kpi">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={112} style={{ borderRadius: "var(--dbx-radius-lg)" }} />
        ))}
      </div>
      <Skeleton height={320} style={{ borderRadius: "var(--dbx-radius-lg)" }} />
    </Page>
  );
}

export function RemoteOutlet({ manifest }: { manifest: ShellManifest }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const remote = matchRemote(manifest.remotes, pathname);

  if (!remote) {
    return (
      <Page>
        <EmptyState icon={Compass} title="Page not found" action={<Link to="/overview">Go to the overview</Link>}>
          There is nothing at {pathname}.
        </EmptyState>
      </Page>
    );
  }
  if (remote.adminOnly && !user?.is_admin) {
    return (
      <Page>
        <EmptyState icon={ShieldAlert} title="Administrators only">
          Ask an administrator if you need access to this section.
        </EmptyState>
      </Page>
    );
  }
  const RemoteApp = remoteApp(remote.name);
  return (
    <RemoteBoundary key={`${remote.name}-${attempt}`} name={remote.name} onRetry={() => setAttempt((value) => value + 1)}>
      <Suspense fallback={<PageSkeleton />}>
        <RemoteApp />
      </Suspense>
    </RemoteBoundary>
  );
}
