import { useState, useEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Tool result display (compact inline card)
// ---------------------------------------------------------------------------

function ToolResult({ call }) {
  const [open, setOpen] = useState(false);
  let parsed = null;
  try { parsed = JSON.parse(call.result); } catch {}

  const labels = {
    get_cashflow:        "Cashflow data",
    search_transactions: "Transactions",
    get_top_categories:  "Category breakdown",
    get_income_summary:  "Income summary",
    get_recurring_charges: "Recurring charges",
  };

  return (
    <div style={{ margin: "4px 0", borderRadius: "var(--r-sm)", background: "var(--paper-2)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", textAlign: "left", padding: "5px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 6, color: "var(--ink-2)" }}
      >
        <Icon name={open ? "chevUp" : "chevDown"} size={11} />
        <span style={{ fontWeight: 500 }}>{labels[call.tool] || call.tool}</span>
      </button>
      {open && parsed && (
        <div style={{ padding: "0 10px 8px", fontSize: 11, color: "var(--ink-1)" }}>
          {call.tool === "get_cashflow" && (
            <div style={{ display: "flex", gap: 12 }}>
              <span>Income: <strong style={{ color: "var(--income)" }}>{fmt(parsed.income)}</strong></span>
              <span>Spend: <strong>{fmt(parsed.spend)}</strong></span>
              <span>Net: <strong style={{ color: parsed.net >= 0 ? "var(--income)" : "var(--expense)" }}>{fmt(parsed.net)}</strong></span>
            </div>
          )}
          {call.tool === "search_transactions" && Array.isArray(parsed.transactions) && (
            <div>
              <div style={{ color: "var(--ink-3)", marginBottom: 4 }}>{parsed.total} total, showing {parsed.shown}</div>
              {parsed.transactions.slice(0, 6).map((t, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0", borderBottom: "1px solid var(--paper-3)" }}>
                  <span style={{ color: "var(--ink-3)", minWidth: 70 }}>{t.date}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right", color: t.amount < 0 ? "var(--income)" : "var(--ink-0)" }}>
                    {t.amount < 0 ? "+" : ""}{fmt(t.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {call.tool === "get_top_categories" && Array.isArray(parsed) && (
            <div>
              {parsed.slice(0, 6).map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                  <span>{c.category || "Uncategorized"}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.total)}</span>
                </div>
              ))}
            </div>
          )}
          {call.tool === "get_recurring_charges" && Array.isArray(parsed) && (
            <div>
              {parsed.slice(0, 6).map((r, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "2px 0" }}>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span style={{ color: "var(--ink-3)" }}>{r.frequency}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 50, textAlign: "right" }}>{fmt(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function Bubble({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
      {!isUser && msg.tool_calls?.length > 0 && (
        <div style={{ width: "100%", marginBottom: 4 }}>
          {msg.tool_calls.map((tc, i) => <ToolResult key={i} call={tc} />)}
        </div>
      )}
      <div style={{
        maxWidth: "88%",
        padding: "9px 13px",
        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser ? "var(--brand-700)" : "var(--paper-0)",
        color: isUser ? "var(--paper-0)" : "var(--ink-0)",
        border: isUser ? "none" : "1px solid var(--paper-3)",
        fontSize: 13,
        lineHeight: 1.55,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested prompts
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  "How much did I spend last month?",
  "What are my top categories this year?",
  "Show me my recurring subscriptions",
  "How does my income compare to spending in 2024?",
];

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export default function ChatPanel({ open, onClose }) {
  const [messages, setMessages]   = useState([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const bottomRef                 = useRef(null);
  const inputRef                  = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text) {
    const userText = (text || input).trim();
    if (!userText) return;
    setInput("");

    const nextMessages = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Server error");
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: data.reply, tool_calls: data.tool_calls || [] },
      ]);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: err.message || "Sorry, I ran into an error. Please try again.", tool_calls: [] },
      ]);
    }
    setLoading(false);
  }

  function handleSubmit(e) {
    e.preventDefault();
    send();
  }

  return (
    <>
      {/* Backdrop on mobile / dim */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, zIndex: 89, background: "transparent" }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: "fixed",
        top: 0,
        right: open ? 0 : -400,
        width: 380,
        height: "100vh",
        background: "var(--paper-1)",
        borderLeft: "1px solid var(--paper-3)",
        display: "flex",
        flexDirection: "column",
        zIndex: 90,
        transition: "right 240ms cubic-bezier(0.2,0.8,0.2,1)",
        boxShadow: open ? "var(--shadow-lg)" : "none",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 14px", borderBottom: "1px solid var(--paper-3)", background: "var(--paper-0)" }}>
          <div style={{ width: 28, height: 28, borderRadius: "var(--r-sm)", background: "var(--brand-700)", display: "grid", placeItems: "center", color: "#fff" }}>
            <Icon name="sparkle" size={14} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em" }}>MoneyWies AI</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Ask about your finances</div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                style={{ color: "var(--ink-3)", padding: 4, fontSize: 11 }}
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button onClick={onClose} style={{ color: "var(--ink-3)", padding: 4 }}>
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 8px" }}>
          {messages.length === 0 && (
            <div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 14, lineHeight: 1.5 }}>
                Ask me anything about your transactions, spending, income, or recurring charges.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    style={{
                      textAlign: "left", padding: "9px 12px", borderRadius: "var(--r-md)",
                      background: "var(--paper-0)", border: "1px solid var(--paper-3)",
                      fontSize: 13, color: "var(--ink-1)", cursor: "pointer",
                      transition: "background 120ms ease",
                    }}
                    onMouseEnter={e => e.target.style.background = "var(--paper-2)"}
                    onMouseLeave={e => e.target.style.background = "var(--paper-0)"}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => <Bubble key={i} msg={msg} />)}

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 13, marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: "var(--ink-3)",
                    animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
              <span>Thinking…</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--paper-3)", background: "var(--paper-0)" }}>
          <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={loading}
              style={{
                flex: 1, background: "var(--paper-1)", border: "1px solid var(--paper-3)",
                borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 13,
                color: "var(--ink-0)", outline: "none",
              }}
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: "var(--r-md)", flexShrink: 0,
                background: input.trim() ? "var(--brand-700)" : "var(--paper-2)",
                color: input.trim() ? "#fff" : "var(--ink-3)",
                display: "grid", placeItems: "center",
                transition: "background 120ms ease",
              }}
            >
              <Icon name="send" size={14} />
            </button>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}
