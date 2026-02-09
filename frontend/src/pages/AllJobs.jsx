import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import JobsTable from "../components/JobsTable";

export default function AllJobs() {
  const [jobs, setJobs] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet("/api/jobs?scope=all");
      setJobs(data);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Compact page header (no wasted space) */}
      <div className="jw-card" style={{ background: "var(--surface2)" }}>
        <div
          className="jw-card-b"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <div style={{ minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="jw-badge subtle">🗂️ All jobs</span>
              <span className="jw-badge subtle">{jobs?.length || 0} jobs</span>
            </div>
            <div className="jw-muted2" style={{ marginTop: 8, fontSize: 12 }}>
              Full job feed from your configured company sources.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="jw-btn" onClick={load} disabled={loading} type="button">
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {err ? (
        <div className="jw-alert">
          <b>Error</b>
          <div style={{ marginTop: 6 }} className="jw-muted">
            {err}
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="jw-card">
          <div className="jw-card-b">
            <div className="jw-muted">Loading jobs…</div>
          </div>
        </div>
      ) : !jobs?.length ? (
        <div className="jw-empty">No jobs found yet. Add companies and run the fetcher.</div>
      ) : (
        <JobsTable jobs={jobs} />
      )}

      <div className="jw-muted2" style={{ fontSize: 12 }}>
        H-1B badge is a historical signal (USCIS data) — not a guarantee.
      </div>
    </div>
  );
}
