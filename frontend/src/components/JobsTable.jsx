/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "../api/client";

function safeLocal(iso) {
  if (!iso) return "—";
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

export default function JobsTable({ scope, runId, settingsHash, onMetaChange }) {
  const [items, setItems] = useState([]);
  const [facets, setFacets] = useState({ sources: [], work_modes: [] });
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [source, setSource] = useState("all");
  const [workMode, setWorkMode] = useState("any");
  const [h1bOnly, setH1bOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const requestSeq = useRef(0);

  useEffect(() => {
    setPage(1);
  }, [q, source, workMode, h1bOnly, pageSize, scope, runId, settingsHash]);

  useEffect(() => {
    let cancelled = false;
    const seq = ++requestSeq.current;

    const run = async () => {
      setLoading(true);
      setErr("");
      try {
        const qs = toQuery({
          scope,
          settings_hash: scope === "settings" ? (settingsHash || undefined) : undefined,
          q: q.trim() || undefined,
          source,
          work_mode: workMode,
          h1b_only: h1bOnly ? 1 : 0,
          page,
          page_size: pageSize,
        });
        const data = await apiGet(`/api/jobs?${qs}`);
        if (cancelled) return;
        if (seq !== requestSeq.current) return;

        const nextItems = Array.isArray(data?.items) ? data.items : [];
        const nextTotal = Number.isFinite(data?.total) ? data.total : 0;
        const nextFacets = data?.facets || { sources: [], work_modes: [] };

        setItems(nextItems);
        setTotal(nextTotal);
        setFacets({
          sources: (nextFacets.sources || []).map(normalizeFacetValue).filter(Boolean),
          work_modes: (nextFacets.work_modes || []).map(normalizeFacetValue).filter(Boolean),
        });

        onMetaChange?.({ total: nextTotal, page, pageSize });
      } catch (e) {
        if (!cancelled) setErr(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

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

  return (
    <div className="jw-card">
      <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
        <div className="jw-toolbar" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ minWidth: 280, flex: 1 }}>
            <div className="jw-label">Search</div>
            <input
              className="jw-input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="e.g. frontend, react native, Austin, remote…"
            />
            <div className="jw-muted2" style={{ marginTop: 6, fontSize: 11 }}>
              company, title, location, dept…
            </div>
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="jw-label">Source</div>
            <select className="jw-select" value={source} onChange={(e) => setSource(e.target.value)}>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "All sources" : s}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 180 }}>
            <div className="jw-label">Work mode</div>
            <select className="jw-select" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
              {workModeOptions.map((m) => (
                <option key={m} value={m}>
                  {m === "any" ? "Any" : m}
                </option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 120 }}>
            <div className="jw-label">Rows</div>
            <select className="jw-select" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "end", justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <input type="checkbox" checked={h1bOnly} onChange={(e) => setH1bOnly(e.target.checked)} />
              <span style={{ fontWeight: 800 }}>Show H-1B only</span>
              <span className="jw-muted2" style={{ fontSize: 11 }}>
                (optional signal)
              </span>
            </label>

            <div className="jw-toolbar" style={{ marginLeft: "auto", alignItems: "center" }}>
              <span className="jw-badge subtle">{total} jobs</span>
              <button className="jw-btn small" onClick={() => setPage(1)} disabled={safePage <= 1} type="button">
                ⟪ First
              </button>
              <button className="jw-btn small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} type="button">
                ← Prev
              </button>
              <span className="jw-badge subtle">
                Page <b>{safePage}</b> / <b>{totalPages}</b>
              </span>
              <button className="jw-btn small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} type="button">
                Next →
              </button>
              <button className="jw-btn small" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} type="button">
                Last ⟫
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

        {loading ? <div className="jw-muted">Loading…</div> : null}

        {showEmpty ? <div className="jw-empty">No matches. Try clearing filters or searching a different keyword.</div> : null}

        {!showEmpty && items?.length ? (
          <div className="jw-tablewrap">
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
                {items.map((j) => (
                  <tr key={j.dedupe_key}>
                    <td style={{ fontWeight: 900 }}>{j.company_name}</td>
                    <td>
                      <a
                        href={j.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          fontWeight: 900,
                          textDecoration: "underline",
                          textDecorationStyle: "dashed",
                        }}
                        title="Open job posting"
                      >
                        {j.title} <span style={{ fontWeight: 700 }}>↗</span>
                      </a>
                      {j.department ? <div className="jw-muted2">{j.department}</div> : null}
                    </td>
                    <td className="jw-muted">{j.location || "—"}</td>
                    <td className="jw-muted">{j.source_type}</td>
                    <td className="jw-muted">{j.work_mode || "unknown"}</td>
                    <td>{j.past_h1b_support === "yes" ? <span className="jw-badge ok">Yes</span> : <span className="jw-badge subtle">—</span>}</td>
                    <td className="jw-muted">{safeLocal(j.first_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
