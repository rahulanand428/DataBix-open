import { BarChart3, Table2 } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { DataTable, type Column } from "../components/data";
import { Card, SegmentedControl } from "../components/primitives";
import { formatCompact, formatDate, formatInteger, formatMonth, formatShortDate } from "../format";
import { useChartTheme, type ChartTheme } from "./theme";

/* ---------- Shared pieces ---------- */

type TooltipRow = { name: string; value: number; color: string };

function TooltipBox({ title, rows, unit }: { title: string; rows: TooltipRow[]; unit?: string }) {
  return (
    <div className="dbx-chart-tooltip">
      <div className="dbx-chart-tooltip__title">{title}</div>
      {rows.map((row) => (
        <div className="dbx-chart-tooltip__row" key={row.name}>
          <span className="dbx-chart-tooltip__key" style={{ background: row.color }} />
          <span className="dbx-chart-tooltip__value">
            {formatInteger(row.value)}
            {unit ? ` ${unit}` : ""}
          </span>
          <span className="dbx-chart-tooltip__name">{row.name}</span>
        </div>
      ))}
    </div>
  );
}

const axisProps = (theme: ChartTheme) => ({
  tick: { fill: theme.axisText, fontSize: 11.5 },
  tickLine: false,
  axisLine: { stroke: theme.axis },
});

/**
 * Daily ticks for short ranges; for long ranges one tick at the first date of
 * each month, labelled "Apr 2026" so it cannot be misread as a day.
 */
function dateAxis(data: Array<{ date?: unknown }>) {
  if (data.length <= 120) return { tickFormatter: (value: string) => formatShortDate(value), minTickGap: 28 };
  const ticks: string[] = [];
  let month = "";
  let lastIndex = -Infinity;
  data.forEach((row, index) => {
    const date = String(row.date ?? "");
    if (date.slice(0, 7) === month) return;
    month = date.slice(0, 7);
    // A partial first month a few days long would print on top of the next label.
    if (index - lastIndex < 8) ticks.pop();
    ticks.push(date);
    lastIndex = index;
  });
  return { ticks, interval: 0 as const, tickFormatter: (value: string) => formatMonth(value) };
}

/* ---------- Chart card with table twin ---------- */

export function ChartCard<Row>({
  title,
  subtitle,
  actions,
  table,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Every chart has a table view so no value is gated behind hover or colour. */
  table: { columns: Array<Column<Row>>; rows: Row[] | undefined; rowKey: (row: Row) => string | number };
  children: ReactNode;
  footer?: ReactNode;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <Card
      title={title}
      subtitle={subtitle}
      footer={footer}
      flush={view === "table"}
      actions={
        <>
          {actions}
          <SegmentedControl
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: <span className="dbx-sr-only">Chart</span>, icon: BarChart3 },
              { value: "table", label: <span className="dbx-sr-only">Table</span>, icon: Table2 },
            ]}
          />
        </>
      }
    >
      {view === "chart" ? (
        children
      ) : (
        <div style={{ maxHeight: 360, overflow: "auto" }}>
          <DataTable compact columns={table.columns} rows={table.rows} rowKey={table.rowKey} />
        </div>
      )}
    </Card>
  );
}

/* ---------- Single-series trend (area) ---------- */

export type TrendPoint = { date: string; value: number };

