import { useState, useEffect, useCallback, useRef } from "react";
import Icon from "../components/Icon.jsx";
import SortTh from "../components/SortTh.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `+$${abs}` : `$${abs}`;
}

function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const PAGE_SIZE = 100;

// Category color map — matches design system
const CAT_COLORS = {
  "Income":                "#1F3A2E",
  "Groceries":             "#4C6B59",
  "Dining & Drinks":       "#B7402A",
  "Restaurants":           "#B7402A",
  "Transport":             "#6A8C78",
  "Transportation":        "#6A8C78",
  "Subscriptions":         "#B8892A",
  "Bills & Utilities":     "#2C4A3B",
  "Shopping":              "#5B625B",
  "Rent":                  "#1F3A2E",
  "Fees":                  "#8A908A",
  "Internal Transfers":    "#CFCABA",
  "Credit Card Payment":   "#CFCABA",
  "Uncategorized":         "#CFCABA",
};

function catColor(cat) {
  return CAT_COLORS[cat] || "#5B625B";
}

// ---------------------------------------------------------------------------
// Recurring override toggle (shown on property-tagged transactions)
// ---------------------------------------------------------------------------

function RecurringToggle({ txn, onSave }) {
  const val = txn.is_recurring_override;
  const states  = [null, true, false];
  const labels  = { null: "auto", true: "recurring", false: "one-time" };
  const colors  = { null: "var(--ink-3)", true: "var(--income)", false: "var(--expense)" };

  async function cycle() {
    const idx  = states.findIndex(s => s === (val === null ? null : val === 1 ? true : false));
    const next = states[(idx + 1) % 3];
    await fetch(`/api/transactions/${txn.id}/recurring`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_recurring_override: next }),
    });
    onSave(txn.id, next === null ? null : next ? 1 : 0);
  }

  const key = val === null ? "null" : val === 1 ? "true" : "false";
  return (
    <button
      onClick={cycle}
      title="Toggle recurring classification"
      style={{ fontSize: 10, color: colors[key === "null" ? null : key === "true" ? true : false],
               background: "none", border: 0, cursor: "pointer", padding: "2px 4px",
               borderRadius: "var(--r-sm)" }}
    >
      {labels[key === "null" ? null : key === "true" ? true : false]}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline editable cell (shared by category and label)
// ---------------------------------------------------------------------------

function EditableChip({ value, placeholder, accentColor, onSave, chipStyle }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value || "");
  const inputRef              = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === (value || "")) { setEditing(false); return; }
    await onSave(trimmed);
    setEditing(false);
  }

  function onKeyDown(e) {
    if (e.key === "Enter")  save();
    if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={onKeyDown}
        style={{
          border: "1px solid var(--brand-400)",
          borderRadius: "var(--r-sm)",
          padding: "3px 8px",
          fontSize: 12,
          fontFamily: "var(--font-sans)",
          outline: "none",
          width: 140,
          background: "var(--paper-0)",
        }}
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value || ""); setEditing(true); }}
      title="Click to edit"
      style={{ background: "none", border: 0, cursor: "pointer", padding: 0, textAlign: "left" }}
    >
      {value
        ? <span className="cat" style={chipStyle}>{value}</span>
        : <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>{placeholder}</span>
      }
    </button>
  );
}

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

  const displayName = txn.merchant_alias || txn.custom_name || txn.name || txn.description;
  const fallback = txn.custom_name || txn.name || txn.description;

  if (editing) {
    return (
      <div>
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          placeholder={fallback}
          style={{ border: "1px solid var(--brand-400)", borderRadius: "var(--r-sm)", padding: "3px 8px", fontSize: 13, fontFamily: "var(--font-sans)", background: "var(--paper-0)", color: "var(--ink-0)", outline: "none", width: 180 }}
        />
      </div>
    );
  }

  return (
    <button onClick={startEdit} title="Click to set display name" style={{ background: "none", border: 0, cursor: "pointer", padding: 0, textAlign: "left" }}>
      <div style={{ fontWeight: 500, fontSize: 13 }}>{displayName}</div>
      {txn.merchant_alias && fallback && txn.merchant_alias !== fallback && (
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fallback}</div>
      )}
      {!txn.merchant_alias && txn.custom_name && txn.name && (
        <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{txn.name}</div>
      )}
    </button>
  );
}

