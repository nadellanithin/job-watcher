import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import JobsTable from "../components/JobsTable";
import Icon from "../components/Icon.jsx";

function fmtLocal(iso) {
  if (!iso) return "-";
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
    <div className="jw-page-shell">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="spark" size={13} /> New Jobs
            </span>
            <span className="jw-badge subtle">{meta.total || 0} jobs</span>
            <span className="jw-badge ok">Latest run only</span>
          </div>
          <h1 className="jw-page-hero-title">Freshly detected opportunities</h1>
          <p className="jw-page-hero-sub">
            {latestRun?.started_at ? `Based on latest run at ${fmtLocal(latestRun.started_at)}.` : "Run the fetcher to populate new jobs."}
          </p>
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
        New jobs are calculated relative to earlier runs by first-seen timestamp.
      </div>
    </div>
  );
}
