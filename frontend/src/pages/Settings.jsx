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

  const [usOnly, setUsOnly] = useState(true);
  const [allowRemoteUs, setAllowRemoteUs] = useState(true);
  const [preferredStates, setPreferredStates] = useState([]);
  const [workMode, setWorkMode] = useState("any");

  const [h1bYears, setH1bYears] = useState([]);
  const [h1bCacheDir, setH1bCacheDir] = useState("./.cache/uscis_h1b");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const s = await apiGet("/api/settings");

      setRoleKeywords(s.role_keywords || []);
      setIncludeKeywords(s.include_keywords || []);
      setExcludeKeywords(s.exclude_keywords || []);
      setVisaPhrases(s.visa_restriction_phrases || []);

      setUsOnly(Boolean(s.us_only));
      setAllowRemoteUs(Boolean(s.allow_remote_us));
      setPreferredStates(s.preferred_states || []);
      setWorkMode(s.work_mode || "any");

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

      us_only: usOnly,
      allow_remote_us: allowRemoteUs,
      preferred_states: preferredStates,
      work_mode: workMode,

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
    usOnly,
    allowRemoteUs,
    preferredStates,
    workMode,
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
          <Section
            title="Keyword targeting"
            subtitle="Fast scan/edit using chips. Paste comma/newline lists to bulk add."
          >
            <div style={{ display: "grid", gap: 14 }}>
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
