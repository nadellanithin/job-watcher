import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";

async function apiPut(path, body) {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT ${path} failed: ${txt}`);
  }
  return res.json();
}

function ChipInput({ label, help, value, onChange, placeholder }) {
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    const items = String(raw || "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!items.length) return;

    const next = Array.from(new Set([...(value || []), ...items]));
    onChange(next);
  };

  const removeAt = (idx) => {
    const next = [...(value || [])];
    next.splice(idx, 1);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
      setDraft("");
      return;
    }
    if (e.key === "Backspace" && !draft && (value || []).length) {
      removeAt((value || []).length - 1);
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData.getData("text");
    if (text && /[\n,]/.test(text)) {
      e.preventDefault();
      add(text);
      setDraft("");
    }
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="jw-label">
        <span>{label}</span>
        {help ? <span className="jw-help">{help}</span> : null}
      </div>

      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 10,
          background: "var(--surface2)",
          display: "grid",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            maxHeight: 104,
            overflowY: "auto",
            paddingRight: 4,
          }}
        >
          {(value || []).map((chip, idx) => (
            <span
              key={`${chip}-${idx}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.10)",
                border: "1px solid var(--border)",
                fontWeight: 800,
                color: "var(--text)",
                whiteSpace: "nowrap",
              }}
            >
              {chip}
              <button
                className="jw-iconbtn"
                style={{ padding: "2px 8px", borderRadius: 999 }}
                onClick={() => removeAt(idx)}
                aria-label={`Remove ${chip}`}
                type="button"
              >
                ✕
              </button>
            </span>
          ))}
        </div>

        <div className="jw-toolbar">
          <input
            className="jw-input"
            style={{ flex: "1 1 240px" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            placeholder={placeholder || "Type and press Enter…"}
          />

          <button
            className="jw-btn small"
            type="button"
            onClick={() => {
              add(draft);
              setDraft("");
            }}
            disabled={!draft.trim()}
          >
            Add
          </button>
        </div>
      </div>

      <div className="jw-muted2" style={{ fontSize: 12 }}>
        Tip: paste a comma/newline list to add multiple at once.
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, right }) {
  return (
    <div className="jw-card">
      <div className="jw-card-h" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="jw-card-title">{title}</div>
          {subtitle ? <div className="jw-muted2" style={{ marginTop: 6, fontSize: 12 }}>{subtitle}</div> : null}
        </div>
        {right ? <div>{right}</div> : null}
      </div>
      <div className="jw-card-b">{children}</div>
    </div>
  );
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [roleKeywords, setRoleKeywords] = useState([]);
  const [includeKeywords, setIncludeKeywords] = useState([]);
  const [excludeKeywords, setExcludeKeywords] = useState([]);
  const [visaPhrases, setVisaPhrases] = useState([]);
  const [excludeExceptions, setExcludeExceptions] = useState([]);

  const [filterMode, setFilterMode] = useState("smart");
  const [minScoreToInclude, setMinScoreToInclude] = useState(3);

  const [usOnly, setUsOnly] = useState(true);
  const [allowRemoteUs, setAllowRemoteUs] = useState(true);
  const [preferredStates, setPreferredStates] = useState([]);
  const [workMode, setWorkMode] = useState("any");

  // Local ML relevance
  const [mlEnabled, setMlEnabled] = useState(false);
  const [mlMode, setMlMode] = useState("rank_only");
  const [mlRescueThreshold, setMlRescueThreshold] = useState(0.85);

  const [h1bYears, setH1bYears] = useState([]);
  const [h1bCacheDir, setH1bCacheDir] = useState("./.cache/uscis_h1b");


  const [feedbackStats, setFeedbackStats] = useState(null);
  const [feedbackStatsErr, setFeedbackStatsErr] = useState("");
  const [mlGuardMsg, setMlGuardMsg] = useState("");

  // Minimum label counts before enabling ML (UI guard)
  const ML_MIN_POS = 5;
  const ML_MIN_NEG = 5;
  const ML_MIN_TOTAL = 20;

  const posCount = (Number(feedbackStats?.counts?.include || 0) + Number(feedbackStats?.counts?.applied || 0));
  const negCount = (Number(feedbackStats?.counts?.exclude || 0) + Number(feedbackStats?.counts?.ignore || 0));
  const totalCount = Number(feedbackStats?.total || 0);
  const mlReady = posCount >= ML_MIN_POS && negCount >= ML_MIN_NEG && totalCount >= ML_MIN_TOTAL;
  const mlReadyHint = mlReady
    ? "Ready"
    : `Need at least ${ML_MIN_TOTAL} total labels with ${ML_MIN_POS}+ positive (include/applied) and ${ML_MIN_NEG}+ negative (exclude/ignore). Current: ${posCount} pos, ${negCount} neg, ${totalCount} total.`;
  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await apiGet("/api/settings");

      // Feedback stats (non-blocking for settings UI)
      try {
        // Prefer a "jobs" view so we can show human-readable job context.
        const fs = await apiGet("/api/feedback/stats?limit=15&view=jobs");
        setFeedbackStats(fs);
        setFeedbackStatsErr("");
      } catch (e2) {
        setFeedbackStats(null);
        setFeedbackStatsErr(String(e2));
      }

      setRoleKeywords(s.role_keywords || []);
      setIncludeKeywords(s.include_keywords || []);
      setExcludeKeywords(s.exclude_keywords || []);
      setVisaPhrases(s.visa_restriction_phrases || []);
      setExcludeExceptions(s.exclude_exceptions || []);

      setFilterMode(s.filter_mode || "smart");
      setMinScoreToInclude(Number.isFinite(s.min_score_to_include) ? s.min_score_to_include : 3);

      setUsOnly(Boolean(s.us_only));
      setAllowRemoteUs(Boolean(s.allow_remote_us));
      setPreferredStates(s.preferred_states || []);
      setWorkMode(s.work_mode || "any");

      setMlEnabled(Boolean(s.ml_enabled));
      setMlMode(s.ml_mode || "rank_only");
      setMlRescueThreshold(
        typeof s.ml_rescue_threshold === "number" ? s.ml_rescue_threshold : 0.85
      );

      setH1bYears((s.uscis_h1b_years || []).map(String));
      setH1bCacheDir(s.uscis_h1b_cache_dir || "./.cache/uscis_h1b");
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const payload = useMemo(() => {
    return {
      role_keywords: roleKeywords,
      include_keywords: includeKeywords,
      exclude_keywords: excludeKeywords,
      visa_restriction_phrases: visaPhrases,
      exclude_exceptions: excludeExceptions,
      filter_mode: filterMode,
      min_score_to_include: Number(minScoreToInclude) || 3,

      us_only: usOnly,
      allow_remote_us: allowRemoteUs,
      preferred_states: preferredStates,
      work_mode: workMode,

      ml_enabled: mlEnabled,
      ml_mode: mlMode,
      ml_rescue_threshold: Number(mlRescueThreshold) || 0.85,

      uscis_h1b_years: (h1bYears || [])
        .map((x) => Number(x))
        .filter((n) => Number.isFinite(n)),
      uscis_h1b_cache_dir: h1bCacheDir,
    };
  }, [
    roleKeywords,
    includeKeywords,
    excludeKeywords,
    visaPhrases,
    excludeExceptions,
    filterMode,
    minScoreToInclude,
    usOnly,
    allowRemoteUs,
    preferredStates,
    workMode,
    mlEnabled,
    mlMode,
    mlRescueThreshold,
    h1bYears,
    h1bCacheDir,
  ]);

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await apiPut("/api/settings", payload);
      await load();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <h1 className="jw-h1">Settings</h1>
        <div className="jw-toolbar">
          <button className="jw-btn" onClick={load} disabled={saving || loading} type="button">
            {loading ? "Loading…" : "Reload"}
          </button>
          <button className="jw-btn primary" onClick={save} disabled={saving || loading} type="button">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="jw-alert">
          <b>Error</b>
          <div style={{ marginTop: 6 }} className="jw-muted">{err}</div>
        </div>
      ) : null}

      {loading ? (
        <div className="jw-card">
          <div className="jw-card-b">
            <div className="jw-muted">Loading settings…</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>

          {/*
            Keep Settings readable: group the "learning" pieces on the left,
            and the most-touched keyword/score knobs on the right.
          */}
          <div className="jw-settings-grid">
            <div style={{ display: "grid", gap: 12 }}>
              <Section
                title="Learning signals"
                subtitle="These labels power ML re-ranking. Aim for 50–100 distinct labeled jobs before enabling ML."
                right={
                  <button
                    className="jw-btn small"
                    type="button"
                    onClick={load}
                    disabled={saving || loading}
                    title="Refresh feedback stats"
                  >
                    Refresh
                  </button>
                }
              >
            {feedbackStatsErr ? (
              <div className="jw-muted2" style={{ fontSize: 12 }}>
                Could not load feedback stats: {feedbackStatsErr}
              </div>
            ) : null}

            {!feedbackStats ? (
              <div className="jw-muted2" style={{ fontSize: 12 }}>
                No feedback collected yet.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                  <div className="jw-muted2" style={{ fontSize: 12 }}>
                    Total events: <b>{feedbackStats.total}</b>
                  </div>
                  <div className="jw-muted2" style={{ fontSize: 12 }}>
                    Distinct jobs: <b>{feedbackStats.distinct_jobs}</b>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["include", "exclude", "applied", "ignore"].map((k) => (
                    <span
                      key={k}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid var(--border)",
                        fontWeight: 800,
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k}: {Number(feedbackStats.counts?.[k] || 0)}
                    </span>
                  ))}
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                  <div className="jw-label" style={{ marginBottom: 8 }}>
                    <span>Recent feedback</span>
                    <span className="jw-help">latest jobs</span>
                  </div>

                  <div className="jw-muted2" style={{ fontSize: 12, marginBottom: 10 }}>
                    You may see multiple feedback events for the same job — that’s expected if you click different labels.
                    The model uses the <b>latest label per job</b>.
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="jw-table" style={{ minWidth: 760 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>When</th>
                          <th style={{ width: 120 }}>Label</th>
                          <th style={{ width: 110 }}>Category</th>
                          <th>Job</th>
                          <th style={{ width: 90, textAlign: "right" }}>Events</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(feedbackStats.recent || []).map((r) => {
                          const when = String(r.created_at || "").replace("T", " ").replace("+00:00", "Z");
                          const jobTitle = r.job_title || "(job not found)";
                          const jobCompany = r.job_company || "";
                          const jobUrl = r.job_url || "";

                          return (
                            <tr key={r.id}>
                              <td className="jw-muted2" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{when}</td>
                              <td style={{ fontWeight: 900 }}>{r.label}</td>
                              <td className="jw-muted2" style={{ fontSize: 12 }}>{r.reason_category || "-"}</td>
                              <td>
                                <div style={{ display: "grid", gap: 2 }}>
                                  {jobUrl ? (
                                    <a href={jobUrl} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
                                      {jobTitle} <span style={{ fontWeight: 800 }}>↗</span>
                                    </a>
                                  ) : (
                                    <span style={{ fontWeight: 800 }}>{jobTitle}</span>
                                  )}
                                  {jobCompany ? (
                                    <span className="jw-muted2" style={{ fontSize: 12 }}>{jobCompany}</span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="jw-muted2" style={{ fontSize: 12, textAlign: "right" }}>{Number(r.events_count || 1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
              </Section>

              <Section
                title="Local ML relevance"
                subtitle="Free CPU model that learns from your feedback. Start with rank_only (safe)."
              >
            <div style={{ display: "grid", gap: 12 }}>
              {mlGuardMsg ? (
                <div className="jw-alert" style={{ marginBottom: 4 }}>
                  <b>ML not enabled</b>
                  <div style={{ marginTop: 6 }} className="jw-muted">{mlGuardMsg}</div>
                </div>
              ) : null}

              <label style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={mlEnabled}
                  disabled={!mlReady && !mlEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    if (next && !mlReady) {
                      setMlGuardMsg(mlReadyHint);
                      return;
                    }
                    setMlGuardMsg("");
                    setMlEnabled(next);
                  }}
                />
                <span style={{ fontWeight: 800 }}>
                  Enable ML re-ranking
                  {!mlReady && !mlEnabled ? (
                    <span className="jw-muted2" style={{ fontSize: 12, marginLeft: 10 }}>
                      (locked — {mlReadyHint})
                    </span>
                  ) : null}
                </span>
              </label>

              <div className="jw-row">
                <div className="jw-col">
                  <div className="jw-label">
                    <span>Mode</span>
                    <span className="jw-help">start with rank_only</span>
                  </div>
                  <select
                    className="jw-select"
                    value={mlMode}
                    onChange={(e) => setMlMode(e.target.value)}
                    disabled={!mlEnabled}
                  >
                    <option value="rank_only">Rank only (no inclusion changes)</option>
                    <option value="rescue" disabled>
                      Rescue (coming soon)
                    </option>
                  </select>
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                    When enabled, New/Settings job lists default to "Relevance" ordering using the latest model.
                  </div>
                </div>

                <div className="jw-col">
                  <div className="jw-label">
                    <span>Rescue threshold</span>
                    <span className="jw-help">used in rescue mode</span>
                  </div>
                  <input
                    className="jw-input"
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={mlRescueThreshold}
                    onChange={(e) => setMlRescueThreshold(e.target.value)}
                    disabled
                  />
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                    Disabled for now (we'll wire this when we implement rescue with guardrails).
                  </div>
                </div>
              </div>
            </div>
              </Section>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Section
                title="Keyword targeting"
                subtitle="Fast scan/edit using chips. Paste comma/newline lists to bulk add."
              >
            <div style={{ display: "grid", gap: 14 }}>
              <div className="jw-row">
                <div className="jw-col">
                  <div className="jw-label">
                    <span>Filter mode</span>
                    <span className="jw-help">smart vs score</span>
                  </div>
                  <select className="jw-select" value={filterMode} onChange={(e) => setFilterMode(e.target.value)}>
                    <option value="smart">Smart (deterministic)</option>
                    <option value="score">Score (recommended)</option>
                  </select>
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                    In score mode, include/exclude keywords adjust the score — they don’t hard-block jobs.
                  </div>
                </div>

                <div className="jw-col">
                  <div className="jw-label">
                    <span>Min score to include</span>
                    <span className="jw-help">score mode</span>
                  </div>
                  <input
                    className="jw-input"
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    value={minScoreToInclude}
                    onChange={(e) => setMinScoreToInclude(e.target.value)}
                    disabled={filterMode !== "score"}
                  />
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                    Score range: roughly <b>0–10+</b> depending on matches. Higher is stricter.
                    Typical: <b>2–4</b>. Start at <b>3</b> and adjust after a run.
                  </div>
                </div>
              </div>

              <ChipInput
                label="Role keywords"
                help="targets"
                value={roleKeywords}
                onChange={setRoleKeywords}
                placeholder="frontend, full stack, react native…"
              />

              <div className="jw-row">
                <div className="jw-col">
                  <ChipInput
                    label="Include keywords"
                    help="boost matches"
                    value={includeKeywords}
                    onChange={setIncludeKeywords}
                    placeholder="react, ios, android…"
                  />
                </div>
                <div className="jw-col">
                  <ChipInput
                    label="Exclude keywords"
                    help="remove noise"
                    value={excludeKeywords}
                    onChange={setExcludeKeywords}
                    placeholder="intern, staff, principal…"
                  />

                  <div style={{ marginTop: 12 }}>
                    <ChipInput
                      label="Exclude exceptions"
                      help="rare"
                      value={excludeExceptions}
                      onChange={setExcludeExceptions}
                      placeholder="phrases that should override an exclude hit…"
                    />
                  </div>
                </div>
              </div>

              <ChipInput
                label="Visa restriction phrases"
                help="filters explicit no-sponsor"
                value={visaPhrases}
                onChange={setVisaPhrases}
                placeholder="no visa sponsorship, US citizens only…"
              />
            </div>
              </Section>
            </div>
          </div>

          <Section
            title="Location & work mode"
            subtitle="US-only is enforced in the backend. Preferred states is optional."
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div className="jw-toolbar">
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={usOnly} onChange={(e) => setUsOnly(e.target.checked)} />
                  <span style={{ fontWeight: 800 }}>US-only</span>
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={allowRemoteUs} onChange={(e) => setAllowRemoteUs(e.target.checked)} />
                  <span style={{ fontWeight: 800 }}>Allow Remote (US)</span>
                </label>

                <span className="jw-badge subtle">Work mode: <b style={{ marginLeft: 6 }}>{workMode}</b></span>
              </div>

              <div className="jw-row">
                <div className="jw-col">
                  <ChipInput
                    label="Preferred states"
                    help="optional"
                    value={preferredStates}
                    onChange={setPreferredStates}
                    placeholder="CA, TX, WA…"
                  />
                  <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                    If empty → no state filtering.
                  </div>
                </div>

                <div className="jw-col">
                  <div className="jw-label">
                    <span>Work mode</span>
                    <span className="jw-help">filter</span>
                  </div>
                  <select className="jw-select" value={workMode} onChange={(e) => setWorkMode(e.target.value)}>
                    <option value="any">Any</option>
                    <option value="remote">Remote</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="onsite">Onsite</option>
                  </select>
                </div>
              </div>
            </div>
          </Section>

          <details className="jw-card" style={{ padding: 0 }}>
            <summary
              style={{
                cursor: "pointer",
                listStyle: "none",
                padding: 14,
                fontWeight: 900,
                borderBottom: "1px solid var(--border)",
              }}
            >
              H-1B signal (advanced)
              <span className="jw-muted2" style={{ marginLeft: 10, fontWeight: 700 }}>
                optional config
              </span>
            </summary>

            <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
              <ChipInput
                label="USCIS H-1B years"
                help="comma/newline ok"
                value={h1bYears}
                onChange={setH1bYears}
                placeholder="2024, 2023…"
              />

              <div>
                <div className="jw-label">
                  <span>Cache directory</span>
                  <span className="jw-help">advanced</span>
                </div>
                <input className="jw-input" value={h1bCacheDir} onChange={(e) => setH1bCacheDir(e.target.value)} />
                <div className="jw-muted2" style={{ fontSize: 12, marginTop: 6 }}>
                  Historical signal only — not a guarantee of sponsorship.
                </div>
              </div>
            </div>
          </details>

          <div className="jw-card" style={{ position: "sticky", bottom: 12, background: "rgba(248,250,252,0.82)", backdropFilter: "blur(12px)" }}>
            <div className="jw-card-b" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div className="jw-muted2" style={{ fontSize: 12 }}>
                Changes apply to future runs. Run the fetcher from Dashboard to see updated results.
              </div>
              <div className="jw-toolbar">
                <button className="jw-btn" onClick={load} disabled={saving} type="button">
                  Reload
                </button>
                <button className="jw-btn primary" onClick={save} disabled={saving} type="button">
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
