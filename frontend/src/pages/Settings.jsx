/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet } from "../api/client";
import Icon from "../components/Icon.jsx";
import SelectMenu from "../components/SelectMenu.jsx";

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

function Section({ id, title, subtitle, children }) {
  return (
    <section id={id} className="jw-card">
      <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
          {subtitle ? (
            <div className="jw-help" style={{ marginTop: 6 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        {children}
      </div>
    </section>
  );
}

function FieldRow({ label, help, children }) {
  return (
    <div>
      <div
        className="jw-label"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}
      >
        <span>{label}</span>
        {help ? <span className="jw-help">{help}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ChipInput({ label, help, value, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);

  const chips = Array.isArray(value) ? value : [];
  const hasOverflow = chips.length > 4;
  const overflowCount = Math.max(0, chips.length - 4);
  const preview = chips.slice(0, 4);

  useEffect(() => {
    if (chips.length <= 4) setEditorOpen(false);
  }, [chips.length]);

  const addItems = (raw, openEditor = false) => {
    const items = String(raw || "")
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!items.length) return;
    const next = Array.from(new Set([...chips, ...items]));
    onChange(next);
    setDraft("");
    if (openEditor) setEditorOpen(true);
  };

  const removeAt = (idx) => {
    const next = [...chips];
    next.splice(idx, 1);
    onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addItems(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && chips.length) {
      removeAt(chips.length - 1);
    }
  };

  const onEditorKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addItems(draft, true);
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData?.getData("text");
    if (text && /[\n,]/.test(text)) {
      e.preventDefault();
      addItems(text, hasOverflow || editorOpen);
    }
  };

  const modalNode = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      <FieldRow label={label} help={help}>
        <div className="jw-chip-field">
          <div className="jw-chip-rail">
            {preview.map((x, i) => (
              <span key={`${x}-${i}`} className="jw-chip">
                <span>{x}</span>
                <button
                  className="jw-chip-remove"
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${x}`}
                >
                  x
                </button>
              </span>
            ))}

            {hasOverflow ? (
              <button className="jw-chip-more" type="button" onClick={() => setEditorOpen(true)}>
                +{overflowCount} more...
              </button>
            ) : null}
          </div>

          <div className="jw-chip-main-controls">
            <input
              className="jw-input"
              value={draft}
              placeholder={placeholder || "Type and press Enter"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
            />
            <button className="jw-btn small" type="button" onClick={() => addItems(draft)}>
              Add
            </button>
            {chips.length ? (
              <button className="jw-btn ghost small" type="button" onClick={() => removeAt(chips.length - 1)}>
                Remove last
              </button>
            ) : null}
          </div>

          {hasOverflow ? (
            <div className="jw-help">Continue adding/removing here or use +{overflowCount} more... for full list.</div>
          ) : null}
        </div>
      </FieldRow>

      {editorOpen && modalNode
        ? createPortal(
            <>
              <div className="jw-modal-overlay open" onClick={() => setEditorOpen(false)} />
              <div className="jw-modal open" role="dialog" aria-modal="true" aria-label={`${label} editor`}>
                <div className="jw-modal-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="jw-modal-h">
                    <div>
                      <div className="jw-modal-title">{label}</div>
                      <div className="jw-modal-sub">Add or remove values. Changes apply immediately.</div>
                    </div>
                    <button className="jw-btn small" type="button" onClick={() => setEditorOpen(false)}>
                      Close
                    </button>
                  </div>
                  <div className="jw-modal-b" style={{ display: "grid", gap: 12 }}>
                    <div className="jw-chip-modal-list">
                      {chips.length ? (
                        chips.map((x, i) => (
                          <span key={`${x}-${i}`} className="jw-chip">
                            <span>{x}</span>
                            <button
                              className="jw-chip-remove"
                              type="button"
                              onClick={() => removeAt(i)}
                              aria-label={`Remove ${x}`}
                            >
                              x
                            </button>
                          </span>
                        ))
                      ) : (
                        <div className="jw-empty">No values yet.</div>
                      )}
                    </div>
                    <div className="jw-chip-editor-row">
                      <input
                        className="jw-input"
                        value={draft}
                        placeholder={placeholder || "Type and press Enter"}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onEditorKeyDown}
                        onPaste={onPaste}
                      />
                      <button className="jw-btn primary" type="button" onClick={() => addItems(draft, true)}>
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>,
            modalNode
          )
        : null}
    </>
  );
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [feedbackStats, setFeedbackStats] = useState({ counts: {} });
  const [feedbackStatsLoading, setFeedbackStatsLoading] = useState(true);

  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [active, setActive] = useState("targets");

  const isDirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFeedbackStatsLoading(true);

    Promise.all([
      apiGet("/api/settings"),
      apiGet("/api/feedback/stats?view=jobs&limit=1").catch(() => ({ counts: {} })),
    ])
      .then(([settingsData, statsData]) => {
        if (!alive) return;
        const next = settingsData || {};
        setSaved(next);
        setDraft(next);
        setFeedbackStats(statsData || { counts: {} });
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message || "Failed to load settings");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setFeedbackStatsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const patch = (k, v) => setDraft((d) => ({ ...(d || {}), [k]: v }));

  const save = async () => {
    setErr("");
    try {
      const res = await apiPut("/api/settings", draft || {});
      setSaved(res || draft || {});
      setDraft(res || draft || {});
    } catch (e) {
      setErr(e?.message || "Failed to save");
    }
  };

  const reset = () => setDraft(saved || {});

  if (loading) return <div className="jw-muted">Loading...</div>;
  if (!draft) return <div className="jw-empty">No settings loaded.</div>;

  const nav = [
    { id: "targets", label: "Targets" },
    { id: "scoring", label: "Scoring" },
    { id: "location", label: "Location and work mode" },
    { id: "visa", label: "Visa and H-1B phrases" },
    { id: "learning", label: "Learning signals" },
  ];

  const feedbackCounts = feedbackStats?.counts || {};
  const mlPositiveCount = Number(feedbackCounts.include || 0) + Number(feedbackCounts.applied || 0);
  const mlNegativeCount = Number(feedbackCounts.exclude || 0) + Number(feedbackCounts.ignore || 0);
  const mlLabelTotal = mlPositiveCount + mlNegativeCount;
  const mlEligible = mlLabelTotal >= 20 && mlPositiveCount > 0 && mlNegativeCount > 0;
  const mlToggleDisabled = feedbackStatsLoading || (!mlEligible && !draft.ml_enabled);
  const mlConfigDisabled = mlToggleDisabled || !draft.ml_enabled;
  const showRescueThreshold = !mlConfigDisabled && (draft.ml_mode || "rank_only") === "rescue";

  return (
    <div className="jw-page-shell">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="settings" size={13} /> Settings
            </span>
            <span className={`jw-badge ${isDirty ? "warn" : "ok"}`}>{isDirty ? "Unsaved changes" : "All changes saved"}</span>
          </div>
          <h1 className="jw-page-hero-title">Configure matching behavior</h1>
          <p className="jw-page-hero-sub">
            Tune relevance, location constraints, and learning signals used by the next run.
          </p>
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

      <div className="jw-settings-shell">
        <aside className="jw-settings-nav">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 600 }}>Sections</div>
            <span className="jw-badge subtle">{isDirty ? "Unsaved" : "Saved"}</span>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {nav.map((n) => (
              <button
                key={n.id}
                className={`jw-settings-navlink ${active === n.id ? "active" : ""}`}
                type="button"
                onClick={() => {
                  setActive(n.id);
                  document.getElementById(n.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {n.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 12 }} className="jw-help">
            Keep rules focused and high signal to avoid noisy matches.
          </div>
        </aside>

        <div className="jw-settings-main">
          <div className="jw-settings-actions">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`jw-badge ${isDirty ? "warn" : "subtle"}`}>{isDirty ? "Unsaved changes" : "No pending changes"}</span>
              <span className="jw-help">Save applies to the next fetch run.</span>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="jw-btn ghost" type="button" onClick={reset} disabled={!isDirty}>
                Reset
              </button>
              <button className="jw-btn primary" type="button" onClick={save} disabled={!isDirty}>
                Save
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <Section id="targets" title="Targets" subtitle="Define preferred role phrases and keyword biasing.">
              <ChipInput
                label="Role keywords"
                help="Use a few strong phrases"
                value={draft.role_keywords || []}
                onChange={(v) => patch("role_keywords", v)}
                placeholder="e.g. frontend engineer, react native, full stack"
              />
              <ChipInput
                label="Include keywords"
                help="Soft boosts"
                value={draft.include_keywords || []}
                onChange={(v) => patch("include_keywords", v)}
                placeholder="e.g. react, typescript, ios, payments"
              />
              <ChipInput
                label="Exclude keywords"
                help="Avoid obvious mismatches"
                value={draft.exclude_keywords || []}
                onChange={(v) => patch("exclude_keywords", v)}
                placeholder="e.g. principal, staff, security clearance"
              />
            </Section>

            <Section id="scoring" title="Scoring" subtitle="Control strictness and exception behavior.">
              <FieldRow label="Filter mode" help="smart = rules, score = threshold">
                <SelectMenu
                  value={draft.filter_mode || "smart"}
                  onChange={(v) => patch("filter_mode", v)}
                  options={[
                    { value: "smart", label: "Smart (rule-based)" },
                    { value: "score", label: "Score threshold" },
                  ]}
                  ariaLabel="Filter mode"
                />
              </FieldRow>

              {draft.filter_mode === "score" ? (
                <div>
                  <div className="jw-help" style={{ marginBottom: 15 }}>
                    Score mode applies a single threshold to the combined signal from all rules. It is more flexible but may require some experimentation to find the right threshold.
                  </div>
                  <FieldRow label="Min score to include" help="Used in score mode">
                    <input
                      className="jw-input"
                      type="number"
                      min={0}
                      max={100}
                      value={draft.min_score_to_include ?? 55}
                      onChange={(e) => patch("min_score_to_include", Number(e.target.value))} />
                    <div className="jw-help" style={{ marginTop: 6 }}>
                      Lower includes more jobs. Higher is stricter.
                    </div>
                    <div className="jw-help" style={{ marginTop: 4 }}>
                      Practical score range is usually -4 to +5 with current rules, so thresholds around 1 to 4 are typical.
                    </div>
                  </FieldRow>
                </div>
              ) : null}

              <ChipInput
                label="Exclude exceptions"
                help="Allow specific terms to bypass excludes"
                value={draft.exclude_exceptions || []}
                onChange={(v) => patch("exclude_exceptions", v)}
                placeholder="e.g. frontend exception for senior"
              />
            </Section>

            <Section id="location" title="Location and work mode" subtitle="Constrain results to your location preferences.">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input type="checkbox" checked={!!draft.us_only} onChange={(e) => patch("us_only", e.target.checked)} />
                  <div>
                    <div style={{ fontWeight: 500 }}>US-only</div>
                    <div className="jw-help">Hard constraint</div>
                  </div>
                </label>

                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!draft.allow_remote_us}
                    onChange={(e) => patch("allow_remote_us", e.target.checked)}
                  />
                  <div>
                    <div style={{ fontWeight: 500 }}>Allow Remote (US)</div>
                    <div className="jw-help">Counts as US-only</div>
                  </div>
                </label>
              </div>

              <FieldRow label="Work mode" help="any, remote, hybrid, onsite">
                <SelectMenu
                  value={draft.work_mode || "any"}
                  onChange={(v) => patch("work_mode", v)}
                  options={[
                    { value: "any", label: "Any" },
                    { value: "remote", label: "Remote" },
                    { value: "hybrid", label: "Hybrid" },
                    { value: "onsite", label: "Onsite" },
                  ]}
                  ariaLabel="Work mode"
                />
              </FieldRow>

              <ChipInput
                label="Preferred states"
                help="Optional"
                value={draft.preferred_states || []}
                onChange={(v) => patch("preferred_states", v)}
                placeholder="e.g. CA, TX, WA"
              />
            </Section>

            <Section id="visa" title="Visa and H-1B phrases" subtitle="Maintain a short, high-signal restriction list.">
              <ChipInput
                label="Visa restriction phrases"
                help="Used as a negative signal"
                value={draft.visa_restriction_phrases || []}
                onChange={(v) => patch("visa_restriction_phrases", v)}
                placeholder="e.g. no sponsorship, must be US citizen"
              />

              <FieldRow label="USCIS H-1B years" help="Historical signal only">
                <input
                  className="jw-input"
                  value={(draft.uscis_h1b_years || []).join(",")}
                  onChange={(e) =>
                    patch(
                      "uscis_h1b_years",
                      e.target.value
                        .split(/[,\s]+/)
                        .map((x) => x.trim())
                        .filter(Boolean)
                        .map((x) => Number(x))
                        .filter((x) => Number.isFinite(x))
                    )
                  }
                  placeholder="e.g. 2024, 2023, 2022"
                />
              </FieldRow>
            </Section>

            <Section id="learning" title="Learning signals" subtitle="Optional local ML relevance support.">
              <FieldRow label="Enable ML relevance" help="Local only">
                <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={!!draft.ml_enabled}
                    disabled={mlToggleDisabled}
                    onChange={(e) => patch("ml_enabled", e.target.checked)}
                  />
                  <span className="jw-help">No external API calls.</span>
                </label>
                <div className="jw-help" style={{ marginTop: 6 }}>
                  {feedbackStatsLoading
                    ? "Checking feedback coverage..."
                    : mlEligible
                    ? `Ready: ${mlLabelTotal} labels (${mlPositiveCount} positive, ${mlNegativeCount} negative).`
                    : `Requires at least 20 labels with both positive and negative feedback. Current: ${mlLabelTotal} labels (${mlPositiveCount} positive, ${mlNegativeCount} negative).`}
                </div>
              </FieldRow>

              <FieldRow label="ML mode" help="rank_only or rescue">
                <SelectMenu
                  value={draft.ml_mode || "rank_only"}
                  onChange={(v) => patch("ml_mode", v)}
                  options={[
                    { value: "rank_only", label: "Rank only" },
                    { value: "rescue", label: "Rescue borderline jobs" },
                  ]}
                  disabled={mlConfigDisabled}
                  ariaLabel="ML mode"
                />
              </FieldRow>

              {showRescueThreshold ? (
                <FieldRow label="Rescue threshold" help="Typical 0.75 to 0.90">
                  <input
                    className="jw-input"
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={draft.ml_rescue_threshold ?? 0.85}
                    onChange={(e) => patch("ml_rescue_threshold", Number(e.target.value))}
                    disabled={mlConfigDisabled}
                  />
                  <div className="jw-help" style={{ marginTop: 6 }}>
                    Jobs below your threshold can still be rescued when ML relevance exceeds this value. Higher threshold rescues fewer jobs.
                  </div>
                </FieldRow>
              ) : null}
            </Section>

            <div style={{ height: 24 }} aria-hidden="true" />
          </div>
        </div>
      </div>

      <style>{`
        .jw-settings-shell{
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 14px;
          align-items: start;
        }
        .jw-settings-nav{
          position: sticky;
          top: calc(var(--topbar-h) + 14px);
          align-self: start;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: rgba(24, 33, 45, 0.54);
          padding: 12px;
          box-shadow: var(--shadow-sm);
        }
        .jw-settings-navlink{
          width: 100%;
          text-align: left;
          border: 1px solid transparent;
          background: transparent;
          color: var(--muted);
          padding: 10px 10px;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 500;
        }
        .jw-settings-navlink:hover{
          background: rgba(255,255,255,0.04);
          border-color: rgba(148,163,184,0.18);
          color: var(--text);
        }
        .jw-settings-navlink.active{
          background: var(--primary-soft);
          border-color: rgba(var(--primary-rgb), 0.36);
          color: var(--text);
        }
        .jw-settings-main{
          min-width: 0;
          display: grid;
          gap: 14px;
        }
        .jw-settings-actions{
          position: sticky;
          top: calc(var(--topbar-h) + 14px);
          z-index: 8;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: rgba(16, 23, 33, 0.92);
          box-shadow: var(--shadow-sm);
          padding: 12px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }
        .jw-chip-field{
          display: grid;
          gap: 10px;
        }
        .jw-chip-rail{
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .jw-chip-modal-list{
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          max-height: 280px;
          overflow: auto;
          padding-right: 4px;
        }
        .jw-chip-main-controls{
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 10px;
          align-items: center;
        }
        .jw-chip-editor-row{
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
        }
        .jw-chip{
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          // border: 1px solid rgba(var(--primary-rgb), 0.44);
          background: linear-gradient(180deg, rgba(var(--primary-rgb), 0.24), rgba(18, 26, 37, 0.9));
          color: #e6fff3;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
          font-size: var(--fs-xs);
          max-width: 100%;
        }
        .jw-chip > span:first-child{
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 38ch;
        }
        .jw-chip-remove{
          border: 0;
          width: 18px;
          height: 18px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(255,255,255,0.12);
          color: var(--text);
          cursor: pointer;
          padding: 0;
          line-height: 1;
          font-size: 11px;
        }
        .jw-chip-remove:hover{
          background: rgba(251,113,133,0.22);
          color: #fecdd3;
        }
        .jw-chip-more{
          border: 1px dashed rgba(var(--primary-rgb), 0.48);
          background: rgba(var(--primary-rgb), 0.14);
          color: #a7f3d0;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: var(--fs-xs);
          font-weight: 600;
          cursor: pointer;
        }
        .jw-chip-more:hover{
          border-color: rgba(var(--primary-rgb), 0.64);
          background: rgba(var(--primary-rgb), 0.2);
        }

        @media (max-width: 1023px){
          .jw-settings-shell{ grid-template-columns: 1fr; }
          .jw-settings-nav{
            position: relative;
            top: auto;
          }
          .jw-settings-actions{
            position: relative;
            top: auto;
          }
        }
        @media (max-width: 640px){
          .jw-chip-main-controls{
            grid-template-columns: 1fr;
          }
          .jw-chip-editor-row{
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

