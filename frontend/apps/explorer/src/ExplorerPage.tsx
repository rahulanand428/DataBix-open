import { downloadExport, useDateRange, useRecords, useSymbols, type SortOrder } from "@databix/sdk";
import {
  Alert,
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  Page,
  PageHeader,
  Pagination,
  SearchInput,
  Select,
  formatDate,
  formatInteger,
  useToast,
} from "@databix/ui";
import { Download, FilterX, SearchX, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

const SORTS: SortOrder[] = ["-date", "date", "symbol", "-symbol", "quantity", "-quantity"];
const PAGE_SIZES = [25, 50, 100];

export function ExplorerPage() {
  const range = useDateRange();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const symbol = params.get("symbol")?.toUpperCase() || null;
  const sort = (SORTS as string[]).includes(params.get("sort") ?? "") ? (params.get("sort") as SortOrder) : "-date";
  const size = PAGE_SIZES.includes(Number(params.get("size"))) ? Number(params.get("size")) : 25;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [draft, setDraft] = useState(symbol ?? "");
  const [exporting, setExporting] = useState(false);
  const suggestions = useSymbols(draft.trim(), 8, 0, draft.trim().length > 0);

  useEffect(() => {
    setDraft(symbol ?? "");
  }, [symbol]);

  const records = useRecords(
    { from: range.from, to: range.to, symbol, sort, limit: size, offset: (page - 1) * size },
    range.ready,
  );

  const update = (changes: Record<string, string | null>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });

  const applySymbol = (event: FormEvent) => {
    event.preventDefault();
    update({ symbol: draft.trim().toUpperCase() || null, page: null });
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await downloadExport({ date_from: range.from, date_to: range.to, symbol, sort });
      toast.show(
        result.truncated
          ? `Exported the first ${formatInteger(result.rows)} rows (export limit reached).`
          : `Exported ${formatInteger(result.rows)} rows.`,
        "good",
      );
    } catch (error) {
      toast.show((error as Error).message, "critical");
    } finally {
      setExporting(false);
    }
  };

  const total = records.data?.total ?? 0;

  return (
    <Page>
      <PageHeader
        title="Explorer"
        description="Every reported short sale in the selected date range. Filter by symbol, sort any column and export what you see."
        actions={
          <Button icon={Download} onClick={exportCsv} loading={exporting} disabled={!records.data || total === 0}>
            Export CSV
          </Button>
        }
      />

      <form className="dbx-filter-row" onSubmit={applySymbol} role="search">
        <SearchInput
          placeholder="Filter by symbol, e.g. RELIANCE"
          aria-label="Symbol"
          value={draft}
          list="explorer-symbols"
          onChange={(event) => setDraft(event.target.value)}
          style={{ width: 280 }}
        />
        <datalist id="explorer-symbols">
          {suggestions.data?.items.map((item) => (
            <option key={item.symbol} value={item.symbol}>
              {item.security_name}
            </option>
          ))}
        </datalist>
        <Button type="submit">Apply</Button>
        {symbol && (
          <Badge tone="brand">
            Symbol: {symbol}
            <button
              type="button"
              aria-label="Clear symbol filter"
              onClick={() => update({ symbol: null, page: null })}
              style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: "inherit", display: "inline-flex" }}
            >
              <X size={13} aria-hidden />
            </button>
          </Badge>
        )}
        <span className="dbx-spacer" />
        <label className="dbx-row dbx-muted" style={{ ["--dbx-gap" as string]: "8px", fontSize: 13 }}>
          Rows per page
          <Select
            value={size}
            onChange={(event) => update({ size: event.target.value, page: null })}
            style={{ width: 84 }}
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      </form>

      {records.isError ? (
        <Alert tone="critical" title="Could not load records">{records.error.message}</Alert>
      ) : (
        <Card flush>
          <DataTable
            caption="Short-selling records"
            loading={records.isLoading || !range.ready}
            busy={records.isFetching && !records.isLoading}
            rows={records.data?.items}
            rowKey={(row) => row.id}
            sort={sort}
            onSort={(next) => update({ sort: next === "-date" ? null : next, page: null })}
            skeletonRows={10}
            empty={
              <EmptyState
                icon={symbol ? FilterX : SearchX}
                title="No records match"
                action={symbol ? <Button size="sm" onClick={() => update({ symbol: null })}>Clear symbol filter</Button> : undefined}
              >
                Try a wider date range{symbol ? " or another symbol" : ""}.
              </EmptyState>
            }
            columns={[
              { key: "date", header: "Date", sortKey: "date", cell: (row) => formatDate(row.date), width: 140 },
              {
                key: "symbol",
                header: "Symbol",
                sortKey: "symbol",
                width: 150,
                cell: (row) => (
                  <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>
                    {row.symbol}
                  </Link>
                ),
              },
              { key: "name", header: "Security", cell: (row) => <span className="dbx-secondary">{row.security_name}</span> },
              { key: "qty", header: "Shares shorted", sortKey: "quantity", numeric: true, cell: (row) => formatInteger(row.quantity), width: 160 },
            ]}
          />
          {records.data && total > 0 && (
            <Pagination
              total={total}
              limit={size}
              offset={(page - 1) * size}
              noun="records"
              onChange={(offset) => update({ page: offset === 0 ? null : String(offset / size + 1) })}
            />
          )}
        </Card>
      )}
    </Page>
  );
}
