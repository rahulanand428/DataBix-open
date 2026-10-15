import { useSymbols } from "@databix/sdk";
import { Dialog, EmptyState, SearchInput, formatCompact } from "@databix/ui";
import { SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const results = useSymbols(debounced, 8, 0, open);
  const items = results.data?.items ?? [];

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 150);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    setActive(0);
  }, [debounced]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (symbol: string) => {
    onClose();
    navigate(`/symbols/${encodeURIComponent(symbol)}`);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Find a symbol" width={560}>
      <SearchInput
        autoFocus
        placeholder="Symbol or company name, e.g. RELIANCE or bank"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-controls="dbx-palette-results"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && items[active]) {
            event.preventDefault();
            go(items[active].symbol);
          }
        }}
      />
      <div id="dbx-palette-results" role="listbox" aria-label="Matching symbols" style={{ minHeight: 120 }}>
        {items.map((item, index) => (
          <button
            key={item.symbol}
            type="button"
            role="option"
            aria-selected={index === active}
            className="dbx-menu-item"
            onMouseEnter={() => setActive(index)}
            onClick={() => go(item.symbol)}
          >
            <span className="dbx-symbol" style={{ minWidth: 96 }}>{item.symbol}</span>
            <span className="dbx-secondary" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.security_name}
            </span>
            <span className="dbx-muted dbx-num">{formatCompact(item.total_quantity)}</span>
          </button>
        ))}
        {results.isSuccess && items.length === 0 && (
          <EmptyState icon={SearchX} title="No matching symbols">Try a shorter search.</EmptyState>
        )}
      </div>
    </Dialog>
  );
}
