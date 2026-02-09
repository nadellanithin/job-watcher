import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";

/* -------------------------
   tiny fetch helpers
------------------------- */
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `POST ${path} failed`);
  }
  return res.json();
}

async function apiPut(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `PUT ${path} failed`);
  }
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || `DELETE ${path} failed`);
  }
  return res.json();
}

/* -------------------------
   small UI helpers
------------------------- */
function statusForCompany(c) {
  const n = (c?.sources || []).length;
  if (!n) return { label: "Needs discovery", cls: "warn" };
  return { label: "Ready", cls: "ok" };
}

function sourceSummary(sources = []) {
  const hasCareer = sources.some((s) => s.type === "career_url");
  const hasGH = sources.some((s) => s.type === "greenhouse");
  const hasLever = sources.some((s) => s.type === "lever");
  return [
    hasCareer ? { k: "career", label: "Career" } : null,
    hasGH ? { k: "gh", label: "GH" } : null,
    hasLever ? { k: "lever", label: "Lever" } : null,
  ].filter(Boolean);
}

function toApplySources(recommended = []) {
  return (recommended || [])
    .map((r) => {
      if (!r?.type) return null;
      if (r.type === "career_url") {
        return { type: "career_url", url: r.url, mode: r.mode || "requests", notes: "" };
      }
      return { type: r.type, slug: r.slug, notes: "" };
    })
    .filter(Boolean);
}

function pickCareerSource(company) {
  return (company?.sources || []).find((s) => s.type === "career_url") || null;
}

function pickSlug(company, type) {
  return (company?.sources || []).find((s) => s.type === type)?.slug || "";
}

function upsertSources(baseSources, newSources) {
  const src = [...(baseSources || [])];

  const key = (s) => {
    if (!s?.type) return "";
    if (s.type === "career_url") return `career_url:${(s.url || "").trim()}`;
    return `${s.type}:${(s.slug || "").trim().toLowerCase()}`;
  };

  const map = new Map();
  for (const s of src) {
    const k = key(s);
    if (k) map.set(k, s);
  }
  for (const s of newSources || []) {
    const k = key(s);
    if (k) map.set(k, s);
  }
  return Array.from(map.values());
}

function removeSource(baseSources, target) {
  const key = (s) => {
    if (!s?.type) return "";
    if (s.type === "career_url") return `career_url:${(s.url || "").trim()}`;
    return `${s.type}:${(s.slug || "").trim().toLowerCase()}`;
  };
  const kT = key(target);
  return (baseSources || []).filter((s) => key(s) !== kT);
}

