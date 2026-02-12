import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet, apiPost } from "../api/client.js";
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
        return threshold ? `Score total ${total} (threshold ${threshold})` : `Score total ${total}`;
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

  return v.map((x) => humanize(x)).filter(Boolean).slice(0, 6);
}

function parsePositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function outcomeBadgeMeta(outcome) {
  const normalized = String(outcome || "")
    .trim()
    .toLowerCase();
  if (normalized === "included") return { className: "ok", text: "Included" };
  if (normalized === "excluded") return { className: "danger", text: "Excluded" };
  if (!normalized) return { className: "subtle", text: "-" };
  return { className: "subtle", text: normalized };
}

function reasonPreviewMeta(reason, maxLen = 28) {
  const full = String(reason ?? "").trim();
  const isTruncated = full.length > maxLen;
  return {
    full,
    isTruncated,
    preview: isTruncated ? `${full.slice(0, maxLen)}...` : full,
  };
}

function ReviewButtons({ disabled, onSetFeedback, dedupeKey }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button className="jw-btn primary small" disabled={disabled} onClick={() => onSetFeedback(dedupeKey, "include")}>
        Include
      </button>
      <button className="jw-btn danger small" disabled={disabled} onClick={() => onSetFeedback(dedupeKey, "exclude")}>
        Exclude
      </button>
      <button className="jw-btn small" disabled={disabled} onClick={() => onSetFeedback(dedupeKey, "ignore")}>
        Ignore
      </button>
    </div>
  );
}

