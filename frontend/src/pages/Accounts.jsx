import { useState, useEffect } from "react";
import Icon from "../components/Icon.jsx";

function fmt(n) {
  if (n == null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export default function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/accounts")
      .then(r => r.json())
      .then(data => { setAccounts(data); setLoading(false); });
  }, []);

  async function toggleIgnore(acct) {
    await fetch(`/api/accounts/${acct.id}?ignored=${!acct.ignored}`, { method: "PATCH" });
    setAccounts(prev => prev.map(a => a.id === acct.id ? { ...a, ignored: !acct.ignored } : a));
  }

  const active  = accounts.filter(a => !a.ignored);
  const ignored = accounts.filter(a => a.ignored);

  return (
    <main className="main">
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Accounts</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Accounts
          </h1>
        </div>
      </div>

      <div className="card flush">
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--paper-3)" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Tracked accounts</span>
          <span style={{ marginLeft: 8, fontSize: 12, color: "var(--ink-3)" }}>{active.length} active</span>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
        )}

        {!loading && accounts.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No accounts found. Import a CSV to add accounts.
          </div>
        )}

        {!loading && accounts.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Account</th>
                <th className="num" style={{ width: 100 }}>Number</th>
                <th style={{ width: 80, textAlign: "center" }}>Status</th>
                <th style={{ width: 120, textAlign: "center" }}>Include in reports</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(acct => (
                <tr key={acct.id} style={{ opacity: acct.ignored ? 0.5 : 1 }}>
                  <td style={{ fontSize: 13, color: "var(--ink-2)" }}>{acct.institution || "—"}</td>
                  <td style={{ fontWeight: 500, fontSize: 13 }}>{acct.account_name}</td>
                  <td className="num mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    ··{acct.account_number?.slice(-4) || "—"}
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 8px",
                      borderRadius: "var(--r-full)",
                      background: acct.ignored ? "var(--paper-2)" : "var(--income-soft)",
                      color: acct.ignored ? "var(--ink-3)" : "var(--income)",
                    }}>
                      {acct.ignored ? "Ignored" : "Active"}
                    </span>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button
                      onClick={() => toggleIgnore(acct)}
                      title={acct.ignored ? "Include in reports" : "Exclude from reports"}
                      style={{ color: acct.ignored ? "var(--ink-3)" : "var(--brand-700)", padding: 6 }}
                    >
                      <Icon name={acct.ignored ? "eyeOff" : "eye"} size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ignored.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--ink-3)" }}>
          {ignored.length} account{ignored.length > 1 ? "s" : ""} excluded from cashflow reports. Click the eye icon to re-include.
        </div>
      )}
    </main>
  );
}