function CategoryCell({ txn, categories, onSave }) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef(null);

  useEffect(() => { if (editing) selectRef.current?.focus(); }, [editing]);

  async function handleChange(e) {
    const val = e.target.value;
    setEditing(false);
    if (val === (txn.category || "")) return;
    await fetch(`/api/transactions/${txn.id}/category?category=${encodeURIComponent(val)}`, { method: "PATCH" });
    onSave(txn.id, val);
  }

  if (editing) {
    return (
      <select
        ref={selectRef}
        defaultValue={txn.category || ""}
        onChange={handleChange}
        onBlur={() => setEditing(false)}
        style={{
          border: "1px solid var(--brand-400)",
          borderRadius: "var(--r-sm)",
          padding: "3px 8px",
          fontSize: 12,
          fontFamily: "var(--font-sans)",
          background: "var(--paper-0)",
          color: "var(--ink-0)",
          outline: "none",
          cursor: "pointer",
          maxWidth: 180,
        }}
      >
        <option value="">Uncategorized</option>
        {categories.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      title="Click to change category"
      style={{ background: "none", border: 0, cursor: "pointer", padding: 0, textAlign: "left" }}
    >
      {txn.category
        ? <span className="cat">{txn.category}</span>
        : <span style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>Uncategorized</span>
      }
    </button>
  );
}

function LabelCell({ txn, labels, onSave }) {
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
// Quick rule creation modal
// ---------------------------------------------------------------------------

const qrLabelStyle = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
  fontWeight: 500,
  marginBottom: 5,
};

const qrInputStyle = {
  width: "100%",
  background: "var(--paper-0)",
  border: "1px solid var(--paper-3)",
  borderRadius: "var(--r-md)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  color: "var(--ink-0)",
  outline: "none",
  boxSizing: "border-box",
};

function QuickRuleModal({ txn, category, label, categories, labels, accounts, onClose, onCreated }) {
  const [pattern,      setPattern]      = useState((txn.name || txn.description || "").toUpperCase());
  const [cat,          setCat]          = useState(category ?? "");
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

        {/* Row 1: pattern + category + label */}
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
              list="qr-cat-list"
              value={cat}
              onChange={e => setCat(e.target.value)}
              style={qrInputStyle}
            />
            <datalist id="qr-cat-list">
              {categories.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label style={qrLabelStyle}>Label</label>
            <input
              list="qr-label-list"
              value={lbl}
              onChange={e => setLbl(e.target.value)}
              style={qrInputStyle}
              placeholder="e.g. Gym"
            />
            <datalist id="qr-label-list">
              {(labels || []).map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>

        {/* Row 2: account + amount range */}
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
// Sort header cell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Transactions() {
  const [search, setSearch]       = useState("");
  const [category, setCategory]   = useState("");
  const [account, setAccount]     = useState("");
  const [year, setYear]           = useState(null);
  const [month, setMonth]         = useState(null);
  const [sortBy, setSortBy]       = useState("date");
  const [sortDir, setSortDir]     = useState("desc");
  const [page, setPage]           = useState(0);

  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(false);

  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts]     = useState([]);
  const [labels, setLabels]         = useState([]);
  const [label, setLabel]           = useState("");
  const [years, setYears]           = useState([]);
  const [quickRule, setQuickRule]   = useState(null);
  const [applyStats, setApplyStats] = useState(null);

  // AI / NL search mode
  const [nlMode, setNlMode]         = useState(false);
  const [nlQuery, setNlQuery]       = useState("");
  const [nlResult, setNlResult]     = useState(null);
  const [nlLoading, setNlLoading]   = useState(false);

  const debouncedSearch = useDebounce(search);

  // Load filter options once
  useEffect(() => {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
    fetch("/api/accounts").then(r => r.json()).then(setAccounts);
    fetch("/api/labels").then(r => r.json()).then(setLabels);
    fetch("/api/transaction-years").then(r => r.json()).then(setYears);
  }, []);

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0); }, [debouncedSearch, category, account, label, year, month, sortBy, sortDir]);

  // Fetch transactions
  const fetchTxns = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      limit:    PAGE_SIZE,
      offset:   page * PAGE_SIZE,
      sort_by:  sortBy,
      sort_dir: sortDir,
    });

    let searchText = debouncedSearch || "";
    let parsedLabelSearch = null;
    let parsedCategory = category;

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

    if (searchText)       params.set("search",          searchText);
    if (parsedAmount)     params.set("amount_filter",   parsedAmount);
    if (parsedMerchant)   params.set("merchant_filter", parsedMerchant);
    if (parsedCategory)   params.set("category",        parsedCategory);
    if (account)          params.set("account",         account);
    if (label)            params.set("label",           label);
    if (parsedLabelSearch) params.set("label_search",   parsedLabelSearch);
    if (year) {
      const mm = month ? String(month).padStart(2, "0") : null;
      params.set("start", mm ? `${year}-${mm}-01` : `${year}-01-01`);
      params.set("end",   mm ? `${year}-${mm}-31` : `${year}-12-31`);
    }

    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(data => { setRows(data.transactions); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [debouncedSearch, category, account, label, year, month, sortBy, sortDir, page]);

  useEffect(() => { fetchTxns(); }, [fetchTxns]);

  function handleSort(col) {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function handleCategorySave(id, newCat) {
    setRows(prev => {
      const txn = prev.find(r => r.id === id);
      if (txn) setQuickRule({ txn, category: newCat });
      return prev.map(r => r.id === id ? { ...r, category: newCat, category_source: "manual" } : r);
    });
  }

  function handleMerchantSave(id, alias) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, merchant_alias: alias } : r));
  }

  function handleLabelSave(id, newLabel) {
    setRows(prev => {
      const txn = prev.find(r => r.id === id);
      if (txn && newLabel) setQuickRule({ txn, label: newLabel });
      return prev.map(r => r.id === id ? { ...r, label: newLabel } : r);
    });
    if (newLabel) {
      const newOnes = newLabel.split(",").map(s => s.trim()).filter(Boolean);
      setLabels(prev => { const s = new Set(prev); newOnes.forEach(l => s.add(l)); return [...s].sort(); });
    }
  }

  function handleRecurringSave(id, val) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, is_recurring_override: val } : r));
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="main">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Transactions</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Transactions
          </h1>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {nlMode ? (
            <form onSubmit={async e => {
              e.preventDefault();
              if (!nlQuery.trim()) return;
              setNlLoading(true); setNlResult(null);
              const res = await fetch("/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: nlQuery }) });
              const data = await res.json();
              setNlLoading(false);
              if (data.ok) setNlResult(data);
            }} style={{ display: "flex", gap: 6 }}>
              <label className="input" style={{ minWidth: 340 }}>
                <Icon name="sparkle" size={14} style={{ color: "var(--brand-400)" }} />
                <input
                  autoFocus
                  placeholder="Ask anything… e.g. dining in March over $50"
                  value={nlQuery}
                  onChange={e => setNlQuery(e.target.value)}
                />
                {nlLoading && <span style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>Thinking…</span>}
              </label>
              <button type="submit" className="btn btn-primary btn-sm" disabled={nlLoading}>Search</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setNlMode(false); setNlResult(null); setNlQuery(""); }}>
                <Icon name="x" size={13} />
              </button>
            </form>
          ) : (
            <>
              <label className="input" style={{ minWidth: 300 }}>
                <Icon name="search" size={14} />
                <input
                  placeholder="Search… label:camp category:food amount:7600 merchant:check"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch("")} style={{ color: "var(--ink-3)" }}>
                    <Icon name="x" size={13} />
                  </button>
                )}
              </label>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setNlMode(true)}
                title="AI search"
                style={{ padding: "7px 10px" }}
              >
                <Icon name="sparkle" size={14} />
              </button>
            </>
          )}
          </div>
          {years.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <div className="segmented">
                <button className={!year ? "on" : ""} onClick={() => { setYear(null); setMonth(null); }}>All</button>
                {years.map(y => (
                  <button key={y} className={year === y ? "on" : ""} onClick={() => { setYear(y); setMonth(null); }}>{y}</button>
                ))}
              </div>
              {year && (
                <div className="segmented" style={{ fontSize: 11 }}>
                  <button className={!month ? "on" : ""} onClick={() => setMonth(null)}>All</button>
                  {MONTH_NAMES.map((name, i) => (
                    <button key={i} className={month === i + 1 ? "on" : ""} onClick={() => setMonth(m => m === i + 1 ? null : i + 1)}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={selectStyle}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={account}
          onChange={e => setAccount(e.target.value)}
          style={selectStyle}
        >
          <option value="">All accounts</option>
          {accounts.map(a => (
            <option key={a.account_number} value={a.account_number}>
              {a.account_name}
            </option>
          ))}
        </select>

        <select
          value={label}
          onChange={e => setLabel(e.target.value)}
          style={selectStyle}
        >
          <option value="">All labels</option>
          {labels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {(category || account || label || search || year) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(""); setCategory(""); setAccount(""); setLabel(""); setYear(null); setMonth(null); }}
          >
            <Icon name="x" size={12} /> Clear filters
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-2)" }}>
          {loading || nlLoading ? "Loading…" : nlResult ? `${nlResult.total.toLocaleString()} results` : `${total.toLocaleString()} transactions`}
        </span>
      </div>

      {/* Apply stats banner */}
      {applyStats && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: "var(--r-md)", padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "var(--brand-700)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            Rule applied to <strong>{applyStats.rule_applied.toLocaleString()}</strong> transactions
          </span>
          <button onClick={() => setApplyStats(null)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--brand-400)" }}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* NL search result banner */}
      {nlResult && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: "var(--r-md)", padding: "10px 16px", marginBottom: 12, fontSize: 13, color: "var(--brand-700)", display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="sparkle" size={14} />
          <span>{nlResult.interpreted}</span>
          <button onClick={() => setNlResult(null)} style={{ marginLeft: "auto", color: "var(--brand-400)" }}><Icon name="x" size={13} /></button>
        </div>
      )}

      {/* Table */}
      <div className="card flush">
        <table className="tbl">
          <thead>
            <tr>
              <SortTh label="Date"     col="date"         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} style={{ width: 90 }} />
              <SortTh label="Merchant" col="name"         sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500, padding: "10px 16px" }}>Account</th>
              <SortTh label="Category" col="category"     sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              <th style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500, padding: "10px 16px" }}>Label</th>
              <SortTh label="Amount"   col="amount"       sortBy={sortBy} sortDir={sortDir} onSort={handleSort} className="num" style={{ width: 140 }} />
            </tr>
          </thead>
          <tbody>
            {(nlResult ? nlResult.transactions : rows).map(txn => {
              const isIncome = txn.amount < 0;
              return (
                <tr key={txn.id} style={{ background: isIncome ? "var(--income-soft)" : "var(--expense-soft)" }}>
                  <td className="mono" style={{ color: "var(--ink-2)", fontSize: 13 }}>{txn.date}</td>
                  <td>
                    <MerchantCell txn={txn} onSave={handleMerchantSave} />
                  </td>
                  <td style={{ fontSize: 13, color: "var(--ink-2)", whiteSpace: "nowrap" }}>
                    {txn.account_name}
                  </td>
                  <td>
                    <CategoryCell txn={txn} categories={categories} onSave={handleCategorySave} />
                    {txn.category_source === "manual" && (
                      <span style={{ fontSize: 10, color: "var(--brand-400)", marginLeft: 6 }}>edited</span>
                    )}
                    {txn.category_source === "rule" && (
                      <span style={{ fontSize: 10, color: "var(--ink-3)", marginLeft: 6 }}>rule</span>
                    )}
                  </td>
                  <td>
                    <LabelCell txn={txn} labels={labels} onSave={(id, l) => handleLabelSave(id, l)} />
                    {txn.property_id && (
                      <RecurringToggle txn={txn} onSave={handleRecurringSave} />
                    )}
                  </td>
                  <td
                    className="num money mono"
                    style={{
                      fontWeight: 500,
                      color: isIncome ? "var(--income)" : "var(--expense)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(txn.amount)}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", color: "var(--ink-3)", padding: 40 }}>
                  No transactions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            <Icon name="arrowUp" size={13} /> Prev
          </button>
          <span style={{ fontSize: 13, color: "var(--ink-2)" }}>
            Page {page + 1} of {totalPages}
          </span>
          <button
            className="btn btn-secondary btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            Next <Icon name="arrowDown" size={13} />
          </button>
        </div>
      )}
      {/* Quick rule modal */}
      {quickRule && (
        <QuickRuleModal
          txn={quickRule.txn}
          category={quickRule.category}
          label={quickRule.label}
          categories={categories}
          labels={labels}
          accounts={accounts}
          onClose={() => setQuickRule(null)}
          onCreated={stats => { setApplyStats(stats); fetchTxns(); }}
        />
      )}
    </main>
  );
}

const selectStyle = {
  appearance: "none",
  background: "var(--paper-0)",
  border: "1px solid var(--paper-3)",
  borderRadius: "var(--r-md)",
  padding: "7px 32px 7px 12px",
  fontSize: 13,
  color: "var(--ink-1)",
  fontFamily: "var(--font-sans)",
  cursor: "pointer",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A908A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 10px center",
};