export default function Inbox() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);

  const [status, setStatus] = useState(searchParams.get("status") || "unreviewed");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [page, setPage] = useState(parsePositiveInt(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(parsePositiveInt(searchParams.get("page_size"), 10));
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 767);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [meta, setMeta] = useState({ total: 0, page: 1, page_size: 10 });

  const statusOptions = useMemo(
    () => [
      { value: "unreviewed", label: "Unreviewed" },
      { value: "include", label: "Include" },
      { value: "exclude", label: "Exclude" },
      { value: "ignore", label: "Ignore" },
      { value: "all", label: "All" },
    ],
    []
  );

  const pageSizeOptions = useMemo(
    () => [
      { value: 10, label: "10" },
      { value: 25, label: "25" },
      { value: 50, label: "50" },
      { value: 100, label: "100" },
      { value: 200, label: "200" },
    ],
    []
  );

  const fetchData = async () => {
    setLoading(true);
    setErr("");
    try {
      const params = new URLSearchParams();
      params.set("status", status || "unreviewed");
      if (q && q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("page_size", String(pageSize));

      const [res, st] = await Promise.all([
        apiGet(`/api/inbox?${params.toString()}`),
        apiGet("/api/inbox/stats").catch(() => null),
      ]);
      setItems(res?.items || []);
      setMeta({ total: res?.total || 0, page: res?.page || 1, page_size: res?.page_size || pageSize });
      setStats(st || null);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 767);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const sp = {};
    if (status) sp.status = status;
    if (q && q.trim()) sp.q = q.trim();
    sp.page = String(page);
    sp.page_size = String(pageSize);
    setSearchParams(sp, { replace: true });
  }, [status, q, page, pageSize, setSearchParams]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, page, pageSize]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (meta.page_size || pageSize)));
    if (page > totalPages) setPage(totalPages);
  }, [meta.total, meta.page_size, page, pageSize]);

  const onSetFeedback = async (dedupeKey, label) => {
    try {
      await apiPost("/api/feedback", { dedupe_key: dedupeKey, label, reason_category: "" });
      await fetchData();
    } catch (e) {
      setErr(e?.message || String(e));
    }
  };

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / (meta.page_size || pageSize)));

  return (
    <div className="jw-page-shell">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="inbox" size={13} /> Inbox
            </span>
            <span className="jw-badge subtle">{meta.total || 0} jobs</span>
            {stats ? (
              <span className="jw-badge subtle" title="Inbox counts by status">
                Unreviewed: {stats.unreviewed || 0} | Included: {stats.include || 0} | Excluded: {stats.exclude || 0} | Ignored: {stats.ignore || 0}
              </span>
            ) : null}
          </div>
          <h1 className="jw-page-hero-title">Deduped review queue</h1>
          <p className="jw-page-hero-sub">One row per job across all runs. Review once, keep it sticky.</p>
        </div>
      </div>

      <div className="jw-card">
        <div className="jw-card-h">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ width: 170 }}>
              <div className="jw-label">Status</div>
              <SelectMenu
                value={status}
                onChange={(v) => {
                  setStatus(v);
                  setPage(1);
                }}
                options={statusOptions}
                ariaLabel="Status"
              />
            </div>

            <div style={{ minWidth: 240, flex: "1 1 240px" }}>
              <div className="jw-label">Search</div>
              <input
                className="jw-input"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Company, title, location, URL..."
              />
            </div>

            <div>
              <div className="jw-label">Rows</div>
              <SelectMenu
                value={String(pageSize)}
                onChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
                options={pageSizeOptions.map((o) => ({ value: String(o.value), label: o.label }))}
                ariaLabel="Rows per page"
              />
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <button className="jw-btn ghost" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Prev
              </button>
              <span className="jw-muted" style={{ fontSize: 13 }}>
                Page {page} / {totalPages}
              </span>
              <button className="jw-btn ghost" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
          {err ? (
            <div className="jw-alert">
              <Icon name="warning" size={14} /> {err}
            </div>
          ) : null}

          {isMobile ? (
            <div className="jw-cardlist">
              {loading ? (
                <div className="jw-empty">Loading...</div>
              ) : items.length ? (
                items.map((it) => {
                  const reasons = normalizeReasons(it.reasons);
                  const outcome = outcomeBadgeMeta(it.last_outcome);
                  return (
                    <div key={it.dedupe_key} className="jw-carditem">
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          {it.url ? (
                            <a className="jw-joblink" href={it.url} target="_blank" rel="noreferrer" title="Open job posting">
                              {it.title} <Icon name="external" size={13} />
                            </a>
                          ) : (
                            <div style={{ fontWeight: 600 }}>{it.title || "-"}</div>
                          )}
                          <div className="jw-muted2" style={{ marginTop: 6 }}>
                            {it.company_name || "-"} | {it.location || "-"} | {it.source_type || "-"}
                          </div>
                        </div>
                        <span className="jw-badge ok">Seen {it.seen_count || 0}</span>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                        <span className={`jw-badge ${outcome.className}`}>{outcome.text}</span>
                      </div>

                      <div className="jw-muted2" style={{ marginTop: 8 }}>
                        First seen: {fmtDate(it.first_seen)} | Last seen: {fmtDate(it.last_seen)}
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        {reasons.length ? (
                          reasons.map((r, idx) => (
                            <span
                              key={idx}
                              className="jw-badge subtle"
                              title={reasonPreviewMeta(r).full}
                              aria-label={reasonPreviewMeta(r).full}
                              style={
                                reasonPreviewMeta(r).isTruncated
                                  ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 2 }
                                  : undefined
                              }
                            >
                              {reasonPreviewMeta(r).preview}
                            </span>
                          ))
                        ) : (
                          <span className="jw-muted">-</span>
                        )}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <ReviewButtons disabled={loading} onSetFeedback={onSetFeedback} dedupeKey={it.dedupe_key} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="jw-empty">No inbox items.</div>
              )}
            </div>
          ) : (
            <div className="jw-tablewrap">
              <table className="jw-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 320 }}>Job</th>
                    <th style={{ width: 150 }}>First seen</th>
                    <th style={{ width: 150 }}>Last seen</th>
                    <th style={{ width: 20 }}>Seen count</th>
                    <th style={{ width: 150 }}>Last outcome</th>
                    <th style={{ minWidth: 220 }}>Reasons</th>
                    <th style={{ width: 300 }}>Review</th>
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="jw-muted" style={{ padding: 16 }}>
                        Loading...
                      </td>
                    </tr>
                  ) : items.length ? (
                    items.map((it) => {
                      const reasons = normalizeReasons(it.reasons);
                      const outcome = outcomeBadgeMeta(it.last_outcome);
                      return (
                        <tr key={it.dedupe_key}>
                          <td style={{ maxWidth: 380 }}>
                            {it.url ? (
                              <a className="jw-joblink" href={it.url} target="_blank" rel="noreferrer" title="Open job posting">
                                {it.title} <Icon name="external" size={13} />
                              </a>
                            ) : (
                              <span>{it.title || "-"}</span>
                            )}
                            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <span className="jw-badge subtle">{it.company_name || "-"}</span>
                              <span className="jw-badge subtle">{it.location || "-"}</span>
                              <span className="jw-badge subtle">{it.source_type || "-"}</span>
                              {it.ml_prob != null ? <span className="jw-badge subtle">ML {(Number(it.ml_prob) * 100).toFixed(0)}%</span> : null}
                            </div>
                          </td>
                          <td>{fmtDate(it.first_seen)}</td>
                          <td>{fmtDate(it.last_seen)}</td>
                          <td>
                            <span className="jw-badge ok">{it.seen_count || 0}</span>
                          </td>
                          <td>
                            <span className={`jw-badge ${outcome.className}`}>{outcome.text}</span>
                          </td>
                          <td>
                            {reasons.length ? (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {reasons.map((r, idx) => (
                                  <span
                                    key={idx}
                                    className="jw-badge subtle"
                                    title={reasonPreviewMeta(r).full}
                                    aria-label={reasonPreviewMeta(r).full}
                                    style={
                                      reasonPreviewMeta(r).isTruncated
                                        ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 2 }
                                        : undefined
                                    }
                                  >
                                    {reasonPreviewMeta(r).preview}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="jw-muted">-</span>
                            )}
                          </td>
                          <td>
                            <ReviewButtons disabled={loading} onSetFeedback={onSetFeedback} dedupeKey={it.dedupe_key} />
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="jw-muted" style={{ padding: 16 }}>
                        No inbox items.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
