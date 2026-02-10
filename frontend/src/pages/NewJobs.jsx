import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import JobsTable from "../components/JobsTable";

function fmtLocal(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function NewJobs() {
  const [latestRun, setLatestRun] = useState(null);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });

  useEffect(() => {
    (async () => {
      try {
        const rs = await apiGet("/api/runs");
        setLatestRun(Array.isArray(rs) ? rs[0] : null);
      } catch (e) {
        setErr(String(e));
      }
    })();
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
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
          <div style={{ minWidth: 280 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="jw-badge subtle">✨ New Jobs</span>
              <span className="jw-badge subtle">{meta.total || 0} jobs</span>
              <span className="jw-badge ok">Latest run only</span>
            </div>

            <div className="jw-muted2" style={{ marginTop: 8, fontSize: 12 }}>
              {latestRun?.started_at ? (
                <>
                  Based on the latest run: <b>{fmtLocal(latestRun.started_at)}</b>
                </>
              ) : (
                <>Run the fetcher to populate new jobs.</>
              )}
            </div>
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

      <JobsTable scope="new" onMetaChange={setMeta} />

      <div className="jw-muted2" style={{ fontSize: 12 }}>
        New jobs are calculated relative to prior runs (first time seen).
      </div>
    </div>
  );
}
