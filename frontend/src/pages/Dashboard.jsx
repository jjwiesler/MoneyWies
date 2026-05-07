import { useState, useEffect } from "react";
import { ResponsiveBar } from "@nivo/bar";
import { ResponsivePie } from "@nivo/pie";
import Icon from "../components/Icon.jsx";
import { nivoTheme, cashflowColors, categoryColors } from "../lib/nivoTheme.js";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();

function fmt(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtFull(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 0 }}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", color: color || "var(--ink-0)", fontFamily: "var(--font-mono)", lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cashflow grouped bar chart
// ---------------------------------------------------------------------------

function CashflowChart({ data, selectedMonth, onMonthClick }) {
  if (!data?.length) return (
    <div style={{ height: 220, display: "grid", placeItems: "center", color: "var(--ink-3)", fontSize: 13 }}>No data</div>
  );

  const nivoData = data.map(d => ({
    month:    MONTHS[d.month - 1],
    monthNum: d.month,
    income:   Math.round(d.income),
    spend:    Math.round(d.spend),
  }));

  return (
    <div style={{ height: 220 }}>
      <ResponsiveBar
        data={nivoData}
        keys={["income", "spend"]}
        indexBy="month"
        groupMode="grouped"
        margin={{ top: 12, right: 12, bottom: 36, left: 54 }}
        padding={0.28}
        innerPadding={2}
        colors={({ id, data: d }) => {
          const base = id === "income" ? cashflowColors[0] : cashflowColors[1];
          if (!selectedMonth) return base;
          return d.monthNum === selectedMonth ? base : base + "44";
        }}
        theme={nivoTheme}
        enableLabel={false}
        enableGridX={false}
        axisBottom={{ tickSize: 0, tickPadding: 8 }}
        axisLeft={{ tickSize: 0, tickPadding: 8, format: v => "$" + (v >= 1000 ? Math.round(v / 1000) + "k" : v) }}
        tooltip={({ id, value, data: d }) => (
          <div style={{ background: "var(--paper-0)", border: "1px solid var(--paper-3)", borderRadius: "var(--r-md)", padding: "8px 12px", fontSize: 12 }}>
            <strong>{d.month}</strong> · {id}: <strong>{fmtFull(value)}</strong>
          </div>
        )}
        onClick={({ data: d }) => onMonthClick(d.monthNum)}
        role="application"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Savings rate donut
// ---------------------------------------------------------------------------

function SavingsDonut({ rate }) {
  const clamped = Math.max(0, Math.min(100, rate));
  const data = [
    { id: "saved", value: clamped },
    { id: "rest",  value: Math.max(0, 100 - clamped) },
  ];
  return (
    <div style={{ height: 150 }}>
      <ResponsivePie
        data={data}
        innerRadius={0.70}
        padAngle={1.5}
        cornerRadius={3}
        colors={["#1F3A2E", "#EFECE3"]}
        theme={nivoTheme}
        enableArcLabels={false}
        enableArcLinkLabels={false}
        isInteractive={false}
        layers={[
          "arcs",
          ({ centerX, centerY }) => (
            <text
              x={centerX}
              y={centerY}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", fill: rate < 0 ? "#B7402A" : "var(--ink-0)" }}
            >
              {Math.round(rate)}%
            </text>
          ),
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top categories horizontal bars
// ---------------------------------------------------------------------------

function CategoryBars({ data, selectedCategory, onCategoryClick }) {
  if (!data?.length) return (
    <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 0" }}>No spend data for this period.</div>
  );
  const above = data.filter(cat => cat.total > 2500);
  const otherTotal = data.filter(cat => cat.total <= 2500).reduce((sum, cat) => sum + cat.total, 0);
  const max = data[0]?.total || 1;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {above.map((cat, i) => {
        const isSelected = selectedCategory === cat.category;
        const dimmed = selectedCategory && !isSelected;
        return (
          <div
            key={cat.category || "uncategorized"}
            onClick={() => onCategoryClick(cat.category)}
            style={{ cursor: "pointer", opacity: dimmed ? 0.4 : 1, transition: "opacity 150ms ease" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: "var(--ink-1)", fontWeight: 500 }}>{cat.category || "Uncategorized"}</span>
              <span style={{ color: "var(--ink-2)", fontFamily: "var(--font-mono)" }}>{fmt(cat.total)}</span>
            </div>
            <div style={{ height: 5, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${(cat.total / max) * 100}%`,
                background: categoryColors[i % categoryColors.length],
                borderRadius: 3,
                transition: "width 500ms ease",
              }} />
            </div>
          </div>
        );
      })}
      {otherTotal > 0 && (
        <div key="other" style={{ opacity: selectedCategory ? 0.4 : 1, transition: "opacity 150ms ease" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
            <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>Other</span>
            <span style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{fmt(otherTotal)}</span>
          </div>
          <div style={{ height: 5, background: "var(--paper-3)", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${(otherTotal / max) * 100}%`,
              background: "var(--ink-4)",
              borderRadius: 3,
              transition: "width 500ms ease",
            }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent transactions mini-list
// ---------------------------------------------------------------------------

function RecentTxns({ txns }) {
  if (!txns?.length) return (
    <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "16px 0" }}>No transactions yet.</div>
  );
  return (
    <div>
      {txns.map(txn => {
        const isIncome = txn.amount < 0;
        const name = txn.custom_name || txn.name || txn.description;
        return (
          <div key={txn.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--paper-2)" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{txn.date} · {txn.account_name}</div>
            </div>
            {txn.category && (
              <span className="cat" style={{ fontSize: 11, flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {txn.category}
              </span>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 500, flexShrink: 0, color: isIncome ? "var(--income)" : "var(--expense)" }}>
              {isIncome ? "+" : ""}{fmtFull(Math.abs(txn.amount))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const [years,      setYears]      = useState([]);
  const [year,       setYear]       = useState(CURRENT_YEAR);
  const [month,      setMonth]      = useState(null);

  const [cashflow,          setCashflow]          = useState([]);
  const [categories,        setCategories]        = useState([]);
  const [recentTxns,        setRecentTxns]        = useState([]);
  const [excludeTax,        setExcludeTax]        = useState(false);
  const [selectedCategory,  setSelectedCategory]  = useState(null);

  // Load available years once
  useEffect(() => {
    fetch("/api/transaction-years").then(r => r.json()).then(yrs => {
      setYears(yrs);
      if (yrs.length > 0) setYear(Number(yrs[0]));
    });
  }, []);

  // Load cashflow for selected year
  useEffect(() => {
    if (!year) return;
    const excl = excludeTax ? "&exclude_categories=Taxes&exclude_label=Taxes" : "";
    fetch(`/api/reports/cashflow?year=${year}${excl}`).then(r => r.json()).then(setCashflow);
  }, [year, excludeTax]);

  // Load top categories for selected period
  useEffect(() => {
    if (!year) return;
    const mm    = month ? String(month).padStart(2, "0") : null;
    const start = mm ? `${year}-${mm}-01` : `${year}-01-01`;
    const end   = mm ? `${year}-${mm}-31` : `${year}-12-31`;
    const excl = excludeTax ? "&exclude_categories=Taxes&exclude_label=Taxes" : "";
    fetch(`/api/reports/category-spend?start=${start}&end=${end}&limit=100${excl}`)
      .then(r => r.json()).then(setCategories);
  }, [year, month, excludeTax]);

  // Load largest transactions for selected period
  useEffect(() => {
    if (!year) return;
    const mm    = month ? String(month).padStart(2, "0") : null;
    const start = mm ? `${year}-${mm}-01` : `${year}-01-01`;
    const end   = mm ? `${year}-${mm}-31` : `${year}-12-31`;
    const catParam = selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : "";
    fetch(`/api/transactions?limit=50&sort_by=amount&sort_dir=desc&start=${start}&end=${end}${catParam}`)
      .then(r => r.json()).then(d => setRecentTxns(d.transactions || []));
  }, [year, month, selectedCategory]);

  // Derive hero stats from cashflow (avoid extra API call)
  const displayed = month ? cashflow.filter(d => d.month === month) : cashflow;
  const totals = displayed.reduce(
    (acc, m) => ({ income: acc.income + m.income, spend: acc.spend + m.spend }),
    { income: 0, spend: 0 },
  );
  const net         = totals.income - totals.spend;
  const savingsRate = totals.income > 0 ? (net / totals.income) * 100 : 0;
  const avgMonthly       = displayed.length > 0 ? totals.spend   / displayed.length : 0;
  const avgMonthlyIncome = displayed.length > 0 ? totals.income  / displayed.length : 0;

  const periodLabel = month ? `${MONTHS[month - 1]} ${year}` : String(year);

  const hasLabel = (t, lbl) => t.label && t.label.split(",").map(s => s.trim()).includes(lbl);
  const EXCLUDED_TXNS = excludeTax
    ? (t) => t.category !== "Internal Transfers" && t.category !== "Taxes" && !hasLabel(t, "Taxes")
    : (t) => t.category !== "Internal Transfers";
  const displayedTxns = recentTxns.filter(EXCLUDED_TXNS).slice(0, 15);
  const displayedCategories = categories;

  return (
    <main className="main">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Dashboard</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            {periodLabel}
          </h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              onClick={() => setExcludeTax(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 11, padding: "4px 10px", borderRadius: 6, cursor: "pointer",
                border: "1px solid var(--paper-3)",
                background: excludeTax ? "var(--ink-1)" : "var(--paper-2)",
                color: excludeTax ? "var(--paper-1)" : "var(--ink-2)",
                fontWeight: 500, transition: "all 150ms ease",
              }}
            >
              <span style={{ fontSize: 10 }}>{excludeTax ? "●" : "○"}</span>
              Exclude taxes
            </button>
            <div className="segmented">
              {years.map(y => (
                <button key={y} className={year === Number(y) ? "on" : ""} onClick={() => { setYear(Number(y)); setMonth(null); }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="segmented" style={{ fontSize: 11 }}>
            <button className={!month ? "on" : ""} onClick={() => setMonth(null)}>All</button>
            {MONTHS.map((name, i) => (
              <button
                key={i}
                className={month === i + 1 ? "on" : ""}
                onClick={() => setMonth(m => m === i + 1 ? null : i + 1)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hero stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <StatCard
          label="Income"
          value={fmt(totals.income)}
          color="var(--income)"
          sub={periodLabel}
        />
        <StatCard
          label="Spend"
          value={fmt(totals.spend)}
          color="var(--expense)"
          sub={periodLabel}
        />
        <StatCard
          label="Net"
          value={fmt(net)}
          color={net >= 0 ? "var(--income)" : "var(--expense)"}
          sub={net >= 0 ? "surplus" : "deficit"}
        />
        <StatCard
          label="Avg / mo income"
          value={fmt(avgMonthlyIncome)}
          color="var(--income)"
          sub="avg monthly income"
        />
        <StatCard
          label="Avg / mo spend"
          value={fmt(avgMonthly)}
          color="var(--expense)"
          sub="avg monthly spend"
        />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 16, marginBottom: 16 }}>
        {/* Cashflow bar chart */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Cashflow · {year}</div>
              <div className="card-sub">Click a month to filter · dashes = net</div>
            </div>
            <div style={{ display: "flex", gap: 14 }}>
              {[{ label: "Income", color: cashflowColors[0] }, { label: "Spend", color: cashflowColors[1] }].map(({ label, color }) => (
                <span key={label} style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: "inline-block" }} /> {label}
                </span>
              ))}
            </div>
          </div>
          <div style={{ padding: "0 16px 16px" }}>
            <CashflowChart
              data={cashflow}
              selectedMonth={month}
              onMonthClick={m => setMonth(prev => prev === m ? null : m)}
            />
          </div>
        </div>

        {/* Savings donut */}
        <div className="card" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-head">
            <div className="card-title">Savings rate</div>
          </div>
          <div style={{ padding: "0 20px 8px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <SavingsDonut rate={savingsRate} />
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>of income saved · {periodLabel}</div>
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", fontSize: 12, borderTop: "1px solid var(--paper-2)", paddingTop: 12 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "var(--ink-3)", marginBottom: 3 }}>Income</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: "var(--income)" }}>{fmt(totals.income)}</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: "var(--ink-3)", marginBottom: 3 }}>Net</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 500, color: net >= 0 ? "var(--income)" : "var(--expense)" }}>{fmt(net)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Top categories */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Top spending categories</div>
              <div className="card-sub">{periodLabel} · by amount</div>
            </div>
          </div>
          <div style={{ padding: "0 20px 20px" }}>
            <CategoryBars
              data={displayedCategories}
              selectedCategory={selectedCategory}
              onCategoryClick={cat => setSelectedCategory(prev => prev === cat ? null : cat)}
            />
          </div>
        </div>

        {/* Largest transactions */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Largest transactions</div>
              <div className="card-sub">
                {periodLabel} · by amount
                {selectedCategory && (
                  <>
                    {" · "}
                    <span
                      onClick={() => setSelectedCategory(null)}
                      style={{ cursor: "pointer", color: "var(--ink-1)", fontWeight: 500 }}
                    >
                      {selectedCategory} ×
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div style={{ padding: "0 20px 8px" }}>
            <RecentTxns txns={displayedTxns} />
          </div>
        </div>
      </div>
    </main>
  );
}
