import { useState, useEffect } from "react";
import { ResponsiveBar } from "@nivo/bar";
import Icon from "../components/Icon.jsx";
import { nivoTheme, cashflowColors } from "../lib/nivoTheme.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtFull(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function api(path) {
  return fetch("/api" + path).then(r => r.json());
}

// ---------------------------------------------------------------------------
// Nivo cashflow bar chart
// ---------------------------------------------------------------------------

// Custom layer: dashed net polyline drawn over the grouped bars
function NetLineLayer({ bars, yScale }) {
  if (!bars?.length) return null;

  // Group bars by month (indexValue), compute group center x and net value
  const groups = {};
  bars.forEach(bar => {
    const key = bar.data.indexValue;
    if (!groups[key]) groups[key] = { xs: [], net: 0 };
    groups[key].xs.push(bar.x, bar.x + bar.width);
    if (bar.data.id === "income") groups[key].net += bar.data.value;
    if (bar.data.id === "spend")  groups[key].net -= bar.data.value;
  });

  const pts = Object.values(groups).map(g => ({
    x: (Math.min(...g.xs) + Math.max(...g.xs)) / 2,
    y: yScale(Math.max(g.net, 0)),
  }));

  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <g>
      <path d={d} fill="none" stroke="#4C6B59" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" opacity={0.8} />
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="#4C6B59" opacity={0.8} />)}
    </g>
  );
}

