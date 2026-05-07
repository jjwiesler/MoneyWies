import { useState, useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";
import SortTh from "../components/SortTh.jsx";

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// ---------------------------------------------------------------------------
// Category + Label inline cells
// ---------------------------------------------------------------------------

const cellSelectStyle = {
  border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)",
  padding: "3px 8px", fontSize: 12, fontFamily: "var(--font-sans)",
  background: "var(--paper-0)", color: "var(--ink-0)", outline: "none",
  cursor: "pointer", maxWidth: 180,
};
const cellInputStyle = {
  border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)",
  padding: "3px 8px", fontSize: 12, fontFamily: "var(--font-sans)",
  outline: "none", width: 140, background: "var(--paper-0)",
};

function MerchantCell({ txn, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function startEdit() { setDraft(txn.merchant_alias || ""); setEditing(true); }

  async function commit() {
    setEditing(false);
    const val = draft.trim();
    if (val === (txn.merchant_alias || "")) return;
    await fetch(`/api/transactions/${txn.id}/merchant_alias?merchant_alias=${encodeURIComponent(val)}`, { method: "PATCH" });
    onSave(txn.id, val || null);
  }

  const displayName = txn.merchant_alias || txn.custom_name || txn.name;
  const fallback = txn.custom_name || txn.name;

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        placeholder={fallback}
        style={{ border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)", padding: "3px 8px", fontSize: 13, fontFamily: "var(--font-sans)", background: "var(--paper-0)", color: "var(--ink-0)", outline: "none", width: 180 }}
      />
    );
  }

  return (
    <button onClick={startEdit} title="Click to set display name" style={{ background: "none", border: 0, cursor: "pointer", padding: 0, textAlign: "left" }}>
      <div style={{ fontWeight: 500, fontSize: 13 }}>{displayName}</div>
      {txn.merchant_alias && fallback && txn.merchant_alias !== fallback && (
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fallback}</div>
      )}
    </button>
  );
}

function ExpenseCategoryCell({ txn, categories, onSave }) {
  const [editing,  setEditing]  = useState(false);
  const [freeText, setFreeText] = useState(false);
  const selectRef  = useRef(null);
  const inputRef   = useRef(null);
  const pendingNew = useRef(false);

  useEffect(() => {
    if (editing && !freeText) selectRef.current?.focus();
    if (editing &&  freeText) inputRef.current?.focus();
  }, [editing, freeText]);

  async function commit(val) {
    setEditing(false); setFreeText(false);
    const trimmed = val.trim();
    if (trimmed === (txn.category || "")) return;
    await fetch(`/api/transactions/${txn.id}/category?category=${encodeURIComponent(trimmed)}`, { method: "PATCH" });
    if (trimmed && !categories.includes(trimmed)) {
      await fetch(`/api/categories?name=${encodeURIComponent(trimmed)}`, { method: "POST" });
    }
    onSave(txn.id, trimmed);
  }

  function handleSelect(e) {
    const val = e.target.value;
    if (val === "__new__") { pendingNew.current = true; setFreeText(true); return; }
    commit(val);
  }

  function handleBlur() {
    if (pendingNew.current) { pendingNew.current = false; return; }
    setEditing(false);
  }

  if (editing && freeText) {
    return (
      <input
        ref={inputRef}
        placeholder="New category…"
        style={cellInputStyle}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") commit(e.target.value); if (e.key === "Escape") { setEditing(false); setFreeText(false); } }}
      />
    );
  }

  if (editing) {
    return (
      <select ref={selectRef} defaultValue={txn.category || ""} onChange={handleSelect} onBlur={handleBlur} style={cellSelectStyle}>
        <option value="">Uncategorized</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
        <option value="__new__">+ Add new…</option>
      </select>
    );
  }

  return (
    <button onClick={() => setEditing(true)} title="Click to change category"
      style={{ background: "none", border: 0, cursor: "pointer", padding: 0, textAlign: "left" }}>
      {txn.category
        ? <span className="cat">{txn.category}</span>
        : <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>Uncategorized</span>
      }
    </button>
  );
}