export function TrendChart({
  data,
  height = 280,
  seriesName,
  unit = "shares",
  busy,
  labelPeak = true,
}: {
  data: TrendPoint[];
  height?: number;
  seriesName: string;
  unit?: string;
  busy?: boolean;
  labelPeak?: boolean;
}) {
  const theme = useChartTheme();
  const peakIndex = useMemo(
    () => data.reduce((best, point, index) => (best < 0 || point.value > data[best]!.value ? index : best), -1),
    [data],
  );
  const peak = peakIndex >= 0 ? data[peakIndex] : null;
  // Keep the peak label clear of the axes when the peak sits at either edge.
  const peakLabelPosition = peakIndex < data.length * 0.08 ? "right" : peakIndex > data.length * 0.92 ? "left" : "top";
  return (
    <div className="dbx-chart" data-busy={busy ? "true" : "false"} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 22, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={theme.grid} strokeWidth={1} />
          <XAxis dataKey="date" {...axisProps(theme)} {...dateAxis(data)} />
          <YAxis {...axisProps(theme)} axisLine={false} width={52} tickFormatter={formatCompact} />
          <Tooltip
            cursor={{ stroke: theme.axisText, strokeWidth: 1 }}
            content={(props: TooltipContentProps) =>
              props.active && props.payload?.length ? (
                <TooltipBox
                  title={formatDate(String(props.label))}
                  unit={unit}
                  rows={[{ name: seriesName, value: Number(props.payload[0]?.value ?? 0), color: theme.accent }]}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="value"
            name={seriesName}
            stroke={theme.accent}
            strokeWidth={2}
            fill={theme.accent}
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2, fill: theme.accent }}
            isAnimationActive={false}
          />
          {labelPeak && peak && peak.value > 0 && (
            <ReferenceDot
              x={peak.date}
              y={peak.value}
              r={4}
              fill={theme.accent}
              stroke={theme.surface}
              strokeWidth={2}
              label={{
                value: `Peak ${formatCompact(peak.value)}`,
                position: peakLabelPosition,
                offset: 10,
                fill: theme.ink2,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Single-series columns over time ---------- */

export function ColumnChart({
  data,
  height = 260,
  seriesName,
  unit = "shares",
  busy,
}: {
  data: TrendPoint[];
  height?: number;
  seriesName: string;
  unit?: string;
  busy?: boolean;
}) {
  const theme = useChartTheme();
  return (
    <div className="dbx-chart" data-busy={busy ? "true" : "false"} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={theme.grid} />
          <XAxis dataKey="date" {...axisProps(theme)} {...dateAxis(data)} />
          <YAxis {...axisProps(theme)} axisLine={false} width={52} tickFormatter={formatCompact} />
          <Tooltip
            cursor={{ fill: theme.grid, fillOpacity: 0.5 }}
            content={(props: TooltipContentProps) =>
              props.active && props.payload?.length ? (
                <TooltipBox
                  title={formatDate(String(props.label))}
                  unit={unit}
                  rows={[{ name: seriesName, value: Number(props.payload[0]?.value ?? 0), color: theme.accent }]}
                />
              ) : null
            }
          />
          <Bar dataKey="value" name={seriesName} fill={theme.accent} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---------- Ranked bar list (HTML) ---------- */

export type BarListItem = { key: string; label: string; sublabel?: string; value: number };

export function BarList({
  items,
  onSelect,
  unit = "shares",
  busy,
}: {
  items: BarListItem[];
  onSelect?: (item: BarListItem) => void;
  unit?: string;
  busy?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol className="dbx-barlist dbx-chart" data-busy={busy ? "true" : "false"} style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => {
        // Leave room after the longest bar for its value label.
        const width = `calc((100% - 64px) * ${Math.max(0.015, item.value / max)})`;
        const content = (
          <>
            <span className="dbx-barlist__label">
              <span className="dbx-symbol">{item.label}</span>
              {item.sublabel && <span className="dbx-barlist__sub">{item.sublabel}</span>}
            </span>
            <span className="dbx-barlist__track">
              <span className="dbx-barlist__bar" style={{ width }} />
              <span className="dbx-barlist__value dbx-num">{formatCompact(item.value)}</span>
            </span>
          </>
        );
        const title = `${item.label}${item.sublabel ? ` · ${item.sublabel}` : ""}: ${formatInteger(item.value)} ${unit}`;
        return (
          <li key={item.key}>
            {onSelect ? (
              <button type="button" className="dbx-barlist__row" title={title} onClick={() => onSelect(item)}>
                {content}
              </button>
            ) : (
              <div className="dbx-barlist__row" title={title}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Multi-series comparison (≤ 3 lines) ---------- */

export type SeriesSpec = { key: string; label: string; slot: 0 | 1 | 2 };

export function MultiLineChart({
  data,
  series,
  height = 320,
  unit = "shares",
  busy,
}: {
  data: Array<Record<string, number | string | null>>;
  series: SeriesSpec[];
  height?: number;
  unit?: string;
  busy?: boolean;
}) {
  const theme = useChartTheme();
  const plotHeight = height - 12 - 30;
  const yMax = Math.max(
    1,
    ...data.flatMap((row) => series.map((item) => Number(row[item.key] ?? 0))),
  );
  const endValue = (key: string) => {
    for (let index = data.length - 1; index >= 0; index -= 1) {
      const value = data[index]?.[key];
      if (value != null) return Number(value);
    }
    return null;
  };
  // Direct end labels only when they cannot collide; otherwise the legend and
  // tooltip carry identity (stacked labels detach from their lines).
  const ends = series.map((item) => endValue(item.key)).filter((value): value is number => value !== null);
  const endLabels = ends.every((value, index) =>
    ends.every((other, otherIndex) => otherIndex <= index || (Math.abs(value - other) / yMax) * plotHeight >= 16),
  );
  const rightMargin = endLabels ? Math.max(...series.map((item) => item.label.length * 7.2)) + 20 : 16;
  const lastIndex = (key: string) => {
    for (let index = data.length - 1; index >= 0; index -= 1) {
      if (data[index]?.[key] != null) return index;
    }
    return -1;
  };
  return (
    <div className="dbx-stack" style={{ ["--dbx-gap" as string]: "10px" }}>
      <div className="dbx-legend" aria-label="Legend">
        {series.map((item) => (
          <span key={item.key} className="dbx-legend__item">
            <span className="dbx-legend__line" style={{ background: theme.series[item.slot] }} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="dbx-chart" data-busy={busy ? "true" : "false"} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: rightMargin, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis dataKey="date" {...axisProps(theme)} {...dateAxis(data)} />
            <YAxis {...axisProps(theme)} axisLine={false} width={52} tickFormatter={formatCompact} />
            <Tooltip
              cursor={{ stroke: theme.axisText, strokeWidth: 1 }}
              content={(props: TooltipContentProps) =>
                props.active && props.payload?.length ? (
                  <TooltipBox
                    title={formatDate(String(props.label))}
                    unit={unit}
                    rows={series
                      .map((item) => {
                        const entry = props.payload?.find((candidate) => candidate.dataKey === item.key);
                        return entry?.value == null
                          ? null
                          : { name: item.label, value: Number(entry.value), color: theme.series[item.slot] };
                      })
                      .filter((row): row is TooltipRow => row !== null)
                      .sort((left, right) => right.value - left.value)}
                  />
                ) : null
              }
            />
            {series.map((item) => {
              const end = lastIndex(item.key);
              return (
                <Line
                  key={item.key}
                  type="monotone"
                  dataKey={item.key}
                  name={item.label}
                  stroke={theme.series[item.slot]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  dot={false}
                  connectNulls
                  activeDot={{ r: 4, stroke: theme.surface, strokeWidth: 2 }}
                  isAnimationActive={false}
                  label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                    endLabels && props.index === end && end >= 0 ? (
                      <text
                        key={`${item.key}-end`}
                        x={Number(props.x) + 8}
                        y={Number(props.y)}
                        dy={4}
                        fill={theme.ink2}
                        fontSize={11.5}
                        fontWeight={600}
                      >
                        {item.label}
                      </text>
                    ) : (
                      <g key={`${item.key}-${props.index}`} />
                    )
                  }
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ---------- Sparkline ---------- */

export function Sparkline({
  values,
  width = 96,
  height = 28,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label?: string;
}) {
  const theme = useChartTheme();
  if (values.length < 2) return <span className="dbx-muted">—</span>;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pad = 4;
  const x = (index: number) => pad + (index / (values.length - 1)) * (width - pad * 2);
  const y = (value: number) => height - pad - ((value - min) / span) * (height - pad * 2);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const lastValue = values[values.length - 1] ?? 0;
  return (
    <svg className="dbx-sparkline" width={width} height={height} role="img" aria-label={label ?? "Trend"}>
      <polyline points={points} fill="none" stroke={theme.muted} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(lastValue)} r={3} fill={theme.accent} stroke={theme.surface} strokeWidth={1.5} />
    </svg>
  );
}
