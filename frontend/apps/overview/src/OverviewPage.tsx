import { RANGE_PRESETS, useDailyTotals, useDateRange, useRecords, useSummary, useTopSymbols } from "@databix/sdk";
import {
  Alert,
  BarList,
  Card,
  ChartCard,
  DataTable,
  Grid,
  Page,
  PageHeader,
  Sparkline,
  StatCard,
  TrendChart,
  formatCompact,
  formatDate,
  formatInteger,
  formatShortDate,
} from "@databix/ui";
import { CalendarDays, Gauge, Layers, TrendingDown } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router";

const DAY = 86_400_000;
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/** The period of equal length immediately before the selected range. */
function previousRange(from: string | null, to: string | null) {
  if (!from || !to) return { from: null, to: null };
  const length = Math.round((Date.parse(to) - Date.parse(from)) / DAY) + 1;
  const previousTo = shift(from, -1);
  return { from: shift(previousTo, -(length - 1)), to: previousTo };
}

const change = (current?: number, previous?: number) =>
  current === undefined || previous === undefined || previous === 0 ? null : ((current - previous) / previous) * 100;

export function OverviewPage() {
  const range = useDateRange();
  const navigate = useNavigate();
  const previous = previousRange(range.from, range.to);
  const summary = useSummary(range, range.ready);
  const prior = useSummary(previous, range.ready && Boolean(previous.from));
  const daily = useDailyTotals(range, range.ready);
  const top = useTopSymbols(range, 10, range.ready);
  const latestDay = useRecords(
    { from: range.latest, to: range.latest, sort: "-quantity", limit: 8, offset: 0 },
    Boolean(range.latest),
  );

  const presetLabel = RANGE_PRESETS.find((preset) => preset.id === range.preset)?.label ?? "Custom range";
  const span = range.from && range.to ? `${formatDate(range.from)} – ${formatDate(range.to)}` : "All available data";
  const trend = useMemo(
    () => (daily.data?.items ?? []).map((day) => ({ date: day.date, value: day.total_quantity })),
    [daily.data],
  );
  const s = summary.data;
  const hasComparison = Boolean(previous.from) && (prior.data?.trading_days ?? 0) > 0;
  const deltaLabel = hasComparison ? "vs previous period" : undefined;
  const busy = summary.isFetching && !summary.isLoading;

  if (summary.isError) {
    return (
      <Page>
        <Alert tone="critical" title="Could not load the overview">{summary.error.message}</Alert>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        eyebrow={`${presetLabel} · ${span}`}
        title="Overview"
        description="Short-selling activity reported to the National Stock Exchange, aggregated by day and symbol."
      />

      <Grid kpi>
        <StatCard
          label="Shares shorted"
          icon={TrendingDown}
          loading={summary.isLoading}
          value={formatCompact(s?.total_quantity)}
          delta={hasComparison ? change(s?.total_quantity, prior.data?.total_quantity) : undefined}
          deltaLabel={deltaLabel}
          trend={trend.length > 1 ? <Sparkline values={trend.slice(-30).map((point) => point.value)} width={180} label="Last 30 trading days" /> : null}
        />
        <StatCard
          label="Daily average"
          icon={Gauge}
          loading={summary.isLoading}
          value={formatCompact(s?.average_daily_quantity)}
          delta={hasComparison ? change(s?.average_daily_quantity, prior.data?.average_daily_quantity) : undefined}
          deltaLabel={deltaLabel}
          hint={!hasComparison ? "shares per trading day" : undefined}
        />
        <StatCard
          label="Symbols shorted"
          icon={Layers}
          loading={summary.isLoading}
          value={formatInteger(s?.symbols)}
          hint={s ? `${formatInteger(s.records)} reported trades` : undefined}
        />
        <StatCard
          label="Busiest day"
          icon={CalendarDays}
          loading={summary.isLoading}
          value={s?.peak_day ? formatCompact(s.peak_day.total_quantity) : "—"}
          hint={s?.peak_day ? `shares on ${formatDate(s.peak_day.date)}` : "No trading days in range"}
        />
      </Grid>

      <ChartCard
        title="Shares shorted per day"
        subtitle={`${formatInteger(s?.trading_days)} trading days`}
        table={{
          rows: daily.data?.items,
          rowKey: (row) => row.date,
          columns: [
            { key: "date", header: "Date", cell: (row) => formatDate(row.date) },
            { key: "qty", header: "Shares shorted", numeric: true, cell: (row) => formatInteger(row.total_quantity) },
            { key: "symbols", header: "Symbols", numeric: true, cell: (row) => formatInteger(row.symbols) },
          ],
        }}
      >
        <TrendChart data={trend} seriesName="Shares shorted" busy={daily.isFetching && !daily.isLoading} />
      </ChartCard>

      <Grid columns={2}>
        <ChartCard
          title="Most-shorted symbols"
          subtitle="Total shares shorted in the selected range"
          table={{
            rows: top.data?.items,
            rowKey: (row) => row.symbol,
            columns: [
              { key: "symbol", header: "Symbol", cell: (row) => <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link> },
              { key: "name", header: "Security", cell: (row) => row.security_name },
              { key: "qty", header: "Shares", numeric: true, cell: (row) => formatInteger(row.total_quantity) },
              { key: "days", header: "Days", numeric: true, cell: (row) => formatInteger(row.trading_days) },
            ],
          }}
        >
          <BarList
            busy={busy}
            items={(top.data?.items ?? []).map((item) => ({
              key: item.symbol,
              label: item.symbol,
              sublabel: item.security_name,
              value: item.total_quantity,
            }))}
            onSelect={(item) => navigate(`/symbols/${encodeURIComponent(item.key)}`)}
          />
        </ChartCard>

        <Card
          title="Largest short sales on the latest day"
          subtitle={range.latest ? formatDate(range.latest) : undefined}
          actions={<Link to={`/explorer?range=custom&from=${range.latest ?? ""}&to=${range.latest ?? ""}&sort=-quantity`}>Open in explorer</Link>}
          flush
        >
          <DataTable
            compact
            loading={latestDay.isLoading}
            rows={latestDay.data?.items}
            rowKey={(row) => row.id}
            caption="Largest short sales on the latest trading day"
            columns={[
              { key: "symbol", header: "Symbol", cell: (row) => <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link> },
              { key: "name", header: "Security", cell: (row) => <span className="dbx-secondary">{row.security_name}</span> },
              { key: "qty", header: "Shares", numeric: true, cell: (row) => formatInteger(row.quantity) },
            ]}
          />
          {latestDay.data && (
            <div className="dbx-card__footer">
              {formatInteger(latestDay.data.total)} trades reported on {formatShortDate(range.latest)}
            </div>
          )}
        </Card>
      </Grid>
    </Page>
  );
}