function ExpenseLabelCell({ txn, labels, onSave }) {
  const [adding,   setAdding]   = useState(false);
  const [freeText, setFreeText] = useState(false);
  const [draft,    setDraft]    = useState("");
  const selectRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    if (adding && !freeText) selectRef.current?.focus();
    if (adding &&  freeText) inputRef.current?.focus();
  }, [adding, freeText]);

  const current = txn.label ? txn.label.split(",").map(s => s.trim()).filter(Boolean) : [];

  async function persist(newLabels) {
    const str = newLabels.join(",");
    await fetch(`/api/transactions/${txn.id}/label?label=${encodeURIComponent(str)}`, { method: "PATCH" });
    onSave(txn.id, str);
  }

  function remove(lbl) { persist(current.filter(l => l !== lbl)); }

  function handleSelect(e) {
    const val = e.target.value;
    if (val === "__new__") { setFreeText(true); return; }
    setAdding(false);
    if (val && !current.includes(val)) persist([...current, val]);
  }

  function commitNew(val) {
    setAdding(false); setFreeText(false);
    const trimmed = val.trim();
    if (trimmed && !current.includes(trimmed)) persist([...current, trimmed]);
  }

  const pillStyle = { display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 5px", background: "var(--brand-50)", color: "var(--brand-700)", borderRadius: "var(--r-sm)", fontSize: 11, whiteSpace: "nowrap" };
  const xStyle    = { background: "none", border: 0, cursor: "pointer", padding: "0 1px", lineHeight: 1, color: "var(--brand-400)", fontSize: 13 };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}>
      {current.map(l => (
        <span key={l} style={pillStyle}>
          {l}
          <button onClick={() => remove(l)} style={xStyle} title="Remove label">×</button>
        </span>
      ))}
      {adding && freeText && (
        <input ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={() => commitNew(draft)}
          onKeyDown={e => { if (e.key === "Enter") commitNew(draft); if (e.key === "Escape") { setAdding(false); setFreeText(false); } }}
          placeholder="New label…"
          style={{ border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)", padding: "2px 6px", fontSize: 11, outline: "none", width: 90, background: "var(--paper-0)" }}
        />
      )}
      {adding && !freeText && (
        <select ref={selectRef} value="" onChange={handleSelect} onBlur={() => setAdding(false)}
          style={{ border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)", padding: "2px 4px", fontSize: 11, background: "var(--paper-0)", outline: "none", cursor: "pointer" }}>
          <option value="" disabled>Add label…</option>
          {labels.filter(l => !current.includes(l)).map(l => <option key={l} value={l}>{l}</option>)}
          <option value="__new__">+ New label…</option>
        </select>
      )}
      {!adding && (
        <button onClick={() => { setAdding(true); setFreeText(false); setDraft(""); }}
          style={{ background: "none", border: "1px dashed var(--ink-4)", borderRadius: "var(--r-sm)", cursor: "pointer", padding: "1px 5px", fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}
          title="Add label">+</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick rule modal
// ---------------------------------------------------------------------------

const qrLabelStyle = {
  display: "block", fontSize: 11,
  letterSpacing: "0.05em", textTransform: "uppercase",
  color: "var(--ink-3)", fontWeight: 500, marginBottom: 5,
};
const qrInputStyle = {
  width: "100%", background: "var(--paper-0)",
  border: "1px solid var(--paper-3)", borderRadius: "var(--r-md)",
  padding: "7px 10px", fontSize: 13, fontFamily: "var(--font-sans)",
  color: "var(--ink-0)", outline: "none", boxSizing: "border-box",
};

function QuickRuleModal({ txn, label, categories, labels, accounts, onClose, onCreated }) {
  const [pattern,      setPattern]      = useState((txn.name || txn.description || "").toUpperCase());
  const [cat,          setCat]          = useState(txn.category || "");
  const [lbl,          setLbl]          = useState(label ?? "");
  const [scopeAccount, setScopeAccount] = useState("");
  const [amountMin,    setAmountMin]    = useState("");
  const [amountMax,    setAmountMax]    = useState("");
  const [previewCount, setPreviewCount] = useState(null);
  const [saving,       setSaving]       = useState(false);

  const debouncedPattern = useDebounce(pattern);
  const debouncedMin     = useDebounce(amountMin);
  const debouncedMax     = useDebounce(amountMax);

  useEffect(() => {
    const hasCondition = debouncedPattern.trim() || scopeAccount || debouncedMin || debouncedMax;
    if (!hasCondition) { setPreviewCount(null); return; }
    const params = new URLSearchParams({ limit: 1 });
    if (debouncedPattern) params.set("pattern",       debouncedPattern);
    if (scopeAccount)     params.set("scope_account", scopeAccount);
    if (debouncedMin)     params.set("amount_min",    debouncedMin);
    if (debouncedMax)     params.set("amount_max",    debouncedMax);
    fetch(`/api/rules/preview?${params}`)
      .then(r => r.json())
      .then(d => setPreviewCount(d.total_matches));
  }, [debouncedPattern, scopeAccount, debouncedMin, debouncedMax]);

  async function save() {
    if (!cat.trim() && !lbl.trim()) return;
    if (!pattern.trim() && !scopeAccount && !amountMin && !amountMax) return;
    setSaving(true);
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern:           pattern.trim()      || null,
        category:          cat.trim()          || null,
        label:             lbl.trim()          || null,
        sub_category:      null,
        scope_institution: null,
        scope_account:     scopeAccount.trim() || null,
        amount_min:        amountMin !== "" ? parseFloat(amountMin) : null,
        amount_max:        amountMax !== "" ? parseFloat(amountMax) : null,
      }),
    });
    const data = await res.json();
    setSaving(false);
    onCreated(data.apply_stats);
    onClose();
  }

  const txnAmt = Math.abs(txn.amount).toFixed(2);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(16,21,16,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--paper-0)", borderRadius: "var(--r-xl)", border: "1px solid var(--paper-3)", boxShadow: "var(--shadow-lg)", padding: 24, width: 500, maxWidth: "92vw" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.01em" }}>Create rule</div>
          <button onClick={onClose} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 4 }}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 18 }}>
          Automatically categorize and label transactions that match all filled conditions.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <div>
            <label style={qrLabelStyle}>Pattern</label>
            <input
              autoFocus
              value={pattern}
              onChange={e => setPattern(e.target.value.toUpperCase())}
              style={{ ...qrInputStyle, fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div>
            <label style={qrLabelStyle}>Category</label>
            <input
              list="qr-expense-cat-list"
              value={cat}
              onChange={e => setCat(e.target.value)}
              style={qrInputStyle}
            />
            <datalist id="qr-expense-cat-list">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label style={qrLabelStyle}>Label</label>
            <input
              list="qr-expense-label-list"
              value={lbl}
              onChange={e => setLbl(e.target.value)}
              style={qrInputStyle}
              placeholder="e.g. Gym"
            />
            <datalist id="qr-expense-label-list">
              {(labels || []).map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
          <div>
            <label style={qrLabelStyle}>Account</label>
            <select
              value={scopeAccount}
              onChange={e => setScopeAccount(e.target.value)}
              style={{ ...qrInputStyle, appearance: "none", cursor: "pointer" }}
            >
              <option value="">Any account</option>
              {accounts.map(a => (
                <option key={a.account_number} value={a.account_number}>{a.account_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={qrLabelStyle}>Amount min $</label>
            <input
              type="number" min="0" step="0.01"
              value={amountMin}
              onChange={e => setAmountMin(e.target.value)}
              placeholder={txnAmt}
              style={{ ...qrInputStyle, fontFamily: "var(--font-mono)" }}
            />
          </div>
          <div>
            <label style={qrLabelStyle}>Amount max $</label>
            <input
              type="number" min="0" step="0.01"
              value={amountMax}
              onChange={e => setAmountMax(e.target.value)}
              placeholder={txnAmt}
              style={{ ...qrInputStyle, fontFamily: "var(--font-mono)" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {previewCount !== null && (
            <span style={{ fontSize: 13, color: previewCount > 0 ? "var(--income)" : "var(--ink-3)" }}>
              {previewCount > 0 ? `Matches ${previewCount.toLocaleString()} transactions` : "No matches"}
            </span>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Skip</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving || (!cat.trim() && !lbl.trim())}
            >
              {saving ? "Saving…" : "Create rule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly bar chart (SVG, no deps)
// ---------------------------------------------------------------------------

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const PIE_COLORS = ["#B7402A","#D4613F","#E8896B","#A0341E","#C95235","#7A2918","#F2B49A"];

function LabelPie({ data, filterLabels, onToggle }) {
  if (!data?.length) return <div style={{ fontSize: 12, color: "var(--ink-3)" }}>No labels</div>;
  const total = data.reduce((s, d) => s + d.total, 0);
  if (!total) return null;

  const cx = 55, cy = 55, r = 48, inner = 26;
  let angle = -Math.PI / 2;

  const slices = data.slice(0, 7).map((d, i) => {
    const frac = d.total / total;
    const a0 = angle;
    angle += frac * 2 * Math.PI;
    const a1 = angle;
    const [cos0, sin0, cos1, sin1] = [Math.cos(a0), Math.sin(a0), Math.cos(a1), Math.sin(a1)];
    const large = frac > 0.5 ? 1 : 0;
    const active = filterLabels.includes(d.label);
    return {
      path: `M ${cx+r*cos0} ${cy+r*sin0} A ${r} ${r} 0 ${large} 1 ${cx+r*cos1} ${cy+r*sin1} L ${cx+inner*cos1} ${cy+inner*sin1} A ${inner} ${inner} 0 ${large} 0 ${cx+inner*cos0} ${cy+inner*sin0} Z`,
      color: PIE_COLORS[i % PIE_COLORS.length],
      label: d.label, pct: Math.round(frac * 100), active,
    };
  });

  const anyActive = filterLabels.length > 0;

  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
      <svg width={110} height={110} viewBox="0 0 110 110" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color}
            opacity={anyActive && !s.active ? 0.3 : 1}
            style={{ cursor: "pointer", transition: "opacity 0.15s" }}
            onClick={() => onToggle(s.label)} />
        ))}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, flex: 1 }}>
        {slices.map((s, i) => (
          <button key={i} onClick={() => onToggle(s.label)}
            style={{
              display: "flex", alignItems: "center", gap: 6, fontSize: 11,
              background: "none", border: 0, cursor: "pointer", padding: "2px 0", textAlign: "left",
              opacity: anyActive && !s.active ? 0.4 : 1, transition: "opacity 0.15s",
            }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
            <span className="mono" style={{ color: "var(--ink-3)", marginLeft: "auto", flexShrink: 0, fontSize: 10 }}>{s.pct}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthlyExpenseChart({ data, selectedMonth }) {
  const byMonth = {};
  for (const row of data) {
    byMonth[row.month] = (byMonth[row.month] || 0) + row.total;
  }

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const values = months.map(m => byMonth[m] || 0);
  const max = Math.max(...values, 1);
  const selectedPad = selectedMonth ? String(selectedMonth).padStart(2, "0") : null;

  const W = 740, H = 160, padX = 30, padY = 10;
  const barW = 36, gap = (W - padX * 2 - barW * 12) / 11;

  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} width="100%" style={{ display: "block" }}>
      {[0.33, 0.66, 1].map(f => (
        <line key={f} x1={padX} y1={padY + H * (1 - f)} x2={W - padX} y2={padY + H * (1 - f)}
          stroke="#EFECE3" strokeWidth="1" strokeDasharray={f < 1 ? "2 4" : "0"} />
      ))}
      {months.map((m, i) => {
        const x = padX + i * (barW + gap);
        const barH = (values[i] / max) * H;
        const isSelected = selectedPad ? m === selectedPad : false;
        const dimmed = selectedPad && !isSelected;
        return (
          <g key={m}>
            <rect x={x} y={padY + H - barH} width={barW} height={barH} rx="3"
              fill={isSelected ? "#8B2F1E" : "#B7402A"}
              opacity={dimmed ? 0.25 : isSelected ? 1 : 0.8} />
            <text x={x + barW / 2} y={H + padY + 18} fontFamily="Geist Mono" fontSize="10"
              fill={isSelected ? "#B7402A" : dimmed ? "#C5C9C5" : "#8A908A"} textAnchor="middle">{MONTH_LABELS[i]}</text>
            {values[i] > 0 && !dimmed && (
              <text x={x + barW / 2} y={padY + H - barH - 4} fontFamily="Geist" fontSize="9"
                fill="#5B625B" textAnchor="middle">
                {values[i] >= 1000 ? `${Math.round(values[i] / 1000)}k` : Math.round(values[i])}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}


// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Expenses() {
  const [year, setYear]       = useState(CURRENT_YEAR);
  const [month, setMonth]     = useState(null);
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState([]);
  const [yoy, setYoy]         = useState([]);
  const [yearSummary, setYearSummary] = useState(null);
  const [txns, setTxns]       = useState([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPage, setTxnPage] = useState(0);
  const [filterCategories, setFilterCategories] = useState([]);
  const [filterLabels,     setFilterLabels]     = useState([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [sortBy,  setSortBy]  = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [quickRule,  setQuickRule]  = useState(null);
  const [categories, setCategories] = useState([]);
  const [accounts,   setAccounts]   = useState([]);
  const [labels,     setLabels]     = useState([]);

  const PAGE = 50;
  const period = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);

  // stable keys for effect deps
  const filterCatsKey  = [...filterCategories].sort().join(",");
  const filterLabsKey  = [...filterLabels].sort().join(",");
  // labels known but NOT selected — used to exclude multi-label transactions
  const excludeLabsKey = filterLabels.length > 0
    ? labels.filter(l => !filterLabels.includes(l)).sort().join(",")
    : "";

  function toggleCategory(cat) {
    setFilterCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  }
  function toggleLabel(lbl) {
    setFilterLabels(prev => prev.includes(lbl) ? prev.filter(l => l !== lbl) : [...prev, lbl]);
  }
  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
    fetch("/api/accounts").then(r => r.json()).then(setAccounts);
    fetch("/api/labels").then(r => r.json()).then(setLabels);
  }, []);

  useEffect(() => {
    fetch(`/api/expenses/summary?period=${period}`).then(r => r.json()).then(setSummary);
    fetch("/api/expenses/yoy").then(r => r.json()).then(setYoy);
  }, [period]);

  useEffect(() => {
    const params = new URLSearchParams({ year });
    if (filterCatsKey)  params.set("category",      filterCatsKey);
    if (filterLabsKey)  params.set("label",          filterLabsKey);
    if (excludeLabsKey) params.set("exclude_label",  excludeLabsKey);
    fetch(`/api/expenses/monthly?${params}`).then(r => r.json()).then(setMonthly);
  }, [year, filterCatsKey, filterLabsKey, excludeLabsKey]);

  useEffect(() => {
    fetch(`/api/expenses/summary?period=${year}`).then(r => r.json()).then(setYearSummary);
  }, [year]);

  useEffect(() => { setTxnPage(0); }, [period, filterCatsKey, filterLabsKey, excludeLabsKey, debouncedSearch, sortBy, sortDir]);

  useEffect(() => {
    const params = new URLSearchParams({ period, limit: PAGE, offset: txnPage * PAGE, sort_by: sortBy, sort_dir: sortDir });
    let searchText = debouncedSearch || "";
    let parsedLabelSearch = null;
    let parsedCategory = filterCatsKey;

    const labelMatch = searchText.match(/\blabel:(\S+)/i);
    if (labelMatch) {
      parsedLabelSearch = labelMatch[1];
      searchText = searchText.replace(labelMatch[0], "").trim();
    }
    const categoryMatch = searchText.match(/\bcategory:(\S+)/i);
    if (categoryMatch) {
      parsedCategory = categoryMatch[1];
      searchText = searchText.replace(categoryMatch[0], "").trim();
    }
    const amountMatch = searchText.match(/\bamount:(\S+)/i);
    let parsedAmount = null;
    if (amountMatch) {
      parsedAmount = amountMatch[1];
      searchText = searchText.replace(amountMatch[0], "").trim();
    }
    const merchantMatch = searchText.match(/\bmerchant:(\S+)/i);
    let parsedMerchant = null;
    if (merchantMatch) {
      parsedMerchant = merchantMatch[1];
      searchText = searchText.replace(merchantMatch[0], "").trim();
    }

    if (parsedCategory)   params.set("category",        parsedCategory);
    if (filterLabsKey)    params.set("label",            filterLabsKey);
    if (parsedLabelSearch) params.set("label_search",   parsedLabelSearch);
    if (excludeLabsKey)   params.set("exclude_label",   excludeLabsKey);
    if (searchText)       params.set("search",           searchText);
    if (parsedAmount)     params.set("amount_filter",   parsedAmount);
    if (parsedMerchant)   params.set("merchant_filter", parsedMerchant);
    fetch(`/api/expenses/transactions?${params}`)
      .then(r => r.json())
      .then(d => { setTxns(d.transactions); setTxnTotal(d.total); });
  }, [period, filterCatsKey, filterLabsKey, excludeLabsKey, debouncedSearch, sortBy, sortDir, txnPage]);

  function handleMerchantSave(id, alias) {
    setTxns(prev => prev.map(t => t.id === id ? { ...t, merchant_alias: alias } : t));
  }

  function handleCategorySave(id, newCat) {
    setTxns(prev => prev.map(t => t.id === id ? { ...t, category: newCat } : t));
    setCategories(prev => newCat && !prev.includes(newCat) ? [...prev, newCat].sort() : prev);
  }

  function handleLabelSave(id, newLabel) {
    setTxns(prev => {
      const txn = prev.find(t => t.id === id);
      if (txn && newLabel) setQuickRule({ txn, label: newLabel });
      return prev.map(t => t.id === id ? { ...t, label: newLabel } : t);
    });
    if (newLabel) {
      const newOnes = newLabel.split(",").map(s => s.trim()).filter(Boolean);
      setLabels(prev => { const s = new Set(prev); newOnes.forEach(l => s.add(l)); return [...s].sort(); });
    }
  }

  const availableYears = [...new Set(yoy.map(r => r.year))].sort().reverse();
  const totalPages = Math.ceil(txnTotal / PAGE);

  const yoyYears = [...new Set(yoy.map(r => r.year))].sort();
  const yoyMap = {};
  for (const r of yoy) {
    if (!yoyMap[r.year]) yoyMap[r.year] = {};
    yoyMap[r.year][r.category] = r.total;
  }
  const yoyTotals = yoyYears.map(y => Object.values(yoyMap[y] || {}).reduce((a, b) => a + b, 0));

  return (
    <main className="main">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Expenses</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Expenses
          </h1>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div className="segmented">
            {availableYears.map(y => (
              <button key={y} className={String(year) === y ? "on" : ""} onClick={() => { setYear(Number(y)); setMonth(null); }}>
                {y}
              </button>
            ))}
          </div>
          <div className="segmented" style={{ fontSize: 11 }}>
            <button className={!month ? "on" : ""} onClick={() => setMonth(null)}>All</button>
            {MONTH_LABELS.map((name, i) => (
              <button key={i} className={month === i + 1 ? "on" : ""} onClick={() => setMonth(m => m === i + 1 ? null : i + 1)}>
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary header */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 16, marginBottom: 16 }}>
          {/* Hero */}
          {(() => {
            const hasFilter = filterCategories.length > 0 || filterLabels.length > 0;
            const monthPad = month ? String(month).padStart(2, "0") : null;
            const filteredTotal = hasFilter
              ? monthly.filter(r => !monthPad || r.month === monthPad).reduce((s, r) => s + r.total, 0)
              : summary.total;
            return (
              <div className="card" style={{ background: "#7A2918", color: "var(--paper-0)", border: 0 }}>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.65, fontWeight: 500 }}>
                  {hasFilter ? "Filtered spend" : "Total spend"} · {period}
                </div>
                <div className="mono" style={{ fontSize: 44, lineHeight: 1.05, letterSpacing: "-0.03em", fontWeight: 500, marginTop: 10 }}>
                  {fmt(filteredTotal)}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                  {hasFilter ? `${txnTotal.toLocaleString()} filtered` : `${summary.count} transactions`}
                  {!hasFilter && summary.classified > 0 && ` · ${fmt(summary.classified)} categorized`}
                </div>
              </div>
            );
          })()}

          {/* By category pills */}
          <div className="card">
            <div className="stat-label" style={{ marginBottom: 7 }}>By category</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {summary.by_category.map(t => {
                const active = filterCategories.includes(t.category);
                return (
                  <button key={t.category} onClick={() => toggleCategory(t.category)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "2px 8px", borderRadius: "var(--r-md)",
                      border: "1px solid",
                      borderColor: active ? "#B7402A" : "var(--paper-3)",
                      background: active ? "#F1D8D0" : "var(--paper-0)",
                      cursor: "pointer", fontSize: 11,
                    }}>
                    <span style={{ fontWeight: 500 }}>{t.category}</span>
                    <span className="mono" style={{ color: "var(--ink-2)", fontSize: 10 }}>{fmt(t.total)}</span>
                    <span style={{ color: "var(--ink-3)", fontSize: 10 }}>{pct(t.total, summary.total)}%</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* By label pie */}
          <div className="card">
            <div className="stat-label" style={{ marginBottom: 7 }}>By label</div>
            <LabelPie data={summary.by_label || []} filterLabels={filterLabels} onToggle={toggleLabel} />
          </div>
        </div>
      )}

      {/* Monthly trend */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div className="stat-label">Monthly spend · {period}</div>
          </div>
        </div>
        <MonthlyExpenseChart data={monthly} selectedMonth={month} />
      </div>

      {/* Expense transactions */}
      <div className="card flush" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div>
            <div className="card-title">Expense transactions</div>
            <div className="card-sub">
              {txnTotal.toLocaleString()} transactions
              {filterCategories.length > 0 && <span> · {filterCategories.join(", ")}</span>}
              {filterLabels.length > 0 && <span> · {filterLabels.join(", ")}</span>}
              {search && <span> · "{search}"</span>}
            </div>
          </div>
          <label className="input" style={{ minWidth: 220 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search… label:Bolinas category:Camp amount:7600 merchant:check"
              style={{ background: "transparent", border: "none", outline: "none", width: "100%", fontSize: 13 }}
            />
          </label>
          {(filterCategories.length > 0 || filterLabels.length > 0 || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterCategories([]); setFilterLabels([]); setSearch(""); }}>
              <Icon name="x" size={12} /> Clear filter
            </button>
          )}
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <SortTh label="Date"        col="date"         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ width: 90 }} />
              <SortTh label="Merchant"    col="name"         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th>Account</th>
              <SortTh label="Category"    col="category"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th>Label</th>
              <SortTh label="Amount"      col="amount"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="num" style={{ width: 140 }} />
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {txns.map(txn => (
              <tr key={txn.id}>
                <td className="mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>{txn.date}</td>
                <td>
                  <MerchantCell txn={txn} onSave={handleMerchantSave} />
                  {txn.account_name && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{txn.account_name}</div>
                  )}
                </td>
                <td style={{ fontSize: 12, color: "var(--ink-2)" }}>{txn.institution}</td>
                <td>
                  <ExpenseCategoryCell txn={txn} categories={categories} onSave={handleCategorySave} />
                  {txn.category_source === "manual" && (
                    <span style={{ fontSize: 10, color: "var(--brand-400)", marginLeft: 6 }}>edited</span>
                  )}
                  {txn.category_source === "rule" && (
                    <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>rule</span>
                  )}
                </td>
                <td>
                  <ExpenseLabelCell txn={txn} labels={labels} onSave={handleLabelSave} />
                </td>
                <td className="num money mono" style={{ fontWeight: 500, color: "var(--expense)" }}>
                  {fmt(txn.amount)}
                </td>
                <td>
                  <button
                    onClick={() => setQuickRule({ txn })}
                    title="Create rule"
                    style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex", alignItems: "center" }}
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {txns.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--ink-3)", padding: 32, fontSize: 13 }}>
                  No expense transactions for {year}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: 16 }}>
            <button className="btn btn-secondary btn-sm" disabled={txnPage === 0} onClick={() => setTxnPage(p => p - 1)}>Prev</button>
            <span style={{ fontSize: 13, color: "var(--ink-2)", alignSelf: "center" }}>
              {txnPage + 1} / {totalPages}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={txnPage >= totalPages - 1} onClick={() => setTxnPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* YoY + Category breakdown — 2 col */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* YoY */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 14 }}>Year-over-year</div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>Year</th>
                <th style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>Total</th>
                <th style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>vs prior</th>
              </tr>
            </thead>
            <tbody>
              {yoyYears.map((y, i) => {
                const total = yoyTotals[i];
                const prior = i > 0 ? yoyTotals[i - 1] : null;
                const delta = prior ? ((total - prior) / prior) * 100 : null;
                return (
                  <tr key={y} style={{ borderTop: "1px solid var(--paper-2)" }}>
                    <td style={{ padding: "8px 0", fontWeight: String(year) === y ? 600 : 400 }}>{y}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "8px 0" }}>{fmt(total)}</td>
                    <td style={{ textAlign: "right", padding: "8px 0" }}>
                      {delta !== null && (
                        <span style={{ fontSize: 12, color: delta >= 0 ? "var(--expense)" : "var(--income)" }}>
                          {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Category breakdown */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 14 }}>Category breakdown · {year}</div>
          {yearSummary ? (
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>Category</th>
                  <th style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>Transactions</th>
                  <th style={{ textAlign: "right", fontSize: 11, color: "var(--ink-3)", fontWeight: 500, paddingBottom: 8 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(yearSummary.by_category || []).slice(0, 8).map(row => (
                  <tr key={row.category} style={{ borderTop: "1px solid var(--paper-2)" }}>
                    <td style={{ padding: "8px 0", fontWeight: 500 }}>{row.category}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "8px 0", color: "var(--ink-2)" }}>{row.count.toLocaleString()}</td>
                    <td className="mono" style={{ textAlign: "right", padding: "8px 0" }}>{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</div>
          )}
        </div>
      </div>

      {quickRule && (
        <QuickRuleModal
          txn={quickRule.txn}
          label={quickRule.label}
          categories={categories}
          labels={labels}
          accounts={accounts}
          onClose={() => setQuickRule(null)}
          onCreated={() => setQuickRule(null)}
        />
      )}
    </main>
  );
}
