import { RANGE_PRESETS, useDailyTotals, useDateRange, useSymbolSeries, useSymbolStats } from "@databix/sdk";
import {
  Alert,
  Button,
  ChartCard,
  ColumnChart,
  EmptyState,
  Grid,
  Page,
  PageHeader,
  StatCard,
  formatCompact,
  formatDate,
  formatDecimal,
  formatInteger,
} from "@databix/ui";
import { CalendarRange, GitCompareArrows, Sigma, Table2, TrendingDown, Trophy } from "lucide-react";
import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { WatchButton } from "./WatchButton";

export function SymbolDetailPage() {
  const symbol = decodeURIComponent(useParams().symbol ?? "").toUpperCase();
  const range = useDateRange();
  const navigate = useNavigate();
  const stats = useSymbolStats(symbol);
  const series = useSymbolSeries(symbol, range, range.ready);
  // Plot every trading day in the range (zero when the symbol wasn't shorted),
  // so gaps in time stay visible instead of being squeezed out.
  const tradingDays = useDailyTotals(range, range.ready);
  const points = useMemo(() => {
    const byDate = new Map((series.data?.items ?? []).map((point) => [point.date, point.quantity]));
    const days = tradingDays.data?.items.map((day) => day.date) ?? [...byDate.keys()];
    return days.map((date) => ({ date, value: byDate.get(date) ?? 0 }));
  }, [series.data, tradingDays.data]);
  const shortedDays = series.data?.items.length ?? 0;
  const inRange = points.reduce((sum, point) => sum + point.value, 0);
  const presetLabel = RANGE_PRESETS.find((preset) => preset.id === range.preset)?.label ?? "Custom range";

  if (stats.isError) {
    const missing = (stats.error as { status?: number }).status === 404;
    return (
      <Page>
        {missing ? (
          <EmptyState icon={TrendingDown} title={`No short selling recorded for ${symbol}`} action={<Link to="/symbols">Browse symbols</Link>}>
            Check the symbol, or search by company name.
          </EmptyState>
        ) : (
          <Alert tone="critical" title="Could not load this symbol">{stats.error.message}</Alert>
        )}
      </Page>
    );
  }

  const s = stats.data;
  const explorerLink = `/explorer?symbol=${encodeURIComponent(symbol)}${range.search ? `&${range.search}` : ""}`;

  return (
    <Page>
      <PageHeader
        eyebrow={<Link to="/symbols">Symbols</Link>}
        title={symbol}
        description={s?.security_name ?? " "}
        actions={
          <>
            <WatchButton symbol={symbol} />
            <Button icon={GitCompareArrows} onClick={() => navigate(`/compare?symbols=${encodeURIComponent(symbol)}`)}>
              Compare
            </Button>
            <Button icon={Table2} onClick={() => navigate(explorerLink)}>
              View records
            </Button>
          </>
        }
      />
      <Grid kpi>
        <StatCard label="Shares shorted, all time" icon={Sigma} loading={stats.isLoading} value={formatCompact(s?.total_quantity)} hint={s ? `${formatInteger(s.total_quantity)} shares` : undefined} />
        <StatCard label="Average per shorted day" icon={TrendingDown} loading={stats.isLoading} value={formatCompact(s?.average_quantity)} hint={s ? `${formatDecimal(s.average_quantity)} shares` : undefined} />
        <StatCard label="Largest day" icon={Trophy} loading={stats.isLoading} value={formatCompact(s?.max_quantity)} hint={s ? `on ${formatDate(s.max_date)}` : undefined} />
        <StatCard label="Days shorted" icon={CalendarRange} loading={stats.isLoading} value={formatInteger(s?.trading_days)} hint={s ? `${formatDate(s.first_date)} – ${formatDate(s.last_date)}` : undefined} />
      </Grid>
      <ChartCard
        title="Shares shorted per day"
        subtitle={`${presetLabel} · shorted on ${formatInteger(shortedDays)} of ${formatInteger(points.length)} trading days · ${formatInteger(inRange)} shares`}
        table={{
          rows: series.data?.items ? [...series.data.items].reverse() : undefined,
          rowKey: (row) => row.date,
          columns: [
            { key: "date", header: "Date", cell: (row) => formatDate(row.date) },
            { key: "qty", header: "Shares shorted", numeric: true, cell: (row) => formatInteger(row.quantity) },
          ],
        }}
      >
        {series.isSuccess && shortedDays === 0 ? (
          <EmptyState icon={CalendarRange} title="No short selling in this range">Pick a wider date range in the top bar.</EmptyState>
        ) : (
          <ColumnChart data={points} seriesName={symbol} busy={series.isFetching && !series.isLoading} />
        )}
      </ChartCard>
    </Page>
  );
}
