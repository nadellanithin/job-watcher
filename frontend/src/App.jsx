import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewJobs from "./pages/NewJobs.jsx";
import AllJobs from "./pages/AllJobs.jsx";
import Companies from "./pages/Companies.jsx";
import Settings from "./pages/Settings.jsx";
import Audit from "./pages/Audit.jsx";
import Inbox from "./pages/Inbox.jsx";
import Metrics from "./pages/Metrics.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewJobs />} />
          <Route path="/all" element={<AllJobs />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/metrics" element={<Metrics />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
