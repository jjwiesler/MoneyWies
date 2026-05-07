// MoneyWies — shared UI components for product screens
// Exposes components on window for other Babel scripts.

const { useState, useMemo, useEffect } = React;

// ---------- Icons (inline SVG, stroke-based) ----------
const Icon = ({ name, size = 16, stroke = 1.75 }) => {
  const paths = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    ledger: <><path d="M4 4h14a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-4-3V4z"/><path d="M8 9h8M8 13h6"/></>,
    reports: <><path d="M3 20h18"/><rect x="5" y="11" width="3" height="8"/><rect x="10.5" y="7" width="3" height="12"/><rect x="16" y="3" width="3" height="16"/></>,
    rules: <><path d="M4 6h10M4 12h16M4 18h10"/><circle cx="17" cy="6" r="2"/><circle cx="17" cy="18" r="2"/></>,
    accounts: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    import: <><path d="M12 3v13"/><path d="m7 11 5 5 5-5"/><path d="M4 21h16"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrowUp: <><path d="M12 19V5M5 12l7-7 7 7"/></>,
    arrowDown: <><path d="M12 5v14M19 12l-7 7-7-7"/></>,
    arrowRight: <><path d="M5 12h14M13 5l7 7-7 7"/></>,
    chev: <><path d="m9 6 6 6-6 6"/></>,
    chevDown: <><path d="m6 9 6 6 6-6"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
    eyeOff: <><path d="M3 3l18 18"/><path d="M10.5 5.2a11 11 0 0 1 1.5-.2c6.5 0 10 7 10 7a18 18 0 0 1-2.4 3.2M6.6 6.6A18 18 0 0 0 2 12s3.5 7 10 7a11 11 0 0 0 5.4-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
    filter: <><path d="M3 5h18M6 12h12M10 19h4"/></>,
    dot: <circle cx="12" cy="12" r="4"/>,
    download: <><path d="M12 3v13M7 11l5 5 5-5M4 21h16"/></>,
    sparkle: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
};

// ---------- Money formatter ----------
const fmt = (n, { sign = false, privacy = false } = {}) => {
  if (privacy) return "$ •••••";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const s = n < 0 ? "−" : (sign ? "+" : "");
  return `${s}$${abs}`;
};

// ---------- Sidebar ----------
const Sidebar = ({ current = "dashboard" }) => {
  const items = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "ledger", label: "Transactions", icon: "ledger" },
    { id: "reports", label: "Reports", icon: "reports" },
    { id: "rules", label: "Rules", icon: "rules" },
    { id: "accounts", label: "Accounts", icon: "accounts" },
    { id: "import", label: "Import", icon: "import" },
  ];
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div className="brand-word">MoneyWies</div>
      </div>

      <div className="nav">
        <div className="nav-group-label">Workspace</div>
        {items.map(i => (
          <a key={i.id} className={`nav-item ${current === i.id ? "active" : ""}`}>
            <span className="n-icon"><Icon name={i.icon} size={16} stroke={1.6} /></span>
            {i.label}
          </a>
        ))}
        <div className="nav-group-label" style={{ marginTop: 12 }}>System</div>
        <a className="nav-item"><span className="n-icon"><Icon name="settings" size={16} stroke={1.6} /></span>Settings</a>
        <a className="nav-item" href="Design System.html"><span className="n-icon"><Icon name="sparkle" size={16} stroke={1.6} /></span>Design system</a>
      </div>

      <div style={{ marginTop: "auto", padding: "16px 10px", borderTop: "1px solid var(--paper-3)", fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-700)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>JD</div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500, color: "var(--ink-0)" }}>Jay &amp; Erica</div>
            <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Household · 4 accounts</div>
          </div>
        </div>
      </div>
    </aside>
  );
};

// ---------- Stat ----------
const Stat = ({ label, value, delta, tone, privacy, prefix = "", big }) => (
  <div className="stat">
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={big ? { fontSize: 44 } : {}}>
      {prefix && <span className="sign">{prefix}</span>}
      {privacy ? "•••••" : value}
    </div>
    {delta && (
      <div className={`stat-delta ${tone || ""}`}>
        <Icon name={tone === "up" ? "arrowUp" : "arrowDown"} size={12} stroke={2} /> {delta}
      </div>
    )}
  </div>
);

// ---------- Sparkline ----------
const Sparkline = ({ data, color = "#1F3A2E", height = 48, width = 240, fill = true }) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 6) - 3]);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  const gradId = `spark-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: "block" }}>
      {fill && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.16" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${gradId})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="3" fill={color} />
    </svg>
  );
};

Object.assign(window, { Icon, fmt, Sidebar, Stat, Sparkline });
