import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost } from "../api/client";

function formatLocal(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function relativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;

  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function parseStats(statsJson) {
  if (!statsJson) return null;
  try {
    if (typeof statsJson === "string") return JSON.parse(statsJson);
    return statsJson;
  } catch {
    return null;
  }
}

function sumHeadline(runs) {
  if (!runs?.length) return { fetched: 0, unique: 0, new: 0 };
  const st = parseStats(runs[0]?.stats_json) || {};
  return {
    fetched: st.fetched ?? 0,
    unique: st.unique ?? 0,
    new: st.new ?? 0,
  };
}

export default function Dashboard() {
  const [runs, setRuns] = useState([]);
  const [scheduler, setScheduler] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [runningNow, setRunningNow] = useState(false);

  const [runLogs, setRunLogs] = useState("");
  const [logQuery, setLogQuery] = useState("");

  // Run settings modal ("receipt")
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsModalLoading, setSettingsModalLoading] = useState(false);
  const [settingsModalErr, setSettingsModalErr] = useState("");
  const [settingsModalRun, setSettingsModalRun] = useState(null);
  const [settingsModalSettings, setSettingsModalSettings] = useState(null);

  // Recent runs pagination
  const [runsPage, setRunsPage] = useState(1);
  const runsPageSize = 8;

  const pollRef = useRef(null);

  const refreshRuns = async () => {
    const data = await apiGet("/api/runs");
    setRuns(Array.isArray(data) ? data : []);
  };

  const refreshScheduler = async () => {
    const data = await apiGet("/api/scheduler/status");
    setScheduler(data);
  };

  const refreshAll = async () => {
    try {
      setErr("");
      await Promise.all([refreshRuns(), refreshScheduler()]);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    try {
      setErr("");
      setRunningNow(true);
      setRunLogs("");
      const resp = await apiPost("/api/run");
      if (resp?.logs) setRunLogs(resp.logs);
      await refreshAll();
    } catch (e) {
      setErr(String(e));
    } finally {
      setRunningNow(false);
    }
  };

  const openRunSettings = async (run) => {
    setSettingsModalRun(run || null);
    setSettingsModalErr("");
    setSettingsModalSettings(null);
    setSettingsModalOpen(true);
    if (!run?.run_id) return;

    try {
      setSettingsModalLoading(true);
      const data = await apiGet(`/api/runs/${run.run_id}/settings`);
      let parsed = null;
      try {
        parsed = data?.settings_json ? JSON.parse(data.settings_json) : null;
      } catch {
        parsed = null;
      }
      setSettingsModalSettings({ raw: data, settings: parsed });
    } catch (e) {
      setSettingsModalErr(String(e));
    } finally {
      setSettingsModalLoading(false);
    }
  };

  const copyLogs = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt || "");
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshAll();

    pollRef.current = setInterval(() => {
      refreshScheduler().catch(() => {});
    }, 10000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastRun = runs?.[0] || null;
  const lastStats = useMemo(() => parseStats(lastRun?.stats_json), [lastRun]);

  const headline = sumHeadline(runs);

  const derivedLogs = runLogs || lastStats?.logs || "";
  const filteredLogs = useMemo(() => {
    const q = logQuery.trim().toLowerCase();
    if (!q) return derivedLogs;
    return derivedLogs
      .split("\n")
      .filter((ln) => ln.toLowerCase().includes(q))
      .join("\n");
  }, [derivedLogs, logQuery]);

  // Scheduler safe fallbacks
  const schedEnabled = scheduler?.enabled === true;
  const sched = schedEnabled ? scheduler : null;

  const schedRunCount =
    sched?.run_count ??
    sched?.runs ??
    sched?.runCount ??
    scheduler?.run_count ??
    scheduler?.runs ??
    scheduler?.runCount ??
    0;

  const runsTotal = runs?.length || 0;
  const runsTotalPages = Math.max(1, Math.ceil(runsTotal / runsPageSize));
  const safeRunsPage = Math.min(runsPage, runsTotalPages);

  const pagedRuns = useMemo(() => {
    const start = (safeRunsPage - 1) * runsPageSize;
    return (runs || []).slice(start, start + runsPageSize);
  }, [runs, safeRunsPage]);

  useEffect(() => {
    setRunsPage((p) =>
      Math.min(p, Math.max(1, Math.ceil((runs?.length || 0) / runsPageSize)))
    );
  }, [runs]);

  const lastRunText = lastRun?.finished_at
    ? `${relativeTime(lastRun.finished_at)} • ${formatLocal(lastRun.finished_at)}`
    : "—";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* Hero */}
      <div className="jw-card" style={{ background: "var(--surface2)" }}>
        <div
          className="jw-card-b"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
            paddingTop: 12,
            paddingBottom: 12,
          }}
        >
          <div style={{ minWidth: 320 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className="jw-badge subtle">📊 Dashboard</span>
              {schedEnabled ? (
                <span className="jw-badge ok">Scheduler: Enabled</span>
              ) : (
                <span className="jw-badge warn">Scheduler: Disabled</span>
              )}
              <span className="jw-badge subtle">
                Runs: <b style={{ marginLeft: 6 }}>{schedEnabled ? schedRunCount : 0}</b>
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 1000 }}>
              Monitor runs, logs, and job freshness
            </div>
            <div className="jw-muted2" style={{ marginTop: 6 }}>
              Run the fetcher, check errors quickly, and validate if Playwright is needed for any company.
            </div>
          </div>

          <div className="jw-toolbar" style={{ alignItems: "center" }}>
            <button className="jw-btn" onClick={refreshAll} disabled={loading || runningNow} type="button">
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            <button className="jw-btn primary" onClick={runNow} disabled={runningNow} type="button">
              {runningNow ? "Running…" : "Run now"}
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

      {/* ✅ Two-card row: Run Summary (left) + Scheduler (right) */}
      <div className="jw-row">
        {/* Run Summary */}
        <div className="jw-col jw-card">
          <div className="jw-card-h">
            <div className="jw-card-title">Run summary</div>
          </div>
          <div className="jw-card-b">
            <span className="jw-pill" title={lastRun?.finished_at ? formatLocal(lastRun.finished_at) : ""}>
              <span style={{ fontWeight: 900 }}>{`Last run ${lastRunText}`}</span>
            </span>

            <div className="jw-toolbar" style={{ marginTop: 10 }}>
              <span className="jw-badge subtle">
                Fetched: <b>{headline.fetched ?? "—"}</b>
              </span>
              <span className="jw-badge subtle">
                Unique: <b>{headline.unique ?? "—"}</b>
              </span>
              <span className="jw-badge subtle">
                New: <b>{headline.new ?? "—"}</b>
              </span>
            </div>

            <div style={{ marginTop: 12 }} className="jw-muted">
              New jobs are detected by comparing against what was seen in previous runs.
            </div>
          </div>
        </div>

        {/* Scheduler */}
        <div className="jw-col jw-card">
          <div className="jw-card-h" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <div className="jw-card-title">Scheduler</div>
            <button className="jw-btn small" onClick={refreshScheduler} disabled={loading || runningNow} type="button">
              Refresh
            </button>
          </div>

          <div className="jw-card-b">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {schedEnabled ? (
                <span className="jw-badge ok">Enabled</span>
              ) : (
                <span className="jw-badge warn">Disabled</span>
              )}
              <span className="jw-badge subtle">
                Mode: <b>{scheduler?.mode ?? "off"}</b>
              </span>
              <span className="jw-badge subtle">
                Interval: <b>{scheduler?.interval_minutes ?? "—"}m</b>
              </span>
              <span className="jw-badge subtle">
                Runs: <b>{schedRunCount}</b>
              </span>
            </div>

            <div className="jw-muted2" style={{ marginTop: 10, fontSize: 12 }}>
              Last scheduled run: <b>{scheduler?.last_run_at ? formatLocal(scheduler.last_run_at) : "—"}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Logs */}
      <div className="jw-card">
        <div
          className="jw-card-h"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="jw-card-title">Latest run logs</div>
            <div className="jw-muted2" style={{ marginTop: 4, fontSize: 12 }}>
              Search within logs to quickly spot “0 jobs”, pagination, or blocked pages.
            </div>
          </div>

          <div className="jw-toolbar">
            <input
              className="jw-input"
              style={{ minWidth: 240 }}
              value={logQuery}
              onChange={(e) => setLogQuery(e.target.value)}
              placeholder="filter logs…"
            />
            <button className="jw-btn small" onClick={() => copyLogs(derivedLogs)} disabled={!derivedLogs} type="button">
              Copy
            </button>
          </div>
        </div>

        <div className="jw-card-b">
          {derivedLogs ? (
            <pre className="jw-log">{filteredLogs}</pre>
          ) : (
            <div className="jw-empty">
              No logs yet. Click <b>Run now</b> to fetch jobs and see output.
            </div>
          )}

          <div className="jw-muted2" style={{ marginTop: 10, fontSize: 12 }}>
            Tip: If a career page is JS-rendered, set its mode to <b>playwright</b> (requires backend env{" "}
            <b>CAREERURL_PLAYWRIGHT=1</b>).
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div className="jw-card">
        <div
          className="jw-card-h"
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="jw-card-title">Recent runs</div>
            <div className="jw-muted2" style={{ marginTop: 6, fontSize: 12 }}>
              8 rows per page (prevents infinite page growth).
            </div>
          </div>

          <div className="jw-toolbar">
            <span className="jw-badge subtle">{runsTotal} total</span>
            <button className="jw-btn small" onClick={() => setRunsPage(1)} disabled={safeRunsPage <= 1} type="button">
              ⟪ First
            </button>
            <button
              className="jw-btn small"
              onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
              disabled={safeRunsPage <= 1}
              type="button"
            >
              ← Prev
            </button>
            <span className="jw-badge subtle">
              Page <b>{safeRunsPage}</b> / <b>{runsTotalPages}</b>
            </span>
            <button
              className="jw-btn small"
              onClick={() => setRunsPage((p) => Math.min(runsTotalPages, p + 1))}
              disabled={safeRunsPage >= runsTotalPages}
              type="button"
            >
              Next →
            </button>
            <button
              className="jw-btn small"
              onClick={() => setRunsPage(runsTotalPages)}
              disabled={safeRunsPage >= runsTotalPages}
              type="button"
            >
              Last ⟫
            </button>
          </div>
        </div>

        <div className="jw-card-b">
          {!runs?.length ? (
            <div className="jw-empty">No runs yet.</div>
          ) : (
            <div className="jw-tablewrap">
              <table className="jw-table">
                <thead>
                  <tr>
                    <th align="left">Run</th>
                    <th align="left">Started</th>
                    <th align="left">Finished</th>
                    <th align="left">Fetched</th>
                    <th align="left">Unique</th>
                    <th align="left">New</th>
                    <th align="left">Actions</th>
                    <th align="left">Status</th>
                  </tr>
                </thead>

                <tbody>
                  {pagedRuns.map((r) => {
                    const st = parseStats(r.stats_json);
                    const hasErrors = st?.source_errors && Object.keys(st.source_errors).length;

                    return (
                      <tr key={r.run_id}>
                        <td style={{ fontWeight: 900 }}>{r.run_id}</td>
                        <td className="jw-muted">{formatLocal(r.started_at)}</td>
                        <td className="jw-muted">{formatLocal(r.finished_at)}</td>
                        <td>{st?.fetched ?? "—"}</td>
                        <td>{st?.unique ?? "—"}</td>
                        <td>{st?.new ?? "—"}</td>
                        <td>
                          <div className="jw-row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <button className="jw-btn small" type="button" onClick={() => openRunSettings(r)}>
                              Filters
                            </button>
                            <a className="jw-btn small" href={`/audit?run_id=${encodeURIComponent(r.run_id)}`}>
                              Audit
                            </a>
                          </div>
                        </td>
                        <td>
                          {hasErrors ? (
                            <span className="jw-badge danger">Has errors</span>
                          ) : (
                            <span className="jw-badge ok">OK</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Run Filters Modal */}
      {settingsModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSettingsModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 50,
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            className="jw-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 100%)",
              maxHeight: "85vh",
              overflow: "auto",
              boxShadow: "0 25px 70px rgba(0,0,0,0.35)",
            }}
          >
            <div
              className="jw-card-h"
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div className="jw-card-title">Run filters (settings used)</div>
                <div className="jw-muted2" style={{ marginTop: 6, fontSize: 12 }}>
                  Run: <b>{settingsModalRun?.run_id}</b>
                </div>
              </div>

              <div className="jw-toolbar">
                <button className="jw-btn small" onClick={() => setSettingsModalOpen(false)} type="button">
                  Close
                </button>
              </div>
            </div>

            <div className="jw-card-b" style={{ display: "grid", gap: 14 }}>
              {settingsModalErr ? (
                <div className="jw-alert">
                  <b>Error</b>
                  <div style={{ marginTop: 6 }} className="jw-muted">
                    {settingsModalErr}
                  </div>
                </div>
              ) : null}

              {settingsModalLoading ? (
                <div className="jw-muted">Loading settings…</div>
              ) : settingsModalSettings?.settings ? (
                <>
                  <details>
                    <summary style={{ cursor: "pointer", fontWeight: 900 }}>View full settings JSON</summary>
                    <pre className="jw-log" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                      {JSON.stringify(settingsModalSettings.settings, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <div className="jw-empty">No settings snapshot found for this run.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
