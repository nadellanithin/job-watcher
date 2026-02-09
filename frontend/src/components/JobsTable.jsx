/* eslint-disable react-hooks/set-state-in-effect */
import { useMemo, useState, useEffect } from "react";

function safeLocal(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

const WORK_MODE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

export default function JobsTable({ jobs }) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("all");
  const [workMode, setWorkMode] = useState("any");
  const [h1bOnly, setH1bOnly] = useState(false);

  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const sources = useMemo(() => {
    const vals = uniq((jobs || []).map((j) => j.source_type));
    return ["all", ...vals];
  }, [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (jobs || []).filter((j) => {
      if (source !== "all" && j.source_type !== source) return false;
      if (workMode !== "any" && (j.work_mode || "").toLowerCase() !== workMode) return false;
      if (h1bOnly && j.past_h1b_support !== "yes") return false;

      if (!q) return true;
      const hay = [j.company_name, j.title, j.location, j.department, j.source_type, j.url]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, query, source, h1bOnly, workMode]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [query, source, h1bOnly, workMode, pageSize]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  if (!jobs) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Scoped styles for job screens ONLY (won't affect dashboard) */}
      <style>{`
        .jw-jobs-filters{
          display:grid;
          grid-template-columns: 2.2fr 1fr 1fr auto;
          gap: 12px;
          align-items:end;
        }
        @media (max-width: 1100px){
          .jw-jobs-filters{ grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 680px){
          .jw-jobs-filters{ grid-template-columns: 1fr; }
        }

        .jw-joblink{
          display:inline-flex;
          align-items:center;
          gap: 8px;
          font-weight: 950;
          text-decoration: none;
          border-bottom: 1px dashed rgba(91,52,245,0.45);
          padding-bottom: 1px;
        }
        .jw-joblink:hover{
          text-decoration: none;
          border-bottom-style: solid;
        }
        html[data-theme="dark"] .jw-joblink{
          border-bottom-color: rgba(139,116,255,0.55);
        }
        .jw-ext{
          font-size: 12px;
          opacity: 0.85;
        }

        .jw-table td{
          line-height: 1.25;
        }
      `}</style>

      {/* Filters */}
      <div className="jw-card">
        <div className="jw-card-b" style={{ paddingTop: 12, paddingBottom: 12 }}>
          <div className="jw-jobs-filters">
            <div>
              <div className="jw-label">
                <span>Search</span>
                <span className="jw-help">company, title, location, dept…</span>
              </div>
              <input
                className="jw-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. frontend, react native, Austin, remote…"
              />
            </div>

            <div>
              <div className="jw-label">
                <span>Source</span>
                <span className="jw-help">filter</span>
              </div>
              <select className="jw-select" value={source} onChange={(e) => setSource(e.target.value)}>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s === "all" ? "All sources" : s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="jw-label">
                <span>Work mode</span>
                <span className="jw-help">filter</span>
              </div>
              <select className="jw-select" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                {WORK_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "grid", gap: 10, justifyItems: "end" }}>
              <div className="jw-label" style={{ width: "100%" }}>
                <span>Rows</span>
                <span className="jw-help">per page</span>
              </div>
              <select
                className="jw-select"
                value={pageSize}
                onChange={(e) => setPageSize(parseInt(e.target.value, 10))}
                style={{ width: 160 }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            {/* Second row controls */}
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ display: "inline-flex", gap: 5, alignItems: "end" }}>
                <input type="checkbox" checked={h1bOnly} onChange={(e) => setH1bOnly(e.target.checked)} />
                <span style={{ fontWeight: 900 }}>Show H-1B only</span>
                <span className="jw-muted2" style={{ fontSize: 12 }}>
                  (optional signal)
                </span>
              </label>

              <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span className="jw-badge subtle">{total} jobs</span>
                <span className="jw-badge subtle">
                  Page <b>{safePage}</b> / <b>{totalPages}</b>
                </span>

                <button className="jw-btn small" type="button" onClick={() => setPage(1)} disabled={safePage <= 1}>
                  ⟪ First
                </button>
                <button
                  className="jw-btn small"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  ← Prev
                </button>
                <button
                  className="jw-btn small"
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Next →
                </button>
                <button
                  className="jw-btn small"
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage >= totalPages}
                >
                  Last ⟫
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!paged.length ? (
        <div className="jw-empty">No matches. Try clearing filters or searching a different keyword.</div>
      ) : (
        <div className="jw-tablewrap">
          <table className="jw-table">
            <thead>
              <tr>
                <th align="left">Company</th>
                <th align="left">Role</th>
                <th align="left">Location</th>
                <th align="left">H-1B</th>
                <th align="left">Source</th>
                <th align="left">First seen</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((j) => (
                <tr key={j.dedupe_key}>
                  <td style={{ width: 200 }}>
                    <div style={{ fontWeight: 950 }}>{j.company_name || "—"}</div>
                    {/* <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                      {j.work_mode ? (
                        <span className="jw-badge subtle" style={{ padding: "4px 10px" }}>
                          {j.work_mode}
                        </span>
                      ) : (
                        <span className="jw-muted2">—</span>
                      )}
                    </div> */}
                  </td>

                  <td>
                    {/* ✅ clearly clickable link */}
                    <a href={j.url} target="_blank" rel="noreferrer" className="jw-joblink" title="Open job posting">
                      {j.title || "—"} <span className="jw-ext">↗</span>
                    </a>
                    {/* {j.department ? (
                      <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                        {j.department}
                      </div>
                    ) : null} */}
                  </td>

                  <td style={{ width: 240 }}>{j.location || "—"}</td>

                  <td style={{ width: 120 }}>
                    {j.past_h1b_support === "yes" ? (
                      <span className="jw-badge ok">Yes</span>
                    ) : (
                      <span className="jw-badge subtle">—</span>
                    )}
                  </td>

                  <td style={{ width: 150 }}>
                    <span className="jw-badge subtle">{j.source_type || "—"}</span>
                  </td>

                  <td style={{ width: 200 }} className="jw-muted">
                    {safeLocal(j.first_seen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
