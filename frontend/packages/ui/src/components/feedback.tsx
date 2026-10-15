import { CalendarRange, CheckCircle2, ChevronDown, Info, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { formatDate } from "../format";
import { Popover, MenuItem } from "./data";
import { Button, Input } from "./primitives";

/* ---------- Toasts ---------- */

type ToastTone = "info" | "good" | "critical";
type ToastItem = { id: number; tone: ToastTone; message: ReactNode };
type ToastApi = { show: (message: ReactNode, tone?: ToastTone) => void };

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: ReactNode, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4500);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="dbx-toasts" aria-live="polite">
        {items.map((item) => {
          const Icon = item.tone === "good" ? CheckCircle2 : item.tone === "critical" ? XCircle : Info;
          return (
            <div key={item.id} className={`dbx-toast dbx-toast--${item.tone}`} role="status">
              <Icon aria-hidden />
              <div>{item.message}</div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------- Date range picker ---------- */

export type DateRangePreset = { id: string; label: string };
export type DateRangeValue = { preset: string; from: string | null; to: string | null };

/**
 * Presets as rows, selection marked with a bold check, custom range behind a
 * hairline at the bottom (no calendar grid to fight for "last 3 months").
 */
export function DateRangePicker({
  value,
  presets,
  onPreset,
  onCustom,
  min,
  max,
}: {
  value: DateRangeValue;
  presets: DateRangePreset[];
  onPreset: (preset: string) => void;
  onCustom: (from: string, to: string) => void;
  min?: string | null;
  max?: string | null;
}) {
  const [from, setFrom] = useState(value.from ?? "");
  const [to, setTo] = useState(value.to ?? "");
  const presetLabel = presets.find((preset) => preset.id === value.preset)?.label;
  const label =
    value.preset === "custom" && value.from && value.to
      ? `${formatDate(value.from)} – ${formatDate(value.to)}`
      : presetLabel ?? "All data";
  const valid = Boolean(from && to && from <= to);

  return (
    <Popover
      align="left"
      onOpenChange={(open) => {
        if (open) {
          setFrom(value.from ?? "");
          setTo(value.to ?? "");
        }
      }}
      trigger={({ open, toggle }) => (
        <Button icon={CalendarRange} onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
          {label}
          <ChevronDown aria-hidden />
        </Button>
      )}
    >
      {(close) => (
        <div role="dialog" aria-label="Date range" style={{ width: 280 }}>
          <div className="dbx-menu-label">Date range</div>
          {presets.map((preset) => (
            <MenuItem
              key={preset.id}
              selected={value.preset === preset.id}
              onSelect={() => {
                onPreset(preset.id);
                close();
              }}
            >
              {preset.label}
            </MenuItem>
          ))}
          <div className="dbx-menu-sep" />
          <form
            className="dbx-stack"
            style={{ ["--dbx-gap" as string]: "8px", padding: "4px 6px 6px" }}
            onSubmit={(event) => {
              event.preventDefault();
              if (!valid) return;
              onCustom(from, to);
              close();
            }}
          >
            <div className="dbx-menu-label" style={{ padding: 0 }}>Custom range</div>
            <div className="dbx-row" style={{ ["--dbx-gap" as string]: "6px" }}>
              <Input type="date" aria-label="From" value={from} min={min ?? undefined} max={max ?? undefined} onChange={(event) => setFrom(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
              <Input type="date" aria-label="To" value={to} min={min ?? undefined} max={max ?? undefined} onChange={(event) => setTo(event.target.value)} style={{ flex: 1, minWidth: 0 }} />
            </div>
            <Button type="submit" size="sm" variant="primary" disabled={!valid}>
              Apply custom range
            </Button>
          </form>
        </div>
      )}
    </Popover>
  );
}
