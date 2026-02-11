import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";
import Icon from "./Icon.jsx";
import SelectMenu from "./SelectMenu.jsx";

function safeLocal(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function normalizeFacetValue(v) {
  if (v == null) return "";
  return String(v).trim();
}

function toQuery(params) {
  const usp = new URLSearchParams();
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.set(k, String(v));
  });
  return usp.toString();
}

function JobCard({ job }) {
  const h1b = String(job.h1b_signal || "").toLowerCase();
  const h1bBadge =
    h1b === "yes"
      ? { cls: "ok", label: "H-1B signal" }
      : h1b === "no"
      ? { cls: "danger", label: "No H-1B signal" }
      : { cls: "subtle", label: "H-1B: unknown" };

  return (
    <div className="jw-carditem">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <a href={job.url} target="_blank" rel="noreferrer" className="jw-joblink" title="Open job posting">
            {job.title} <Icon name="external" size={13} />
          </a>

          <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className="jw-badge subtle">{job.company_name}</span>
            {job.location ? <span className="jw-badge subtle">{job.location}</span> : null}
          </div>

          <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {job.source ? <span className="jw-badge subtle">{job.source}</span> : null}
            {job.work_mode ? <span className="jw-badge subtle">{job.work_mode}</span> : null}
            <span className={`jw-badge ${h1bBadge.cls}`}>{h1bBadge.label}</span>
          </div>

          <div style={{ marginTop: 10, color: "var(--muted2)", fontSize: 12 }}>First seen: {safeLocal(job.first_seen)}</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <a className="jw-btn primary small" href={job.url} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      </div>
    </div>
  );
}

