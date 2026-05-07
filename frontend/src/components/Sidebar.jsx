import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";
import moneywiesLogo from "../assets/moneywies-logo.png";

const NAV = [
  { to: "/dashboard",    label: "Dashboard",    icon: "dashboard" },
  { to: "/transactions", label: "Transactions", icon: "ledger" },
  { to: "/income",       label: "Income",       icon: "arrowUp" },
  { to: "/expenses",     label: "Expenses",     icon: "arrowDown" },
  { to: "/recurring",    label: "Recurring",    icon: "repeat" },
  { to: "/properties",   label: "Properties",   icon: "home" },
  { to: "/reports",      label: "Reports",      icon: "reports" },
  { to: "/rules",        label: "Rules",        icon: "rules" },
  { to: "/accounts",     label: "Accounts",     icon: "accounts" },
  { to: "/import",       label: "Import",       icon: "import" },
  { to: "/reconcile",   label: "Reconcile",    icon: "split"  },
  { to: "/token-usage",  label: "Token Usage",  icon: "sparkle" },
];

export default function Sidebar({ onChatOpen }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <img src={moneywiesLogo} alt="MoneyWies logo" />
        </div>
        <div className="brand-word">MoneyWies</div>
      </div>

      <nav className="nav">
        <div className="nav-group-label">Workspace</div>
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            <span className="n-icon">
              <Icon name={icon} size={16} stroke={1.6} />
            </span>
            {label}
          </NavLink>
        ))}
        <div className="nav-group-label" style={{ marginTop: 12 }}>System</div>
        <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="n-icon"><Icon name="settings" size={16} stroke={1.6} /></span>
          Settings
        </NavLink>
      </nav>

      <div style={{ padding: "0 10px 12px" }}>
        <button
          onClick={onChatOpen}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", borderRadius: "var(--r-md)",
            background: "var(--brand-700)", color: "#fff",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            border: "none",
          }}
        >
          <Icon name="sparkle" size={14} />
          Ask MoneyWies AI
        </button>
      </div>

      <div style={{ padding: "16px 10px", borderTop: "1px solid var(--paper-3)", fontSize: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-700)", color: "#fff", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600 }}>
            JS
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500, color: "var(--ink-0)" }}>JJ &amp; Sam</div>
            <div style={{ color: "var(--ink-3)", fontSize: 11 }}>Household</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
