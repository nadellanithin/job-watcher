import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client.js";
import Icon from "../components/Icon.jsx";

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCount(value) {
  return asNumber(value).toLocaleString();
}

function formatBytes(value) {
  const bytes = asNumber(value);
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIdx = 0;
  while (size >= 1024 && unitIdx < units.length - 1) {
    size /= 1024;
    unitIdx += 1;
  }
  const digits = size >= 10 || unitIdx === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIdx]}`;
}

function formatMB(value) {
  if (value == null) return "-";
  return `${(asNumber(value) / (1024 * 1024)).toFixed(2)} MB`;
}

function StatLine({ label, value, muted = false }) {
  return (
    <div className="jw-metrics-line">
      <span className="jw-muted">{label}</span>
      <span className={muted ? "jw-muted2" : ""}>{value}</span>
    </div>
  );
}

export default function Metrics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await apiGet("/api/metrics/storage");
      setData(res || null);
    } catch (e) {
      setErr(e?.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const keyCounts = data?.key_counts || {};
  const ml = data?.ml || {};
  const dbstatAvailable = Boolean(data?.dbstat_available);
  const totalDbBytes =
    asNumber(data?.db_size_bytes) + asNumber(data?.wal_size_bytes) + asNumber(data?.shm_size_bytes);
  const hasMlArtifacts = asNumber(ml.model_size_bytes) > 0 || asNumber(ml.exports_size_bytes) > 0;

  const rows = useMemo(() => {
    const source = Array.isArray(data?.tables) ? data.tables : [];
    const copy = [...source];
    copy.sort((a, b) => {
      if (data?.dbstat_available) {
        return asNumber(b.size_bytes) - asNumber(a.size_bytes);
      }
      return asNumber(b.row_count) - asNumber(a.row_count);
    });
    return copy;
  }, [data?.tables, data?.dbstat_available]);

  return (
    <div className="jw-page-shell">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="dashboard" size={13} /> Metrics
            </span>
            <span className="jw-badge subtle">{rows.length} tables</span>
          </div>
          <h1 className="jw-page-hero-title">Storage and retention metrics</h1>
          <p className="jw-page-hero-sub">
            Read-only snapshot of DB size, table growth, inbox volume, and local ML footprint.
          </p>
        </div>
        <div>
          <button className="jw-btn" type="button" onClick={load} disabled={loading}>
            <Icon name="refresh" size={13} /> {loading ? "Refreshing..." : "Refresh"}
          </button>
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

      <div className="jw-row">
        <div className="jw-col jw-card">
          <div className="jw-card-h">
            <div className="jw-card-title">Database files</div>
          </div>
          <div className="jw-card-b">
            <StatLine label="Total DB footprint" value={formatBytes(totalDbBytes)} />
            <StatLine label="Main DB file" value={formatBytes(data?.db_size_bytes)} />
            <StatLine label="WAL file" value={formatBytes(data?.wal_size_bytes)} />
            <StatLine label="SHM file" value={formatBytes(data?.shm_size_bytes)} />
            {data?.db_path ? <StatLine label="DB file" value={String(data.db_path)} muted /> : null}
          </div>
        </div>

        <div className="jw-col jw-card">
          <div className="jw-card-h">
            <div className="jw-card-title">Retention and counts</div>
          </div>
          <div className="jw-card-b">
            <StatLine label="Runs retained" value={formatCount(keyCounts.runs_retained)} />
            <StatLine label="Audit rows" value={formatCount(keyCounts.audit_rows)} />
            <StatLine label="Inbox active rows" value={formatCount(keyCounts.inbox_active_rows)} />
            <StatLine label="Inbox inactive rows" value={formatCount(keyCounts.inbox_inactive_rows)} />
            <StatLine label="Feedback rows" value={formatCount(keyCounts.feedback_rows)} />
            <StatLine label="Overrides rows" value={formatCount(keyCounts.overrides_rows)} />
            <StatLine label="Companies count" value={formatCount(keyCounts.companies_count)} />
            <StatLine label="jobs_latest count" value={formatCount(keyCounts.jobs_latest_count)} />
            <StatLine label="jobs_seen count" value={formatCount(keyCounts.jobs_seen_count)} />
          </div>
        </div>

        <div className="jw-col jw-card">
          <div className="jw-card-h">
            <div className="jw-card-title">Local ML footprint</div>
          </div>
          <div className="jw-card-b">
            <StatLine label="Feedback labels" value={formatCount(ml.feedback_rows)} />
            {hasMlArtifacts ? (
              <>
                <StatLine label="Model artifacts" value={formatBytes(ml.model_size_bytes)} />
                <StatLine label="Export files" value={formatBytes(ml.exports_size_bytes)} />
              </>
            ) : (
              <div className="jw-help">No local model/export artifacts detected in current data directory.</div>
            )}
          </div>
        </div>
      </div>

      <div className="jw-card">
        <div
          className="jw-card-h"
          style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}
        >
          <div className="jw-card-title">Table breakdown</div>
          <span className="jw-badge subtle">{dbstatAvailable ? "Size + rows" : "Rows only"}</span>
        </div>
        <div className="jw-card-b">
          {!dbstatAvailable ? (
            <div className="jw-help" style={{ marginBottom: 10 }}>
              Exact per-table sizes unavailable on this SQLite build; showing row counts only.
            </div>
          ) : null}

          <div className="jw-tablewrap">
            <table className="jw-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Rows</th>
                  {dbstatAvailable ? <th>Total Size</th> : null}
                  {dbstatAvailable ? <th>Table Data</th> : null}
                  {dbstatAvailable ? <th>Indexes</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td>{formatCount(r.row_count)}</td>
                      {dbstatAvailable ? <td>{formatMB(r.size_bytes)}</td> : null}
                      {dbstatAvailable ? <td>{formatMB(r.table_size_bytes)}</td> : null}
                      {dbstatAvailable ? <td>{formatMB(r.indexes_size_bytes)}</td> : null}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={dbstatAvailable ? 5 : 2} className="jw-muted" style={{ padding: 16 }}>
                      No table data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        .jw-metrics-line{
          display: flex;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: rgba(24, 33, 45, 0.46);
          padding: 8px 10px;
          margin-bottom: 8px;
        }
      `}</style>
    </div>
  );
}
