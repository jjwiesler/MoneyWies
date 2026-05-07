// MoneyWies — Dashboard screen
const { useState, useEffect } = React;

// Data
const MONTHS = ["May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar","Apr"];
const INCOME = [8420,8420,9100,8420,9840,10200,9420,10420,8420,9640,9100,11204];
const SPEND  = [5840,5420,6120,5840,6420,6620,6120,6820,5920,6420,6120,6985.6];

const TOP_MERCHANTS = [
  { name: "Stuyvesant Real Estate", sub: "Rent · BofA ·· 4412", amt: -2400.00, logo: "SR", bg: "#1F3A2E", cat: "Rent" },
  { name: "Whole Foods", sub: "Groceries · Amex Gold ·· 1009", amt: -422.18, logo: "WF", bg: "#4C6B59", cat: "Groceries" },
  { name: "Con Edison", sub: "Utilities · BofA ·· 4412", amt: -284.40, logo: "CE", bg: "#2C4A3B", cat: "Utilities" },
  { name: "Trader Joe's", sub: "Groceries · Amex Gold ·· 1009", amt: -248.92, logo: "TJ", bg: "#4C6B59", cat: "Groceries" },
  { name: "Joe Coffee", sub: "Dining · Amex Gold ·· 1009", amt: -186.40, logo: "JC", bg: "#B7402A", cat: "Dining" },
  { name: "Lyft", sub: "Transport · Chase Sapphire ·· 7781", amt: -162.50, logo: "LY", bg: "#4C6B59", cat: "Transport" },
  { name: "Claude Pro", sub: "Subscriptions · Amex Gold ·· 1009", amt: -120.00, logo: "CL", bg: "#B8892A", cat: "Subscriptions" },
  { name: "Equinox", sub: "Fitness · Amex Gold ·· 1009", amt: -89.00, logo: "EQ", bg: "#B8892A", cat: "Fitness" },
];

const RECENT = [
  { date: "Apr 23", merchant: "Gusto Payroll", cat: "Income · Payroll", amt: 5602.00, account: "BofA Checking ·· 4412", tone: "pos" },
  { date: "Apr 23", merchant: "Whole Foods Market", cat: "Groceries", amt: -142.88, account: "Amex Gold ·· 1009", tone: "neg" },
  { date: "Apr 22", merchant: "Lyft", cat: "Transport", amt: -28.40, account: "Chase Sapphire ·· 7781", tone: "neg" },
  { date: "Apr 22", merchant: "Claude Pro", cat: "Subscriptions", amt: -20.00, account: "Amex Gold ·· 1009", tone: "neg" },
  { date: "Apr 21", merchant: "Trader Joe's", cat: "Groceries", amt: -68.12, account: "Amex Gold ·· 1009", tone: "neg" },
  { date: "Apr 21", merchant: "Joe Coffee Company", cat: "Dining", amt: -6.40, account: "Amex Gold ·· 1009", tone: "neg" },
  { date: "Apr 20", merchant: "Stuyvesant Real Estate", cat: "Rent", amt: -2400.00, account: "BofA Checking ·· 4412", tone: "neg" },
  { date: "Apr 19", merchant: "Savings interest", cat: "Income · Interest", amt: 38.12, account: "BofA Savings ·· 8820", tone: "pos" },
];

const CATEGORIES = [
  { name: "Rent & utilities", amt: 2684.40, pct: 38, color: "#1F3A2E" },
  { name: "Groceries", amt: 1204.88, pct: 17, color: "#4C6B59" },
  { name: "Dining", amt: 612.42, pct: 9, color: "#B7402A" },
  { name: "Transport", amt: 428.14, pct: 6, color: "#6A8C78" },
  { name: "Subscriptions", amt: 184.40, pct: 3, color: "#B8892A" },
  { name: "Other", amt: 1871.36, pct: 27, color: "#CFCABA" },
];

