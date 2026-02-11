/* eslint-disable react-hooks/set-state-in-effect */
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon.jsx";

const COLLAPSE_KEY = "jw_sidebar_collapsed";

export default function Layout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const location = useLocation();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "dark");
    document.documentElement.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const navItems = useMemo(
    () => [
      { to: "/", label: "Dashboard", icon: "dashboard" },
      { to: "/new", label: "New Jobs", icon: "spark" },
      { to: "/all", label: "All Jobs", icon: "list" },
      { to: "/companies", label: "Companies", icon: "building" },
      { to: "/audit", label: "Audit", icon: "shield" },
      { to: "/settings", label: "Settings", icon: "settings" },
    ],
    []
  );

  const pageTitle = useMemo(() => {
    const hit = navItems.find((n) => n.to === location.pathname);
    if (hit) return hit.label;
    if (location.pathname.startsWith("/new")) return "New Jobs";
    if (location.pathname.startsWith("/all")) return "All Jobs";
    if (location.pathname.startsWith("/companies")) return "Companies";
    if (location.pathname.startsWith("/audit")) return "Audit";
    if (location.pathname.startsWith("/settings")) return "Settings";
    return "Job Watcher";
  }, [location.pathname, navItems]);

  return (
    <div className="jw-root">
      <style>{globalStyles}</style>

      <div
        className={`jw-overlay ${mobileNavOpen ? "open" : ""}`}
        onClick={() => setMobileNavOpen(false)}
        role="button"
        tabIndex={0}
        aria-label="Close navigation"
        onKeyDown={(e) => {
          if (e.key === "Escape") setMobileNavOpen(false);
        }}
      />

      <aside className={`jw-sidenav ${mobileNavOpen ? "open" : ""} ${collapsed ? "collapsed" : ""}`}>
        <div className="jw-brand">
          <div className="jw-brand-main">
            <div className="jw-logo" aria-label="Job Watcher logo">
              JW
            </div>

            <div className="jw-brand-text">
              <div className="jw-brand-title">Job Watcher</div>
              <div className="jw-brand-sub">US-only job monitoring</div>
            </div>
          </div>

          <button
            className="jw-iconbtn jw-only-desktop jw-collapsebtn"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((v) => !v)}
            type="button"
          >
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={16} />
          </button>
        </div>

        <nav className="jw-nav" aria-label="Primary">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) => `jw-navlink ${isActive ? "active" : ""}`}
              title={collapsed ? n.label : undefined}
              aria-label={collapsed ? n.label : undefined}
            >
              <span className="jw-navicon" aria-hidden="true">
                <Icon name={n.icon} size={18} />
              </span>
              <span className="jw-navlabel">{n.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="jw-sidenav-footer">
          <div className="jw-muted">
            If a career page is JS-rendered, set source mode to <b>playwright</b>.
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
            <Icon name="menu" size={18} />
            <span className="jw-sr-only">Menu</span>
          </button>

          <div className="jw-topbar-title">
            <span className="jw-dot" aria-hidden="true" />
            <div className="jw-topbar-stack">
              <span className="jw-topbar-main">{pageTitle}</span>
              <span className="jw-topbar-sub">Monitor | Fetch | Apply</span>
            </div>
          </div>

          <div className="jw-topbar-actions">
            <span className="jw-badge subtle">Alpha</span>
          </div>
        </header>

        <main className="jw-content">{children}</main>
      </div>
    </div>
  );
}

