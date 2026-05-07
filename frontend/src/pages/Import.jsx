import { useState, useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";

function ImportResult({ result, mode = "complete", onDismiss, onConfirm, onCancel, confirming }) {
  const hasNew = result.inserted > 0;
  const isPreview = mode === "preview";

  const headerText = isPreview
    ? (hasNew ? `Preview · ${result.inserted} new transaction${result.inserted !== 1 ? "s" : ""}` : "Preview · no new transactions")
    : (hasNew ? "Import complete" : "Import complete — no new transactions");

  return (
    <div style={{ border: "1px solid var(--brand-200)", borderRadius: "var(--r-lg)", background: "var(--paper-0)", marginBottom: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: isPreview ? "var(--paper-2)" : "var(--income-soft)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name={isPreview ? "info" : "check"} size={15} style={{ color: isPreview ? "var(--ink-2)" : "var(--income)", flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: isPreview ? "var(--ink-1)" : "var(--income)" }}>
          {headerText}
        </span>
        {result.date_range && (
          <span style={{ fontSize: 12, color: "var(--ink-2)", marginLeft: 4 }}>
            · {result.date_range.from} → {result.date_range.to}
          </span>
        )}
        {!isPreview && (
          <button onClick={onDismiss} style={{ marginLeft: "auto", background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)" }}>
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      <div style={{ padding: "14px 16px" }}>
        {/* Top stat row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: hasNew ? 16 : 0 }}>
          {[
            { label: "New transactions", value: result.inserted,    color: result.inserted > 0 ? "var(--income)" : "var(--ink-2)" },
            { label: "Duplicates skipped", value: result.duplicates, color: "var(--ink-2)" },
            { label: "Rule-categorized",  value: result.rule_matched,  color: "var(--brand-700)" },
            { label: "Used import category", value: result.uncategorized, color: "var(--ink-3)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "var(--paper-1)", borderRadius: "var(--r-md)", padding: "10px 12px", textAlign: "center", border: "1px solid var(--paper-3)" }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-mono)", color, lineHeight: 1 }}>{value ?? 0}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.3 }}>{label}</div>
            </div>
          ))}
        </div>

        {hasNew && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {/* By account */}
            {result.by_account?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>By account</div>
                {result.by_account.map(row => (
                  <div key={row.account} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--paper-2)", fontSize: 12 }}>
                    <span style={{ color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "75%" }}>{row.account}</span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)", flexShrink: 0 }}>{row.count}</span>
                  </div>
                ))}
              </div>
            )}

            {/* By category */}
            {result.by_category?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)", fontWeight: 500, marginBottom: 8 }}>By category</div>
                {result.by_category.map(row => (
                  <div key={row.category} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--paper-2)", fontSize: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", minWidth: 0 }}>
                      <span style={{ color: "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.category}</span>
                      <span style={{ fontSize: 10, color: row.source === "rule" ? "var(--brand-400)" : "var(--ink-3)", flexShrink: 0 }}>
                        {row.source === "rule" ? "rule" : row.source === "manual" ? "manual" : "imported"}
                      </span>
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", color: "var(--ink-2)", flexShrink: 0 }}>{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!hasNew && result.duplicates > 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="info" size={13} />
            All {result.duplicates.toLocaleString()} rows already exist — no changes made.
          </div>
        )}

        {hasNew && result.uncategorized > 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 12, display: "flex", alignItems: "center", gap: 6, paddingTop: 12, borderTop: "1px solid var(--paper-2)" }}>
            <Icon name="info" size={13} style={{ flexShrink: 0 }} />
            {result.uncategorized} transaction{result.uncategorized !== 1 ? "s" : ""} {isPreview ? "will fall back to their imported category." : "fell back to their imported category. Add rules on the Rules page to auto-categorize them next time."}
          </div>
        )}
      </div>

      {isPreview && (
        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--paper-3)", display: "flex", gap: 8, justifyContent: "flex-end", background: "var(--paper-1)" }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={confirming}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm} disabled={confirming || !hasNew}>
            {confirming ? "Importing…" : `Import ${result.inserted} transaction${result.inserted !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Import() {
  const [log,      setLog]      = useState([]);
  const [dragging, setDragging] = useState(false);
  const [stage,       setStage]       = useState(null); // null | "previewing" | "preview" | "confirming" | "complete"
  const [previewData, setPreviewData] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState(null);
  const [undoing,     setUndoing]     = useState(null);
  const inputRef = useRef(null);

  function loadLog() {
    fetch("/api/import-log").then(r => r.json()).then(setLog).catch(() => {});
  }

  useEffect(loadLog, []);

  async function handleFile(file) {
    if (!file) return;
    setStage("previewing"); setPreviewData(null); setPreviewFile(file); setResult(null); setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch("/api/import/preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Preview failed");
      setPreviewData(data);
      setStage("preview");
    } catch (e) {
      setError(e.message);
      setStage(null);
    }
  }

  async function confirmImport() {
    setStage("confirming");
    const fd = new FormData();
    fd.append("file", previewFile);
    try {
      const res  = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Import failed");
      setResult(data);
      setStage("complete");
      loadLog();
    } catch (e) {
      setError(e.message);
      setStage(null);
    }
  }

  function cancelPreview() {
    setStage(null); setPreviewData(null); setPreviewFile(null);
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  async function undoImport(row) {
    if (!window.confirm(`Undo import of "${row.filename}"? This will delete ${row.inserted_count} transaction(s) and cannot be undone.`)) return;
    setUndoing(row.id);
    try {
      const res = await fetch(`/api/import/${row.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Undo failed");
      loadLog();
    } catch (e) {
      setError(e.message);
    }
    setUndoing(null);
  }

  return (
    <main className="main">
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Import</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Import
          </h1>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>
        <div>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !stage && inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? "var(--brand-400)" : "var(--paper-3)"}`,
              borderRadius: "var(--r-lg)",
              background: dragging ? "var(--brand-50)" : "var(--paper-0)",
              padding: "52px 24px",
              textAlign: "center",
              cursor: stage ? "default" : "pointer",
              transition: "border-color 140ms ease, background 140ms ease",
              marginBottom: 16,
            }}
          >
            <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={onFileChange} />
            <div style={{ width: 40, height: 40, borderRadius: "var(--r-md)", background: "var(--paper-2)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
              <Icon name="import" size={20} stroke={1.5} style={{ color: "var(--ink-2)" }} />
            </div>
            {stage === "previewing" ? (
              <div style={{ fontSize: 14, color: "var(--ink-2)" }}>Analyzing file…</div>
            ) : stage === "confirming" ? (
              <div style={{ fontSize: 14, color: "var(--ink-2)" }}>Importing and applying rules…</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-0)", marginBottom: 4 }}>
                  Drop a RocketMoney CSV here
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>or click to browse · .csv files only</div>
              </>
            )}
          </div>

          {/* Preview / result panel */}
          {stage === "preview" && previewData && (
            <ImportResult
              result={previewData}
              mode="preview"
              onConfirm={confirmImport}
              onCancel={cancelPreview}
              confirming={false}
            />
          )}
          {stage === "confirming" && previewData && (
            <ImportResult
              result={previewData}
              mode="preview"
              onConfirm={confirmImport}
              onCancel={cancelPreview}
              confirming={true}
            />
          )}
          {stage === "complete" && result && (
            <ImportResult result={result} mode="complete" onDismiss={() => { setStage(null); setResult(null); }} />
          )}

          {error && (
            <div style={{ background: "var(--expense-soft)", border: "1px solid #e0a090", borderRadius: "var(--r-md)", padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "var(--expense)" }}>
              <strong>Import failed:</strong> {error}
            </div>
          )}

          {/* Import log */}
          <div className="card flush">
            <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid var(--paper-3)" }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Import history</span>
            </div>
            {log.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>No imports yet.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Imported at</th>
                    <th className="num" style={{ width: 80 }}>New</th>
                    <th className="num" style={{ width: 90 }}>Dupes</th>
                    <th className="num" style={{ width: 100 }}>Rule hits</th>
                    <th style={{ width: 60 }} />
                  </tr>
                </thead>
                <tbody>
                  {log.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 500, fontSize: 13 }}>{row.filename}</td>
                      <td style={{ fontSize: 13, color: "var(--ink-2)" }}>
                        {row.imported_at?.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="num mono" style={{ fontSize: 13, color: "var(--income)" }}>
                        {(row.inserted_count ?? row.row_count - (row.duplicate_count ?? 0))?.toLocaleString()}
                      </td>
                      <td className="num mono" style={{ fontSize: 13, color: "var(--ink-3)" }}>
                        {row.duplicate_count?.toLocaleString()}
                      </td>
                      <td className="num mono" style={{ fontSize: 13, color: "var(--brand-700)" }}>
                        {row.rule_matched != null ? row.rule_matched.toLocaleString() : "—"}
                      </td>
                      <td>
                        {row.inserted_count > 0 && row.transaction_ids && (
                          <button
                            className="btn btn-ghost btn-sm"
                            disabled={undoing === row.id}
                            onClick={() => undoImport(row)}
                            title="Undo this import"
                            style={{ color: "var(--expense)", fontSize: 11 }}
                          >
                            {undoing === row.id ? "…" : "Undo"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Sidebar: import guarantees */}
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 14 }}>How import works</div>

          {[
            {
              icon: "check",
              color: "var(--income)",
              title: "Duplicates are skipped",
              body: "Each transaction is fingerprinted by date, account, amount, and description. Re-importing the same file (or an overlapping date range) is safe — no double-counting.",
            },
            {
              icon: "check",
              color: "var(--income)",
              title: "Manual edits are preserved",
              body: "If you've manually changed a category, it won't be overwritten — ever. Manual always wins.",
            },
            {
              icon: "check",
              color: "var(--income)",
              title: "Rules apply automatically",
              body: "After insert, your categorization rules run on every new transaction. Only new rows are processed — existing ones are untouched.",
            },
            {
              icon: "check",
              color: "var(--income)",
              title: "Original category is saved",
              body: "The imported category from RocketMoney is stored separately. If you delete a rule, the transaction reverts to its original category — not blank.",
            },
            {
              icon: "info",
              color: "var(--ink-3)",
              title: "Ignored accounts",
              body: "Transactions from accounts marked as ignored in Accounts are imported but flagged ignored — excluded from all reports.",
            },
          ].map(({ icon, color, title, body }) => (
            <div key={title} style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: color + "22", display: "grid", placeItems: "center", flexShrink: 0, marginTop: 1 }}>
                <Icon name={icon} size={11} style={{ color }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{title}</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>{body}</div>
              </div>
            </div>
          ))}

          <div style={{ borderTop: "1px solid var(--paper-3)", paddingTop: 14, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Supported format: <strong>RocketMoney CSV export</strong>. Export from RocketMoney → Transactions → Export.
          </div>
        </div>
      </div>
    </main>
  );
}
