import { useWatchlist, useWatchlistMutations } from "@databix/sdk";
import { Button, useToast } from "@databix/ui";
import { Star, StarOff } from "lucide-react";

export function useWatched(symbol: string) {
  const watchlist = useWatchlist();
  return Boolean(watchlist.data?.items.some((item) => item.symbol === symbol));
}

export function WatchButton({ symbol, compact }: { symbol: string; compact?: boolean }) {
  const watched = useWatched(symbol);
  const { add, remove } = useWatchlistMutations();
  const toast = useToast();
  const pending = add.isPending || remove.isPending;
  const toggle = async () => {
    try {
      if (watched) {
        await remove.mutateAsync(symbol);
        toast.show(`${symbol} removed from your watchlist`);
      } else {
        await add.mutateAsync(symbol);
        toast.show(`${symbol} added to your watchlist`, "good");
      }
    } catch (error) {
      toast.show((error as Error).message, "critical");
    }
  };
  if (compact) {
    return (
      <Button variant="ghost" size="sm" iconOnly icon={watched ? Star : StarOff} onClick={toggle} disabled={pending} aria-pressed={watched}>
        {watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      </Button>
    );
  }
  return (
    <Button icon={Star} onClick={toggle} loading={pending} aria-pressed={watched}>
      {watched ? "Watching" : "Watch"}
    </Button>
  );
}
