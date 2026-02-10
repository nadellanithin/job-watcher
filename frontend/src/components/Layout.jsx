import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";

const THEME_KEY = "jw_theme";
const COLLAPSE_KEY = "jw_sidebar_collapsed";

export default function Layout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || "light");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const location = useLocation();

  const navItems = useMemo(
    () => [
      { to: "/", label: "Dashboard", icon: "📊" },
      { to: "/new", label: "New Jobs", icon: "✨" },
      { to: "/all", label: "All Jobs", icon: "🗂️" },
      { to: "/companies", label: "Companies", icon: "🏢" },
      { to: "/audit", label: "Audit", icon: "🧾" },
      { to: "/settings", label: "Settings", icon: "⚙️" },
    ],
    []
  );

  const pageTitle = useMemo(() => {
    const hit = navItems.find((n) => n.to === location.pathname);
    if (hit) return hit.label;
    if (location.pathname.startsWith("/companies")) return "Companies";
    if (location.pathname.startsWith("/audit")) return "Audit";
    if (location.pathname.startsWith("/settings")) return "Settings";
    if (location.pathname.startsWith("/new")) return "New Jobs";
    if (location.pathname.startsWith("/all")) return "All Jobs";
    return "Job Watcher";
  }, [location.pathname, navItems]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <div className="jw-root">
      <style>{globalStyles}</style>

      <div
        className={`jw-overlay ${mobileNavOpen ? "open" : ""}`}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside className={`jw-sidenav ${mobileNavOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="jw-brand">
          <div className="jw-logo" aria-label="Job Watcher logo">JW</div>

          <div className="jw-brand-text">
            <div className="jw-brand-title">Job Watcher</div>
            <div className="jw-brand-sub">US-only • Safe sources</div>
          </div>

          {/* ✅ fix: collapse button stays usable + aligned even when collapsed */}
          <button
            className="jw-iconbtn jw-only-desktop jw-collapsebtn"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
            type="button"
          >
            {collapsed ? "⟫" : "⟪"}
          </button>
        </div>

        <nav className="jw-nav" aria-label="Primary">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `jw-navlink ${isActive ? "active" : ""}`}
              onClick={() => setMobileNavOpen(false)}
              title={collapsed ? n.label : undefined}
              aria-label={collapsed ? n.label : undefined}
            >
              <span className="jw-navicon" aria-hidden="true">
                {n.icon}
              </span>
              <span className="jw-navlabel">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="jw-sidenav-footer">
          <div className="jw-muted">
            Tip: If a career page is JS-rendered, set its mode to <b>playwright</b>.
          </div>
        </div>
      </aside>

      <div className="jw-main">
        <header className="jw-topbar">
          <button
            className="jw-iconbtn jw-only-mobile"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            type="button"
          >
            ☰
          </button>

          <div className="jw-topbar-title">
            <span className="jw-dot" />
            <div className="jw-topbar-stack">
              <span className="jw-topbar-main">{pageTitle}</span>
              <span className="jw-topbar-sub">Monitor • fetch • apply</span>
            </div>
          </div>

          <div className="jw-topbar-actions">
            <button
              className="jw-btn small"
              type="button"
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "light" ? "🌙 Dark" : "☀️ Light"}
            </button>
            <span className="jw-badge subtle">V1 Alpha</span>
          </div>
        </header>

        <main className="jw-content">{children}</main>
      </div>
    </div>
  );
}

const globalStyles = `
:root{
  --topbar-h: 66px;

  --bg: #eef2f7;
  --surface: rgba(248,250,252,0.86);
  --surface2: rgba(255,255,255,0.92);
  --border: #d9e1ee;

  --text: #0f172a;
  --muted: #475569;
  --muted2: #64748b;

  --primary: #5b34f5;
  --primary-soft: rgba(91, 52, 245, 0.12);

  --danger: #ef4444;
  --danger-soft: rgba(239, 68, 68, 0.12);

  --ok: #16a34a;
  --ok-soft: rgba(22, 163, 74, 0.12);

  --warn: #d97706;
  --warn-soft: rgba(217, 119, 6, 0.12);

  --radius: 16px;
  --shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  --shadow-sm: 0 6px 16px rgba(15, 23, 42, 0.06);
}

html[data-theme="dark"]{
  --bg: #070b14;
  --surface: rgba(17,24,39,0.72);
  --surface2: rgba(15,23,42,0.78);
  --border: rgba(148,163,184,0.22);

  --text: rgba(255,255,255,0.92);
  --muted: rgba(226,232,240,0.74);
  --muted2: rgba(226,232,240,0.60);

  --primary: #8b74ff;
  --primary-soft: rgba(139, 116, 255, 0.16);

  --shadow: 0 14px 34px rgba(0,0,0,0.45);
  --shadow-sm: 0 9px 22px rgba(0,0,0,0.35);
}

*{ box-sizing: border-box; }
html, body { height: 100%; }

body{
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(900px 520px at 30% -10%, rgba(91,52,245,0.12), transparent 60%),
    radial-gradient(800px 480px at 90% 10%, rgba(22,163,74,0.08), transparent 55%),
    var(--bg);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}

html[data-theme="dark"] body{
  background:
    radial-gradient(900px 520px at 30% -10%, rgba(139,116,255,0.16), transparent 60%),
    radial-gradient(800px 480px at 90% 10%, rgba(34,197,94,0.08), transparent 55%),
    var(--bg);
}

a { color: inherit; text-decoration: none; }
a:hover { text-decoration: underline; }

.jw-root{
  display:flex;
  min-height: 100vh;
}

/* Modal / Drawer (used by Companies discover flow) */
.jw-modal-overlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.28);
  backdrop-filter: blur(2px);
  z-index: 80;
  display: none;
}
.jw-modal-overlay.open{ display:block; }