const globalStyles = `
.jw-root{
  display:flex;
  min-height: 100vh;
}

.jw-main{
  flex:1;
  min-width: 0;
  display:flex;
  flex-direction: column;
}

.jw-sr-only{
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.jw-only-mobile{ display: none !important; }
.jw-overlay{ display:none; }

.jw-sidenav{
  width: 264px;
  padding: 16px 14px;
  background: rgba(16, 23, 33, 0.94);
  border-right: 1px solid var(--border);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  height: 100vh;
  display:flex;
  flex-direction: column;
  gap: 12px;
  transition: width 160ms ease, padding 160ms ease;
  z-index: 50;
}

.jw-sidenav.collapsed{
  width: 86px;
  padding: 14px 10px;
}

.jw-brand{
  display:grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(180deg, rgba(24, 33, 45, 0.92), rgba(19, 26, 35, 0.92));
  box-shadow: var(--shadow-sm);
}

.jw-brand-main{
  display:flex;
  align-items:center;
  gap: 10px;
  min-width: 0;
}

.jw-logo{
  width: 40px;
  height: 40px;
  border-radius: 11px;
  display:grid;
  place-items:center;
  background: linear-gradient(135deg, var(--primary), var(--primary-700));
  color: #021012;
  font-weight: var(--fw-bold);
  letter-spacing: 0.04em;
  flex: 0 0 auto;
}

.jw-brand-title{
  font-weight: var(--fw-semibold);
  font-size: var(--fs-base);
  color: var(--text);
  line-height: 1.2;
}

.jw-brand-sub{
  font-size: var(--fs-sm);
  color: var(--muted-2);
  margin-top: 4px;
}

.jw-collapsebtn{
  width: 100%;
  justify-content: center;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: var(--fs-xs);
}

.jw-sidenav.collapsed .jw-brand-main{
  justify-content: center;
}

.jw-sidenav.collapsed .jw-brand-text{
  display:none;
}

.jw-nav{
  display:grid;
  gap: 8px;
  margin-top: 2px;
  position: relative;
}

.jw-navlink{
  position: relative;
  isolation: isolate;
  overflow: hidden;
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  color: var(--text-2);
  background: transparent;
  transition: border-color 240ms cubic-bezier(0.22, 1, 0.36, 1), color 240ms ease, transform 180ms ease;
  font-weight: var(--fw-medium);
  text-decoration: none;
}

.jw-navlink::before{
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(140px 46px at 24px 50%, rgba(var(--primary-rgb), 0.26), rgba(var(--primary-rgb), 0)),
    linear-gradient(90deg, rgba(var(--primary-rgb), 0.2), rgba(var(--primary-rgb), 0.06));
  opacity: 0;
  transform: translateX(-12px) scaleX(0.9);
  transform-origin: left center;
  transition: opacity 260ms ease, transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 0;
}

.jw-navlink > *{
  position: relative;
  z-index: 1;
}

.jw-navicon{
  width: 36px;
  height: 36px;
  display:grid;
  place-items:center;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: rgba(226, 232, 240, 0.03);
  flex: 0 0 auto;
  transition: border-color 220ms ease, background 220ms ease, transform 220ms ease;
}

.jw-navlabel{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--fs-base);
}

.jw-navlink:hover{
  border-color: rgba(var(--primary-rgb), 0.32);
  color: var(--text);
  text-decoration: none;
  transform: translateX(1px);
}

.jw-navlink:hover::before{
  opacity: 1;
  transform: translateX(0) scaleX(1);
}

.jw-navlink:hover .jw-navicon{
  border-color: rgba(var(--primary-rgb), 0.42);
  background: rgba(var(--primary-rgb), 0.16);
  transform: translateY(-1px);
}

.jw-navlink:focus-visible{
  outline: none;
  border-color: rgba(var(--primary-rgb), 0.52);
  box-shadow: 0 0 0 4px rgba(var(--primary-rgb), 0.18);
}

.jw-navlink:focus-visible::before{
  opacity: 1;
  transform: translateX(0) scaleX(1);
}

.jw-navlink.active{
  border-color: rgba(var(--primary-rgb), 0.54);
  color: var(--text);
  transform: translateX(2px);
}

.jw-navlink.active::before{
  opacity: 1;
  transform: translateX(0) scaleX(1);
}

.jw-navlink.active .jw-navicon{
  border-color: rgba(var(--primary-rgb), 0.62);
  background: rgba(var(--primary-rgb), 0.28);
  box-shadow: inset 0 0 0 1px rgba(var(--primary-rgb), 0.18);
}

.jw-sidenav.collapsed .jw-navlink{
  justify-content: center;
  padding: 8px;
  transform: none;
}

.jw-sidenav.collapsed .jw-navlink:hover,
.jw-sidenav.collapsed .jw-navlink.active{
  transform: none;
}

.jw-sidenav.collapsed .jw-navlink::before{
  transform: scale(0.92);
}

.jw-sidenav.collapsed .jw-navlink:hover::before,
.jw-sidenav.collapsed .jw-navlink.active::before{
  transform: scale(1);
}

.jw-sidenav.collapsed .jw-navlabel{
  display:none;
}

.jw-sidenav-footer{
  margin-top: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(24, 33, 45, 0.7);
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

.jw-sidenav.collapsed .jw-sidenav-footer{
  display:none;
}

.jw-topbar{
  height: var(--topbar-h);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: rgba(13, 17, 23, 0.78);
  backdrop-filter: blur(10px);
  position: sticky;
  top: 0;
  z-index: 20;
}

.jw-topbar-title{
  display:flex;
  align-items:center;
  gap: 12px;
  min-width: 0;
}

.jw-topbar-stack{
  display:grid;
  line-height: 1.05;
}

.jw-topbar-main{
  font-weight: var(--fw-semibold);
  font-size: var(--fs-md);
  color: var(--text);
}

.jw-topbar-sub{
  font-size: var(--fs-sm);
  color: var(--muted-2);
  margin-top: 4px;
}

.jw-dot{
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--primary);
  box-shadow: 0 0 0 7px rgba(var(--primary-rgb), 0.2);
  flex: 0 0 auto;
}

.jw-topbar-actions{
  display:flex;
  gap: 10px;
  align-items:center;
}

.jw-content{
  padding: 24px;
  width: 100%;
  max-width: 1480px;
  margin: 0 auto;
}

.jw-card{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background:
    linear-gradient(180deg, rgba(27, 37, 50, 0.2), rgba(15, 23, 42, 0)),
    rgba(15, 23, 42, 0.9);
  box-shadow: var(--shadow-sm);
  transition: border-color 220ms ease, box-shadow 220ms ease, background 220ms ease;
}

.jw-card:hover{
  border-color: var(--border-strong);
  box-shadow: 0 18px 38px rgba(0, 0, 0, 0.34);
}

.jw-card-h{ padding: 14px 14px 0 14px; }
.jw-card-b{ padding: 16px; }

.jw-row{ display:flex; gap: 12px; flex-wrap: wrap; }
.jw-col{ flex: 1 1 360px; min-width: 320px; }

.jw-label{
  margin-bottom: 6px;
  font-weight: var(--fw-medium);
  color: var(--muted);
  font-size: var(--fs-xs);
}

.jw-help{
  font-size: var(--fs-sm);
  color: var(--muted-2);
  font-weight: var(--fw-regular);
  line-height: 1.45;
}

.jw-muted{ color: var(--muted); }
.jw-muted2{
  color: var(--muted-2);
  font-size: var(--fs-sm) !important;
  line-height: 1.45;
}

.jw-card-title{
  font-weight: var(--fw-semibold);
  font-size: var(--fs-md);
  color: var(--text);
}

.jw-input,
.jw-select{
  width: 100%;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.78);
  color: var(--text);
  padding: 10px 12px;
  font-weight: var(--fw-regular);
  font-size: var(--fs-base);
}

.jw-input[type="checkbox"]{
  accent-color: var(--primary);
}

.jw-input::placeholder{ color: var(--muted-2); }

.jw-input:focus,
.jw-select:focus{
  border-color: var(--primary);
  box-shadow: 0 0 0 4px var(--focus);
}

.jw-page-shell{
  display: grid;
  gap: 16px;
  animation: jw-fade-up 260ms ease both;
}

.jw-page-hero{
  position: relative;
  isolation: isolate;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) + 2px);
  padding: 16px;
  background:
    linear-gradient(160deg, rgba(var(--primary-rgb), 0.18), rgba(var(--primary-rgb), 0) 48%),
    linear-gradient(180deg, rgba(24, 33, 45, 0.96), rgba(19, 26, 35, 0.96));
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.jw-page-hero::after{
  content: "";
  position: absolute;
  inset: -24% -18% auto auto;
  width: 220px;
  height: 220px;
  background: radial-gradient(circle at center, rgba(var(--primary-rgb), 0.22), rgba(var(--primary-rgb), 0));
  pointer-events: none;
  z-index: 0;
  transform: translate3d(0, 0, 0);
  animation: jw-float 7s ease-in-out infinite;
}

.jw-page-hero-main,
.jw-page-hero > :not(.jw-page-hero-main){
  position: relative;
  z-index: 1;
}

.jw-page-hero-main{
  min-width: 260px;
  display: grid;
  gap: 8px;
}

.jw-page-hero-title{
  margin: 0;
  font-size: clamp(24px, 2.9vw, 32px);
  line-height: 1.2;
  font-weight: var(--fw-semibold);
  color: var(--text);
}

.jw-page-hero-sub{
  margin: 0;
  color: var(--muted);
  font-size: var(--fs-md);
  line-height: 1.45;
}

.jw-page-hero .jw-badge{
  font-size: var(--fs-sm);
  padding: 7px 12px;
}

.jw-page-hero .jw-badge svg{
  width: 16px !important;
  height: 16px !important;
}

.jw-btn{
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.72);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: var(--fw-semibold);
  font-size: var(--fs-sm);
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
}

.jw-btn:hover{
  background: var(--hover);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.jw-btn:active{
  transform: translateY(0);
  background: var(--active);
}

.jw-btn:disabled{
  opacity: 0.6;
  cursor: not-allowed;
}

.jw-btn.small{
  padding: 8px 10px;
  border-radius: 10px;
  font-size: var(--fs-sm);
}

.jw-btn.primary{
  background: linear-gradient(180deg, var(--btn-primary), var(--btn-primary-600));
  color: #e8f7ee;
  border-color: rgba(var(--btn-primary-rgb), 0.56);
  box-shadow: 0 4px 10px rgba(var(--btn-primary-rgb), 0.18), inset 0 1px 0 rgba(255,255,255,0.08);
}

.jw-btn.primary:hover{
  background: linear-gradient(180deg, var(--btn-primary-600), var(--btn-primary-700));
  border-color: rgba(var(--btn-primary-rgb), 0.72);
}

.jw-btn.primary:active{
  background: var(--btn-primary-700);
  border-color: rgba(var(--btn-primary-rgb), 0.82);
}

.jw-btn.primary:focus-visible{
  outline: 2px solid transparent;
  box-shadow: 0 0 0 3px var(--btn-primary-focus), 0 4px 10px rgba(var(--btn-primary-rgb), 0.2);
}

.jw-btn.ghost{
  background: transparent;
  border-color: transparent;
  color: var(--text-2);
}

.jw-btn.ghost:hover{
  background: var(--hover);
  border-color: var(--border);
  color: var(--text);
}

.jw-btn.danger{
  border-color: rgba(251, 113, 133, 0.4);
  background: var(--danger-bg);
  color: #fecdd3;
}

.jw-iconbtn{
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.72);
  color: var(--text);
  border-radius: 11px;
  padding: 8px 10px;
  cursor: pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  font-size: var(--fs-sm);
  gap: 8px;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease, box-shadow 140ms ease;
}

.jw-iconbtn:hover{
  background: var(--hover);
  border-color: var(--border-strong);
  transform: translateY(-1px);
}

.jw-badge{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: var(--fs-xs);
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.72);
  color: var(--text);
  font-weight: var(--fw-medium);
}

.jw-badge.subtle{ color: var(--text-2); }
.jw-badge.ok{
  background: var(--success-bg);
  border-color: rgba(34, 197, 94, 0.3);
  color: #bbf7d0;
}
.jw-badge.warn{
  background: var(--warn-bg);
  border-color: rgba(251, 191, 36, 0.3);
  color: #fef3c7;
}
.jw-badge.danger{
  background: var(--danger-bg);
  border-color: rgba(251, 113, 133, 0.3);
  color: #fecdd3;
}

.jw-pill{
  display:inline-flex;
  align-items:center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.72);
  color: var(--text-2);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}

.jw-pill.ok{
  background: var(--success-bg);
  border-color: rgba(34, 197, 94, 0.3);
  color: #bbf7d0;
}

.jw-pill.bad{
  background: var(--danger-bg);
  border-color: rgba(251, 113, 133, 0.3);
  color: #fecdd3;
}

.jw-empty{
  border: 1px dashed var(--border-strong);
  background: rgba(24, 33, 45, 0.44);
  padding: 16px;
  border-radius: var(--radius);
  color: var(--muted);
  font-size: var(--fs-sm);
}

.jw-alert{
  border: 1px solid rgba(251, 113, 133, 0.32);
  background: rgba(251, 113, 133, 0.1);
  padding: 12px;
  border-radius: 12px;
}

.jw-tablewrap{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: auto;
  background: rgba(15, 23, 42, 0.86);
  box-shadow: var(--shadow-sm);
  transition: border-color 220ms ease, box-shadow 220ms ease;
}

.jw-tablewrap:hover{
  border-color: var(--border-strong);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
}

.jw-table{
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
  line-height: 1.4;
}

.jw-table th,
.jw-table td{
  padding: 11px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.jw-table th{
  position: sticky;
  top: 0;
  background: rgba(24, 33, 45, 0.98);
  color: var(--text-2);
  font-size: 12px;
  letter-spacing: 0.08em;
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  text-align: left;
  white-space: nowrap;
  z-index: 1;
}

.jw-table tr:hover td{
  background: var(--hover);
}

.jw-toolbar{
  display:flex;
  gap: 10px;
  align-items:center;
}

.jw-selectmenu{
  position: relative;
  min-width: 0;
}

.jw-selectmenu-btn{
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: rgba(24, 33, 45, 0.78);
  color: var(--text);
  padding: 10px 12px;
  font-size: var(--fs-base);
  line-height: 1.2;
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
}

.jw-selectmenu-btn:hover{
  border-color: var(--border-strong);
  background: rgba(24, 33, 45, 0.9);
}

.jw-selectmenu-btn:disabled{
  opacity: 0.55;
  cursor: not-allowed;
}

.jw-selectmenu-btn:focus-visible{
  outline: 2px solid transparent;
  box-shadow: 0 0 0 4px var(--focus);
  border-color: var(--primary);
}

.jw-selectmenu-label{
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jw-selectmenu-caret{
  flex: 0 0 auto;
  transition: transform 120ms ease;
  color: var(--muted);
}

.jw-selectmenu-caret.open{
  transform: rotate(180deg);
}

.jw-selectmenu-list{
  position: absolute;
  z-index: 70;
  left: 0;
  right: 0;
  top: calc(100% + 8px);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  background: rgba(11, 18, 32, 0.98);
  box-shadow: var(--shadow);
  overflow: hidden;
  max-height: 280px;
  overflow-y: auto;
  transform-origin: top center;
  animation: jw-pop 140ms ease both;
}

.jw-selectmenu-list.up{
  top: auto;
  bottom: calc(100% + 8px);
  transform-origin: bottom center;
  animation: jw-pop-up 140ms ease both;
}

.jw-selectmenu-opt{
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text-2);
  padding: 10px 12px;
  cursor: pointer;
  font-size: var(--fs-sm);
  transition: background 120ms ease, color 120ms ease;
}

.jw-selectmenu-opt:hover,
.jw-selectmenu-opt.active{
  background: var(--hover);
  color: var(--text);
}

.jw-selectmenu-opt.selected{
  background: var(--selected);
  color: var(--text);
}

.jw-selectmenu-opt:disabled{
  opacity: 0.45;
  cursor: not-allowed;
}

.jw-log{
  border-radius: var(--radius);
  padding: 12px;
  font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
  font-size: var(--fs-xs);
  line-height: 1.55;
  white-space: pre-wrap;
  max-height: 460px;
  overflow: auto;
  background: rgba(24, 33, 45, 0.84);
  color: var(--text);
  border: 1px solid var(--border);
}

.jw-sheet-overlay{
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
  z-index: 80;
  display: none;
}

.jw-sheet-overlay.open{ display:block; }

.jw-sheet{
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: min(72vh, 620px);
  background: rgba(16, 23, 33, 0.98);
  border-top: 1px solid var(--border);
  box-shadow: var(--shadow);
  z-index: 90;
  transform: translateY(101%);
  transition: transform 220ms ease;
  display: flex;
  flex-direction: column;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
}

.jw-sheet.open{ transform: translateY(0); }

.jw-sheet-h{
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}

.jw-sheet-title{ font-weight: var(--fw-semibold); font-size: var(--fs-sm); }
.jw-sheet-b{ padding: 14px; overflow: auto; display: grid; gap: 12px; }

.jw-cardlist{ display: grid; gap: 12px; }

.jw-carditem{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(24, 33, 45, 0.74);
  padding: 12px;
  box-shadow: var(--shadow-sm);
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

.jw-carditem:hover{
  transform: translateY(-1px);
  border-color: var(--border-strong);
  background: rgba(24, 33, 45, 0.84);
}

.jw-menu{ position: relative; }
.jw-menu summary{ list-style: none; cursor: pointer; }
.jw-menu summary::-webkit-details-marker{ display: none; }
.jw-menu[open] > summary{ box-shadow: 0 0 0 3px rgba(var(--primary-rgb), 0.24); border-radius: 12px; }

.jw-menu-panel{
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  right: 0;
  min-width: 200px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 18, 32, 0.98);
  backdrop-filter: blur(12px);
  padding: 6px;
  box-shadow: var(--shadow);
  transform-origin: top right;
  animation: jw-pop 120ms ease both;
}

.jw-menu-item{
  width: 100%;
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-weight: var(--fw-medium);
  text-align: left;
}

.jw-menu-item:hover{
  background: var(--hover);
  border-color: var(--border-strong);
}

.jw-pagebar{
  display:flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.jw-h1{
  margin: 0;
  font-size: var(--fs-xl);
  font-weight: var(--fw-semibold);
  color: var(--text);
}

.jw-mini{
  display:inline-flex;
  padding: 3px 7px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(226, 232, 240, 0.04);
  color: var(--text-2);
  font-size: 12px;
}

.jw-rowline{
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 11px;
  background: rgba(24, 33, 45, 0.52);
}

.jw-rowline-main{
  min-width: 0;
  color: var(--text-2);
  font-size: var(--fs-sm);
  word-break: break-word;
}

.jw-split{
  display:grid;
  grid-template-columns: minmax(360px, 420px) 1fr;
  gap: 14px;
  align-items: start;
}

.jw-pane{
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(15, 23, 42, 0.9);
  box-shadow: var(--shadow-sm);
  min-height: 520px;
  display:flex;
  flex-direction: column;
}

.jw-pane-h{
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.jw-pane-f{
  padding: 10px 12px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.jw-list{
  padding: 10px;
  display:grid;
  gap: 8px;
  overflow: auto;
}

.jw-listitem{
  width: 100%;
  text-align: left;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(24, 33, 45, 0.48);
  color: var(--text);
  cursor: pointer;
  padding: 10px;
  display:grid;
  gap: 8px;
  transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
}

.jw-listitem:hover{
  border-color: var(--border-strong);
  background: var(--hover);
  transform: translateY(-1px);
}

.jw-listitem.active{
  border-color: rgba(var(--primary-rgb), 0.44);
  background: var(--selected);
}

.jw-listitem-top{
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
}

.jw-listitem-title{
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jw-listitem-sub{
  display:flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}

.jw-detail{
  padding: 12px;
  display:grid;
  gap: 12px;
}

.jw-detail-h{
  display:flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.jw-detail-title{
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
  color: var(--text);
}

.jw-modal-overlay{
  position: fixed;
  inset: 0;
  z-index: 69;
  background: rgba(0, 0, 0, 0.56);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.jw-modal-overlay.open{
  opacity: 1;
  pointer-events: auto;
}

.jw-modal{
  position: fixed;
  inset: 0;
  z-index: 72;
  padding: 14px;
  display:grid;
  place-items: center;
  pointer-events: none;
}

.jw-modal.open{ pointer-events: auto; }

.jw-modal-panel{
  width: min(760px, 100%);
  max-height: 88vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(13, 17, 23, 0.98);
  box-shadow: var(--shadow);
  transform: translateY(10px) scale(0.99);
  opacity: 0;
  transition: transform 140ms ease, opacity 140ms ease;
}

.jw-modal.open .jw-modal-panel{
  transform: translateY(0) scale(1);
  opacity: 1;
}

.jw-modal-h{
  padding: 12px;
  border-bottom: 1px solid var(--border);
  display:flex;
  justify-content: space-between;
  gap: 10px;
  align-items:flex-start;
}

.jw-modal-title{
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.jw-modal-sub{
  margin-top: 6px;
  color: var(--muted-2);
  font-size: var(--fs-xs);
}

.jw-modal-b{ padding: 12px; }

.jw-drawer{
  position: fixed;
  top: 0;
  right: 0;
  z-index: 75;
  width: min(700px, 100vw);
  height: 100vh;
  border-left: 1px solid var(--border);
  background: rgba(13, 17, 23, 0.98);
  box-shadow: var(--shadow);
  transform: translateX(101%);
  transition: transform 180ms ease;
  pointer-events: none;
  visibility: hidden;
  display:flex;
  flex-direction: column;
}

.jw-drawer.open{
  transform: translateX(0);
  pointer-events: auto;
  visibility: visible;
}

.jw-drawer-h{
  padding: 12px;
  border-bottom: 1px solid var(--border);
  display:flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.jw-drawer-title{
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.jw-drawer-sub{
  margin-top: 6px;
  color: var(--muted-2);
  font-size: var(--fs-xs);
}

.jw-drawer-b{
  padding: 12px;
  overflow: auto;
  display:grid;
  gap: 12px;
}

@keyframes jw-fade-up{
  from{
    opacity: 0;
    transform: translateY(4px);
  }
  to{
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes jw-pop{
  from{
    opacity: 0;
    transform: translateY(-4px) scale(0.985);
  }
  to{
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes jw-pop-up{
  from{
    opacity: 0;
    transform: translateY(4px) scale(0.985);
  }
  to{
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes jw-float{
  0%{
    transform: translate3d(0, 0, 0);
  }
  50%{
    transform: translate3d(-6px, 6px, 0);
  }
  100%{
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce){
  .jw-page-shell,
  .jw-page-hero::after,
  .jw-btn,
  .jw-iconbtn,
  .jw-navlink,
  .jw-navlink::before,
  .jw-navicon,
  .jw-selectmenu-caret,
  .jw-selectmenu-list,
  .jw-menu-panel,
  .jw-card,
  .jw-tablewrap,
  .jw-carditem,
  .jw-listitem{
    animation: none !important;
    transition: none !important;
  }
}

@media (max-width: 1120px){
  .jw-split{
    grid-template-columns: 1fr;
  }
  .jw-pane{
    min-height: auto;
  }
}

@media (max-width: 920px){
  .jw-only-desktop{ display:none !important; }
  .jw-only-mobile{ display: inline-flex !important; }
  .jw-only-mobile.jw-toolbar{ display: flex !important; }
  .jw-only-mobile.jw-cardlist{ display: grid !important; }

  .jw-sidenav{
    position: fixed;
    left: -320px;
    top: 0;
    z-index: 60;
    transition: left 160ms ease;
    width: 268px !important;
    height: 100vh;
  }

  .jw-sidenav.open{ left: 0; }

  .jw-overlay{
    display:block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(0, 0, 0, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 160ms ease;
  }

  .jw-overlay.open{
    opacity: 1;
    pointer-events: auto;
  }
}

@media (max-width: 767px){
  .jw-content{ padding: 16px; }
  .jw-page-hero{
    padding: 14px;
  }
  .jw-pagebar{
    align-items: stretch;
  }
  .jw-listitem-sub{
    flex-wrap: wrap;
  }
  .jw-drawer{
    width: 100vw;
  }
}
`;

