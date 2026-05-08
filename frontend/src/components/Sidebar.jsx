import { NavLink } from "react-router-dom";
import Icon from "./Icon.jsx";
import moneywiesLogo from "../assets/moneywies-logo.png";
import { useWorkspace } from "../context/WorkspaceContext.jsx";

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
  const { workspace, logout } = useWorkspace();

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
        <NavLink to="/workspaces" className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
          <span className="n-icon"><Icon name="accounts" size={16} stroke={1.6} /></span>
          Workspaces
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

      <div style={{ padding: "12px 10px 16px", borderTop: "1px solid var(--paper-3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, background: "var(--brand-700)",
              color: "#fff", display: "grid", placeItems: "center", fontSize: 12,
              fontWeight: 600, flexShrink: 0,
            }}>
              {workspace?.name?.slice(0, 2).toUpperCase() ?? "WS"}
            </div>
            <div style={{ lineHeight: 1.3, minWidth: 0 }}>
              <div style={{ fontWeight: 500, color: "var(--ink-0)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {workspace?.name ?? "Workspace"}
              </div>
              <button
                onClick={logout}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  color: "var(--ink-3)", fontSize: 11, fontFamily: "var(--font-sans)",
                  textDecoration: "underline", textUnderlineOffset: 2,
                }}
              >
                Switch workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
