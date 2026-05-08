import { useState, useEffect } from "react";
import Icon from "../components/Icon.jsx";

export default function WorkspaceAdmin() {
  const [workspaces, setWorkspaces] = useState([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null); // {name, token} shown after create
  const [copied, setCopied] = useState(false);

  function load() {
    fetch("/api/workspaces", { credentials: "include" })
      .then(r => r.json())
      .then(setWorkspaces);
  }
  useEffect(load, []);

  async function handleCreate(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    const res = await fetch("/api/workspaces", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const ws = await res.json();
    setNewToken({ name: ws.name, token: ws.token });
    setNewName("");
    setCreating(false);
    load();
  }

  function copyToken(token) {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inputStyle = {
    background: "var(--paper-0)", border: "1px solid var(--paper-3)",
    borderRadius: "var(--r-md)", padding: "8px 12px",
    fontSize: 13, fontFamily: "var(--font-sans)", color: "var(--ink-0)",
    outline: "none", boxSizing: "border-box",
  };

  return (
    <main className="main">
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Settings</span><span className="sep">/</span><span>Workspaces</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Workspaces
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 680 }}>
        {/* Existing workspaces */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head">
            <div className="card-title">Your workspaces</div>
            <div className="card-sub">Each workspace has a separate database and token</div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            {workspaces.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>No workspaces yet.</div>
            )}
            {workspaces.map(ws => (
              <div key={ws.id} style={{
                display: "flex", alignItems: "center",
                padding: "10px 0", borderBottom: "1px solid var(--paper-2)",
              }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-0)" }}>{ws.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* New token revealed */}
        {newToken && (
          <div className="card" style={{ marginBottom: 20, borderColor: "var(--brand-400)" }}>
            <div className="card-head">
              <div className="card-title" style={{ color: "var(--brand-700)" }}>
                Workspace "{newToken.name}" created
              </div>
              <div className="card-sub">Copy this token now — it won't be shown again</div>
            </div>
            <div style={{ padding: "0 20px 20px" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--paper-1)", borderRadius: "var(--r-md)", padding: "10px 12px",
              }}>
                <code style={{ flex: 1, fontSize: 12, fontFamily: "var(--font-mono)", wordBreak: "break-all", color: "var(--ink-0)" }}>
                  {newToken.token}
                </code>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => copyToken(newToken.token)}
                  style={{ flexShrink: 0 }}
                >
                  {copied ? <Icon name="check" size={13} /> : null}
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
                Share this token with anyone who should access the "{newToken.name}" workspace.
              </div>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 10 }}
                onClick={() => setNewToken(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Create new workspace */}
        <div className="card">
          <div className="card-head">
            <div className="card-title">Create workspace</div>
            <div className="card-sub">A new token will be generated — share it to grant access</div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <form onSubmit={handleCreate} style={{ display: "flex", gap: 8 }}>
              <input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Workspace name (e.g. Work)"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={creating || !newName.trim()}
              >
                <Icon name="plus" size={13} />
                {creating ? "Creating…" : "Create"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
