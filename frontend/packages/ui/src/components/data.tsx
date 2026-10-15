import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatInteger, formatPercent } from "../format";
import { Button, Skeleton, cx } from "./primitives";

/* ---------- Stat tile ---------- */

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  deltaLabel,
  hint,
  trend,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** Percentage change vs the comparison period. Direction only; activity is neither good nor bad. */
  delta?: number | null;
  deltaLabel?: string;
  hint?: ReactNode;
  trend?: ReactNode;
  loading?: boolean;
}) {
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <section className="dbx-card dbx-stat" aria-busy={loading}>
      <div className="dbx-stat__label">
        {Icon && <Icon aria-hidden />}
        {label}
      </div>
      <div className="dbx-stat__value">{loading ? <Skeleton width="60%" height={28} /> : value}</div>
      <div className="dbx-stat__meta">
        {!loading && delta !== undefined && (
          <span className="dbx-stat__delta">
            <DeltaIcon aria-hidden />
            {delta == null ? "n/a" : formatPercent(delta)}
          </span>
        )}
        {!loading && deltaLabel && <span>{deltaLabel}</span>}
        {!loading && hint && <span>{hint}</span>}
      </div>
      {trend && <div className="dbx-stat__trend">{trend}</div>}
    </section>
  );
}

/* ---------- Data table ---------- */

export type Column<Row> = {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
  /** Sort key sent to the server; ascending is the key, descending is "-" + key. */
  sortKey?: string;
  width?: number | string;
};

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  sort,
  onSort,
  loading,
  busy,
  empty,
  caption,
  compact,
  skeletonRows = 8,
}: {
  columns: Array<Column<Row>>;
  rows: Row[] | undefined;
  rowKey: (row: Row) => string | number;
  sort?: string;
  onSort?: (sort: string) => void;
  loading?: boolean;
  busy?: boolean;
  empty?: ReactNode;
  caption?: string;
  compact?: boolean;
  skeletonRows?: number;
}) {
  const direction = (column: Column<Row>): "ascending" | "descending" | "none" => {
    if (!column.sortKey || !sort) return "none";
    if (sort === column.sortKey) return "ascending";
    if (sort === `-${column.sortKey}`) return "descending";
    return "none";
  };

  return (
    <div className="dbx-table-wrap dbx-table-loading" data-busy={busy ? "true" : "false"}>
      <table className={cx("dbx-table", compact && "dbx-table--compact")}>
        {caption && <caption className="dbx-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => {
              const state = direction(column);
              const SortIcon = state === "ascending" ? ArrowUp : state === "descending" ? ArrowDown : ArrowUpDown;
              return (
                <th
                  key={column.key}
                  className={column.numeric ? "is-numeric" : undefined}
                  style={{ width: column.width }}
                  aria-sort={column.sortKey ? state : undefined}
                  scope="col"
                >
                  {column.sortKey && onSort ? (
                    <button
                      type="button"
                      className="dbx-table__sort"
                      aria-sort={state}
                      onClick={() =>
                        onSort(state === "descending" ? column.sortKey! : `-${column.sortKey}`)
                      }
                    >
                      {column.header}
                      <SortIcon aria-hidden />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && !rows
            ? Array.from({ length: skeletonRows }, (_, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column.key}>
                      <Skeleton width={column.numeric ? "50%" : "70%"} style={{ marginLeft: column.numeric ? "auto" : 0 }} />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.numeric ? "is-numeric" : undefined}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && empty}
    </div>
  );
}

export function Pagination({
  total,
  limit,
  offset,
  onChange,
  noun = "rows",
}: {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  noun?: string;
}) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <nav className="dbx-pagination" aria-label="Pagination">
      <span className="dbx-num">
        {formatInteger(first)}–{formatInteger(last)} of {formatInteger(total)} {noun}
      </span>
      <div className="dbx-row" style={{ ["--dbx-gap" as string]: "6px" }}>
        <Button size="sm" icon={ChevronLeft} disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>
          Previous
        </Button>
        <Button size="sm" disabled={last >= total} onClick={() => onChange(offset + limit)}>
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

/* ---------- Dialog ---------- */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dbx-dialog"
      style={width ? { width: `min(${width}px, calc(100vw - 32px))` } : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {open && (
        <>
          <div className="dbx-dialog__header">
            <h2>{title}</h2>
            {description && <p className="dbx-muted">{description}</p>}
          </div>
          {children && <div className="dbx-dialog__body">{children}</div>}
          {footer && <div className="dbx-dialog__footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/* ---------- Popover ---------- */

export function Popover({
  trigger,
  children,
  align = "right",
  open: controlledOpen,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const setOpen = (next: boolean) => {
    setUncontrolled(next);
    onOpenChange?.(next);
  };
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });
  return (
    <div className="dbx-popover-anchor" ref={ref}>
      {trigger({ open, toggle: () => setOpen(!open) })}
      {open && <div className={cx("dbx-popover", align === "left" && "dbx-popover--left")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  onSelect,
  selected,
  href,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  onSelect?: () => void;
  selected?: boolean;
  href?: string;
}) {
  const content = (
    <>
      {Icon && <Icon aria-hidden />}
      <span>{children}</span>
      {selected && <Check className="dbx-menu-item__check" aria-hidden />}
    </>
  );
  if (href) {
    return (
      <a className="dbx-menu-item" href={href} onClick={onSelect}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" className="dbx-menu-item" role="menuitemradio" aria-checked={selected} onClick={onSelect}>
      {content}
    </button>
  );
}
