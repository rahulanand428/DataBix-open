import { Route, Routes } from "react-router";

import { ComparePage } from "./ComparePage";
import { SymbolDetailPage } from "./SymbolDetailPage";
import { SymbolsPage } from "./SymbolsPage";
import { WatchlistPage } from "./WatchlistPage";

export default function App() {
  return (
    <Routes>
      <Route path="/symbols" element={<SymbolsPage />} />
      <Route path="/symbols/:symbol" element={<SymbolDetailPage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
    </Routes>
  );
}
