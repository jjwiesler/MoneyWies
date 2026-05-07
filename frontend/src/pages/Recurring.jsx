import { useState, useEffect } from "react";
import Icon from "../components/Icon.jsx";

const FREQ_ORDER = ["monthly", "weekly", "biweekly", "quarterly", "annual", "irregular"];
const FREQ_LABEL = {
  monthly: "Monthly",
  weekly: "Weekly",
  biweekly: "Biweekly",
  quarterly: "Quarterly",
  annual: "Annual",
  irregular: "Irregular",
};

function fmt(amount) {
  return "$" + Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y.slice(2)}`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr) - new Date()) / 86400000);
}

function isActive(lastDate, avgIntervalDays) {
  if (!lastDate) return false;
  const daysSince = (new Date() - new Date(lastDate)) / 86400000;
  const window = Math.max(180, (avgIntervalDays || 30) * 1.5);
  return daysSince <= window;
}

function RecurringRow({ r, isFirst }) {
  const [expanded, setExpanded] = useState(false);
  const hasHistory = r.price_history && r.price_history.length > 1;
  const days = daysUntil(r.next_due);
  const dueLabel = days === null ? "—" : days < 0 ? "overdue" : days === 0 ? "today" : `in ${days}d`;
  const dueColor = days !== null && days <= 3 ? "var(--brand-700)" : "var(--ink-2)";
  const active = isActive(r.last_seen ?? r.last_date, r.avg_interval_days);

  return (
    <>
      <tr style={{ borderTop: isFirst ? "none" : "1px solid var(--paper-3)", opacity: active ? 1 : 0.5 }}>
        <td style={tdStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {hasHistory && (
              <button
                onClick={() => setExpanded(v => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink-4)", display: "flex", lineHeight: 1 }}
              >
                <Icon name={expanded ? "chevDown" : "chev"} size={13} stroke={2} />
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span
                title={active ? "Active — charged within expected billing window" : "Inactive — no recent charges detected"}
                style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: active ? "#22c55e" : "var(--ink-4)" }}
              />
              <div>
                <div style={{ fontWeight: 500, color: "var(--ink-0)" }}>{r.name}</div>
                {r.category && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{r.category}</div>}
              </div>
            </div>
          </div>
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--ink-3)" }}>{fmtDate(r.last_date)}</td>
        <td style={{ ...tdStyle, textAlign: "right", color: dueColor, fontWeight: days !== null && days <= 3 ? 500 : 400 }}>{dueLabel}</td>
        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          <div>{fmt(r.amount)}</div>
          {r.yoy_pct != null && (
            <div style={{ fontSize: 11, color: r.yoy_pct > 0 ? "var(--brand-700)" : "var(--ink-4)", marginTop: 1 }}>
              {r.yoy_pct > 0 ? "↑" : "↓"}{Math.abs(r.yoy_pct)}% /yr avg
            </div>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--ink-3)", fontVariantNumeric: "tabular-nums" }}>{fmt(r.yearly_cost)}</td>
      </tr>

      {expanded && r.price_history.slice().reverse().map((h, hi) => (
        <tr key={hi} style={{ borderTop: "1px solid var(--paper-3)", background: "var(--paper-2)" }}>
          <td style={{ ...tdStyle, paddingLeft: 36, color: "var(--ink-3)", fontSize: 12 }}>
            {h.name !== r.name ? h.name : "—"}
          </td>
          <td style={{ ...tdStyle, textAlign: "right", color: "var(--ink-4)", fontSize: 12 }}>{fmtDate(h.last_date)}</td>
          <td style={{ ...tdStyle }} />
          <td style={{ ...tdStyle, textAlign: "right", color: "var(--ink-3)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{fmt(h.amount)}</td>
          <td style={{ ...tdStyle }} />
        </tr>
      ))}
    </>
  );
}

export default function Recurring() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    fetch("/api/ai/recurring")
      .then(r => r.json())
      .then(data => { setRows(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const activeRows = rows.filter(r => isActive(r.last_seen ?? r.last_date, r.avg_interval_days));
  const visibleRows = showInactive ? rows : activeRows;

  const filtered = visibleRows.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const monthlyCost = activeRows.reduce((sum, r) => sum + (r.amount * 30.44 / r.avg_interval_days), 0);
  const yearlyCost  = activeRows.reduce((sum, r) => sum + r.yearly_cost, 0);
  const inactiveCount = rows.length - activeRows.length;

  const grouped = FREQ_ORDER.reduce((acc, freq) => {
    const items = filtered.filter(r => r.frequency === freq);
    if (items.length) acc[freq] = items;
    return acc;
  }, {});

  return (
    <div style={{ padding: "28px 32px", maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: "var(--ink-0)" }}>Recurring</h1>
        {!loading && (
          <>
            <span style={{ background: "var(--brand-50)", color: "var(--brand-700)", borderRadius: "var(--r-sm)", padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>
              ~{fmt(monthlyCost)}/mo
            </span>
            <span style={{ background: "var(--paper-3)", color: "var(--ink-2)", borderRadius: "var(--r-sm)", padding: "3px 10px", fontSize: 12, fontWeight: 500 }}>
              ~{fmt(yearlyCost)}/yr
            </span>
            {inactiveCount > 0 && (
              <button
                onClick={() => setShowInactive(v => !v)}
                style={{ marginLeft: "auto", background: "none", border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "3px 10px", fontSize: 12, color: "var(--ink-3)", cursor: "pointer" }}
              >
                {showInactive ? `Hide inactive (${inactiveCount})` : `Show inactive (${inactiveCount})`}
              </button>
            )}
          </>
        )}
      </div>

      <div style={{ position: "relative", marginBottom: 20, width: 300 }}>
        <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)", pointerEvents: "none" }}>
          <Icon name="search" size={14} />
        </span>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search recurring..."
          style={{
            width: "100%", boxSizing: "border-box",
            paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
            border: "1px solid var(--paper-3)", borderRadius: "var(--r-md)",
            fontSize: 13, fontFamily: "var(--font-sans)",
            background: "var(--paper-0)", color: "var(--ink-0)", outline: "none",
          }}
        />
      </div>

      {loading && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Loading...</div>}

      {!loading && rows.length === 0 && (
        <div style={{ color: "var(--ink-3)", fontSize: 14, marginTop: 40, textAlign: "center" }}>
          No recurring charges detected. Import more transaction history to improve detection.
        </div>
      )}

      {!loading && Object.entries(grouped).map(([freq, items]) => {
        const groupYearly = items.reduce((s, r) => s + r.yearly_cost, 0);
        return (
          <div key={freq} style={{ marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-3)" }}>
                {FREQ_LABEL[freq]}
              </span>
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{fmt(groupYearly)}/yr</span>
            </div>

            <div style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-md)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "var(--paper-2)" }}>
                    <th style={thStyle}>Name</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Last Charged</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Next Due</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>/yr</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r, i) => (
                    <RecurringRow key={i} r={r} isFirst={i === 0} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const thStyle = {
  padding: "8px 14px", textAlign: "left",
  fontSize: 11, fontWeight: 600, color: "var(--ink-3)",
  textTransform: "uppercase", letterSpacing: "0.05em",
};

const tdStyle = {
  padding: "10px 14px", color: "var(--ink-1)",
};
