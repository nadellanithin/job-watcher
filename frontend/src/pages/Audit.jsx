import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiDelete, apiGet, apiPut } from "../api/client.js";

function fmtDate(s) {
  if (!s) return "";
  try {
    const d = new Date(s);
    return d.toLocaleString();
  } catch {
    return s;
  }
}

function normalizeReasons(v) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || "").replace(/[\r\n\t]+/g, " ").replace(/^\*+\s*/, "").trim())
    .filter(Boolean);
}

function titleCaseWords(s) {
  return String(s || "")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function prettyReason(raw) {
  const clean = String(raw || "").replace(/[\r\n\t]+/g, " ").replace(/^\*+\s*/, "").trim();
  if (!clean) return "-";

  const parts = clean.split(":").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const key = titleCaseWords(parts[0]);
    const status = titleCaseWords(parts[1]).toLowerCase();
    const value = parts.slice(2).join(":").trim();
    if (value) return `${key}: ${status} - ${value}`;
    return `${key}: ${status}`;
  }
  return clean;
}

export default function Audit() {
  const [searchParams, setSearchParams] = useSearchParams();

  const runIdParam = searchParams.get("run_id") || "";
  const outcomeParam = searchParams.get("outcome") || "all";
  const qParam = searchParams.get("q") || "";

  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(runIdParam);
  const [outcome, setOutcome] = useState(outcomeParam);
  const [q, setQ] = useState(qParam);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [data, setData] = useState({ items: [], total: 0, meta: {} });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    apiGet("/api/runs")
      .then((rows) => {
        if (!alive) return;
        setRuns(rows || []);
      })
      .catch(() => {
        // Ignore failure; audit can still load from URL params.
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sp = {};
    if (runId) sp.run_id = runId;
    if (outcome && outcome !== "all") sp.outcome = outcome;
    if (q && q.trim()) sp.q = q.trim();
    setSearchParams(sp, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, outcome, q]);

  const fetchAudit = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      if (runId) params.set("run_id", runId);
      params.set("outcome", outcome || "all");
      if (q && q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const res = await apiGet(`/api/audit?${params.toString()}`);
      setData(res || { items: [], total: 0, meta: {} });
    } catch (e) {
      setErr(e?.message || "Failed to load audit");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, outcome, q, page, pageSize]);

  const totalPages = useMemo(() => {
    const t = Number(data?.total || 0);
    return Math.max(1, Math.ceil(t / pageSize));
  }, [data?.total, pageSize]);

  const onForce = async (dedupeKey, action) => {
    try {
      await apiPut(`/api/overrides/${encodeURIComponent(dedupeKey)}`, { action });
      await fetchAudit();
    } catch (e) {
      alert(e?.message || "Override failed");
    }
  };

  const onClear = async (dedupeKey) => {
    try {
      await apiDelete(`/api/overrides/${encodeURIComponent(dedupeKey)}`);
      await fetchAudit();
    } catch (e) {
      alert(e?.message || "Clear override failed");
    }
  };

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
              <span className="jw-badge subtle">Audit</span>
              <span className="jw-badge subtle">{data.total || 0} rows</span>
              {data?.meta?.run_id ? (
                <span className="jw-badge ok">run_id {data.meta.run_id}</span>
              ) : (
                <span className="jw-badge subtle">Latest run</span>
              )}
            </div>
            <div className="jw-muted2" style={{ marginTop: 8, fontSize: 12 }}>
              See included and excluded jobs, then force include or exclude overrides.
            </div>
          </div>
        </div>
      </div>

      <div className="jw-card">
        <div className="jw-card-h">
          <div className="jw-card-title">Filters</div>
        </div>

        <div className="jw-card-b">
          <div className="jw-toolbar" style={{ gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ minWidth: 240 }}>
              <div className="jw-label">Run</div>
              <select
                className="jw-select"
                value={runId}
                onChange={(e) => {
                  setRunId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Latest</option>
                {runs.map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    {fmtDate(r.started_at)}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: 180 }}>
              <div className="jw-label">Outcome</div>
              <select
                className="jw-select"
                value={outcome}
                onChange={(e) => {
                  setOutcome(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="included">Included</option>
                <option value="excluded">Excluded</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <div className="jw-label">Search</div>
              <input
                className="jw-input"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="company / title / location / url / reasons"
              />
            </div>

            <div style={{ minWidth: 150 }}>
              <div className="jw-label">Rows</div>
              <select
                className="jw-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[25, 50, 100, 200].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

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
            <div className="jw-card-title">Results</div>
            <div className="jw-muted2" style={{ marginTop: 6, fontSize: 12 }}>
              {loading ? "Loading..." : `${data.total || 0} rows`}
              {data?.meta?.run_id ? ` - run_id ${data.meta.run_id}` : ""}
            </div>
          </div>

          <div className="jw-toolbar">
            <button
              className="jw-btn small"
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              Prev
            </button>
            <span className="jw-badge subtle">
              Page <b>{page}</b> / <b>{totalPages}</b>
            </span>
            <button
              className="jw-btn small"
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next
            </button>
          </div>
        </div>

        <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
          {err ? <div className="jw-alert">{err}</div> : null}

          <div className="jw-tablewrap" style={{ overflowX: "auto" }}>
            <table className="jw-table" style={{ tableLayout: "fixed", minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Outcome</th>
                  <th style={{ width: 160 }}>Company</th>
                  <th style={{ width: 275 }}>Title</th>
                  <th style={{ width: 180 }}>Location</th>
                  <th style={{ width: 150 }}>Source</th>
                  <th style={{ width: 240 }}>Reasons</th>
                  <th style={{ width: 180 }}>Override</th>
                </tr>
              </thead>
              <tbody>
                {(data.items || []).map((r) => {
                  const included = Number(r.included) === 1;
                  const oa = (r.override_action || "").toLowerCase();
                  const reasons = normalizeReasons(r.reasons);
                  const shownReasons = reasons.slice(0, 3);
                  const extraReasons = Math.max(0, reasons.length - shownReasons.length);
                  const overrideClass = oa === "include" ? "ok" : oa === "exclude" ? "danger" : "subtle";

                  return (
                    <tr key={r.dedupe_key}>
                      <td style={{ verticalAlign: "top" }}>
                        <span className={`jw-badge ${included ? "ok" : "danger"}`}>
                          {included ? "Included" : "Excluded"}
                        </span>
                      </td>
                      <td style={{ verticalAlign: "top", fontWeight: 800 }}>{r.company_name}</td>
                      <td style={{ verticalAlign: "top" }}>
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontWeight: 600,
                              textDecoration: "underline",
                              textDecorationStyle: "dashed",
                              textUnderlineOffset: "4px",
                            }}
                          >
                            {r.title} <span style={{ fontWeight: 700 }}>↗</span>
                          </a>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{r.title}</span>
                        )}
                      </td>
                      <td className="jw-muted" style={{ verticalAlign: "top" }}>
                        {r.location || "-"}
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        <span>{r.source_type}</span>
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        {!shownReasons.length ? (
                          <span className="jw-muted2">-</span>
                        ) : (
                          <div style={{ display: "grid", gap: 5 }}>
                            {shownReasons.map((reason, idx) => (
                              <div
                                key={`${r.dedupe_key}-reason-${idx}`}
                                className="jw-muted2"
                                style={{
                                  fontSize: 12,
                                  lineHeight: 1.3,
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "flex-start",
                                }}
                              >
                                <span style={{ fontSize: 10, lineHeight: "16px" }}>*</span>
                                <span>{prettyReason(reason)}</span>
                              </div>
                            ))}
                            {extraReasons > 0 ? (
                              <span className="jw-badge subtle" style={{ width: "fit-content", marginTop: 2 }}>
                                +{extraReasons} more
                              </span>
                            ) : null}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: "top" }}>
                        <div className="jw-row" style={{ gap: 8, flexWrap: "wrap" }}>
                          {oa ? (
                            <>
                              <span
                                className={`jw-pill ${overrideClass}`}
                                style={{ margin: 0, borderRadius: 10, textTransform: "capitalize" }}
                              >
                                Override: {oa}
                              </span>
                              <button className="jw-btn small" type="button" onClick={() => onClear(r.dedupe_key)}>
                                Clear
                              </button>
                            </>
                          ) : !included ? (
                            <button
                              className="jw-btn small"
                              type="button"
                              onClick={() => onForce(r.dedupe_key, "include")}
                            >
                              Force include
                            </button>
                          ) : (
                            <button
                              className="jw-btn small"
                              type="button"
                              onClick={() => onForce(r.dedupe_key, "exclude")}
                            >
                              Force exclude
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && (!data.items || data.items.length === 0) ? (
                  <tr>
                    <td colSpan={7} className="jw-muted" style={{ padding: 14 }}>
                      No rows.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
