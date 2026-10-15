import { Route, Routes } from "react-router";

import { OverviewPage } from "./OverviewPage";

export default function App() {
  return (
    <Routes>
      <Route path="/overview" element={<OverviewPage />} />
    </Routes>
  );
}
