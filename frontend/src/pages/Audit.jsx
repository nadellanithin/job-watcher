import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiDelete, apiGet, apiPost, apiPut } from "../api/client.js";
import Icon from "../components/Icon.jsx";
import SelectMenu from "../components/SelectMenu.jsx";

function fmtDate(value) {
  if (!value) return "-";
  try {
    const d = new Date(value);
    return d.toLocaleString();
  } catch {
    return value;
  }
}

function normalizeReasons(v) {
  if (!Array.isArray(v)) return [];
  const prettify = (token) =>
    String(token ?? "")
      .replace(/_/g, " ")
      .trim();

  const humanize = (raw) => {
    const cleaned = String(raw ?? "")
      .replace(/[\r\n]+/g, " ")
      .replace(/^\*+\s*/, "")
      .trim();
    if (!cleaned) return "";

    const parts = cleaned
      .split(":")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return "";

    if (parts[0] === "score") {
      if (parts[1] === "total") {
        const total = parts[2] ?? "?";
        const thresholdIdx = parts.indexOf("threshold");
        const threshold = thresholdIdx >= 0 ? parts[thresholdIdx + 1] : null;
        return threshold
          ? `Score total ${total} (threshold ${threshold})`
          : `Score total ${total}`;
      }

      const delta = parts[1] || "";
      const family = prettify(parts[2] || "");
      const field = prettify(parts[3] || "");
      const matchType = prettify(parts[4] || "");
      const matched = prettify(parts.slice(5).join(":"));

      if (family && field && matched) return `Score ${delta} from ${family} match in ${field}: "${matched}"`;
      if (family && field && matchType) return `Score ${delta} from ${family} match in ${field} (${matchType})`;
      if (family && field) return `Score ${delta} from ${family} match in ${field}`;
      if (family) return `Score ${delta} from ${family} match`;
      return `Score ${delta}`.trim();
    }

    if (parts[0] === "override" && parts[1] === "force_include") return "Manual override: forced include";
    if (parts[0] === "override" && parts[1] === "force_exclude") return "Manual override: forced exclude";

    if (parts.length > 1) {
      return `${prettify(parts[0])}: ${parts
        .slice(1)
        .map((p) => prettify(p))
        .join(" | ")}`;
    }
    return prettify(parts[0]);
  };

  return v.map((x) => humanize(x)).filter(Boolean);
}

function normalizeFeedbackLabel(label) {
  if (label === "applied") return "include";
  return label || "";
}

function feedbackBadgeMeta(label) {
  const normalized = normalizeFeedbackLabel(label);
  if (normalized === "include") return { className: "ok", text: "Feedback include" };
  if (normalized === "exclude") return { className: "danger", text: "Feedback exclude" };
  if (normalized === "ignore") return { className: "warn", text: "Feedback ignore" };
  if (!normalized) return { className: "subtle", text: "No feedback" };
  return { className: "subtle", text: `Feedback ${String(normalized)}` };
}

function DecisionBlock({ item, compact = false }) {
  const included = !!item?.included;
  const hasOverride = item?.override_action === "include" || item?.override_action === "exclude";
  const overrideClass = hasOverride ? (item.override_action === "include" ? "ok" : "danger") : "subtle";
  const overrideText = hasOverride ? `Forced ${item.override_action}` : "Auto decision";
  const feedback = feedbackBadgeMeta(item?.feedback_label);

  return (
    <div className={`jw-audit-decision-card ${included ? "ok" : "danger"} ${compact ? "compact" : ""}`}>
      <div className="jw-audit-decision-head">
        <span className={`jw-audit-decision-dot ${included ? "ok" : "danger"}`} />
        <div>
          <div className="jw-audit-decision-title">{included ? "Included" : "Excluded"}</div>
          {!compact ? <div className="jw-audit-decision-sub">{hasOverride ? "Manual override active" : "Rule-based decision"}</div> : null}
        </div>
      </div>
      <div className="jw-audit-decision-tags">
        <span className={`jw-badge ${overrideClass}`}>{overrideText}</span>
        <span className={`jw-badge ${feedback.className}`}>{feedback.text}</span>
      </div>
    </div>
  );
}