/* -------------------------
   Page
------------------------- */
export default function Companies() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // list controls
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(15);
  const [page, setPage] = useState(1);

  // selection
  const [selectedId, setSelectedId] = useState(null);

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCareerUrl, setAddCareerUrl] = useState("");
  const [addCareerMode, setAddCareerMode] = useState("requests");
  const [autoDiscover, setAutoDiscover] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [addGhSlug, setAddGhSlug] = useState("");
  const [addLeverSlug, setAddLeverSlug] = useState("");

  // Discover drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverErr, setDiscoverErr] = useState("");
  const [discoverData, setDiscoverData] = useState(null);
  const [applyLoading, setApplyLoading] = useState(false);

  // Edit details
  const [editMode, setEditMode] = useState(false);
  const [editCareerUrl, setEditCareerUrl] = useState("");
  const [editCareerMode, setEditCareerMode] = useState("requests");
  const [editGhSlug, setEditGhSlug] = useState("");
  const [editLeverSlug, setEditLeverSlug] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);
  const [detailMsg, setDetailMsg] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet("/api/companies");
      setCompanies(data || []);
      // keep selection stable
      if (!selectedId && data?.length) setSelectedId(data[0].id);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const shouldLock = addOpen || drawerOpen;
    const prev = document.body.style.overflow;
    if (shouldLock) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "";
    };
  }, [addOpen, drawerOpen]);


  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return companies || [];
    return (companies || []).filter((c) => {
      const hay = [
        c.company_name,
        c.employer_name,
        String(c.id),
        ...(c.sources || []).map((s) => (s.type === "career_url" ? s.url : s.slug)),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(qq);
    });
  }, [companies, q]);

  useEffect(() => {
    setPage(1);
  }, [q, pageSize]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length, pageSize]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  const selectedCompany = useMemo(() => {
    return (companies || []).find((c) => c.id === selectedId) || null;
  }, [companies, selectedId]);

  // sync edit fields when selection changes
  useEffect(() => {
    setEditMode(false);
    setDetailMsg("");
    if (!selectedCompany) return;

    const career = pickCareerSource(selectedCompany);
    setEditCareerUrl(career?.url || "");
    setEditCareerMode(career?.mode || "requests");
    setEditGhSlug(pickSlug(selectedCompany, "greenhouse"));
    setEditLeverSlug(pickSlug(selectedCompany, "lever"));
  }, [selectedCompany]);

  const openDiscover = async (company) => {
    if (!company?.id) return;
    setDrawerOpen(true);
    setDiscoverErr("");
    setDiscoverData(null);
    setDiscoverLoading(true);

    try {
      const career = pickCareerSource(company);
      const body = { company_name: company.company_name, career_url: career?.url || null };
      const data = await apiPost(`/api/companies/${company.id}/discover`, body);
      setDiscoverData(data);
    } catch (e) {
      setDiscoverErr(String(e));
    } finally {
      setDiscoverLoading(false);
    }
  };

  const closeDiscover = () => {
    setDrawerOpen(false);
    setDiscoverErr("");
    setDiscoverData(null);
    setDiscoverLoading(false);
    setApplyLoading(false);
  };

  const applyRecommended = async () => {
    if (!selectedCompany?.id) return;
    const srcs = toApplySources(discoverData?.recommended || []);
    if (!srcs.length) return;

    setApplyLoading(true);
    setDiscoverErr("");
    try {
      await apiPost(`/api/companies/${selectedCompany.id}/apply_discovery`, { sources: srcs });
      await load();
      closeDiscover();
      setDetailMsg("✅ Applied recommended sources.");
    } catch (e) {
      setDiscoverErr(String(e));
    } finally {
      setApplyLoading(false);
    }
  };

  const addCompany = async () => {
    setErr("");
    setDetailMsg("");
    try {
      const nm = addName.trim();
      if (!nm) return setErr("Company name is required.");

      const sources = [];
      if (addCareerUrl.trim()) sources.push({ type: "career_url", url: addCareerUrl.trim(), mode: addCareerMode, notes: "" });
      if (addGhSlug.trim()) sources.push({ type: "greenhouse", slug: addGhSlug.trim(), notes: "" });
      if (addLeverSlug.trim()) sources.push({ type: "lever", slug: addLeverSlug.trim(), notes: "" });

      const created = await apiPost("/api/companies", {
        company_name: nm,
        employer_name: null,
        sources,
        source_priority: ["career_url", "greenhouse", "lever"],
        fetch_mode: "all",
      });

      setAddOpen(false);
      setAddName("");
      setAddCareerUrl("");
      setAddCareerMode("requests");
      setAddGhSlug("");
      setAddLeverSlug("");
      setShowAdvanced(false);

      await load();
      if (created?.id) setSelectedId(created.id);

      if (autoDiscover && created?.id) {
        // start discover directly for newly added company
        const latest = { ...created, sources };
        openDiscover(latest);
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  const saveEdits = async () => {
    if (!selectedCompany?.id) return;
    setSaveLoading(true);
    setDetailMsg("");
    try {
      let sources = [...(selectedCompany.sources || [])];

      // career_url upsert/remove
      if (editCareerUrl.trim()) {
        sources = upsertSources(sources, [{ type: "career_url", url: editCareerUrl.trim(), mode: editCareerMode, notes: "" }]);
      } else {
        // remove existing career url(s)
        for (const s of [...sources]) {
          if (s.type === "career_url") sources = removeSource(sources, s);
        }
      }

      // greenhouse upsert/remove
      if (editGhSlug.trim()) {
        sources = upsertSources(sources, [{ type: "greenhouse", slug: editGhSlug.trim(), notes: "" }]);
      } else {
        for (const s of [...sources]) {
          if (s.type === "greenhouse") sources = removeSource(sources, s);
        }
      }

      // lever upsert/remove
      if (editLeverSlug.trim()) {
        sources = upsertSources(sources, [{ type: "lever", slug: editLeverSlug.trim(), notes: "" }]);
      } else {
        for (const s of [...sources]) {
          if (s.type === "lever") sources = removeSource(sources, s);
        }
      }

      await apiPut(`/api/companies/${selectedCompany.id}`, {
        company_name: selectedCompany.company_name,
        employer_name: selectedCompany.employer_name || null,
        sources,
        source_priority: selectedCompany.source_priority || ["career_url", "greenhouse", "lever"],
        fetch_mode: selectedCompany.fetch_mode || "all",
      });

      await load();
      setEditMode(false);
      setDetailMsg("✅ Saved changes.");
    } catch (e) {
      setDetailMsg(`⚠️ ${String(e)}`);
    } finally {
      setSaveLoading(false);
    }
  };

  const deleteCompany = async () => {
    if (!selectedCompany?.id) return;
    if (!confirm(`Delete ${selectedCompany.company_name}?`)) return;
    setErr("");
    setDetailMsg("");
    try {
      await apiDelete(`/api/companies/${selectedCompany.id}`);
      const remaining = (companies || []).filter((c) => c.id !== selectedCompany.id);
      setCompanies(remaining);
      setSelectedId(remaining[0]?.id || null);
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* overlays */}
      <div className={`jw-modal-overlay ${addOpen ? "open" : ""}`} onClick={() => setAddOpen(false)} />
      <div className={`jw-modal-overlay ${drawerOpen ? "open" : ""}`} onClick={closeDiscover} />

      {/* Add modal */}
      <div className={`jw-modal ${addOpen ? "open" : ""}`} role="dialog" aria-modal="true" aria-hidden={!addOpen}>
        <div className="jw-modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="jw-modal-h">
            <div>
              <div className="jw-modal-title">Add company</div>
              <div className="jw-modal-sub">Add name + (optional) career page. We can discover the rest.</div>
            </div>
            <button className="jw-btn small" onClick={() => setAddOpen(false)} type="button">
              Close
            </button>
          </div>

          <div className="jw-modal-b" style={{ display: "grid", gap: 12 }}>
            <div>
              <div className="jw-label">
                <span>Company name</span>
                <span className="jw-help">Required</span>
              </div>
              <input className="jw-input" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. Airbnb" />
            </div>

            <div className="jw-card" style={{ background: "transparent" }}>
              <div className="jw-card-b" style={{ display: "grid", gap: 10 }}>
                <div>
                  <div className="jw-label">
                    <span>Career URL</span>
                    <span className="jw-help">best coverage</span>
                  </div>
                  <input
                    className="jw-input"
                    value={addCareerUrl}
                    onChange={(e) => setAddCareerUrl(e.target.value)}
                    placeholder="https://company.com/careers"
                  />
                </div>

                <div className="jw-toolbar" style={{ justifyContent: "space-between" }}>
                  <span className="jw-badge subtle">Render</span>
                  <select className="jw-select" style={{ width: 240 }} value={addCareerMode} onChange={(e) => setAddCareerMode(e.target.value)}>
                    <option value="requests">requests (fast)</option>
                    <option value="playwright">playwright (JS-rendered)</option>
                  </select>
                </div>

                <div className="jw-muted2" style={{ fontSize: 12 }}>
                  Playwright runs only if backend env allows it (<b>CAREERURL_PLAYWRIGHT=1</b>).
                </div>
              </div>
            </div>

            <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <label className="jw-toolbar" style={{ gap: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={autoDiscover} onChange={(e) => setAutoDiscover(e.target.checked)} />
                <span style={{ fontWeight: 900 }}>Auto-discover sources</span>
              </label>

              <button className="jw-btn small" onClick={() => setShowAdvanced((v) => !v)} type="button">
                {showAdvanced ? "Hide" : "Show"} advanced
              </button>
            </div>

            {showAdvanced ? (
              <div className="jw-card" style={{ background: "transparent" }}>
                <div className="jw-card-b" style={{ display: "grid", gap: 10 }}>
                  <div className="jw-muted2" style={{ fontSize: 12 }}>
                    Optional: add slugs now if you already know them.
                  </div>
                  <div className="jw-row">
                    <div className="jw-col" style={{ minWidth: 200 }}>
                      <div className="jw-label">
                        <span>Greenhouse slug</span>
                        <span className="jw-help">optional</span>
                      </div>
                      <input className="jw-input" value={addGhSlug} onChange={(e) => setAddGhSlug(e.target.value)} placeholder="e.g. airbnb" />
                    </div>
                    <div className="jw-col" style={{ minWidth: 200 }}>
                      <div className="jw-label">
                        <span>Lever slug</span>
                        <span className="jw-help">optional</span>
                      </div>
                      <input className="jw-input" value={addLeverSlug} onChange={(e) => setAddLeverSlug(e.target.value)} placeholder="e.g. netflix" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <button className="jw-btn primary" onClick={addCompany} type="button">
              Add company
            </button>
          </div>
        </div>
      </div>

      {/* Discover drawer */}
      <aside className={`jw-drawer ${drawerOpen ? "open" : ""}`} aria-hidden={!drawerOpen}>
        <div className="jw-drawer-h">
          <div style={{ minWidth: 0 }}>
            <div className="jw-drawer-title">Discover sources</div>
            <div className="jw-drawer-sub" style={{ wordBreak: "break-word" }}>
              {selectedCompany?.company_name || ""}
            </div>
          </div>
          <div className="jw-toolbar">
            <button
              className="jw-btn small"
              type="button"
              onClick={() => selectedCompany && openDiscover(selectedCompany)}
              disabled={!selectedCompany || discoverLoading}
            >
              {discoverLoading ? "Checking…" : "Re-run"}
            </button>
            <button className="jw-btn small" type="button" onClick={closeDiscover}>
              Close
            </button>
          </div>
        </div>

        <div className="jw-drawer-b">
          {discoverErr ? (
            <div className="jw-alert" style={{ marginBottom: 12 }}>
              <b>Discovery error</b>
              <div className="jw-muted" style={{ marginTop: 6 }}>
                {discoverErr}
              </div>
            </div>
          ) : null}

          {discoverLoading ? (
            <div className="jw-muted">Running bounded checks…</div>
          ) : discoverData ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div className="jw-card" style={{ background: "transparent" }}>
                <div className="jw-card-b" style={{ display: "grid", gap: 10 }}>
                  <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 1000 }}>Recommended</div>
                      <div className="jw-muted2" style={{ fontSize: 12, marginTop: 4 }}>
                        Verified GH/Lever (if found) + career URL fallback.
                      </div>
                    </div>

                    <button
                      className="jw-btn primary"
                      type="button"
                      disabled={applyLoading || !toApplySources(discoverData.recommended).length}
                      onClick={applyRecommended}
                    >
                      {applyLoading ? "Applying…" : "Apply recommended"}
                    </button>
                  </div>

                  {!discoverData.recommended?.length ? (
                    <div className="jw-muted">No recommendations yet.</div>
                  ) : (
                    <div style={{ display: "grid", gap: 8 }}>
                      {discoverData.recommended.map((s, idx) => (
                        <div key={idx} className="jw-rowline">
                          <span className="jw-badge subtle">{s.type}</span>
                          <span className="jw-rowline-main">
                            {s.type === "career_url" ? s.url : s.slug}
                            {s.verified ? <span style={{ margin: '0px 10px' }}>✅ Verified</span> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="jw-card" style={{ background: "transparent" }}>
                <div className="jw-card-b">
                  <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 1000 }}>All candidates</div>
                      <div className="jw-muted2" style={{ fontSize: 12, marginTop: 4 }}>
                        Highest-signal candidates float to the top.
                      </div>
                    </div>
                    <span className="jw-badge subtle">{discoverData.candidates?.length || 0} checked</span>
                  </div>

                  <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table className="jw-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Identifier</th>
                          <th>Status</th>
                          <th>Jobs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(discoverData.candidates || []).map((c, idx) => (
                          <tr key={idx}>
                            <td><span className="jw-badge subtle">{c.type}</span></td>
                            <td style={{ maxWidth: 280, wordBreak: "break-word" }}>{c.type === "career_url" ? c.url : c.slug}</td>
                            <td>
                              {c.verified ? (
                                <span className="jw-pill ok" style={{ margin: 0 }}>✅ Verified</span>
                              ) : c.error ? (
                                <span className="jw-pill bad" style={{ margin: 0 }}>⚠️ {String(c.error).slice(0, 40)}</span>
                              ) : (
                                <span className="jw-pill" style={{ margin: 0 }}>—</span>
                              )}
                            </td>
                            <td>{typeof c.job_count === "number" ? c.job_count : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 10 }}>
                    Tip: If a company is JS-heavy, set Career URL render mode to <b>playwright</b>.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="jw-muted">Select a company and run discovery.</div>
          )}
        </div>
      </aside>

      {/* Header */}
      <div className="jw-pagebar">
        <div>
          <h1 className="jw-h1">Companies</h1>
          <div className="jw-muted2" style={{ marginTop: 4 }}>
            Add → discover → apply. Keep the list clean and scalable.
          </div>
        </div>

        <div className="jw-toolbar" style={{ flexWrap: "wrap" }}>
          <span className="jw-badge subtle">{companies?.length || 0} saved</span>
          <button className="jw-btn" onClick={load} disabled={loading} type="button">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button className="jw-btn primary" onClick={() => setAddOpen(true)} type="button">
            + Add company
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

      {/* Split layout */}
      <div className="jw-split">
        {/* Left: List */}
        <div className="jw-pane">
          <div className="jw-pane-h">
            <input className="jw-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search companies…" />
            <div className="jw-toolbar" style={{ justifyContent: "space-between", marginTop: 10, gap: 10, flexWrap: "wrap" }}>
              <div className="jw-toolbar" style={{ gap: 10 }}>
                <span className="jw-muted2" style={{ fontSize: 12 }}>
                  Showing <b>{pageItems.length}</b> of <b>{filtered.length}</b>
                </span>
              </div>

              <div className="jw-toolbar" style={{ gap: 10 }}>
                <span className="jw-muted2" style={{ fontSize: 12 }}>Rows</span>
                <select className="jw-select" style={{ width: 110 }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>
          </div>

          <div className="jw-list">
            {loading ? (
              <div className="jw-empty">Loading…</div>
            ) : !filtered.length ? (
              <div className="jw-empty">No companies yet. Click <b>+ Add company</b> to start.</div>
            ) : (
              pageItems.map((c) => {
                const st = statusForCompany(c);
                const src = sourceSummary(c.sources || []);
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    className={`jw-listitem ${active ? "active" : ""}`}
                    onClick={() => setSelectedId(c.id)}
                    type="button"
                  >
                    <div className="jw-listitem-top">
                      <div className="jw-listitem-title">{c.company_name}</div>
                      <span className={`jw-pill ${st.cls}`} style={{ margin: 0 }}>
                        {st.cls === "ok" ? "●" : "○"} {st.label}
                      </span>
                    </div>

                    <div className="jw-listitem-sub">
                      <span className="jw-muted2" style={{ fontSize: 12 }}>
                        {src.length ? src.map((x) => <span key={x.k} className="jw-mini" title={x.label}>{x.label}</span>) : "No sources"}
                      </span>
                      <span className="jw-muted2" style={{ fontSize: 12 }}>
                        {c.sources?.length ? `${c.sources.length} source(s)` : "—"}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="jw-pane-f">
            <div className="jw-toolbar" style={{ justifyContent: "space-between", width: "100%" }}>
              <button className="jw-btn small" type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                ← Prev
              </button>
              <span className="jw-muted2" style={{ fontSize: 12 }}>
                Page <b>{page}</b> / <b>{totalPages}</b>
              </span>
              <button
                className="jw-btn small"
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next →
              </button>
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <div className="jw-pane">
          {!selectedCompany ? (
            <div className="jw-empty">Select a company to view details.</div>
          ) : (
            <div className="jw-detail">
              <div className="jw-detail-h">
                <div style={{ minWidth: 0 }}>
                  <div className="jw-detail-title">{selectedCompany.company_name}</div>
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 4 }}>
                    id: {selectedCompany.id} • priority: <b>{(selectedCompany.source_priority || []).join(" → ")}</b>
                  </div>
                </div>

                <div className="jw-toolbar" style={{ flexWrap: "wrap" }}>
                  <button className="jw-btn small" onClick={() => openDiscover(selectedCompany)} type="button">
                    Discover
                  </button>
                  <button className="jw-btn small" onClick={() => setEditMode((v) => !v)} type="button">
                    {editMode ? "Cancel" : "Edit sources"}
                  </button>
                  <button className="jw-btn small danger" onClick={deleteCompany} type="button">
                    Delete
                  </button>
                </div>
              </div>

              {detailMsg ? (
                <div className="jw-alert" style={{ borderColor: "rgba(148,163,184,0.35)", background: "var(--surface2)" }}>
                  <div className="jw-muted">{detailMsg}</div>
                </div>
              ) : null}

              <div className="jw-card" style={{ background: "transparent" }}>
                <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
                  <div className="jw-toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                    <div style={{ fontWeight: 1000 }}>Sources</div>
                    {!editMode ? (
                      <span className="jw-badge subtle">{(selectedCompany.sources || []).length} total</span>
                    ) : null}
                  </div>

                  {!editMode ? (
                    (selectedCompany.sources || []).length ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        {(selectedCompany.sources || []).map((s, idx) => (
                          <div key={idx} className="jw-rowline">
                            <span className="jw-badge subtle">{s.type}</span>
                            <span className="jw-rowline-main">
                              {s.type === "career_url" ? (
                                <span style={{ wordBreak: "break-word" }}>
                                  {s.url}{" "}
                                  <span className="jw-mini" style={{ marginLeft: 8 }}>
                                    {s.mode || "requests"}
                                  </span>
                                </span>
                              ) : (
                                <span style={{ fontWeight: 900 }}>{s.slug}</span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="jw-muted2" style={{ fontSize: 12 }}>
                        No sources saved yet. Click <b>Discover</b> to auto-find sources.
                      </div>
                    )
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      <div>
                        <div className="jw-label">
                          <span>Career URL</span>
                          <span className="jw-help">optional</span>
                        </div>
                        <input
                          className="jw-input"
                          value={editCareerUrl}
                          onChange={(e) => setEditCareerUrl(e.target.value)}
                          placeholder="https://company.com/careers"
                        />
                        <div className="jw-toolbar" style={{ justifyContent: "space-between", marginTop: 10 }}>
                          <span className="jw-badge subtle">Render</span>
                          <select className="jw-select" style={{ width: 240 }} value={editCareerMode} onChange={(e) => setEditCareerMode(e.target.value)}>
                            <option value="requests">requests (fast)</option>
                            <option value="playwright">playwright (JS-rendered)</option>
                          </select>
                        </div>
                      </div>

                      <div className="jw-row">
                        <div className="jw-col" style={{ minWidth: 220 }}>
                          <div className="jw-label">
                            <span>Greenhouse slug</span>
                            <span className="jw-help">optional</span>
                          </div>
                          <input className="jw-input" value={editGhSlug} onChange={(e) => setEditGhSlug(e.target.value)} placeholder="e.g. airbnb" />
                        </div>
                        <div className="jw-col" style={{ minWidth: 220 }}>
                          <div className="jw-label">
                            <span>Lever slug</span>
                            <span className="jw-help">optional</span>
                          </div>
                          <input className="jw-input" value={editLeverSlug} onChange={(e) => setEditLeverSlug(e.target.value)} placeholder="e.g. netflix" />
                        </div>
                      </div>

                      <div className="jw-toolbar" style={{ justifyContent: "flex-end" }}>
                        <button className="jw-btn primary" onClick={saveEdits} disabled={saveLoading} type="button">
                          {saveLoading ? "Saving…" : "Save"}
                        </button>
                      </div>

                      <div className="jw-muted2" style={{ fontSize: 12 }}>
                        Leaving a field empty will remove that source.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="jw-muted2" style={{ fontSize: 12 }}>
                Tip: Keep companies in the list even without sources — discovery can populate them later.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
