import { useSystemStatus } from "@databix/sdk";
import { Alert, Card, Grid, KeyValue, Page, PageHeader, Skeleton, formatDate, formatDateTime, formatInteger, formatRelative } from "@databix/ui";
import { Database, HardDrive, Server, Zap, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

import { AdminTabs } from "./AdminTabs";
import { HealthBadge, RunStatus } from "./status";

const COMPONENTS: Record<string, { label: string; icon: LucideIcon; role: string }> = {
  api: { label: "API", icon: Server, role: "FastAPI service" },
  postgres: { label: "PostgreSQL", icon: Database, role: "Hot store: users and records" },
  redis: { label: "Redis", icon: Zap, role: "Query cache" },
  mongodb: { label: "MongoDB", icon: HardDrive, role: "Cold store: raw history" },
};

export function StatusPage() {
  const status = useSystemStatus();
  const data = status.data;
  const failing = data?.components.filter((component) => component.status !== "ok") ?? [];
  return (
    <Page>
      <PageHeader title="Administration" description="Service health, data freshness and recent ingestion." />
      <AdminTabs />
      {status.isError && <Alert tone="critical" title="Could not load status">{status.error.message}</Alert>}
      {failing.length > 0 && (
        <Alert tone="warning" title={`${failing.length} component${failing.length > 1 ? "s" : ""} unavailable`}>
          {failing.map((component) => COMPONENTS[component.name]?.label ?? component.name).join(", ")} did not respond. Cached and
          stored data may be stale until it recovers.
        </Alert>
      )}
      <Grid kpi>
        {(data?.components ?? Array.from({ length: 4 }, () => null)).map((component, index) =>
          component ? (
            <section key={component.name} className="dbx-card dbx-stat">
              {(() => {
                const meta = COMPONENTS[component.name] ?? { label: component.name, icon: Server, role: "" };
                const Icon = meta.icon;
                return (
                  <>
                    <div className="dbx-stat__label">
                      <Icon aria-hidden />
                      {meta.label}
                    </div>
                    <div><HealthBadge status={component.status} /></div>
                    <div className="dbx-stat__meta">
                      <span>{meta.role}</span>
                      <span className="dbx-num">
                        {component.status === "ok" ? `${component.latency_ms.toFixed(1)} ms` : component.detail ?? "error"}
                      </span>
                    </div>
                  </>
                );
              })()}
            </section>
          ) : (
            <Skeleton key={index} height={112} style={{ borderRadius: "var(--dbx-radius-lg)" }} />
          ),
        )}
      </Grid>
      <Grid columns={2}>
        <Card title="Data freshness">
          {data ? (
            <KeyValue
              items={[
                ["Latest trading day", data.latest_data_date ? `${formatDate(data.latest_data_date)} (${data.data_age_days} days ago)` : "No data yet"],
                ["Earliest trading day", formatDate(data.coverage?.earliest_date)],
                ["Records", formatInteger(data.coverage?.records)],
                ["Symbols", formatInteger(data.coverage?.symbols)],
              ]}
            />
          ) : (
            <Skeleton height={96} />
          )}
        </Card>
        <Card title="Last ingestion" actions={<Link to="/admin/ingestion">Manage ingestion</Link>}>
          {data?.last_ingestion ? (
            <KeyValue
              items={[
                ["Status", <RunStatus key="status" status={data.last_ingestion.status} />],
                ["File", <span key="file" className="dbx-mono">{data.last_ingestion.filename}</span>],
                ["Run by", data.last_ingestion.triggered_by],
                ["Started", `${formatDateTime(data.last_ingestion.started_at)} (${formatRelative(data.last_ingestion.started_at)})`],
                ["New rows", formatInteger(data.last_ingestion.postgres_rows)],
              ]}
            />
          ) : data ? (
            <p className="dbx-muted">No ingestion has run yet.</p>
          ) : (
            <Skeleton height={96} />
          )}
        </Card>
      </Grid>
      {data && (
        <p className="dbx-muted" style={{ fontSize: 12.5 }}>
          Version {data.version} · API up since {formatDateTime(data.started_at)} · checked {formatRelative(data.checked_at)}, refreshes every 30 seconds
        </p>
      )}
    </Page>
  );
}
