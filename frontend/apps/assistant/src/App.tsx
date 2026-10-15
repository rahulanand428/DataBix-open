import { Route, Routes } from "react-router";

import { AssistantPage } from "./AssistantPage";

export default function App() {
  return (
    <Routes>
      <Route path="/assistant" element={<AssistantPage />} />
    </Routes>
  );
}