.jw-drawer{
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(560px, 100vw);
  background: var(--surface2);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 90;
  transform: translateX(101%);
  transition: transform 220ms ease;
  display: flex;
  flex-direction: column;
}
.jw-drawer.open{ transform: translateX(0); }

.jw-drawer-h{
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.jw-drawer-title{ font-weight: 1000; font-size: 14px; letter-spacing: 0.2px; }
.jw-drawer-sub{ color: var(--muted2); font-size: 12px; margin-top: 4px; }
.jw-drawer-b{ padding: 14px 16px; overflow: auto; }

.jw-pill{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 900;
  border: 1px solid var(--border);
  background: rgba(255,255,255,0.55);
}
html[data-theme="dark"] .jw-pill{ background: rgba(15,23,42,0.45); }
.jw-pill.ok{ border-color: rgba(22,163,74,0.35); background: var(--ok-soft); }
.jw-pill.warn{ border-color: rgba(217,119,6,0.35); background: var(--warn-soft); }
.jw-pill.bad{ border-color: rgba(239,68,68,0.35); background: var(--danger-soft); }

.jw-table{
  width: 100%;
  border-collapse: collapse;
}
.jw-table th,
.jw-table td{
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.jw-table th{
  font-size: 12px;
  color: var(--muted2);
  text-align: left;
  font-weight: 900;
}

@media (max-width: 760px){
  .jw-drawer{ width: 100vw; }
}


/* Sidebar */
.jw-sidenav{
  width: 292px;
  padding: 16px;
  background: rgba(248,250,252,0.92);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  height: 100vh;
  display:flex;
  flex-direction: column;
  gap: 14px;
  transition: width 160ms ease;
  z-index: 50; /* keep above topbar */
}

html[data-theme="dark"] .jw-sidenav{
  background: rgba(10,14,26,0.66);
}

.jw-sidenav.collapsed{
  width: 92px;
}

.jw-brand{
  position: relative;
  display:flex;
  align-items:center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface2);
  box-shadow: var(--shadow-sm);
}

.jw-logo{
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display:grid;
  place-items:center;
  background: linear-gradient(135deg, var(--primary), rgba(91,52,245,0.45));
  color: white;
  font-weight: 950;
  letter-spacing: 0.6px;
  flex: 0 0 auto;
}

.jw-brand-text{ min-width: 0; }
.jw-brand-title{
  font-weight: 900;
  letter-spacing: 0.2px;
  font-size: 15px; /* ✅ nicer weight/size */
}
.jw-brand-sub{
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
  font-weight: 700;
}

.jw-sidenav.collapsed .jw-brand{
  justify-content: center;
  padding: 14px 10px;
}

.jw-sidenav.collapsed .jw-brand-text{
  display:none;
}

/* ✅ collapse button: always aligned, no “broken” look */
.jw-collapsebtn{
  margin-left: auto;
  padding: 8px 10px;
  border-radius: 12px;
}
.jw-sidenav .jw-collapsebtn{
  position: absolute;
  right: -45px;
  top: 48px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 14px;
}

/* Nav */
.jw-nav{
  display:grid;
  gap: 8px;
  margin-top: 6px;
}

.jw-navlink{
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: var(--muted);
  background: transparent;
  transition: all 120ms ease;
  font-weight: 500;
}

.jw-sidenav.collapsed .jw-navlink{
  justify-content: center;
  padding: 10px;
  gap: 0;
}

.jw-navicon{
  width: 30px;
  height: 30px;
  display:grid;
  place-items:center;
  font-size: 16px;
}

.jw-sidenav.collapsed .jw-navicon{
  width: 36px;
  height: 36px;
  border-radius: 12px;
}

.jw-navlabel{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 16px; /* ✅ nicer font size */
}

.jw-sidenav.collapsed .jw-navlabel{ display:none; }

.jw-navlink:hover{
  background: rgba(255,255,255,0.65);
  border-color: var(--border);
  color: var(--text);
  text-decoration: none;
  font-weight: 600;
}
html[data-theme="dark"] .jw-navlink:hover{
  background: rgba(255,255,255,0.06);
}

.jw-navlink.active{
  background: var(--primary-soft);
  border-color: rgba(91,52,245,0.22);
  color: var(--text);
  font-weight: 700;
}

.jw-sidenav-footer{
  margin-top: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface2);
  color: var(--muted);
}
.jw-sidenav.collapsed .jw-sidenav-footer{ display:none; }

