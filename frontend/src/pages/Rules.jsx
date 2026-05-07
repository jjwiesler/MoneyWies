import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Icon from "../components/Icon.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const BLANK_FORM = {
  pattern: "",
  category: "",
  sub_category: "",  // kept for API compat, not shown in form
  label: "",
  scope_institution: "",
  scope_account: "",
  amount_min: "",
  amount_max: "",
};

// ---------------------------------------------------------------------------
// Rule form (create + edit)
// ---------------------------------------------------------------------------

function RuleForm({ initial = BLANK_FORM, categories, labels, accounts, onSave, onCancel, applyStats }) {
  const [form, setForm] = useState(initial);
  const [previewCount, setPreviewCount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const debouncedPattern  = useDebounce(form.pattern);
  const debouncedAmtMin   = useDebounce(form.amount_min);
  const debouncedAmtMax   = useDebounce(form.amount_max);

  // Live preview count — fires whenever any condition changes
  useEffect(() => {
    const hasCondition = debouncedPattern.trim() || form.scope_account || form.amount_min || form.amount_max;
    if (!hasCondition) { setPreviewCount(null); return; }
    const params = new URLSearchParams({ limit: 1 });
    if (debouncedPattern)       params.set("pattern",           debouncedPattern);
    if (form.scope_institution) params.set("scope_institution", form.scope_institution);
    if (form.scope_account)     params.set("scope_account",     form.scope_account);
    if (debouncedAmtMin)        params.set("amount_min",        debouncedAmtMin);
    if (debouncedAmtMax)        params.set("amount_max",        debouncedAmtMax);
    fetch(`/api/rules/preview?${params}`)
      .then(r => r.json())
      .then(d => setPreviewCount(d.total_matches));
  }, [debouncedPattern, form.scope_institution, form.scope_account, debouncedAmtMin, debouncedAmtMax]);

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.category.trim() && !form.label.trim()) return;
    if (!form.pattern.trim() && !form.scope_account && !form.amount_min && !form.amount_max) return;
    setSaving(true);
    const body = {
      pattern:           form.pattern.trim(),
      category:          form.category.trim()          || null,
      sub_category:      form.sub_category.trim()      || null,
      label:             form.label.trim()             || null,
      scope_institution: form.scope_institution.trim() || null,
      scope_account:     form.scope_account.trim()     || null,
      amount_min:        form.amount_min !== "" ? parseFloat(form.amount_min) : null,
      amount_max:        form.amount_max !== "" ? parseFloat(form.amount_max) : null,
    };
    setSaveError(null);
    try {
      await onSave(body);
    } catch (err) {
      setSaveError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ background: "var(--paper-0)", border: "1px solid var(--paper-3)", borderRadius: "var(--r-lg)", padding: 20, marginBottom: 16 }}>

      {/* Row 1: outputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Category <span style={{ color: "var(--ink-3)" }}>(or label)</span></label>
          <input
            autoFocus
            list="cat-list"
            value={form.category}
            onChange={e => set("category", e.target.value)}
            placeholder="e.g. Groceries"
            style={inputStyle}
          />
          <datalist id="cat-list">
            {categories.map(c => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Label <span style={{ color: "var(--ink-3)" }}>(optional)</span></label>
          <input list="rule-label-list" value={form.label} onChange={e => set("label", e.target.value)} placeholder="e.g. household, tax-deductible" style={inputStyle} />
          <datalist id="rule-label-list">
            {(labels || []).map(l => <option key={l} value={l} />)}
          </datalist>
        </div>
      </div>

      {/* Divider */}
      <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>
        Conditions <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— all must match (AND logic)</span>
      </div>

      {/* Row 2: conditions */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>Pattern <span style={{ color: "var(--ink-3)" }}>(optional)</span></label>
          <input
            value={form.pattern}
            onChange={e => set("pattern", e.target.value)}
            placeholder="e.g. WHOLE FOODS"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)", textTransform: "uppercase" }}
          />
        </div>
        <div>
          <label style={labelStyle}>Amount min $</label>
          <input
            type="number" min="0" step="0.01"
            value={form.amount_min}
            onChange={e => set("amount_min", e.target.value)}
            placeholder="0.00"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
          />
        </div>
        <div>
          <label style={labelStyle}>Amount max $</label>
          <input
            type="number" min="0" step="0.01"
            value={form.amount_max}
            onChange={e => set("amount_max", e.target.value)}
            placeholder="any"
            style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
          />
        </div>
        <div>
          <label style={labelStyle}>Account #</label>
          <input
            list="acct-list"
            value={form.scope_account}
            onChange={e => set("scope_account", e.target.value)}
            placeholder="e.g. ··8526"
            style={inputStyle}
          />
          <datalist id="acct-list">
            {accounts.map(a => <option key={a.account_number} value={a.account_number}>{a.account_name}</option>)}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Institution</label>
          <input value={form.scope_institution} onChange={e => set("scope_institution", e.target.value)} placeholder="e.g. Bank of America" style={inputStyle} />
        </div>
      </div>

      {/* Preview + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {previewCount !== null && (
          <span style={{ fontSize: 13, color: previewCount > 0 ? "var(--income)" : "var(--ink-3)" }}>
            {previewCount > 0 ? `Matches ${previewCount.toLocaleString()} transactions` : "No matches"}
          </span>
        )}
        {applyStats && (
          <span style={{ fontSize: 12, color: "var(--brand-400)" }}>
            Applied to {applyStats.rule_applied.toLocaleString()} transactions
          </span>
        )}
        {saveError && (
          <span style={{ fontSize: 12, color: "var(--danger)", marginRight: 8 }}>{saveError}</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// AI: NL rule suggestion modal
// ---------------------------------------------------------------------------

function NLRuleModal({ categories, accounts, onClose, onCreated }) {
  const [desc, setDesc]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError]       = useState(null);
  const [saving, setSaving]     = useState(false);

  async function suggest(e) {
    e.preventDefault();
    setLoading(true); setError(null); setSuggestion(null);
    const res = await fetch("/api/ai/suggest-rule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: desc }),
    });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) { setError(data.error || "AI error"); return; }
    setSuggestion(data);
  }

  async function approve() {
    setSaving(true);
    const body = {
      pattern: suggestion.pattern, category: suggestion.category,
      sub_category: suggestion.sub_category || null,
      scope_institution: null, scope_account: null,
    };
    const res = await fetch("/api/rules", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    onCreated(data);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,21,16,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div style={{ background: "var(--paper-0)", borderRadius: "var(--r-xl)", border: "1px solid var(--paper-3)", boxShadow: "var(--shadow-lg)", padding: 28, width: 520, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <Icon name="sparkle" size={18} />
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>AI Rule Creator</div>
          <button onClick={onClose} style={{ marginLeft: "auto", color: "var(--ink-3)" }}><Icon name="x" size={18} /></button>
        </div>

        <form onSubmit={suggest} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            autoFocus value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="e.g. Tag all Whole Foods purchases as Groceries"
            style={{ flex: 1, ...inputStyle }}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            {loading ? "Thinking…" : "Generate"}
          </button>
        </form>

        {error && <div style={{ fontSize: 13, color: "var(--expense)", marginBottom: 12 }}>{error}</div>}

        {suggestion && (
          <div style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-md)", padding: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 10, fontWeight: 500 }}>AI suggestion</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span className="mono" style={{ background: "var(--paper-2)", padding: "3px 8px", borderRadius: 4, fontSize: 13 }}>{suggestion.pattern}</span>
              <Icon name="arrowRight" size={14} />
              <span style={{ fontWeight: 500 }}>{suggestion.category}</span>
              {suggestion.sub_category && <span style={{ color: "var(--ink-2)", fontSize: 12 }}>· {suggestion.sub_category}</span>}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 14 }}>{suggestion.explanation}</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setSuggestion(null)}>Try again</button>
              <button className="btn btn-primary btn-sm" onClick={approve} disabled={saving}>
                {saving ? "Creating…" : "Create rule"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI: Bulk categorize modal
// ---------------------------------------------------------------------------

function BulkCategorizeModal({ onClose, onDone }) {
  const [suggestions, setSuggestions] = useState(null);
  const [loading, setLoading]         = useState(true);
  const [approved, setApproved]       = useState(new Set());
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    fetch("/api/ai/bulk-categorize", { method: "POST" })
      .then(r => r.json())
      .then(data => { setSuggestions(data); setLoading(false); })
      .catch(() => { setError("AI request failed"); setLoading(false); });
  }, []);

  function toggle(i) {
    setApproved(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function createApproved() {
    setSaving(true);
    const toCreate = [...approved].map(i => suggestions[i]);
    for (const s of toCreate) {
      await fetch("/api/rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: s.pattern, category: s.category, sub_category: s.sub_category || null, scope_institution: null, scope_account: null }),
      });
    }
    setSaving(false);
    onDone(approved.size);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(16,21,16,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div style={{ background: "var(--paper-0)", borderRadius: "var(--r-xl)", border: "1px solid var(--paper-3)", boxShadow: "var(--shadow-lg)", padding: 28, width: 620, maxWidth: "92vw", maxHeight: "85vh", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Icon name="sparkle" size={18} />
          <div style={{ fontWeight: 600, fontSize: 17 }}>Bulk Categorize</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 4 }}>AI suggestions for uncategorized transactions</div>
          <button onClick={onClose} style={{ marginLeft: "auto", color: "var(--ink-3)" }}><Icon name="x" size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Analyzing uncategorized transactions…</div>}
          {error   && <div style={{ padding: 20, color: "var(--expense)", fontSize: 13 }}>{error}</div>}
          {suggestions && suggestions.length === 0 && <div style={{ padding: 20, color: "var(--ink-3)", fontSize: 13 }}>No uncategorized transactions found.</div>}
          {suggestions?.map((s, i) => (
            <div key={i} onClick={() => toggle(i)} style={{
              display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 4px",
              borderBottom: "1px solid var(--paper-3)", cursor: "pointer",
              background: approved.has(i) ? "var(--brand-50)" : "transparent",
              borderRadius: "var(--r-sm)",
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: approved.has(i) ? "var(--brand-700)" : "var(--paper-2)",
                display: "grid", placeItems: "center",
              }}>
                {approved.has(i) && <Icon name="check" size={11} style={{ color: "#fff" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span className="mono" style={{ background: "var(--paper-2)", padding: "2px 7px", borderRadius: 4, fontSize: 12 }}>{s.pattern}</span>
                  <Icon name="arrowRight" size={12} />
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{s.category}</span>
                  {s.sub_category && <span style={{ fontSize: 12, color: "var(--ink-2)" }}>· {s.sub_category}</span>}
                  {s.txn_count && <span className="pill" style={{ fontSize: 11, padding: "1px 7px", marginLeft: "auto" }}>{s.txn_count} txns</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{s.reasoning}</div>
              </div>
            </div>
          ))}
        </div>

        {suggestions?.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--paper-3)" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setApproved(new Set(suggestions.map((_, i) => i)))}>Select all</button>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={createApproved} disabled={saving || approved.size === 0}>
                {saving ? "Creating…" : `Create ${approved.size} rule${approved.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable rule row
// ---------------------------------------------------------------------------

function RuleRow({ rule, index, onEdit, onDelete, onRun, isRunning }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: rule.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "grid",
    gridTemplateColumns: "28px 20px 1fr auto 1fr auto auto auto",
    alignItems: "center",
    gap: 10,
    padding: "11px 16px",
    borderBottom: "1px solid var(--paper-2)",
    background: "var(--paper-0)",
    fontSize: 13,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        style={{ background: "none", border: 0, cursor: "grab", color: "var(--ink-3)", padding: 0, display: "flex", touchAction: "none" }}
        title="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <rect x="2" y="2" width="4" height="2" rx="1"/>
          <rect x="2" y="6" width="4" height="2" rx="1"/>
          <rect x="2" y="10" width="4" height="2" rx="1"/>
          <rect x="8" y="2" width="4" height="2" rx="1"/>
          <rect x="8" y="6" width="4" height="2" rx="1"/>
          <rect x="8" y="10" width="4" height="2" rx="1"/>
        </svg>
      </button>

      {/* Priority */}
      <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
        {String(index + 1).padStart(2, "0")}
      </span>

      {/* Pattern */}
      <span className="mono" style={{ fontSize: 12, padding: "2px 8px", background: "var(--paper-2)", borderRadius: "var(--r-xs)", width: "fit-content" }}>
        {rule.pattern}
      </span>

      <Icon name="arrowRight" size={12} style={{ color: "var(--ink-3)" }} />

      {/* Category + label */}
      <div>
        {rule.category && <span style={{ fontWeight: 500 }}>{rule.category}</span>}
        {rule.sub_category && (
          <span style={{ color: "var(--ink-2)", marginLeft: 6, fontSize: 12 }}>· {rule.sub_category}</span>
        )}
        {rule.label && (
          <span style={{ marginLeft: rule.category ? 8 : 0, fontSize: 11, padding: "1px 6px", background: "var(--paper-2)", borderRadius: "var(--r-xs)", color: "var(--ink-2)" }}>
            {rule.label}
          </span>
        )}
        {(rule.scope_institution || rule.scope_account || rule.amount_min != null || rule.amount_max != null) && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {rule.amount_min != null && rule.amount_max != null && rule.amount_min === rule.amount_max && (
              <span>= ${rule.amount_min.toLocaleString()}</span>
            )}
            {(rule.amount_min != null || rule.amount_max != null) && !(rule.amount_min === rule.amount_max && rule.amount_min != null) && (
              <span>
                {rule.amount_min != null ? `$${rule.amount_min.toLocaleString()}` : "$0"}
                {" – "}
                {rule.amount_max != null ? `$${rule.amount_max.toLocaleString()}` : "∞"}
              </span>
            )}
            {rule.scope_account && <span>acct ··{rule.scope_account}</span>}
            {rule.scope_institution && <span>{rule.scope_institution}</span>}
          </div>
        )}
      </div>

      {/* Run */}
      <button className="btn btn-ghost btn-sm" onClick={() => onRun(rule)} disabled={isRunning}
              style={{ padding: "4px 8px", color: "var(--income)", opacity: isRunning ? 0.6 : 1 }}
              title="Apply this rule to all transactions now">
        {isRunning ? "Running…" : "Run"}
      </button>

      {/* Edit */}
      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(rule)} style={{ padding: "4px 8px" }}>
        Edit
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(rule)}
        style={{ background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 4 }}
        title="Delete rule"
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Rules() {
  const [rules, setRules]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [labels,     setLabels]     = useState([]);
  const [accounts, setAccounts]   = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [editRule, setEditRule]   = useState(null);
  const [applyStats, setApplyStats] = useState(null);
  const [runningId, setRunningId]   = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showNLModal, setShowNLModal]     = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadRules = useCallback(() =>
    fetch("/api/rules").then(r => r.json()).then(setRules), []);

  useEffect(() => {
    loadRules();
    fetch("/api/categories").then(r => r.json()).then(setCategories);
    fetch("/api/labels").then(r => r.json()).then(setLabels);
    fetch("/api/accounts").then(r => r.json()).then(setAccounts);
  }, []);

  async function handleSave(body) {
    let res;
    if (editRule?.id) {
      res = await fetch(`/api/rules/${editRule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      res = await fetch("/api/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Save failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    setApplyStats(data.apply_stats);
    setShowForm(false);
    setEditRule(null);
    loadRules();
  }

  async function handleRun(rule) {
    setRunningId(rule.id);
    try {
      const res  = await fetch(`/api/rules/${rule.id}/apply`, { method: "POST" });
      const data = await res.json();
      setApplyStats(data.apply_stats);
    } finally {
      setRunningId(null);
    }
  }

  async function handleDelete(rule) {
    const res  = await fetch(`/api/rules/${rule.id}`, { method: "DELETE" });
    const data = await res.json();
    setApplyStats(data.apply_stats);
    setConfirmDelete(null);
    loadRules();
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = rules.findIndex(r => r.id === active.id);
    const newIndex = rules.findIndex(r => r.id === over.id);
    const reordered = arrayMove(rules, oldIndex, newIndex);
    setRules(reordered); // optimistic

    await fetch("/api/rules/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordered_ids: reordered.map(r => r.id) }),
    }).then(r => r.json()).then(d => setApplyStats(d.apply_stats));
  }

  function openNew() { setEditRule(null); setShowForm(true); setApplyStats(null); }
  function openEdit(rule) { setEditRule(rule); setShowForm(true); setApplyStats(null); }
  function closeForm() { setShowForm(false); setEditRule(null); }

  return (
    <main className="main">
      {/* Topbar */}
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Rules</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Rules
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkModal(true)}>
            <Icon name="sparkle" size={13} /> Bulk categorize
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNLModal(true)}>
            <Icon name="sparkle" size={13} /> AI suggest
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            <Icon name="plus" size={14} /> New rule
          </button>
        </div>
      </div>

      {/* Apply stats banner */}
      {applyStats && (
        <div style={{ background: "var(--brand-50)", border: "1px solid var(--brand-100)", borderRadius: "var(--r-md)", padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--brand-700)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>
            Applied to <strong>{applyStats.rule_applied.toLocaleString()}</strong> transactions · {applyStats.reset_to_imported.toLocaleString()} reset to imported category
          </span>
          <button onClick={() => setApplyStats(null)} style={{ background: "none", border: 0, cursor: "pointer", color: "var(--brand-400)" }}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}

      {/* Rule form */}
      {showForm && (
        <RuleForm
          initial={editRule ? {
            pattern:           editRule.pattern           || "",
            category:          editRule.category          || "",
            sub_category:      editRule.sub_category      || "",  // preserved but not shown
            label:             editRule.label             || "",
            scope_institution: editRule.scope_institution || "",
            scope_account:     editRule.scope_account     || "",
            amount_min:        editRule.amount_min != null ? String(editRule.amount_min) : "",
            amount_max:        editRule.amount_max != null ? String(editRule.amount_max) : "",
          } : BLANK_FORM}
          categories={categories}
          labels={labels}
          accounts={accounts}
          onSave={handleSave}
          onCancel={closeForm}
          applyStats={applyStats}
        />
      )}

      {/* Rules list */}
      <div className="card flush">
        {/* Header */}
        <div className="card-head">
          <div>
            <div className="card-title">Rules</div>
            <div className="card-sub">
              {rules.length} rule{rules.length !== 1 ? "s" : ""} · highest priority wins conflicts · applied retroactively
            </div>
          </div>
        </div>

        {rules.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No rules yet. Create one to start auto-categorizing transactions.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rules.map(r => r.id)} strategy={verticalListSortingStrategy}>
              {rules.map((rule, i) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  index={i}
                  onEdit={openEdit}
                  onRun={handleRun}
                  isRunning={runningId === rule.id}
                  onDelete={r => setConfirmDelete(r)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* AI modals */}
      {showNLModal && (
        <NLRuleModal
          categories={categories}
          accounts={accounts}
          onClose={() => setShowNLModal(false)}
          onCreated={data => { setApplyStats(data.apply_stats); loadRules(); }}
        />
      )}
      {showBulkModal && (
        <BulkCategorizeModal
          onClose={() => setShowBulkModal(false)}
          onDone={count => {
            fetch("/api/rules/reorder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordered_ids: [] }) })
              .catch(() => {});
            fetch("/api/rules").then(r => r.json()).then(setRules);
          }}
        />
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(16,21,16,0.4)", display: "grid", placeItems: "center", zIndex: 50 }}>
          <div style={{ background: "var(--paper-0)", border: "1px solid var(--paper-3)", borderRadius: "var(--r-lg)", padding: 28, width: 360, boxShadow: "var(--shadow-lg)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Delete rule?</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 20 }}>
              <span className="mono" style={{ background: "var(--paper-2)", padding: "1px 6px", borderRadius: 3 }}>{confirmDelete.pattern}</span>
              {" → "}{confirmDelete.category}
              <br />
              <span style={{ marginTop: 6, display: "block" }}>Affected transactions will revert to their imported category.</span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn btn-sm"
                style={{ background: "var(--expense)", color: "#fff", borderColor: "transparent" }}
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const labelStyle = {
  display: "block",
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--ink-2)",
  fontWeight: 500,
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  background: "var(--paper-0)",
  border: "1px solid var(--paper-3)",
  borderRadius: "var(--r-md)",
  padding: "7px 10px",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  color: "var(--ink-0)",
  outline: "none",
};
