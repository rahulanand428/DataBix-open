import { useAlerts, useWatchlist, useWatchlistMutations } from "@databix/sdk";
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Input,
  Page,
  PageHeader,
  Select,
  Sparkline,
  formatDate,
  formatInteger,
  formatPercent,
  useToast,
} from "@databix/ui";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BellOff, Plus, Star, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";

const THRESHOLDS = [1.5, 2, 3, 5];
const WINDOWS = [7, 14, 30];

export function WatchlistPage() {
  const watchlist = useWatchlist();
  const [threshold, setThreshold] = useState(2);
  const [days, setDays] = useState(14);
  const alerts = useAlerts(days, threshold);
  const { add, remove } = useWatchlistMutations();
  const toast = useToast();
  const [draft, setDraft] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const symbol = draft.trim().toUpperCase();
    if (!symbol) return;
    try {
      await add.mutateAsync(symbol);
      toast.show(`${symbol} added to your watchlist`, "good");
      setDraft("");
    } catch (error) {
      toast.show((error as Error).message, "critical");
    }
  };

  const items = watchlist.data?.items ?? [];

  return (
    <Page>
      <PageHeader
        title="Watchlist"
        description="Symbols you follow, with their latest shorting against their usual level (the average of their previous 20 shorted days)."
      />
      <form className="dbx-filter-row" onSubmit={submit}>
        <Input placeholder="Add a symbol, e.g. INFY" aria-label="Symbol to watch" value={draft} onChange={(event) => setDraft(event.target.value)} style={{ width: 260 }} />
        <Button type="submit" icon={Plus} loading={add.isPending} disabled={!draft.trim()}>
          Add to watchlist
        </Button>
      </form>

      <Card flush title={`Watching ${items.length} symbol${items.length === 1 ? "" : "s"}`}>
        <DataTable
          caption="Watchlist"
          loading={watchlist.isLoading}
          rows={items}
          rowKey={(row) => row.symbol}
          empty={
            <EmptyState icon={Star} title="Your watchlist is empty">
              Add a symbol above, or use the star on any symbol.
            </EmptyState>
          }
          columns={[
            { key: "symbol", header: "Symbol", cell: (row) => <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link> },
            { key: "name", header: "Security", cell: (row) => <span className="dbx-secondary">{row.security_name}</span> },
            { key: "trend", header: "Last 30 shorted days", cell: (row) => <Sparkline values={row.sparkline} label={`${row.symbol} trend`} /> },
            { key: "last", header: "Last shorted", cell: (row) => formatDate(row.last_date) },
            { key: "qty", header: "Shares", numeric: true, cell: (row) => formatInteger(row.last_quantity) },
            { key: "usual", header: "Usual", numeric: true, cell: (row) => formatInteger(row.baseline_quantity) },
            {
              key: "change",
              header: "vs usual",
              numeric: true,
              cell: (row) =>
                row.change_pct == null ? (
                  "—"
                ) : (
                  <span className="dbx-row" style={{ ["--dbx-gap" as string]: "2px", justifyContent: "flex-end" }}>
                    {row.change_pct >= 0 ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
                    {formatPercent(row.change_pct)}
                  </span>
                ),
            },
            {
              key: "remove",
              header: <span className="dbx-sr-only">Remove</span>,
              width: 48,
              cell: (row) => (
                <Button variant="ghost" size="sm" iconOnly icon={Trash2} onClick={() => remove.mutate(row.symbol)}>
                  Remove {row.symbol}
                </Button>
              ),
            },
          ]}
        />
      </Card>

      <Card
        flush
        title="Spike alerts"
        subtitle="Days when a watched symbol was shorted far above its usual level"
        actions={
          <div className="dbx-row" style={{ ["--dbx-gap" as string]: "8px" }}>
            <Select aria-label="Threshold" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} style={{ width: 130 }}>
              {THRESHOLDS.map((value) => (
                <option key={value} value={value}>
                  ≥ {value}× usual
                </option>
              ))}
            </Select>
            <Select aria-label="Window" value={days} onChange={(event) => setDays(Number(event.target.value))} style={{ width: 130 }}>
              {WINDOWS.map((value) => (
                <option key={value} value={value}>
                  Last {value} days
                </option>
              ))}
            </Select>
          </div>
        }
      >
        <DataTable
          compact
          caption="Spike alerts"
          loading={alerts.isLoading}
          busy={alerts.isFetching && !alerts.isLoading}
          rows={alerts.data?.items}
          rowKey={(row) => `${row.symbol}-${row.date}`}
          empty={<EmptyState icon={BellOff} title="No spikes">Nothing on your watchlist crossed {threshold}× its usual level.</EmptyState>}
          columns={[
            { key: "date", header: "Date", cell: (row) => formatDate(row.date) },
            { key: "symbol", header: "Symbol", cell: (row) => <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link> },
            { key: "qty", header: "Shares", numeric: true, cell: (row) => formatInteger(row.quantity) },
            { key: "usual", header: "Usual", numeric: true, cell: (row) => formatInteger(row.baseline_quantity) },
            {
              key: "ratio",
              header: "Spike",
              numeric: true,
              cell: (row) => (
                <Badge tone={row.ratio >= 5 ? "critical" : "warning"} icon={AlertTriangle}>
                  {row.ratio.toFixed(1)}× usual
                </Badge>
              ),
            },
          ]}
        />
      </Card>
    </Page>
  );
}