function FeedbackButtons({ value, onChange }) {
  const current = normalizeFeedbackLabel(value);
  const options = [
    { value: "include", label: "Mark include", className: "ok" },
    { value: "exclude", label: "Mark exclude", className: "danger" },
    { value: "ignore", label: "Mark ignore", className: "warn" },
  ];

  return (
    <div className="jw-audit-feedback-group" role="group" aria-label="Set feedback">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`jw-audit-feedback-btn ${opt.className} ${current === opt.value ? "active" : ""}`}
          type="button"
          onClick={() => {
            if (opt.value === current) return;
            onChange(opt.value);
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function OverrideButton({ row, onSetOverride, onClearOverride }) {
  const activeOverride = row.override_action === "include" || row.override_action === "exclude" ? row.override_action : "";
  const included = !!row.included;

  if (activeOverride) {
    return (
      <button className="jw-btn small" type="button" onClick={() => onClearOverride(row.dedupe_key)}>
        Remove forced {activeOverride}
      </button>
    );
  }

  const desired = included ? "exclude" : "include";
  return (
    <button
      className={`jw-btn ${desired === "include" ? "primary" : "danger"} small`}
      type="button"
      onClick={() => onSetOverride(row.dedupe_key, desired)}
    >
      {desired === "include" ? "Force include" : "Force exclude"}
    </button>
  );
}

function AuditCard({ item, onSetOverride, onClearOverride, onSetFeedback }) {
  const reasons = normalizeReasons(item.reasons);
  const sourceText = item.source_type || item.source || "Unknown";

  return (
    <div className="jw-carditem">
      <div className="jw-audit-card-head">
        <DecisionBlock item={item} compact />
        <div className="jw-audit-card-meta">
          {item.work_mode ? <span className="jw-badge subtle">{item.work_mode}</span> : null}
          <span className="jw-badge subtle">{sourceText}</span>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className="jw-joblink">
            {item.title} <Icon name="external" size={13} />
          </a>
        ) : (
          <div style={{ fontWeight: 600 }}>{item.title}</div>
        )}

        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="jw-audit-company">{item.company_name || "-"}</span>
          {item.location ? <span className="jw-help">{item.location}</span> : null}
          <span className="jw-help">{sourceText}</span>
          <span className="jw-help">{fmtDate(item.created_at)}</span>
        </div>
      </div>

      <details className="jw-audit-reasons" style={{ marginTop: 10 }}>
        <summary>
          <Icon name="chevronRight" size={13} className="jw-audit-reason-caret" />
          <span>Reasons ({reasons.length || 0})</span>
        </summary>
        <div className="jw-audit-reason-list">
          {reasons.length ? (
            reasons.map((x, i) => (
              <div key={i}>
                <span className="jw-audit-reason-arrow">{">"}</span>
                <span>{x}</span>
              </div>
            ))
          ) : (
            <div>No reasons recorded.</div>
          )}
        </div>
      </details>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <div className="jw-audit-actions">
          <OverrideButton row={item} onSetOverride={onSetOverride} onClearOverride={onClearOverride} />
          <FeedbackButtons value={item.feedback_label} onChange={(next) => onSetFeedback(item.dedupe_key, next)} />
        </div>
        <span className="jw-badge subtle" title="Last evaluated at">
          {fmtDate(item.created_at)}
        </span>
      </div>
    </div>
  );
}

export default function Audit() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(searchParams.get("run_id") || "");
  const [outcome, setOutcome] = useState(searchParams.get("outcome") || "all");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [page, setPage] = useState(Number(searchParams.get("page") || 1));
  const [pageSize, setPageSize] = useState(Number(searchParams.get("page_size") || 10));

  const [data, setData] = useState({ items: [], total: 0, meta: {} });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tableWrapRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let alive = true;
    apiGet("/api/runs")
      .then((rows) => {
        if (!alive) return;
        setRuns(rows || []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sp = {};
    if (runId) sp.run_id = runId;
    if (outcome && outcome !== "all") sp.outcome = outcome;
    if (q && q.trim()) sp.q = q.trim();
    sp.page = String(page);
    sp.page_size = String(pageSize);
    setSearchParams(sp, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, outcome, q, page, pageSize]);

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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(Number(data.total || 0) / pageSize)), [data.total, pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const onSetOverride = async (dedupeKey, action) => {
    await apiPut(`/api/overrides/${encodeURIComponent(dedupeKey)}`, { action, note: "" });
    fetchAudit();
  };

  const onClearOverride = async (dedupeKey) => {
    await apiDelete(`/api/overrides/${encodeURIComponent(dedupeKey)}`);
    fetchAudit();
  };

  const onSetFeedback = async (dedupeKey, label) => {
    await apiPost("/api/feedback", { dedupe_key: dedupeKey, label, reason_category: "" });
    fetchAudit();
  };

  const clearFilters = () => {
    setOutcome("all");
    setQ("");
    setPage(1);
  };

  const filtersContent = (
    <div className="jw-audit-filters-stack">
      <div className="jw-audit-filters-grid">
        <div>
          <div className="jw-label">Run</div>
          <SelectMenu
            value={runId}
            onChange={setRunId}
            options={[{ value: "", label: "Latest" }, ...runs.map((r) => ({ value: r.run_id, label: `${fmtDate(r.started_at)} - ${r.run_id?.slice(0, 8)}` }))]}
            ariaLabel="Run"
          />
        </div>

        <div>
          <div className="jw-label">Outcome</div>
          <SelectMenu
            value={outcome}
            onChange={setOutcome}
            options={[
              { value: "all", label: "All" },
              { value: "included", label: "Included" },
              { value: "excluded", label: "Excluded" },
            ]}
            ariaLabel="Outcome"
          />
        </div>

        <div>
          <div className="jw-label">Rows</div>
          <SelectMenu
            value={pageSize}
            onChange={(n) => setPageSize(Number(n))}
            options={[10, 25, 50, 100].map((n) => ({ value: n, label: String(n) }))}
            ariaLabel="Rows per page"
          />
        </div>
      </div>

      <div>
        <div className="jw-label">Search</div>
        <input className="jw-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="company, title, location, url, reason" />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <button className="jw-btn ghost" type="button" onClick={clearFilters}>
          Clear filters
        </button>
        {isMobile ? (
          <button className="jw-btn primary" type="button" onClick={() => setFiltersOpen(false)}>
            Apply
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="jw-page-shell jw-audit-page">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="shield" size={13} /> Audit
            </span>
            <span className="jw-badge subtle">{data.total || 0} rows</span>
            {data?.meta?.run_id ? <span className="jw-badge ok">run {String(data.meta.run_id).slice(0, 8)}</span> : <span className="jw-badge subtle">Latest run</span>}
          </div>
          <h1 className="jw-page-hero-title">Decision audit trail</h1>
          <p className="jw-page-hero-sub">Review decisions, force include or exclude when needed, and save feedback labels for future runs.</p>
        </div>

        <div className="jw-audit-hero-actions">
          {isMobile ? (
            <button className="jw-btn" type="button" onClick={() => setFiltersOpen(true)}>
              <Icon name="filter" size={14} /> Filters
            </button>
          ) : null}
        </div>
      </div>

      {!isMobile ? (
        <div className="jw-card">
          <div className="jw-card-h" style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div className="jw-card-title">Filters</div>
            <span className="jw-badge subtle">{outcome === "all" ? "All outcomes" : `Outcome: ${outcome}`}</span>
          </div>
          <div className="jw-card-b">{filtersContent}</div>
        </div>
      ) : null}

      {err ? (
        <div className="jw-alert">
          <b>Error</b>
          <div style={{ marginTop: 6 }} className="jw-muted">
            {err}
          </div>
        </div>
      ) : null}

      {data.total ? (
        <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="jw-badge subtle">
            Page <b>{page}</b> / <b>{totalPages}</b>
          </span>
          <div className="jw-toolbar" style={{ flexWrap: "wrap" }}>
            <button className="jw-btn small" onClick={() => setPage(1)} disabled={page <= 1} type="button">
              First
            </button>
            <button className="jw-btn small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} type="button">
              Prev
            </button>
            <button className="jw-btn small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} type="button">
              Next
            </button>
            <button className="jw-btn small" onClick={() => setPage(totalPages)} disabled={page >= totalPages} type="button">
              Last
            </button>
          </div>
        </div>
      ) : null}

      {loading ? <div className="jw-muted">Loading...</div> : null}
      {!loading && !err && (!data.items || data.items.length === 0) ? <div className="jw-empty">No results for these filters.</div> : null}

      {!loading && !err && data.items?.length ? (
        <>
          <div className="jw-only-desktop jw-tablewrap" ref={tableWrapRef}>
            <table className="jw-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 260 }}>Job</th>
                  <th style={{ minWidth: 320 }}>Decision</th>
                  <th style={{ minWidth: 320 }}>Reasons</th>
                  <th style={{ minWidth: 320 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const reasons = normalizeReasons(item.reasons);
                  const sourceText = item.source_type || item.source || "Unknown";

                  return (
                    <tr key={item.dedupe_key}>
                      <td style={{ verticalAlign: "top" }}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer" className="jw-joblink">
                            {item.title} <Icon name="external" size={13} />
                          </a>
                        ) : (
                          <span style={{ fontWeight: 600 }}>{item.title}</span>
                        )}
                        <div className="jw-audit-jobmeta">
                          <span className="jw-audit-company">{item.company_name || "-"}</span>
                          {item.location ? <span>{item.location}</span> : null}
                          <span>{sourceText}</span>
                          <span>{fmtDate(item.created_at)}</span>
                        </div>
                      </td>

                      <td style={{ verticalAlign: "top" }}>
                        <DecisionBlock item={item} />
                      </td>

                      <td style={{ verticalAlign: "top" }}>
                        {reasons.length ? (
                          <details className="jw-audit-reasons">
                            <summary>
                              <Icon name="chevronRight" size={13} className="jw-audit-reason-caret" />
                              <span>
                                {reasons.length} reason{reasons.length > 1 ? "s" : ""}
                              </span>
                            </summary>
                            <div className="jw-audit-reason-list">
                              {reasons.map((x, i) => (
                                <div key={i}>
                                  <span className="jw-audit-reason-arrow">{">"}</span>
                                  <span>{x}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <span className="jw-help">No reasons recorded.</span>
                        )}
                      </td>

                      <td style={{ verticalAlign: "top" }}>
                        <div className="jw-audit-actions-col">
                          <OverrideButton row={item} onSetOverride={onSetOverride} onClearOverride={onClearOverride} />
                          <FeedbackButtons value={item.feedback_label} onChange={(next) => onSetFeedback(item.dedupe_key, next)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="jw-only-mobile jw-cardlist">
            {data.items.map((item) => (
              <AuditCard key={item.dedupe_key} item={item} onSetOverride={onSetOverride} onClearOverride={onClearOverride} onSetFeedback={onSetFeedback} />
            ))}
          </div>
        </>
      ) : null}

      {isMobile ? (
        <>
          <div className={`jw-sheet-overlay ${filtersOpen ? "open" : ""}`} onClick={() => setFiltersOpen(false)} />
          <div className={`jw-sheet ${filtersOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-label="Audit filters">
            <div className="jw-sheet-h">
              <div className="jw-sheet-title">Filters</div>
              <button className="jw-btn small" type="button" onClick={() => setFiltersOpen(false)}>
                Close
              </button>
            </div>
            <div className="jw-sheet-b">{filtersContent}</div>
          </div>
        </>
      ) : null}

      <style>{`
        .jw-audit-page{
          --fs-xs: 12px;
          --fs-sm: 13px;
          --fs-base: 14px;
          --fs-md: 16px;
        }
        .jw-audit-page .jw-table th{
          font-size: 11px;
        }
        .jw-audit-hero-actions{
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .jw-audit-filters-stack{
          display: grid;
          gap: 12px;
        }
        .jw-audit-filters-grid{
          display: grid;
          grid-template-columns: minmax(220px, 1.35fr) repeat(2, minmax(140px, 0.85fr));
          gap: 12px;
          align-items: end;
        }
        .jw-joblink{
          font-weight: 600;
          font-size: 15px;
          text-decoration: underline;
          text-decoration-style: dashed;
          text-underline-offset: 4px;
          color: var(--text);
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .jw-audit-card-head{
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .jw-audit-card-meta{
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .jw-audit-actions{
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .jw-audit-actions-col{
          display: grid;
          gap: 10px;
          min-width: 280px;
        }
        .jw-audit-jobmeta{
          margin-top: 15px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          color: var(--muted);
          font-size: var(--fs-xs);
        }
        .jw-audit-jobmeta > span{
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--border);
          background: rgba(255,255,255,0.03);
        }
        .jw-audit-company{
          display: inline-flex;
          align-items: center;
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(var(--primary-rgb), 0.42);
          background: rgba(var(--primary-rgb), 0.18);
          color: #d1fae5;
          font-size: var(--fs-xs);
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        .jw-audit-decision-card{
          display: grid;
          gap: 10px;
          padding: 10px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: rgba(24, 33, 45, 0.56);
        }
        .jw-audit-decision-card.ok{
          border-color: rgba(34, 197, 94, 0.32);
          background: rgba(34, 197, 94, 0.08);
        }
        .jw-audit-decision-card.danger{
          border-color: rgba(251, 113, 133, 0.34);
          background: rgba(251, 113, 133, 0.08);
        }
        .jw-audit-decision-card.compact{
          gap: 8px;
          padding: 8px 10px;
        }
        .jw-audit-decision-head{
          display: flex;
          gap: 8px;
          align-items: flex-start;
        }
        .jw-audit-decision-dot{
          width: 9px;
          height: 9px;
          border-radius: 999px;
          margin-top: 5px;
          flex: 0 0 auto;
        }
        .jw-audit-decision-dot.ok{ background: #22c55e; }
        .jw-audit-decision-dot.danger{ background: #fb7185; }
        .jw-audit-decision-title{
          font-size: 13px;
          font-weight: 700;
          line-height: 1.2;
        }
        .jw-audit-decision-sub{
          margin-top: 3px;
          font-size: 12px;
          color: var(--muted2);
        }
        .jw-audit-decision-tags{
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jw-audit-reasons summary{
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          color: var(--muted);
          font-size: 12px;
          list-style: none;
        }
        .jw-audit-reason-caret{
          transition: transform 140ms ease;
        }
        .jw-audit-reasons[open] .jw-audit-reason-caret{
          transform: rotate(90deg);
        }
        .jw-audit-reasons summary::-webkit-details-marker{
          display: none;
        }
        .jw-audit-reason-list{
          margin-top: 8px;
          display: grid;
          gap: 9px;
          font-size: 13px;
          color: var(--text);
          line-height: 1.5;
        }
        .jw-audit-reason-list > div{
          display: flex;
          gap: 8px;
          align-items: flex-start;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
        }
        .jw-audit-reason-arrow{
          color: var(--primary);
          font-weight: 700;
          line-height: 1.2;
          margin-top: 1px;
          flex: 0 0 auto;
        }
        .jw-audit-feedback-group{
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jw-audit-feedback-btn{
          border: 1px solid var(--border);
          background: rgba(24, 33, 45, 0.62);
          color: var(--text-2);
          border-radius: 10px;
          padding: 7px 9px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 140ms ease, background 140ms ease, color 140ms ease, transform 120ms ease;
        }
        .jw-audit-feedback-btn:hover{
          border-color: var(--border-strong);
          color: var(--text);
          transform: translateY(-1px);
        }
        .jw-audit-feedback-btn.active.ok{
          border-color: rgba(34, 197, 94, 0.42);
          background: rgba(34, 197, 94, 0.16);
          color: #bbf7d0;
        }
        .jw-audit-feedback-btn.active.warn{
          border-color: rgba(251, 191, 36, 0.42);
          background: rgba(251, 191, 36, 0.16);
          color: #fef3c7;
        }
        .jw-audit-feedback-btn.active.danger{
          border-color: rgba(251, 113, 133, 0.42);
          background: rgba(251, 113, 133, 0.16);
          color: #fecdd3;
        }
        @media (max-width: 1120px){
          .jw-audit-actions-col{
            min-width: 240px;
          }
          .jw-audit-filters-grid{
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 767px){
          .jw-audit-filters-grid{
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

