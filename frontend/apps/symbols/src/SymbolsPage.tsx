import { useSymbols } from "@databix/sdk";
import { Card, DataTable, EmptyState, Page, PageHeader, Pagination, SearchInput, formatDate, formatInteger } from "@databix/ui";
import { SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { WatchButton } from "./WatchButton";

const PAGE_SIZE = 25;

export function SymbolsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [draft, setDraft] = useState(q);
  const symbols = useSymbols(q, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft.trim() !== q) {
        setParams((current) => {
          const next = new URLSearchParams(current);
          if (draft.trim()) next.set("q", draft.trim());
          else next.delete("q");
          next.delete("page");
          return next;
        }, { replace: true });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, q, setParams]);

  return (
    <Page>
      <PageHeader
        title="Symbols"
        description="Every symbol with reported short selling, ranked by all-time shares shorted. Star a symbol to follow it on your watchlist."
      />
      <div className="dbx-filter-row">
        <SearchInput
          placeholder="Search by symbol or company name"
          aria-label="Search symbols"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          style={{ width: 340 }}
        />
        {symbols.data && <span className="dbx-muted">{formatInteger(symbols.data.total)} symbols</span>}
      </div>
      <Card flush>
        <DataTable
          caption="Symbols"
          loading={symbols.isLoading}
          busy={symbols.isFetching && !symbols.isLoading}
          rows={symbols.data?.items}
          rowKey={(row) => row.symbol}
          empty={<EmptyState icon={SearchX} title="No symbols match">Try a shorter search.</EmptyState>}
          columns={[
            { key: "watch", header: <span className="dbx-sr-only">Watch</span>, width: 44, cell: (row) => <WatchButton symbol={row.symbol} compact /> },
            { key: "symbol", header: "Symbol", width: 150, cell: (row) => <Link className="dbx-symbol" to={`/symbols/${encodeURIComponent(row.symbol)}`}>{row.symbol}</Link> },
            { key: "name", header: "Security", cell: (row) => <span className="dbx-secondary">{row.security_name}</span> },
            { key: "total", header: "Shares shorted (all time)", numeric: true, cell: (row) => formatInteger(row.total_quantity) },
            { key: "days", header: "Days shorted", numeric: true, cell: (row) => formatInteger(row.trading_days) },
            { key: "last", header: "Last shorted", cell: (row) => formatDate(row.last_date), width: 140 },
          ]}
        />
        {symbols.data && symbols.data.total > PAGE_SIZE && (
          <Pagination
            total={symbols.data.total}
            limit={PAGE_SIZE}
            offset={(page - 1) * PAGE_SIZE}
            noun="symbols"
            onChange={(offset) =>
              setParams((current) => {
                const next = new URLSearchParams(current);
                if (offset === 0) next.delete("page");
                else next.set("page", String(offset / PAGE_SIZE + 1));
                return next;
              })
            }
          />
        )}
      </Card>
    </Page>
  );
}
