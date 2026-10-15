import { useAdminMutations, useIngestions, useSources } from "@databix/sdk";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  EmptyState,
  Page,
  PageHeader,
  formatBytes,
  formatDateTime,
  formatDuration,
  formatInteger,
  formatRelative,
  useToast,
} from "@databix/ui";
import { FileSpreadsheet, History, Play } from "lucide-react";
import { useState } from "react";

import { AdminTabs } from "./AdminTabs";
import { RunStatus } from "./status";

export function IngestionPage() {
  const sources = useSources();
  const history = useIngestions(25);
  const { runIngestion } = useAdminMutations();
  const toast = useToast();
  const [confirming, setConfirming] = useState<string | null>(null);

  const run = async () => {
    const filename = confirming;
    setConfirming(null);
    if (!filename) return;
    try {
      const result = await runIngestion.mutateAsync(filename);
      toast.show(
        `${result.source_file}: ${formatInteger(result.postgres_rows)} new rows (${formatInteger(result.mongo_rows)} read, ${formatInteger(result.skipped_rows)} skipped).`,
        "good",
      );
    } catch (error) {
      toast.show((error as Error).message, "critical");
    } finally {
      void history.refetch();
      void sources.refetch();
    }
  };

  return (
    <Page>
      <PageHeader title="Administration" description="Load exchange files from the server's datafiles folder. Re-running a file is safe: rows already loaded are skipped." />
      <AdminTabs />
      {runIngestion.isPending && <Alert tone="info" title="Ingestion running">Large files can take a minute. You can keep working; other people's requests are not blocked.</Alert>}
      <Card
        title="Source files"
        subtitle="CSV files in the server's datafiles folder"
        flush
        footer="Rows are de-duplicated per file, not per trade: ingesting two files whose dates overlap counts the overlapping trades twice."
      >
        <DataTable
          caption="Source files"
          loading={sources.isLoading}
          rows={sources.data?.items}
          rowKey={(row) => row.filename}
          empty={<EmptyState icon={FileSpreadsheet} title="No CSV files found">Copy exchange files into the datafiles folder on the server.</EmptyState>}
          columns={[
            {
              key: "file",
              header: "File",
              cell: (row) => (
                <span className="dbx-row" style={{ ["--dbx-gap" as string]: "8px" }}>
                  <FileSpreadsheet size={16} aria-hidden className="dbx-muted" />
                  <span className="dbx-mono">{row.filename}</span>
                  {row.is_default && <Badge>Default</Badge>}
                </span>
              ),
            },
            { key: "size", header: "Size", numeric: true, cell: (row) => formatBytes(row.size_bytes) },
            { key: "modified", header: "Modified", cell: (row) => formatRelative(row.modified_at) },
            { key: "last", header: "Last run", cell: (row) => (row.last_run ? <RunStatus status={row.last_run.status} /> : <span className="dbx-muted">Never</span>) },
            {
              key: "action",
              header: <span className="dbx-sr-only">Action</span>,
              cell: (row) => (
                <Button size="sm" icon={Play} onClick={() => setConfirming(row.filename)} disabled={runIngestion.isPending}>
                  Ingest
                </Button>
              ),
            },
          ]}
        />
      </Card>
      <Card title="Recent runs" flush>
        <DataTable
          compact
          caption="Recent ingestion runs"
          loading={history.isLoading}
          rows={history.data?.items}
          rowKey={(row) => row.id}
          empty={<EmptyState icon={History} title="No runs yet" />}
          columns={[
            { key: "status", header: "Status", cell: (row) => <RunStatus status={row.status} /> },
            { key: "file", header: "File", cell: (row) => <span className="dbx-mono">{row.filename}</span> },
            { key: "by", header: "Run by", cell: (row) => row.triggered_by },
            { key: "started", header: "Started", cell: (row) => <span title={formatDateTime(row.started_at)}>{formatRelative(row.started_at)}</span> },
            {
              key: "duration",
              header: "Duration",
              numeric: true,
              cell: (row) => (row.finished_at ? formatDuration(Date.parse(row.finished_at) - Date.parse(row.started_at)) : "—"),
            },
            { key: "rows", header: "New rows", numeric: true, cell: (row) => formatInteger(row.postgres_rows) },
            { key: "error", header: "Details", cell: (row) => <span className="dbx-muted">{row.error ?? `${formatInteger(row.skipped_rows)} skipped`}</span> },
          ]}
        />
      </Card>
      <Dialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="Ingest this file?"
        description={confirming ? `${confirming} will be read and any rows not already loaded will be added. Cached queries refresh afterwards.` : undefined}
        footer={
          <>
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button variant="primary" icon={Play} onClick={run}>Start ingestion</Button>
          </>
        }
      />
    </Page>
  );
}