export default function JobsTable({ scope, runId, settingsHash, onMetaChange }) {
  const [items, setItems] = useState([]);
  const [facets, setFacets] = useState({ sources: [], work_modes: [] });
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [workMode, setWorkMode] = useState("any");
  const [h1bOnly, setH1bOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 920);

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth <= 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setErr("");
      try {
        const params = {
          scope,
          q: q?.trim() ? q.trim() : undefined,
          source: source !== "all" ? normalizeFacetValue(source) : undefined,
          work_mode: workMode !== "any" ? normalizeFacetValue(workMode) : undefined,
          h1b_only: h1bOnly ? "1" : undefined,
          page,
          page_size: pageSize,
        };

        if (runId) params.run_id = runId;
        if (settingsHash) params.settings_hash = settingsHash;

        const qs = toQuery(params);
        const res = await apiGet(`/api/jobs?${qs}`);
        if (cancelled) return;

        setItems(Array.isArray(res?.items) ? res.items : []);
        setTotal(Number(res?.total || 0));

        const f = res?.facets || {};
        setFacets({
          sources: Array.isArray(f.sources) ? f.sources : [],
          work_modes: Array.isArray(f.work_modes) ? f.work_modes : Array.isArray(f.work_mode) ? f.work_mode : [],
        });

        onMetaChange?.({
          total: Number(res?.total || 0),
          page: Number(res?.page || page),
          pageSize: Number(res?.page_size || pageSize),
        });
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, runId, settingsHash, q, source, workMode, h1bOnly, page, pageSize, onMetaChange]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const showEmpty = !loading && !err && (!items || items.length === 0);
  const sourceOptions = useMemo(() => ["all", ...facets.sources], [facets.sources]);
  const workModeOptions = useMemo(() => ["any", ...facets.work_modes], [facets.work_modes]);

  const clearFilters = () => {
    setQ("");
    setSource("all");
    setWorkMode("any");
    setH1bOnly(false);
    setPage(1);
  };

  const filtersContent = (
    <>
      <div>
        <div className="jw-label">Search</div>
        <input className="jw-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. frontend, react, remote" />
        <div className="jw-help" style={{ marginTop: 6 }}>
          Searches company, title, location, and department.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div className="jw-label">Source</div>
          <SelectMenu
            value={source}
            onChange={setSource}
            options={sourceOptions.map((s) => ({ value: s, label: s === "all" ? "All sources" : s }))}
            ariaLabel="Source"
          />
        </div>
        <div>
          <div className="jw-label">Work mode</div>
          <SelectMenu
            value={workMode}
            onChange={setWorkMode}
            options={workModeOptions.map((m) => ({ value: m, label: m === "any" ? "Any" : m }))}
            ariaLabel="Work mode"
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "end" }}>
        <div>
          <div className="jw-label">Rows</div>
          <SelectMenu
            value={pageSize}
            onChange={(n) => setPageSize(Number(n))}
            options={[10, 25, 50, 100].map((n) => ({ value: n, label: String(n) }))}
            ariaLabel="Rows per page"
          />
        </div>

        <label style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
          <input type="checkbox" checked={h1bOnly} onChange={(e) => setH1bOnly(e.target.checked)} />
          <div>
            <div style={{ fontWeight: 500 }}>H-1B only</div>
            <div className="jw-help">Optional signal and may exclude valid matches.</div>
          </div>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <button className="jw-btn ghost" type="button" onClick={clearFilters}>
          Clear filters
        </button>
        <button className="jw-btn primary" type="button" onClick={() => setFiltersOpen(false)}>
          Apply
        </button>
      </div>
    </>
  );

  return (
    <div className="jw-card">
      <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
        {!isCompact ? (
          <div style={{ display: "grid", gap: 12 }}>{filtersContent}</div>
        ) : (
          <div className="jw-toolbar" style={{ justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="jw-badge subtle">{total} jobs</span>
            <button className="jw-btn" type="button" onClick={() => setFiltersOpen(true)}>
              <Icon name="filter" size={14} /> Filters
            </button>
          </div>
        )}

        <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <span className="jw-badge subtle">
            Page <b>{safePage}</b> / <b>{totalPages}</b>
          </span>
          <div className="jw-toolbar" style={{ flexWrap: "wrap" }}>
            <button className="jw-btn small" onClick={() => setPage(1)} disabled={safePage <= 1} type="button">
              First
            </button>
            <button className="jw-btn small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} type="button">
              Prev
            </button>
            <button className="jw-btn small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} type="button">
              Next
            </button>
            <button className="jw-btn small" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} type="button">
              Last
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

        {loading ? <div className="jw-muted">Loading...</div> : null}
        {showEmpty ? <div className="jw-empty">No matches. Try clearing filters or searching a different keyword.</div> : null}

        {!showEmpty && items?.length ? (
          <>
            <div className="jw-only-desktop jw-tablewrap">
              <table className="jw-table">
                <thead>
                  <tr>
                    <th align="left">Company</th>
                    <th align="left">Role</th>
                    <th align="left">Location</th>
                    <th align="left">Source</th>
                    <th align="left">Work</th>
                    <th align="left">H-1B</th>
                    <th align="left">First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((job) => (
                    <tr key={job.dedupe_key}>
                      <td style={{ fontWeight: 600 }}>{job.company_name}</td>
                      <td>
                        <a href={job.url} target="_blank" rel="noreferrer" className="jw-joblink" title="Open job posting">
                          {job.title} <Icon name="external" size={13} />
                        </a>
                        {job.department ? <div style={{ color: "var(--muted2)", fontSize: 12, marginTop: 4 }}>{job.department}</div> : null}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{job.location || "-"}</td>
                      <td style={{ color: "var(--muted)" }}>{job.source || "-"}</td>
                      <td style={{ color: "var(--muted)" }}>{job.work_mode || "-"}</td>
                      <td>
                        {String(job.h1b_signal || "").toLowerCase() === "yes" ? (
                          <span className="jw-badge ok">Yes</span>
                        ) : String(job.h1b_signal || "").toLowerCase() === "no" ? (
                          <span className="jw-badge danger">No</span>
                        ) : (
                          <span className="jw-badge subtle">-</span>
                        )}
                      </td>
                      <td style={{ color: "var(--muted2)", fontSize: 12 }}>{safeLocal(job.first_seen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="jw-only-mobile jw-cardlist">
              {items.map((job) => (
                <JobCard key={job.dedupe_key} job={job} />
              ))}
            </div>
          </>
        ) : null}

        {isCompact && filtersOpen ? (
          <>
            <div className="jw-sheet-overlay open" onClick={() => setFiltersOpen(false)} />
            <div className="jw-sheet open" role="dialog" aria-modal="true" aria-label="Filters">
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
      </div>

      <style>{`
        .jw-joblink{
          font-weight: 600;
          text-decoration: underline;
          text-decoration-style: dashed;
          text-underline-offset: 4px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text);
        }
      `}</style>
    </div>
  );
}

