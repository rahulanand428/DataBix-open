import { useDateRange, useSymbolSeries, useSymbols, useTopSymbols } from "@databix/sdk";
import {
  Button,
  Card,
  ChartCard,
  DataTable,
  EmptyState,
  Input,
  MultiLineChart,
  Page,
  PageHeader,
  formatInteger,
  useChartTheme,
  type SeriesSpec,
} from "@databix/ui";
import { GitCompareArrows, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

const SLOTS = 3;

/**
 * Up to three symbols, each pinned to a slot (and so a colour) for as long as
 * it is selected: removing one never repaints the others. Slots live in the
 * URL as positional entries, e.g. ?symbols=ABB,,TCS.
 */
function useSlots() {
  const [params, setParams] = useSearchParams();
  const raw = (params.get("symbols") ?? "").split(",").slice(0, SLOTS);
  const slots = Array.from({ length: SLOTS }, (_, index) => raw[index]?.trim().toUpperCase() || null);
  const write = (next: Array<string | null>) =>
    setParams((current) => {
      const updated = new URLSearchParams(current);
      const value = next.map((entry) => entry ?? "").join(",").replace(/,+$/, "");
      if (value) updated.set("symbols", value);
      else updated.delete("symbols");
      return updated;
    });
  return { slots, write };
}

function AddSymbol({ onAdd, disabled }: { onAdd: (symbol: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const suggestions = useSymbols(draft.trim(), 8, 0, draft.trim().length > 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (draft.trim()) onAdd(draft.trim().toUpperCase());
    setDraft("");
  };
  return (
    <form className="dbx-row" style={{ ["--dbx-gap" as string]: "8px" }} onSubmit={submit}>
      <Input
        placeholder={disabled ? "Remove a symbol to add another" : "Add a symbol, e.g. TCS"}
        aria-label="Add symbol"
        list="compare-symbols"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        style={{ width: 260 }}
      />
      <datalist id="compare-symbols">
        {suggestions.data?.items.map((item) => (
          <option key={item.symbol} value={item.symbol}>
            {item.security_name}
          </option>
        ))}
      </datalist>
      <Button type="submit" icon={Plus} disabled={disabled || !draft.trim()}>
        Add
      </Button>
    </form>
  );
}

export function ComparePage() {
  const range = useDateRange();
  const theme = useChartTheme();
  const { slots, write } = useSlots();
  const top = useTopSymbols(range, 6, range.ready);
  const series = [
    useSymbolSeries(slots[0], range, range.ready),
    useSymbolSeries(slots[1], range, range.ready),
    useSymbolSeries(slots[2], range, range.ready),
  ];

  const active = slots
    .map((symbol, slot) => (symbol ? { symbol, slot: slot as 0 | 1 | 2 } : null))
    .filter((entry): entry is { symbol: string; slot: 0 | 1 | 2 } => entry !== null);

  const { rows, summary } = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    const totals: Array<{ symbol: string; slot: 0 | 1 | 2; total: number; days: number; max: number }> = [];
    for (const { symbol, slot } of active) {
      const points = series[slot]?.data?.items ?? [];
      totals.push({
        symbol,
        slot,
        total: points.reduce((sum, point) => sum + point.quantity, 0),
        days: points.length,
        max: points.reduce((best, point) => Math.max(best, point.quantity), 0),
      });
      for (const point of points) {
        const row = byDate.get(point.date) ?? { date: point.date };
        row[symbol] = point.quantity;
        byDate.set(point.date, row);
      }
    }
    // A symbol with no reported short sale on a day shorted zero shares that day.
    const merged = [...byDate.values()]
      .sort((left, right) => String(left.date).localeCompare(String(right.date)))
      .map((row) => {
        for (const { symbol } of active) row[symbol] ??= 0;
        return row;
      });
    return { rows: merged, summary: totals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots.join(","), series[0]?.data, series[1]?.data, series[2]?.data]);

  const add = (symbol: string) => {
    if (slots.includes(symbol)) return;
    const free = slots.indexOf(null);
    if (free === -1) return;
    const next = [...slots];
    next[free] = symbol;
    write(next);
  };
  const remove = (slot: number) => {
    const next = [...slots];
    next[slot] = null;
    write(next);
  };

  const specs: SeriesSpec[] = active.map(({ symbol, slot }) => ({ key: symbol, label: symbol, slot }));
  const loading = series.some((query) => query.isLoading && query.fetchStatus !== "idle");

  return (
    <Page>
      <PageHeader
        title="Compare symbols"
        description="Daily shares shorted for up to three symbols on one axis. Each symbol keeps its colour while it is selected."
      />
      <div className="dbx-filter-row">
        {active.map(({ symbol, slot }) => (
          <span key={symbol} className="dbx-badge" style={{ height: 30, paddingRight: 4 }}>
            <span className="dbx-legend__line" style={{ background: theme.series[slot] }} />
            <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(symbol)}`}>{symbol}</Link>
            <Button variant="ghost" size="sm" iconOnly icon={X} onClick={() => remove(slot)}>
              Remove {symbol}
            </Button>
          </span>
        ))}
        <AddSymbol onAdd={add} disabled={active.length >= SLOTS} />
      </div>

      {active.length === 0 ? (
        <Card>
          <EmptyState icon={GitCompareArrows} title="Pick symbols to compare">
            <div className="dbx-stack" style={{ ["--dbx-gap" as string]: "10px", alignItems: "center" }}>
              <span>Start with the most-shorted symbols in this range:</span>
              <div className="dbx-row" style={{ justifyContent: "center" }}>
                {top.data?.items.slice(0, 6).map((item) => (
                  <Button key={item.symbol} size="sm" onClick={() => add(item.symbol)}>
                    {item.symbol}
                  </Button>
                ))}
              </div>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <ChartCard
            title="Shares shorted per day"
            subtitle="Days without reported short sales count as zero"
            table={{
              rows: [...rows].reverse(),
              rowKey: (row) => String(row.date),
              columns: [
                { key: "date", header: "Date", cell: (row) => String(row.date) },
                ...active.map(({ symbol }) => ({
                  key: symbol,
                  header: symbol,
                  numeric: true,
                  cell: (row: Record<string, number | string | null>) => formatInteger(Number(row[symbol] ?? 0)),
                })),
              ],
            }}
          >
            <MultiLineChart data={rows} series={specs} busy={loading} />
          </ChartCard>
          <Card title="In the selected range" flush>
            <DataTable
              compact
              rows={summary}
              rowKey={(row) => row.symbol}
              columns={[
                {
                  key: "symbol",
                  header: "Symbol",
                  cell: (row) => (
                    <span className="dbx-row" style={{ ["--dbx-gap" as string]: "8px" }}>
                      <span className="dbx-legend__line" style={{ background: theme.series[row.slot] }} />
                      <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link>
                    </span>
                  ),
                },
                { key: "total", header: "Shares shorted", numeric: true, cell: (row) => formatInteger(row.total) },
                { key: "days", header: "Days shorted", numeric: true, cell: (row) => formatInteger(row.days) },
                { key: "avg", header: "Average per day shorted", numeric: true, cell: (row) => formatInteger(Math.round(row.days ? row.total / row.days : 0)) },
                { key: "max", header: "Largest day", numeric: true, cell: (row) => formatInteger(row.max) },
              ]}
            />
          </Card>
        </>
      )}
    </Page>
  );
}
