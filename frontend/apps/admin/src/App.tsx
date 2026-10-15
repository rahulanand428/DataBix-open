import { Navigate, Route, Routes } from "react-router";

import { BrandingPage } from "./BrandingPage";
import { IngestionPage } from "./IngestionPage";
import { StatusPage } from "./StatusPage";
import { UsersPage } from "./UsersPage";

export default function App() {
  return (
    <Routes>
      <Route path="/admin" element={<Navigate to="/admin/status" replace />} />
      <Route path="/admin/status" element={<StatusPage />} />
      <Route path="/admin/ingestion" element={<IngestionPage />} />
      <Route path="/admin/users" element={<UsersPage />} />
      <Route path="/admin/branding" element={<BrandingPage />} />
    </Routes>
  );
}
