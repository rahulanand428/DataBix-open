import { Route, Routes } from "react-router";

import { ExplorerPage } from "./ExplorerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/explorer" element={<ExplorerPage />} />
    </Routes>
  );
}