/* Main */
.jw-main{
  flex:1;
  min-width: 0;
  display:flex;
  flex-direction: column;
}

/* Topbar */
.jw-topbar{
  height: var(--topbar-h);
  display:flex;
  align-items:center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(248,250,252,0.82);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 20;
}
html[data-theme="dark"] .jw-topbar{
  background: rgba(10,14,26,0.55);
}

.jw-topbar-title{
  display:flex;
  align-items:center;
  gap: 12px;
}

.jw-topbar-stack{
  display:grid;
  line-height: 1.05;
}
.jw-topbar-main{
  font-weight: 950;     /* ✅ nicer header weight */
  font-size: 15px;     /* ✅ prevent too-bold/too-large */
  letter-spacing: 0.1px;
}
.jw-topbar-sub{
  font-size: 12px;
  font-weight: 700;    /* ✅ improve subtitle readability */
  color: var(--muted2);
  margin-top: 2px;
}

.jw-dot{
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 6px rgba(91,52,245,0.10);
}

.jw-topbar-actions{
  display:flex;
  gap: 10px;
  align-items:center;
}

.jw-content{
  padding: 30px;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
}

/* Cards */
.jw-card{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.jw-card-h{ padding: 14px 14px 0 14px; }
.jw-card-b{ padding: 14px; }
.jw-card-title{
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: none;
}

.jw-row{ display:flex; gap: 12px; flex-wrap: wrap; }
.jw-col{ flex: 1 1 360px; min-width: 320px; }

/* Inputs */
.jw-input, .jw-select{
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  padding: 10px 12px;
  font-weight: 700;
}
.jw-input:focus, .jw-select:focus{
  outline: none;
  border-color: rgba(91,52,245,0.40);
  box-shadow: 0 0 0 4px rgba(91,52,245,0.12);
}

/* Buttons */
.jw-btn{
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
  transition: transform 80ms ease, background 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
.jw-btn:active{ transform: translateY(1px); }
.jw-btn:disabled{ opacity: 0.55; cursor: not-allowed; }
.jw-btn.small{ padding: 8px 10px; border-radius: 10px; font-size: 13px; }

.jw-btn.primary{
  background: var(--primary);
  color: white;
  border-color: rgba(91,52,245,0.30);
}

.jw-iconbtn{
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  border-radius: 12px;
  padding: 10px 12px;
  cursor: pointer;
}

/* Badges / pills */
.jw-badge{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  border: 1px solid var(--border);
  background: var(--surface2);
  color: var(--text);
  font-weight: 900;
}
.jw-badge.subtle{ color: var(--muted); }
.jw-badge.ok{ background: var(--ok-soft); border-color: rgba(22,163,74,0.22); color: #166534; }
.jw-badge.warn{ background: var(--warn-soft); border-color: rgba(217,119,6,0.22); color: #92400e; }
.jw-badge.danger{ background: var(--danger-soft); border-color: rgba(239,68,68,0.22); color: #991b1b; }

html[data-theme="dark"] .jw-badge.ok{ color: #bbf7d0; }
html[data-theme="dark"] .jw-badge.warn{ color: #fde68a; }
html[data-theme="dark"] .jw-badge.danger{ color: #fecaca; }

.jw-pill{
  display:inline-flex;
  align-items:center;
  margin: 0px 0px 10px 0px;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 999px;
  color: var(--muted);
  border: 1px solid var(--border);
  background: var(--surface2);
  font-size: 13px;
  font-weight: 950;
}

/* Alerts / empty */
.jw-empty{
  border: 1px dashed rgba(148,163,184,0.45);
  background: var(--surface2);
  padding: 16px;
  border-radius: var(--radius);
  color: var(--muted);
}
.jw-alert{
  border: 1px solid rgba(239,68,68,0.25);
  background: var(--danger-soft);
  padding: 12px 12px;
  border-radius: 14px;
}

/* ✅ Tables: fix dark mode header contrast */
.jw-tablewrap{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--surface);
  box-shadow: var(--shadow-sm);
}
.jw-table{
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.jw-table th, .jw-table td{
  padding: 12px 12px;
  border-bottom: 1px solid rgba(217,225,238,0.55);
  vertical-align: middle;
}
html[data-theme="dark"] .jw-table th,
html[data-theme="dark"] .jw-table td{
  border-bottom-color: rgba(148,163,184,0.16);
}

.jw-table th{
  background: rgba(248,250,252,0.92);
  color: var(--muted);
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  font-weight: 950;
}
html[data-theme="dark"] .jw-table th{
  background: rgba(255,255,255,0.06);   /* ✅ better */
  color: rgba(226,232,240,0.78);       /* ✅ better */
}

.jw-table tr:hover td{
  background: rgba(255,255,255,0.45);
}
html[data-theme="dark"] .jw-table tr:hover td{
  background: rgba(255,255,255,0.04);
}

.jw-toolbar{
  display:flex;
  gap: 10px;
  align-items:center;
}

/* ✅ Logs: improve dark mode readability */
.jw-log{
  border-radius: var(--radius);
  padding: 12px;
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  max-height: 460px;
  overflow: auto;

  background: #0b1220;
  color: rgba(255,255,255,0.92);
  border: 1px solid rgba(148,163,184,0.14);
}

html[data-theme="dark"] .jw-log{
  background: rgba(255,255,255,0.04); /* ✅ less harsh than pure black */
  color: rgba(226,232,240,0.92);
  border: 1px solid rgba(148,163,184,0.16);
}

.jw-only-mobile{ display:none; }
.jw-only-desktop{ display:inline-flex; }
.jw-overlay{ display:none; }

@media (max-width: 920px){
  .jw-only-desktop{ display:none; }

  .jw-sidenav{
    position: fixed;
    left: -320px;
    top: 0;
    z-index: 60;
    transition: left 160ms ease;
    width: 292px !important;
  }
  .jw-sidenav.open{ left: 0; }

  .jw-sidenav.collapsed .jw-brand-text,
  .jw-sidenav.collapsed .jw-navlabel,
  .jw-sidenav.collapsed .jw-sidenav-footer{ display:block; }

  .jw-overlay{
    display:block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(15,23,42,0.30);
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }
  .jw-overlay.open{
    opacity: 1;
    pointer-events: auto;
  }

  .jw-only-mobile{ display:inline-flex; }
}

/* Page header */
.jw-pagebar{
  display:flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.jw-h1{
  margin: 0;
  font-size: 34px;
  font-weight: 1000;
  letter-spacing: -0.02em;
}

/* Label row (fixes “Company nameRequired” spacing) */
.jw-label{
  display:flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 6px;
  font-weight: 900;
}
.jw-help{
  font-size: 12px;
  color: var(--muted2);
  font-weight: 800;
}

/* Split layout */
.jw-split{
  display:grid;
  grid-template-columns: minmax(320px, 380px) 1fr;
  gap: 14px;
  align-items: start;
}
@media (max-width: 980px){
  .jw-split{ grid-template-columns: 1fr; }
}

/* Pane */
.jw-pane{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  display:flex;
  flex-direction: column;
  min-height: 520px;
}
.jw-pane-h{ padding: 14px; border-bottom: 1px solid var(--border); }
.jw-pane-f{ padding: 12px 14px; border-top: 1px solid var(--border); background: rgba(255,255,255,0.25); }
html[data-theme="dark"] .jw-pane-f{ background: rgba(255,255,255,0.04); }

/* List */
.jw-list{
  padding: 10px;
  display:grid;
  gap: 10px;
  overflow: auto;
}
.jw-listitem{
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  background: var(--surface2);
  border-radius: 14px;
  padding: 12px 12px;
  cursor: pointer;
  transition: transform 80ms ease, border-color 120ms ease, background 120ms ease;
}
.jw-listitem:hover{
  transform: translateY(-1px);
  border-color: rgba(91,52,245,0.25);
  text-decoration: none;
}
.jw-listitem.active{
  border-color: rgba(91,52,245,0.42);
  background: var(--primary-soft);
}
.jw-listitem-top{
  display:flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.jw-listitem-title{
  font-weight: 1000;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.jw-listitem-sub{
  margin-top: 8px;
  display:flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

/* Mini tag */
.jw-mini{
  display:inline-flex;
  align-items:center;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-size: 12px;
  font-weight: 900;
  color: var(--muted);
  background: rgba(255,255,255,0.55);
  margin-right: 6px;
}
html[data-theme="dark"] .jw-mini{ background: rgba(15,23,42,0.35); }

/* Details */
.jw-detail{ padding: 14px; display:grid; gap: 12px; }
.jw-detail-h{
  display:flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}
.jw-detail-title{
  font-size: 18px;
  font-weight: 1000;
}

/* Row line used in details + drawer */
.jw-rowline{
  display:flex;
  align-items: center;
  gap: 10px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface2);
  padding: 10px 10px;
}
.jw-rowline-main{
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

/* Modal (Add company) */
.jw-modal-overlay{
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.28);
  backdrop-filter: blur(2px);
  z-index: 80;
  display: none;
}
.jw-modal-overlay.open{ display:block; }

.jw-modal{
  position: fixed;
  inset: 0;
  display: none;
  place-items: center;
  z-index: 85;
  padding: 16px;
}
.jw-modal.open{ display: grid; }

.jw-modal > div{}
.jw-modal{
  pointer-events: none;
}
.jw-modal.open{
  pointer-events: auto;
}

.jw-modal{
  color: var(--text);
}
.jw-modal.open .jw-modal-h,
.jw-modal.open .jw-modal-b{
  pointer-events: auto;
}

.jw-modal .jw-modal-h,
.jw-modal .jw-modal-b{
  width: min(640px, 100%);
  background: var(--surface2);
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
}
.jw-modal-h{
  border-radius: 18px 18px 0 0;
  padding: 14px 16px;
  display:flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.jw-modal-b{
  border-radius: 0 0 18px 18px;
  padding: 14px 16px 16px 16px;
}
.jw-modal-title{ font-weight: 1000; }
.jw-modal-sub{ color: var(--muted2); font-size: 12px; margin-top: 4px; }

/* Drawer (Discover) */
.jw-drawer{
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(650px, 100vw);
  background: var(--surface2);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 90;
  transform: translateX(101%);
  transition: transform 220ms ease;
  display: flex;
  flex-direction: column;
}
.jw-drawer.open{ transform: translateX(0); }
.jw-drawer-h{
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.jw-drawer-title{ font-weight: 1000; font-size: 14px; letter-spacing: 0.2px; }
.jw-drawer-sub{ color: var(--muted2); font-size: 12px; margin-top: 4px; }
.jw-drawer-b{ padding: 14px 16px; overflow: auto; }

/* Table */
.jw-table{
  width: 100%;
  border-collapse: collapse;
}
.jw-table th,
.jw-table td{
  padding: 10px 8px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.jw-table th{
  font-size: 12px;
  color: var(--muted2);
  text-align: left;
  font-weight: 900;
}

/* Danger button */
.jw-btn.danger{
  border-color: rgba(239,68,68,0.35);
  background: var(--danger-soft);
}
`;