const SUBS = [
  { name: "Claude Pro", amt: 20, cadence: "Monthly", status: "active" },
  { name: "Netflix", amt: 22.99, cadence: "Monthly", status: "review", flag: "Duplicate w/ HBO?" },
  { name: "Spotify Family", amt: 16.99, cadence: "Monthly", status: "active" },
  { name: "Equinox", amt: 89, cadence: "Monthly", status: "active" },
  { name: "NYT Games", amt: 5, cadence: "Monthly", status: "review" },
];

// ---------- Hero Cashflow chart ----------
const CashflowChart = ({ privacy }) => {
  const max = Math.max(...INCOME);
  const h = 220;
  return (
    <svg viewBox="0 0 780 260" width="100%" style={{ display: "block" }}>
      <line x1="30" y1={h + 10} x2="770" y2={h + 10} stroke="#E4E0D4" strokeWidth="1" />
      <line x1="30" y1={h * 0.33 + 10} x2="770" y2={h * 0.33 + 10} stroke="#EFECE3" strokeWidth="1" strokeDasharray="2 4" />
      <line x1="30" y1={h * 0.66 + 10} x2="770" y2={h * 0.66 + 10} stroke="#EFECE3" strokeWidth="1" strokeDasharray="2 4" />
      {MONTHS.map((m, i) => {
        const x = 44 + i * 60;
        const incH = (INCOME[i] / max) * h;
        const spdH = (SPEND[i] / max) * h;
        const isLast = i === MONTHS.length - 1;
        return (
          <g key={m}>
            <rect x={x} y={h + 10 - incH} width="20" height={incH} rx="3" fill={isLast ? "#1F3A2E" : "#2C4A3B"} opacity={isLast ? 1 : 0.92} />
            <rect x={x + 22} y={h + 10 - spdH} width="20" height={spdH} rx="3" fill="#B7402A" opacity={isLast ? 0.95 : 0.75} />
            <text x={x + 21} y={h + 30} fontFamily="Geist Mono" fontSize="10" fill="#8A908A" textAnchor="middle">{m}</text>
          </g>
        );
      })}
      {/* Peak label */}
      {!privacy && (
        <g>
          <line x1="474" y1={h + 10 - (INCOME[11] / max) * h} x2="474" y2="22" stroke="#1F3A2E" strokeWidth="1" />
          <circle cx="474" cy={h + 10 - (INCOME[11] / max) * h} r="3" fill="#1F3A2E" />
          <rect x="420" y="8" width="110" height="20" rx="10" fill="#1F3A2E" />
          <text x="475" y="22" fontFamily="Geist" fontSize="11" fill="#fff" textAnchor="middle" fontWeight="500">+$11,204 · April</text>
        </g>
      )}
    </svg>
  );
};

// ---------- Donut ----------
const Donut = ({ items, privacy }) => {
  const total = items.reduce((s, i) => s + i.amt, 0);
  const circ = 2 * Math.PI * 54;
  let off = 0;
  return (
    <svg viewBox="0 0 160 160" width="160" height="160">
      <circle cx="80" cy="80" r="54" fill="none" stroke="#EFECE3" strokeWidth="18" />
      {items.map((i, idx) => {
        const frac = i.amt / total;
        const dash = frac * circ;
        const seg = <circle key={idx} cx="80" cy="80" r="54" fill="none" stroke={i.color} strokeWidth="18" strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-off} transform="rotate(-90 80 80)" />;
        off += dash;
        return seg;
      })}
      <text x="80" y="76" textAnchor="middle" fontFamily="Geist" fontSize="10" fill="#8A908A" letterSpacing="1">APRIL</text>
      <text x="80" y="94" textAnchor="middle" fontFamily="Geist" fontSize="17" fontWeight="500" fill="#101510">
        {privacy ? "•••" : fmt(total).replace(/\.\d+$/, "")}
      </text>
    </svg>
  );
};

