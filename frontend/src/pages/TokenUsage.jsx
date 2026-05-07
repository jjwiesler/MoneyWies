import { useState, useEffect } from "react";
import Icon from "../components/Icon.jsx";

function fmtCost(n) {
  if (n === null || n === undefined) return "$0.0000";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function fmtTokens(n) {
  return (n ?? 0).toLocaleString("en-US");
}

const FEATURE_LABELS = {
  suggest_rule:       "AI Rule Suggestion",
  bulk_categorize:    "Bulk Categorize",
  normalize_vendors:  "Vendor Normalize",
  classify_income:    "Income Classification",
  nl_search:          "NL Search",
  chat:               "AI Chat",
};

export default function TokenUsage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    fetch("/api/ai/token-usage")
      .then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const rows = data?.by_feature ?? [];
  const totalCost = data?.total_cost_usd ?? 0;
  const totalCalls = rows.reduce((s, r) => s + r.calls, 0);
  const totalInput = rows.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutput = rows.reduce((s, r) => s + r.output_tokens, 0);
  const maxCost = rows.reduce((m, r) => Math.max(m, r.cost_usd ?? 0), 0.0001);

  return (
    <main className="main">
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Token Usage</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            AI Token Usage
          </h1>
        </div>
      </div>

      {/* Hero stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Cost",    value: fmtCost(totalCost),          sub: "all time" },
          { label: "Total Calls",   value: totalCalls.toLocaleString(),  sub: "API requests" },
          { label: "Input Tokens",  value: fmtTokens(totalInput),        sub: "prompt tokens" },
          { label: "Output Tokens", value: fmtTokens(totalOutput),       sub: "completion tokens" },
        ].map(({ label, value, sub }) => (
          <div key={label} className="card" style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink-0)" }}>{value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* By feature */}
      <div className="card flush">
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--paper-3)", display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="sparkle" size={14} style={{ color: "var(--brand-700)" }} />
          <span style={{ fontWeight: 600, fontSize: 14 }}>Usage by Feature</span>
        </div>

        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
        )}

        {error && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--expense)", fontSize: 13 }}>
            {error === "503" ? "AI features are not configured — set ANTHROPIC_API_KEY to enable." : `Error: ${error}`}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No AI usage recorded yet. Try using Bulk Categorize, NL Search, or the AI Chat.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Feature</th>
                <th className="num" style={{ width: 80 }}>Calls</th>
                <th className="num" style={{ width: 110 }}>Input tokens</th>
                <th className="num" style={{ width: 110 }}>Output tokens</th>
                <th style={{ minWidth: 200 }}>Cost share</th>
                <th className="num" style={{ width: 110 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const label = FEATURE_LABELS[row.feature] || row.feature;
                const pct = maxCost > 0 ? ((row.cost_usd ?? 0) / maxCost) * 100 : 0;
                const sharePct = totalCost > 0 ? (((row.cost_usd ?? 0) / totalCost) * 100).toFixed(1) : "0.0";
                return (
                  <tr key={row.feature}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{label}</td>
                    <td className="num mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>{row.calls.toLocaleString()}</td>
                    <td className="num mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>{fmtTokens(row.input_tokens)}</td>
                    <td className="num mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>{fmtTokens(row.output_tokens)}</td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--paper-3)", overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: "var(--brand-700)" }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 36, textAlign: "right" }}>{sharePct}%</span>
                      </div>
                    </td>
                    <td className="num mono" style={{ fontWeight: 500, fontSize: 13 }}>{fmtCost(row.cost_usd)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--paper-3)" }}>
                <td style={{ fontWeight: 600, fontSize: 13, padding: "10px 16px" }}>Total</td>
                <td className="num mono" style={{ fontWeight: 600, fontSize: 13 }}>{totalCalls.toLocaleString()}</td>
                <td className="num mono" style={{ fontWeight: 600, fontSize: 13 }}>{fmtTokens(totalInput)}</td>
                <td className="num mono" style={{ fontWeight: 600, fontSize: 13 }}>{fmtTokens(totalOutput)}</td>
                <td />
                <td className="num mono" style={{ fontWeight: 600, fontSize: 13 }}>{fmtCost(totalCost)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Pricing note */}
      <div style={{ marginTop: 16, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.6 }}>
        Cost estimates based on claude-3-5-haiku / claude-3-5-sonnet pricing at time of request.
        Actual billed amounts may vary — check your Anthropic console for authoritative figures.
      </div>
    </main>
  );
}