function CashflowChart({ data, onMonthClick, selectedMonth }) {
  if (!data?.length) return null;

  const nivoData = data.map(d => ({
    month:    MONTHS[d.month - 1],
    monthNum: d.month,
    income:   Math.round(d.income),
    spend:    Math.round(d.spend),
  }));

  return (
    <div style={{ height: 240 }}>
      <ResponsiveBar
        data={nivoData}
        keys={["income", "spend"]}
        indexBy="month"
        groupMode="grouped"
        margin={{ top: 20, right: 16, bottom: 36, left: 56 }}
        padding={0.28}
        innerPadding={3}
        colors={cashflowColors}
        theme={nivoTheme}
        borderRadius={3}
        axisBottom={{ tickSize: 0, tickPadding: 10 }}
        axisLeft={{
          tickSize: 0, tickPadding: 8, tickValues: 5,
          format: v => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
        }}
        enableGridX={false}
        gridYValues={5}
        enableLabel={false}
        isInteractive
        onClick={bar => onMonthClick?.(bar.data.monthNum)}
        layers={["grid", "axes", "bars", NetLineLayer, "markers", "legends"]}
        tooltip={({ id, value, indexValue }) => (
          <div style={nivoTheme.tooltip.container}>
            <span style={{ color: "var(--ink-2)", fontSize: 11 }}>{indexValue}</span>
            <br />
            <strong style={{ color: id === "income" ? "#1F3A2E" : "#B7402A" }}>
              {id === "income" ? "Income" : "Spend"}
            </strong>
            {" · "}
            <strong>{fmtFull(value)}</strong>
          </div>
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category spend horizontal bars (custom — better UX than Nivo here)
// ---------------------------------------------------------------------------

function CategoryChart({ rows }) {
  if (!rows?.length) return <div style={{ padding: 20, color: "var(--ink-3)", fontSize: 13 }}>No data</div>;

  const max = rows[0]?.total ?? 1;

  return (
    <div style={{ padding: "4px 0" }}>
      {rows.map((r, i) => (
        <div key={r.category ?? "null"} style={{
          display: "grid",
          gridTemplateColumns: "160px 1fr 100px 56px",
          alignItems: "center",
          gap: 12,
          padding: "9px 20px",
          borderBottom: i < rows.length - 1 ? "1px solid var(--paper-3)" : "none",
        }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink-0)" }}>
            {r.category ?? "Uncategorized"}
          </div>
          <div className="bar">
            <span style={{ width: `${(r.total / max) * 100}%`, background: "var(--brand-400)" }} />
          </div>
          <div className="num money" style={{ fontSize: 13, textAlign: "right" }}>{fmtFull(r.total)}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", textAlign: "right" }}>{r.count} txns</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month detail (inline below chart on click)
// ---------------------------------------------------------------------------

function MonthDetail({ month, year }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!month) return;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    fetch(`/api/reports/category-spend?start=${ym}-01&end=${ym}-31&limit=15`)
      .then(r => r.json()).then(setRows);
  }, [month, year]);

  if (!month) return null;

  return (
    <div style={{ marginTop: 8, padding: "12px 20px", background: "var(--paper-1)", borderRadius: "var(--r-md)", border: "1px solid var(--paper-3)" }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "var(--ink-1)" }}>
        {MONTHS[month - 1]} top categories
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.slice(0, 8).map(r => (
          <div key={r.category ?? "null"} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--ink-1)", width: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {r.category ?? "Uncategorized"}
            </div>
            <div className="bar" style={{ flex: 1 }}>
              <span style={{ width: `${(r.total / (rows[0]?.total || 1)) * 100}%`, background: "var(--expense)" }} />
            </div>
            <div className="num" style={{ fontSize: 12, color: "var(--ink-0)", width: 80, textAlign: "right" }}>{fmtFull(r.total)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Reports() {
  const [year, setYear]             = useState(CURRENT_YEAR);
  const [month, setMonth]           = useState(null);
  const [tab, setTab]               = useState("cashflow");
  const [cashflow, setCashflow]     = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingCf, setLoadingCf]   = useState(false);
  const [loadingCat, setLoadingCat] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [years, setYears]           = useState([CURRENT_YEAR - 1, CURRENT_YEAR]);

  useEffect(() => {
    api("/income/yoy").then(data => {
      const ys = data.map(r => r.year).sort();
      if (ys.length) setYears(ys);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoadingCf(true);
    api(`/reports/cashflow?year=${year}`)
      .then(setCashflow)
      .finally(() => setLoadingCf(false));
  }, [year]);

  useEffect(() => {
    if (tab !== "categories") return;
    setLoadingCat(true);
    const mm = month ? String(month).padStart(2, "0") : null;
    const start = mm ? `${year}-${mm}-01` : `${year}-01-01`;
    const end   = mm ? `${year}-${mm}-31` : `${year}-12-31`;
    api(`/reports/category-spend?start=${start}&end=${end}&limit=20`)
      .then(setCategories)
      .finally(() => setLoadingCat(false));
  }, [year, month, tab]);

  const displayed = month ? cashflow.filter(d => d.month === month) : cashflow;
  const totals = displayed.reduce(
    (acc, m) => ({ income: acc.income + m.income, spend: acc.spend + m.spend, net: acc.net + m.net }),
    { income: 0, spend: 0, net: 0 }
  );
  const savingsRate = totals.income > 0 ? Math.round((totals.net / totals.income) * 100) : 0;

  function handleMonthClick(m) {
    setSelectedMonth(prev => prev === m ? null : m);
  }

  return (
    <main className="main">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Reports</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Reports
          </h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div className="segmented">
            {years.slice(-5).map(y => (
              <button key={y} className={year === y ? "on" : ""} onClick={() => { setYear(y); setMonth(null); setSelectedMonth(null); }}>{y}</button>
            ))}
          </div>
          <div className="segmented" style={{ fontSize: 11 }}>
            <button className={!month ? "on" : ""} onClick={() => setMonth(null)}>All</button>
            {MONTHS.map((name, i) => (
              <button key={i} className={month === i + 1 ? "on" : ""} onClick={() => setMonth(m => m === i + 1 ? null : i + 1)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Total Income",  value: fmt(totals.income), green: true },
          { label: "Total Spend",   value: fmt(totals.spend),  green: false },
          { label: "Net Savings",   value: fmt(totals.net),    green: totals.net >= 0 },
          { label: "Savings Rate",  value: `${savingsRate}%`,  green: savingsRate > 0, sub: "of gross income saved" },
        ].map(({ label, value, green, sub }) => (
          <div key={label} className="card stat">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ fontSize: 28, color: green ? "var(--income)" : undefined }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--paper-3)", marginBottom: 16 }}>
        {[["cashflow","Monthly Cashflow"],["categories","Category Breakdown"],["anomalies","Anomalies"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 18px", fontSize: 14, fontWeight: 500,
              color: tab === key ? "var(--ink-0)" : "var(--ink-3)",
              borderBottom: `2px solid ${tab === key ? "var(--brand-700)" : "transparent"}`,
              marginBottom: -1,
              transition: "color 140ms ease, border-color 140ms ease",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Cashflow tab */}
      {tab === "cashflow" && (
        <>
          <div className="card">
            {/* Legend */}
            <div style={{ display: "flex", gap: 16, marginBottom: 4, fontSize: 12, color: "var(--ink-2)" }}>
              {[["#1F3A2E","Income"],["#B7402A","Spend"],["#4C6B59","Net (dashed)"]].map(([color, label]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} />
                  {label}
                </span>
              ))}
            </div>

            {loadingCf ? (
              <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontSize: 13 }}>
                Loading…
              </div>
            ) : (
              <CashflowChart data={cashflow} onMonthClick={handleMonthClick} selectedMonth={selectedMonth} />
            )}

            {/* Clickable month strip */}
            {!loadingCf && cashflow.length > 0 && (
              <div style={{ display: "flex", marginTop: 4 }}>
                {cashflow.map(d => (
                  <button
                    key={d.month}
                    onClick={() => handleMonthClick(d.month)}
                    style={{
                      flex: 1, padding: "5px 2px", textAlign: "center", fontSize: 11,
                      borderRadius: "var(--r-sm)", color: selectedMonth === d.month ? "var(--ink-0)" : "var(--ink-3)",
                      background: selectedMonth === d.month ? "var(--paper-2)" : "transparent",
                      fontWeight: selectedMonth === d.month ? 600 : 400,
                      transition: "background 120ms ease",
                    }}
                  >
                    {MONTHS[d.month - 1]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedMonth && <MonthDetail month={selectedMonth} year={year} />}

          {/* Monthly table */}
          {!loadingCf && cashflow.length > 0 && (
            <div className="card flush" style={{ marginTop: 20 }}>
              <div className="card-head">
                <div className="card-title">Monthly Detail</div>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Income</th>
                    <th className="num">Spend</th>
                    <th className="num">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {cashflow.filter(d => d.income > 0 || d.spend > 0).map(d => (
                    <tr key={d.month} onClick={() => handleMonthClick(d.month)} style={{ cursor: "pointer" }}>
                      <td style={{ fontWeight: 500 }}>{MONTHS[d.month - 1]} {year}</td>
                      <td className="num money pos">{fmtFull(d.income)}</td>
                      <td className="num money">{fmtFull(d.spend)}</td>
                      <td className="num" style={{ color: d.net >= 0 ? "var(--income)" : "var(--expense)", fontWeight: 500 }}>
                        {d.net >= 0 ? "+" : "−"}{fmtFull(d.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 600, borderTop: "2px solid var(--paper-3)" }}>
                    <td>Total {year}</td>
                    <td className="num money pos">{fmtFull(totals.income)}</td>
                    <td className="num money">{fmtFull(totals.spend)}</td>
                    <td className="num" style={{ color: totals.net >= 0 ? "var(--income)" : "var(--expense)" }}>
                      {totals.net >= 0 ? "+" : "−"}{fmtFull(totals.net)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* Categories tab */}
      {tab === "categories" && (
        <div className="card flush">
          <div className="card-head">
            <div className="card-title">Spending by Category — {month ? `${MONTHS[month - 1]} ${year}` : year}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Excludes transfers &amp; credit card payments</div>
          </div>
          {loadingCat ? (
            <div style={{ padding: "32px 20px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
          ) : (
            <CategoryChart rows={categories} />
          )}
        </div>
      )}

      {/* Anomalies tab */}
      {tab === "anomalies" && <AnomalyFeed />}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Anomaly feed (SQL-only, no AI cost)
// ---------------------------------------------------------------------------

function AnomalyFeed() {
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    fetch("/api/ai/anomalies").then(r => r.json()).then(data => {
      setAnomalies(data);
      setLoading(false);
    });
  }, []);

  const visible = anomalies.filter((_, i) => !dismissed.has(i));

  const TYPE_META = {
    price_increase: { label: "Price Increase", color: "var(--warn)",    bg: "var(--warn-soft)" },
    unusual_spend:  { label: "Unusual Spend",  color: "var(--expense)", bg: "var(--expense-soft)" },
    one_off:        { label: "One-time",        color: "var(--ink-2)",  bg: "var(--paper-2)" },
  };

  return (
    <div className="card flush">
      <div className="card-head">
        <div className="card-title">Anomalies</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Price changes, unusual spend, one-off charges — last 90 days</div>
      </div>
      {loading && <div style={{ padding: "32px 20px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>}
      {!loading && visible.length === 0 && (
        <div style={{ padding: "32px 20px", color: "var(--ink-3)", fontSize: 13 }}>No anomalies detected. All spending looks normal.</div>
      )}
      {visible.map((a, i) => {
        const meta = TYPE_META[a.type] || TYPE_META.one_off;
        const realIdx = anomalies.indexOf(a);
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--paper-3)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: "var(--r-full)", background: meta.bg, color: meta.color, whiteSpace: "nowrap", marginTop: 1 }}>
              {meta.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 13 }}>{a.merchant}</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>
                {a.type === "price_increase" && <>{a.date}: <strong style={{ color: meta.color }}>${a.amount.toFixed(2)}</strong> vs prior ${a.prev_amount.toFixed(2)} on {a.prev_date} (+{a.pct_change}%)</>}
                {a.type === "unusual_spend"  && <>{a.date}: <strong style={{ color: meta.color }}>${a.amount.toFixed(2)}</strong> — {a.multiplier}× above avg ${a.avg_amount.toFixed(2)}</>}
                {a.type === "one_off"        && <>{a.date}: <strong>${a.amount.toFixed(2)}</strong> — no prior occurrence in 2 years{a.category ? ` · ${a.category}` : ""}</>}
              </div>
            </div>
            <button onClick={() => setDismissed(prev => new Set([...prev, realIdx]))} style={{ color: "var(--ink-3)", padding: 4, flexShrink: 0 }}>
              <Icon name="x" size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
