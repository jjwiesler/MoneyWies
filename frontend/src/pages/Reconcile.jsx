import { useState, useRef } from "react";
import Icon from "../components/Icon.jsx";

function fmt(amount) {
  return `$${Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function displayName(txn) {
  return txn.merchant_alias || txn.custom_name || txn.name || txn.description || "—";
}

const MATCH_TYPE_CONFIG = {
  confident:      { label: "Matched",          bg: "var(--income-soft)",  color: "var(--income)",   defaultChecked: true  },
  ambiguous:      { label: "Ambiguous",         bg: "var(--warn-soft,#fff8e1)", color: "var(--warn,#b45309)", defaultChecked: false },
  unmatched:      { label: "No match",          bg: "var(--paper-1)",     color: "var(--ink-3)",    defaultChecked: false },
  already_matched:{ label: "Already reconciled",bg: "var(--warn-soft,#fff8e1)", color: "var(--warn,#b45309)", defaultChecked: false },
};

function MatchRow({ item, checked, onCheck, aliasValue, onAliasChange, selectedCandidate, onCandidateChange }) {
  const cfg = MATCH_TYPE_CONFIG[item.match_type] || MATCH_TYPE_CONFIG.unmatched;
  const isDisabled = item.match_type === "unmatched";
  const isAmbiguous = item.match_type === "ambiguous";
  const isAlreadyMatched = item.match_type === "already_matched";

  const bankMatch = isAmbiguous
    ? (selectedCandidate ? item.candidates.find(c => c.id === selectedCandidate) : null)
    : item.bank_match;

  return (
    <tr style={{ borderBottom: "1px solid var(--paper-2)", opacity: isDisabled ? 0.5 : 1 }}>
      {/* Checkbox */}
      <td style={{ padding: "10px 12px", width: 36, verticalAlign: "middle" }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={isDisabled || (isAmbiguous && !selectedCandidate)}
          onChange={e => onCheck(e.target.checked)}
          style={{ cursor: isDisabled ? "default" : "pointer" }}
        />
      </td>

      {/* Status badge */}
      <td style={{ padding: "10px 8px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: "var(--r-sm)",
          background: cfg.bg, color: cfg.color
        }}>
          {cfg.label}
        </span>
      </td>

      {/* Date + Amount */}
      <td style={{ padding: "10px 8px", fontFamily: "var(--font-mono)", fontSize: 12, verticalAlign: "middle", whiteSpace: "nowrap" }}>
        {item.stmt.date}
      </td>
      <td style={{ padding: "10px 8px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, verticalAlign: "middle", whiteSpace: "nowrap",
        color: item.stmt.direction === "in" ? "var(--income)" : "var(--expense,#dc2626)" }}>
        {item.stmt.direction === "in" ? "+" : "−"}{fmt(item.stmt.amount)}
      </td>

      {/* Note / counterparty */}
      <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--ink-1)", verticalAlign: "middle", maxWidth: 180 }}>
        <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.stmt.note !== "(no note)" ? item.stmt.note : <span style={{ color: "var(--ink-3)" }}>(no note)</span>}
        </div>
        {(item.stmt.from_name || item.stmt.to_name) && (
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
            {item.stmt.direction === "out" ? `→ ${item.stmt.to_name}` : `← ${item.stmt.from_name}`}
          </div>
        )}
      </td>

      {/* Proposed alias (editable) */}
      <td style={{ padding: "10px 8px", verticalAlign: "middle", minWidth: 200 }}>
        {isAlreadyMatched && (
          <div style={{ fontSize: 10, color: "var(--warn,#b45309)", marginBottom: 3 }}>
            Existing: {item.bank_match?.merchant_alias}
          </div>
        )}
        <input
          type="text"
          value={aliasValue}
          onChange={e => onAliasChange(e.target.value)}
          disabled={isDisabled}
          style={{
            width: "100%", fontSize: 12, padding: "4px 7px",
            border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)",
            background: isDisabled ? "var(--paper-1)" : "var(--paper-0)",
            color: "var(--ink-1)", fontFamily: "inherit",
          }}
        />
      </td>

      {/* Bank match */}
      <td style={{ padding: "10px 8px", fontSize: 12, color: "var(--ink-2)", verticalAlign: "middle", minWidth: 200 }}>
        {isAmbiguous ? (
          <select
            value={selectedCandidate || ""}
            onChange={e => onCandidateChange(e.target.value || null)}
            style={{
              fontSize: 12, padding: "4px 7px", borderRadius: "var(--r-sm)",
              border: "1px solid var(--paper-3)", background: "var(--paper-0)",
              color: "var(--ink-1)", width: "100%",
            }}
          >
            <option value="">Pick a match…</option>
            {item.candidates.map(c => (
              <option key={c.id} value={c.id}>
                {c.date} · {displayName(c)} · {fmt(c.amount)}
              </option>
            ))}
          </select>
        ) : bankMatch ? (
          <div>
            <div style={{ fontWeight: 500, color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName(bankMatch)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{bankMatch.date} · {fmt(bankMatch.amount)}</div>
          </div>
        ) : (
          <span style={{ color: "var(--ink-3)", fontStyle: "italic" }}>No match found</span>
        )}
      </td>
    </tr>
  );
}

export default function Reconcile() {
  const [dragging, setDragging]         = useState(false);
  const [stage, setStage]               = useState(null); // null | "loading" | "reviewing" | "applying" | "done"
  const [matches, setMatches]           = useState([]);
  const [checked, setChecked]           = useState({});     // stmt.id → bool
  const [aliases, setAliases]           = useState({});     // stmt.id → string
  const [candidates, setCandidates]     = useState({});     // stmt.id → bank txn id
  const [error, setError]               = useState(null);
  const [applyResult, setApplyResult]   = useState(null);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setStage("loading"); setMatches([]); setError(null); setApplyResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch("/api/reconcile/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Preview failed");

      setMatches(data);

      // Initialize checked / aliases
      const initChecked = {};
      const initAliases = {};
      const initCandidates = {};
      for (const item of data) {
        const cfg = MATCH_TYPE_CONFIG[item.match_type];
        initChecked[item.stmt.id]    = cfg?.defaultChecked ?? false;
        initAliases[item.stmt.id]    = item.stmt.proposed_alias;
        initCandidates[item.stmt.id] = null;
      }
      setChecked(initChecked);
      setAliases(initAliases);
      setCandidates(initCandidates);
      setStage("reviewing");
    } catch (e) {
      setError(e.message);
      setStage(null);
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function selectAll() {
    const next = { ...checked };
    for (const item of matches) {
      if (item.match_type === "unmatched") continue;
      if (item.match_type === "ambiguous" && !candidates[item.stmt.id]) continue;
      next[item.stmt.id] = true;
    }
    setChecked(next);
  }

  function deselectAll() {
    const next = {};
    for (const item of matches) next[item.stmt.id] = false;
    setChecked(next);
  }

  function resolveCandidate(stmtId, bankId) {
    setCandidates(prev => ({ ...prev, [stmtId]: bankId }));
    if (bankId) setChecked(prev => ({ ...prev, [stmtId]: true }));
  }

  async function applyAliases() {
    const items = [];
    for (const item of matches) {
      if (!checked[item.stmt.id]) continue;
      const bankId = item.match_type === "ambiguous"
        ? candidates[item.stmt.id]
        : item.bank_match?.id;
      if (!bankId) continue;
      items.push({
        txn_id: bankId,
        merchant_alias: aliases[item.stmt.id] || item.stmt.proposed_alias,
        force: item.match_type === "already_matched",
      });
    }
    if (!items.length) return;
    setStage("applying");
    try {
      const res  = await fetch("/api/reconcile/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Apply failed");
      setApplyResult(data);
      setStage("done");
    } catch (e) {
      setError(e.message);
      setStage("reviewing");
    }
  }

  // Summary counts
  const counts = matches.reduce((acc, m) => {
    acc[m.match_type] = (acc[m.match_type] || 0) + 1;
    return acc;
  }, {});
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="page-content">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Reconcile</h1>
        <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "4px 0 0" }}>
          Upload a Venmo or PayPal CSV to enrich merchant names on matched bank transactions.
        </p>
      </div>

      {error && (
        <div style={{ background: "var(--danger-soft,#fee2e2)", border: "1px solid var(--danger,#dc2626)", borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 13, color: "var(--danger,#dc2626)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="x" size={14} /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {stage === "done" && applyResult && (
        <div style={{ background: "var(--income-soft)", border: "1px solid var(--income)", borderRadius: "var(--r-md)", padding: "10px 14px", fontSize: 13, color: "var(--income)", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="check" size={14} />
          Applied {applyResult.updated} alias{applyResult.updated !== 1 ? "es" : ""}.
          {applyResult.skipped > 0 && ` ${applyResult.skipped} skipped (already set).`}
          <button onClick={() => { setStage(null); setMatches([]); setApplyResult(null); }} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: "inherit" }}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {/* Drop zone — always visible unless reviewing */}
      {stage !== "reviewing" && stage !== "applying" && (
        <div
          onDragEnter={e => { e.preventDefault(); setDragging(true); }}
          onDragOver={e => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? "var(--brand-400)" : "var(--paper-3)"}`,
            borderRadius: "var(--r-lg)",
            background: dragging ? "var(--brand-50,#f0f4ff)" : "var(--paper-1)",
            padding: "40px 20px",
            textAlign: "center",
            cursor: "pointer",
            transition: "border-color 0.15s, background 0.15s",
            marginBottom: 20,
          }}
        >
          {stage === "loading" ? (
            <div style={{ color: "var(--ink-2)", fontSize: 14 }}>Parsing file…</div>
          ) : (
            <>
              <Icon name="import" size={28} style={{ color: "var(--ink-3)", marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-1)", marginBottom: 4 }}>
                Drop a Venmo or PayPal CSV
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                Venmo: download from Venmo app → Me → Statement · PayPal: Activity → Download
              </div>
            </>
          )}
          <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={e => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; }} />
        </div>
      )}

      {/* Results table */}
      {(stage === "reviewing" || stage === "applying") && matches.length > 0 && (
        <div style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-lg)", overflow: "hidden", background: "var(--paper-0)" }}>
          {/* Summary bar */}
          <div style={{ padding: "12px 16px", background: "var(--paper-1)", borderBottom: "1px solid var(--paper-3)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            {counts.confident     > 0 && <Chip color="var(--income)"  label={`${counts.confident} matched`} />}
            {counts.already_matched > 0 && <Chip color="var(--warn,#b45309)" label={`${counts.already_matched} already reconciled`} />}
            {counts.ambiguous     > 0 && <Chip color="var(--warn,#b45309)" label={`${counts.ambiguous} ambiguous`} />}
            {counts.unmatched     > 0 && <Chip color="var(--ink-3)"   label={`${counts.unmatched} unmatched`} />}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <button className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
              <button className="btn btn-ghost btn-sm" onClick={deselectAll}>Deselect all</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStage(null); setMatches([]); }}>
                ← Upload new file
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--paper-1)", borderBottom: "1px solid var(--paper-3)" }}>
                  {["", "Status", "Date", "Amount", "Note / Party", "Proposed Alias", "Bank Transaction"].map(h => (
                    <th key={h} style={{ padding: "8px 8px", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--ink-3)", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matches.map(item => (
                  <MatchRow
                    key={item.stmt.id}
                    item={item}
                    checked={!!checked[item.stmt.id]}
                    onCheck={v => setChecked(prev => ({ ...prev, [item.stmt.id]: v }))}
                    aliasValue={aliases[item.stmt.id] ?? item.stmt.proposed_alias}
                    onAliasChange={v => setAliases(prev => ({ ...prev, [item.stmt.id]: v }))}
                    selectedCandidate={candidates[item.stmt.id]}
                    onCandidateChange={v => resolveCandidate(item.stmt.id, v)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--paper-3)", background: "var(--paper-1)", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--ink-2)", marginRight: "auto" }}>
              {checkedCount} selected
            </span>
            <button
              className="btn btn-primary btn-sm"
              disabled={checkedCount === 0 || stage === "applying"}
              onClick={applyAliases}
            >
              {stage === "applying" ? "Applying…" : `Apply ${checkedCount} alias${checkedCount !== 1 ? "es" : ""}`}
            </button>
          </div>
        </div>
      )}

      {stage === "reviewing" && matches.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--ink-3)", padding: 40, fontSize: 14 }}>
          No transactions parsed from this file.
        </div>
      )}
    </div>
  );
}

function Chip({ color, label }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
