import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api/client";
import JobsTable from "../components/JobsTable";
import Icon from "../components/Icon.jsx";
import SelectMenu from "../components/SelectMenu.jsx";

function fmtLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function shortHash(h) {
  if (!h) return "";
  return String(h).slice(0, 8);
}

function take(arr, n = 12) {
  return (arr || []).slice(0, n);
}

export default function AllJobs() {
  const [view, setView] = useState("settings");
  const [groups, setGroups] = useState([]);
  const [selectedHash, setSelectedHash] = useState("");
  const [meta, setMeta] = useState({ total: 0, page: 1, pageSize: 25 });

  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptErr, setReceiptErr] = useState("");
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const gs = await apiGet("/api/settings/groups");
        const arr = Array.isArray(gs) ? gs : [];
        setGroups(arr);
        if (!selectedHash && arr.length) setSelectedHash(arr[0].settings_hash);
      } catch {
        setGroups([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroup = useMemo(() => groups.find((g) => g.settings_hash === selectedHash) || null, [groups, selectedHash]);

  useEffect(() => {
    if (view !== "settings") {
      setReceipt(null);
      setReceiptErr("");
      setReceiptLoading(false);
      return;
    }
    if (!selectedGroup?.representative_run_id) {
      setReceipt(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setReceiptLoading(true);
      setReceiptErr("");
      try {
        const data = await apiGet(`/api/runs/${selectedGroup.representative_run_id}/settings`);
        if (cancelled) return;

        let parsed = null;
        try {
          parsed = data?.settings_json ? JSON.parse(data.settings_json) : null;
        } catch {
          parsed = null;
        }

        setReceipt({ ...data, parsed });
      } catch (e) {
        if (!cancelled) setReceiptErr(String(e));
        setReceipt(null);
      } finally {
        if (!cancelled) setReceiptLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view, selectedGroup]);

  const scope = view === "all" ? "all" : "settings";
  const settingsHash = view === "all" ? undefined : selectedHash;

  return (
    <div className="jw-page-shell jw-alljobs-page">
      <div className="jw-page-hero">
        <div className="jw-page-hero-main">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="jw-badge subtle">
              <Icon name="list" size={13} /> All Jobs
            </span>
            <span className="jw-badge subtle">{meta.total || 0} jobs</span>
            {view === "settings" ? <span className="jw-badge ok">Settings group</span> : <span className="jw-badge subtle">All time</span>}
          </div>
          <h1 className="jw-page-hero-title">Historical job archive</h1>
          <p className="jw-page-hero-sub">
            {view === "settings"
              ? selectedGroup
                ? `Showing union for ${selectedGroup.label}. Last run ${fmtLocal(selectedGroup.last_run_started_at)}.`
                : "Select a settings group to view its union."
              : "All unique jobs seen across all runs and settings."}
          </p>
        </div>

        <div className="jw-toolbar" style={{ gap: 8, flexWrap: "wrap", alignItems: "stretch" }}>
          <button type="button" className={`jw-btn small ${view === "settings" ? "" : "ghost"}`} onClick={() => setView("settings")}>
            Settings group
          </button>
          <button type="button" className={`jw-btn small ${view === "all" ? "" : "ghost"}`} onClick={() => setView("all")}>
            All time
          </button>

          {view === "settings" ? (
            <div style={{ minWidth: 300, width: "min(560px, 92vw)" }}>
              <SelectMenu
                value={selectedHash || ""}
                onChange={setSelectedHash}
                options={
                  groups.length
                    ? groups.map((g) => ({ value: g.settings_hash, label: `${g.label} - ${fmtLocal(g.last_run_started_at)}` }))
                    : [{ value: "", label: "No runs yet" }]
                }
                ariaLabel="Settings group"
              />
            </div>
          ) : null}
        </div>
      </div>

      {view === "settings" ? (
        <div className="jw-card">
          <div className="jw-card-h" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div className="jw-card-title">Filters used for this settings group</div>
              <div className="jw-muted2" style={{ marginTop: 6, fontSize: 12 }}>
                Snapshot taken from the most recent run in this group.
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {receiptLoading ? <span className="jw-badge subtle">Loading...</span> : null}
              {selectedHash ? (
                <span className="jw-badge subtle">
                  hash <b>{shortHash(selectedHash)}</b>
                </span>
              ) : null}
            </div>
          </div>

          <div className="jw-card-b" style={{ display: "grid", gap: 12 }}>
            {receiptErr ? (
              <div className="jw-alert">
                <b>Error loading receipt</b>
                <div style={{ marginTop: 6 }} className="jw-muted">
                  {receiptErr}
                </div>
              </div>
            ) : null}

            {!receipt?.parsed ? (
              <div className="jw-muted">No receipt available yet. Run the fetcher once to capture settings snapshots.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span className="jw-badge subtle">
                    US only: <b>{String(!!receipt.parsed.us_only)}</b>
                  </span>
                  <span className="jw-badge subtle">
                    Remote US: <b>{String(!!receipt.parsed.allow_remote_us)}</b>
                  </span>
                  <span className="jw-badge subtle">
                    Work mode: <b>{receipt.parsed.work_mode || "any"}</b>
                  </span>
                  <span className="jw-badge subtle">
                    States: <b>{(receipt.parsed.preferred_states || []).length}</b>
                  </span>
                  <span className="jw-badge subtle">
                    H1B years: <b>{(receipt.parsed.uscis_h1b_years || []).length}</b>
                  </span>
                </div>

                <div className="jw-row" style={{ gap: 12 }}>
                  <div className="jw-col jw-card" style={{ margin: 0 }}>
                    <div className="jw-card-h">
                      <div className="jw-card-title">Role keywords</div>
                    </div>
                    <div className="jw-card-b" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(receipt.parsed.role_keywords || []).length
                        ? take(receipt.parsed.role_keywords).map((k) => (
                            <span key={k} className="jw-badge subtle">
                              {k}
                            </span>
                          ))
                        : <span className="jw-muted">-</span>}
                    </div>
                  </div>

                  <div className="jw-col jw-card" style={{ margin: 0 }}>
                    <div className="jw-card-h">
                      <div className="jw-card-title">Include keywords</div>
                    </div>
                    <div className="jw-card-b" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(receipt.parsed.include_keywords || []).length
                        ? take(receipt.parsed.include_keywords).map((k) => (
                            <span key={k} className="jw-badge subtle">
                              {k}
                            </span>
                          ))
                        : <span className="jw-muted">-</span>}
                    </div>
                  </div>
                </div>

                <div className="jw-row" style={{ gap: 12 }}>
                  <div className="jw-col jw-card" style={{ margin: 0 }}>
                    <div className="jw-card-h">
                      <div className="jw-card-title">Exclude keywords</div>
                    </div>
                    <div className="jw-card-b" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(receipt.parsed.exclude_keywords || []).length
                        ? take(receipt.parsed.exclude_keywords).map((k) => (
                            <span key={k} className="jw-badge warn">
                              {k}
                            </span>
                          ))
                        : <span className="jw-muted">-</span>}
                    </div>
                  </div>

                  <div className="jw-col jw-card" style={{ margin: 0 }}>
                    <div className="jw-card-h">
                      <div className="jw-card-title">Visa restriction phrases</div>
                    </div>
                    <div className="jw-card-b" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {(receipt.parsed.visa_restriction_phrases || []).length
                        ? take(receipt.parsed.visa_restriction_phrases).map((k) => (
                            <span key={k} className="jw-badge danger">
                              {k}
                            </span>
                          ))
                        : <span className="jw-muted">-</span>}
                    </div>
                  </div>
                </div>

                <details>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>View full settings JSON</summary>
                  <pre className="jw-log" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(receipt.parsed, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </div>
        </div>
      ) : null}

      <JobsTable scope={scope} settingsHash={settingsHash} onMetaChange={setMeta} />

      <div className="jw-muted2" style={{ fontSize: 12 }}>
        H-1B badge is a historical signal from USCIS data and is not a guarantee.
      </div>

      <style>{`
        .jw-alljobs-page .jw-page-hero{
          overflow-x: clip;
          overflow-y: visible;
        }
      `}</style>
    </div>
  );
}