// ---------- Dashboard ----------
const Dashboard = () => {
  const [privacy, setPrivacy] = useState(false);
  const [period, setPeriod] = useState("month");
  const [density, setDensity] = useState("balanced"); // comfortable | balanced | dense
  const [accent, setAccent] = useState("#1F3A2E");
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweaksAvailable, setTweaksAvailable] = useState(false);

  // Tweak mode wiring
  useEffect(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === "__activate_edit_mode") setTweaksOpen(true);
      if (d.type === "__deactivate_edit_mode") setTweaksOpen(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "__edit_mode_available" }, "*");
    setTweaksAvailable(true);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--brand-700", accent);
    document.documentElement.style.setProperty("--income", accent);
  }, [accent]);

  const rowPad = density === "dense" ? "8px 16px" : density === "comfortable" ? "18px 16px" : "14px 16px";

  return (
    <div className="app">
      <Sidebar current="dashboard" />

      <main className="main">
        {/* Topbar */}
        <div className="topbar">
          <div>
            <div className="breadcrumb">
              <span>Household</span><span className="sep">/</span><span>Dashboard</span>
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>April 2026</h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label className="input" style={{ minWidth: 280 }}>
              <Icon name="search" size={14} />
              <input placeholder="Search transactions, merchants, rules" />
              <span className="k">⌘K</span>
            </label>
            <button className="btn btn-secondary btn-sm" onClick={() => setPrivacy(p => !p)} title="Privacy mode">
              <Icon name={privacy ? "eyeOff" : "eye"} size={14} />
            </button>
            <button className="btn btn-primary btn-sm"><Icon name="plus" size={14} />Import CSV</button>
          </div>
        </div>

        {/* Period switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="segmented">
              {["month","quarter","year"].map(p => (
                <button key={p} className={period === p ? "on" : ""} onClick={() => setPeriod(p)}>
                  {p === "month" ? "This month" : p === "quarter" ? "Quarter" : "Year"}
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm"><Icon name="calendar" size={13} />Apr 1 – Apr 23</button>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 12, color: "var(--ink-2)" }}>
            <span>Last sync <span className="mono" style={{ color: "var(--ink-1)" }}>2 min ago</span></span>
            <span className="sep" style={{ color: "var(--paper-4)" }}>·</span>
            <span>RocketMoney · 1,248 rows</span>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="card" style={{ padding: 0, background: "var(--brand-700)", color: "var(--paper-0)", border: 0, position: "relative", overflow: "hidden" }}>
            <div style={{ padding: "22px 24px", position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.65, fontWeight: 500 }}>Net cashflow · April</div>
              <div className="mono" style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: "-0.035em", fontWeight: 500, marginTop: 10 }}>
                {privacy ? "$ •••••" : "+$4,218.40"}
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 18, fontSize: 12 }}>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>Income</div>
                  <div className="mono" style={{ marginTop: 3 }}>{privacy ? "$ ••••" : "$11,204.00"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>Spend</div>
                  <div className="mono" style={{ marginTop: 3 }}>{privacy ? "$ ••••" : "$6,985.60"}</div>
                </div>
                <div>
                  <div style={{ opacity: 0.6, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}>MoM</div>
                  <div className="mono" style={{ marginTop: 3, color: "#B6FF5C" }}>↑ 14.2%</div>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", right: 0, bottom: 0, width: "60%", opacity: 0.4 }}>
              <Sparkline data={INCOME.map((v, i) => v - SPEND[i])} color="#B6FF5C" fill={false} height={80} width={400} />
            </div>
          </div>

          <Stat label="Income" value={privacy ? "•••••" : "11,204.00"} prefix="+" delta="$820 vs. March" tone="up" />
          <Stat label="Spend"  value={privacy ? "•••••" : "6,985.60"}  prefix="−" delta="$412 vs. March" tone="down" />
          <Stat label="Savings rate" value={privacy ? "••" : "37.6%"}  delta="↑ 3.1 pts" tone="up" />
        </div>

        {/* Chart row */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div className="stat-label">12-month cashflow</div>
                <div className="mono" style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 6 }}>
                  {privacy ? "$ •••••" : "$52,418.12"} <span style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 400 }}>net year-to-date</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--ink-2)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--brand-700)" }}/>Income</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#B7402A" }}/>Spend</span>
              </div>
            </div>
            <CashflowChart privacy={privacy} />
          </div>

          <div className="card">
            <div className="stat-label">Category mix</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 6 }}>
              {privacy ? "$ •••••" : "$6,985.60"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 10 }}>
              <Donut items={CATEGORIES} privacy={privacy} />
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12, flex: 1 }}>
                {CATEGORIES.map(c => (
                  <div key={c.name} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }}/>{c.name}
                    </span>
                    <span className="mono" style={{ color: "var(--ink-1)" }}>{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent transactions — full width */}
        <div className="card flush" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <div>
              <div className="card-title">Recent transactions</div>
              <div className="card-sub">Across 4 accounts · last 5 days</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm"><Icon name="filter" size={13} />Filter</button>
              <button className="btn btn-secondary btn-sm">View all<Icon name="arrowRight" size={12} /></button>
            </div>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Date</th>
                <th>Merchant</th>
                <th>Account</th>
                <th>Category</th>
                <th className="num" style={{ width: 140 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {RECENT.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: rowPad, color: "var(--ink-2)", fontSize: 13 }} className="mono">{r.date}</td>
                  <td style={{ padding: rowPad, fontWeight: 500, whiteSpace: "nowrap" }}>{r.merchant}</td>
                  <td style={{ padding: rowPad, fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{r.account}</td>
                  <td style={{ padding: rowPad }}>
                    <span className="cat">
                      <span className="swatch" style={{ background: r.tone === "pos" ? "var(--brand-700)" : r.cat.includes("Rent") ? "#1F3A2E" : r.cat.includes("Groceries") ? "#4C6B59" : r.cat.includes("Dining") ? "#B7402A" : r.cat.includes("Transport") ? "#6A8C78" : r.cat.includes("Subscriptions") ? "#B8892A" : "#5B625B" }}/>
                      {r.cat}
                    </span>
                  </td>
                  <td className="num money mono" style={{ padding: rowPad, fontWeight: 500, color: r.tone === "pos" ? "var(--income)" : "var(--ink-0)", whiteSpace: "nowrap" }}>
                    {privacy ? "•••••" : fmt(r.amt, { sign: r.tone === "pos" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Merchants + Subscriptions — 2 col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div className="card flush">
            <div className="card-head">
              <div>
                <div className="card-title">Top merchants</div>
                <div className="card-sub">Ranked by April spend</div>
              </div>
              <button className="btn btn-ghost btn-sm">All<Icon name="arrowRight" size={12}/></button>
            </div>
            <div style={{ padding: "4px 20px 20px" }}>
              {TOP_MERCHANTS.slice(0, 6).map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "10px 0", borderBottom: i < 5 ? "1px solid var(--paper-2)" : "0" }}>
                  <div className="merchant" style={{ minWidth: 0, flex: 1 }}>
                    <div className="logo" style={{ background: m.bg, color: "#fff", flexShrink: 0 }}>{m.logo}</div>
                    <div className="meta" style={{ minWidth: 0, overflow: "hidden" }}>
                      <div className="name" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
                      <div className="sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.cat}</div>
                    </div>
                  </div>
                  <div className="money mono" style={{ fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>{privacy ? "•••••" : fmt(m.amt)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-label">Subscriptions</div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 6, whiteSpace: "nowrap" }}>
                  {privacy ? "$ •••" : "$184.40"} <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 400 }}>/ mo</span>
                </div>
              </div>
              <span className="pill warn" style={{ whiteSpace: "nowrap", flexShrink: 0 }}><span className="dot"/>2 review</span>
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {SUBS.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: 1 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.status === "active" ? "var(--brand-700)" : "var(--warn)", flexShrink: 0 }}/>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div style={{ fontWeight: 500 }}>{s.name}</div>
                      {s.flag && <div style={{ fontSize: 11, color: "var(--warn)" }}>{s.flag}</div>}
                    </div>
                  </div>
                  <div className="mono" style={{ color: "var(--ink-1)", flexShrink: 0, whiteSpace: "nowrap" }}>{privacy ? "••" : `$${s.amt.toFixed(2)}`}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom row — Rules + Accounts, 2 col */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-label">Rule&nbsp;engine</div>
                <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 6, whiteSpace: "nowrap" }}>
                  28<span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 400, marginLeft: 6 }}>rules</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm">Manage</button>
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              {[
                { pri: 1, pat: "GUSTO", cat: "Income · Payroll", hits: 24 },
                { pri: 2, pat: "WHOLE FOODS", cat: "Groceries", hits: 18 },
                { pri: 3, pat: "LYFT", cat: "Transport", hits: 42 },
                { pri: 4, pat: "CON EDISON", cat: "Utilities", hits: 12 },
              ].map(r => (
                <div key={r.pri} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{String(r.pri).padStart(2, "0")}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                    <span className="mono" style={{ fontSize: 12, padding: "2px 6px", background: "var(--paper-2)", borderRadius: 4, whiteSpace: "nowrap" }}>{r.pat}</span>
                    <Icon name="chev" size={10} stroke={2} />
                    <span style={{ color: "var(--ink-2)", fontSize: 12, whiteSpace: "nowrap" }}>{r.cat}</span>
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.hits}×</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div className="stat-label">Accounts</div>
                <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", marginTop: 6 }}>4 <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 400 }}>tracked</span></div>
              </div>
              <span className="pill ghost">1 ignored</span>
            </div>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { name: "BofA Checking", n: "4412", bal: 14208.12, type: "Cash" },
                { name: "BofA Savings", n: "8820", bal: 42108.40, type: "Cash" },
                { name: "Amex Gold", n: "1009", bal: -1284.62, type: "Credit" },
                { name: "Chase Sapphire", n: "7781", bal: -412.88, type: "Credit" },
              ].map(a => (
                <div key={a.n} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, gap: 16 }}>
                  <div style={{ minWidth: 0, overflow: "hidden" }}>
                    <div style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }} className="mono">··{a.n} · {a.type}</div>
                  </div>
                  <div className="mono" style={{ color: a.bal < 0 ? "var(--ink-0)" : "var(--ink-1)", flexShrink: 0, whiteSpace: "nowrap" }}>{privacy ? "•••••" : fmt(a.bal)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 40, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)" }}>
          <div>Data source · rocketmoney-2026-04.csv · imported Apr 23, 2026</div>
          <a href="Design System.html" style={{ color: "var(--ink-2)" }}>Design system →</a>
        </div>
      </main>

      {/* Tweaks panel */}
      {tweaksOpen && (
        <div style={{ position: "fixed", right: 20, bottom: 20, width: 300, background: "var(--paper-0)", border: "1px solid var(--paper-3)", borderRadius: 14, boxShadow: "var(--shadow-lg)", padding: 18, zIndex: 100 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-2)", fontWeight: 500, marginBottom: 14 }}>Tweaks</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-1)", marginBottom: 8 }}>Accent</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["#1F3A2E","#2C4A3B","#B7402A","#4C6B59","#101510"].map(c => (
                <button key={c} onClick={() => { setAccent(c); window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { accent: c } }, "*"); }}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, border: accent === c ? "2px solid var(--ink-0)" : "2px solid transparent" }} />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-1)", marginBottom: 8 }}>Density</div>
            <div className="segmented" style={{ width: "100%" }}>
              {["comfortable","balanced","dense"].map(d => (
                <button key={d} className={density === d ? "on" : ""} style={{ flex: 1 }}
                  onClick={() => { setDensity(d); window.parent.postMessage({ type: "__edit_mode_set_keys", edits: { density: d } }, "*"); }}>
                  {d[0].toUpperCase() + d.slice(1, 4)}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: "var(--ink-1)", marginBottom: 8 }}>Privacy mode</div>
            <button className="btn btn-secondary btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setPrivacy(p => !p)}>
              <Icon name={privacy ? "eyeOff" : "eye"} size={13}/>{privacy ? "Show amounts" : "Hide amounts"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<Dashboard />);
