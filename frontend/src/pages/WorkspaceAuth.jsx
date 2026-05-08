import { useState } from "react";
import { useWorkspace } from "../context/WorkspaceContext.jsx";
import moneywiesLogo from "../assets/moneywies-logo.png";

export default function WorkspaceAuth() {
  const { setWorkspace } = useWorkspace();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/workspace/auth", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      if (!res.ok) {
        setError("Invalid token. Check with your workspace owner.");
        return;
      }
      const ws = await res.json();
      setWorkspace(ws);
    } catch {
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--paper-1)",
    }}>
      <div style={{
        width: 380, background: "var(--paper-0)", borderRadius: "var(--r-lg)",
        border: "1px solid var(--paper-3)", padding: "40px 36px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <img src={moneywiesLogo} alt="MoneyWies" style={{ width: 28, height: 28 }} />
          <span style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-0)" }}>MoneyWies</span>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 500, color: "var(--ink-0)", marginBottom: 6 }}>
            Enter workspace token
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5 }}>
            Each workspace has a secret token. Paste yours below to access your data.
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste token here…"
            autoFocus
            style={{
              width: "100%", boxSizing: "border-box",
              background: "var(--paper-0)", border: "1px solid var(--paper-3)",
              borderRadius: "var(--r-md)", padding: "10px 12px",
              fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--ink-0)",
              outline: "none",
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: "var(--expense)", padding: "6px 10px", background: "rgba(220,53,69,0.06)", borderRadius: "var(--r-sm)" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !token.trim()}
            style={{ marginTop: 4 }}
          >
            {loading ? "Connecting…" : "Enter workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
