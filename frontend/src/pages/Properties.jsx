import { useState, useEffect, useCallback } from "react";
import Icon from "../components/Icon.jsx";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROPERTY_TYPES = ["primary_home", "vacation_home", "rental", "other"];
const USAGE_TYPES    = ["personal", "rental", "mixed"];
const CURRENT_YEAR   = new Date().getFullYear();

const PROPERTY_TYPE_LABELS = {
  primary_home:  "Primary Home",
  vacation_home: "Vacation Home",
  rental:        "Rental",
  other:         "Other",
};

const USAGE_LABELS = {
  personal: "Personal",
  rental:   "Rental",
  mixed:    "Mixed",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n) {
  return "$" + Math.abs(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function api(path, opts = {}) {
  return fetch("/api" + path, opts).then(r => r.json());
}

// ---------------------------------------------------------------------------
// Modal shell
// ---------------------------------------------------------------------------

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(16,21,16,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 100, backdropFilter: "blur(2px)",
    }} onClick={onClose}>
      <div style={{
        background: "var(--paper-0)", borderRadius: "var(--r-xl)",
        border: "1px solid var(--paper-3)", boxShadow: "var(--shadow-lg)",
        padding: 28, width: 480, maxWidth: "90vw",
        maxHeight: "90vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.01em" }}>{title}</div>
          <button onClick={onClose} style={{ color: "var(--ink-3)", padding: 4 }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property form modal
// ---------------------------------------------------------------------------

function PropertyModal({ prop, onSave, onClose }) {
  const [form, setForm] = useState({
    name:              prop?.name ?? "",
    address:           prop?.address ?? "",
    property_type:     prop?.property_type ?? "rental",
    personal_use_days: prop?.personal_use_days ?? 0,
    notes:             prop?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const method = prop ? "PUT" : "POST";
    const url    = prop ? `/properties/${prop.id}` : "/properties";
    const data   = await api(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, personal_use_days: Number(form.personal_use_days) }),
    });
    setSaving(false);
    onSave(data);
  }

  const field = (label, key, type = "text", opts = {}) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>{label}</span>
      <input
        type={type}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
        style={{
          border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)",
          padding: "8px 10px", fontSize: 14, background: "var(--paper-0)",
          outline: "none", width: "100%",
        }}
        {...opts}
      />
    </label>
  );

  return (
    <Modal title={prop ? "Edit Property" : "Add Property"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {field("Name", "name", "text", { required: true, placeholder: "e.g. 123 Main St" })}
        {field("Address", "address", "text", { placeholder: "Street, City, State" })}
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Type</span>
          <select
            value={form.property_type}
            onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))}
            style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: 14, background: "var(--paper-0)" }}
          >
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        {field("Personal Use Days (per year)", "personal_use_days", "number", { min: 0, max: 365 })}
        {field("Notes", "notes")}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Saving…" : prop ? "Save Changes" : "Add Property"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Unit form modal
// ---------------------------------------------------------------------------

function UnitModal({ propId, unit, onSave, onClose }) {
  const [form, setForm] = useState({
    name:       unit?.name ?? "",
    usage_type: unit?.usage_type ?? "rental",
    notes:      unit?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    const data = unit
      ? await api(`/units/${unit.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
      : await api(`/properties/${propId}/units`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    onSave(data);
  }

  return (
    <Modal title={unit ? "Edit Unit" : "Add Unit"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Unit Name</span>
          <input
            value={form.name} required placeholder="e.g. Unit A, 1BR East"
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: 14, background: "var(--paper-0)", outline: "none" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Usage</span>
          <select
            value={form.usage_type}
            onChange={e => setForm(f => ({ ...f, usage_type: e.target.value }))}
            style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: 14, background: "var(--paper-0)" }}
          >
            {USAGE_TYPES.map(t => <option key={t} value={t}>{USAGE_LABELS[t]}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Notes</span>
          <input
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: 14, background: "var(--paper-0)", outline: "none" }}
          />
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Saving…" : unit ? "Save" : "Add Unit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Allocation rule form modal
// ---------------------------------------------------------------------------

function AllocationRuleModal({ propId, units, rule, onSave, onClose }) {
  const [name, setName]   = useState(rule?.name ?? "");
  const [notes, setNotes] = useState(rule?.notes ?? "");
  const [splits, setSplits] = useState(
    rule?.splits?.length
      ? rule.splits.map(s => ({ unit_id: s.unit_id ?? "", label: s.label, percentage: s.percentage }))
      : [{ unit_id: "", label: "", percentage: 50 }, { unit_id: "", label: "", percentage: 50 }]
  );
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState(null);

  const total = splits.reduce((sum, s) => sum + Number(s.percentage), 0);

  function updateSplit(i, key, val) {
    setSplits(prev => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }
  function addSplit() {
    setSplits(prev => [...prev, { unit_id: "", label: "", percentage: 0 }]);
  }
  function removeSplit(i) {
    setSplits(prev => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e) {
    e.preventDefault();
    if (Math.abs(total - 100) > 0.01) { setErr("Percentages must sum to 100"); return; }
    setSaving(true);
    setErr(null);
    const body = {
      name, notes, property_id: propId,
      splits: splits.map(s => ({ ...s, unit_id: s.unit_id || null, percentage: Number(s.percentage) })),
    };
    const res = rule
      ? await api(`/allocation-rules/${rule.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await api("/allocation-rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.detail) { setErr(res.detail); return; }
    onSave(res);
  }

  return (
    <Modal title={rule ? "Edit Allocation Rule" : "Add Allocation Rule"} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>Rule Name</span>
          <input
            value={name} required placeholder="e.g. 60/40 Unit Split"
            onChange={e => setName(e.target.value)}
            style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "8px 10px", fontSize: 14, background: "var(--paper-0)", outline: "none" }}
          />
        </label>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink-2)" }}>
              Splits <span style={{ color: Math.abs(total - 100) > 0.01 ? "var(--expense)" : "var(--income)" }}>({total}%)</span>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addSplit} style={{ gap: 4, fontSize: 12 }}>
              <Icon name="plus" size={13} /> Add split
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {splits.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 28px", gap: 8, alignItems: "center" }}>
                <input
                  placeholder="Label" value={s.label} required
                  onChange={e => updateSplit(i, "label", e.target.value)}
                  style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "6px 8px", fontSize: 13, background: "var(--paper-0)", outline: "none" }}
                />
                <select
                  value={s.unit_id}
                  onChange={e => updateSplit(i, "unit_id", e.target.value)}
                  style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "6px 8px", fontSize: 13, background: "var(--paper-0)" }}
                >
                  <option value="">No unit</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input
                  type="number" min={0} max={100} step={0.1}
                  value={s.percentage} required
                  onChange={e => updateSplit(i, "percentage", e.target.value)}
                  style={{ border: "1px solid var(--paper-3)", borderRadius: "var(--r-sm)", padding: "6px 8px", fontSize: 13, background: "var(--paper-0)", outline: "none", textAlign: "right" }}
                />
                <button type="button" onClick={() => removeSplit(i)} style={{ color: "var(--ink-3)", padding: 4 }}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {err && <div style={{ fontSize: 13, color: "var(--expense)", background: "var(--expense-soft)", padding: "8px 12px", borderRadius: "var(--r-sm)" }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? "Saving…" : rule ? "Save Changes" : "Create Rule"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Schedule E table
// ---------------------------------------------------------------------------

function ScheduleETable({ propId }) {
  const [year, setYear]     = useState(CURRENT_YEAR);
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propId) return;
    setLoading(true);
    api(`/properties/${propId}/schedule-e?year=${year}`)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [propId, year]);

  const total = rows.reduce((s, r) => s + (r.total ?? 0), 0);

  return (
    <div className="card flush" style={{ marginTop: 20 }}>
      <div className="card-head">
        <div className="card-title">Schedule E</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="segmented">
            {[CURRENT_YEAR - 1, CURRENT_YEAR].map(y => (
              <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>{y}</button>
            ))}
          </div>
        </div>
      </div>
      {loading ? (
        <div style={{ padding: "24px 20px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "24px 20px", color: "var(--ink-3)", fontSize: 13 }}>
          No tagged expenses for {year}. Tag transactions with a Schedule E category to see them here.
        </div>
      ) : (
        <table className="tbl">
          <thead>
            <tr>
              <th>Category</th>
              <th className="num">Transactions</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.schedule_e_category}>
                <td>{r.schedule_e_category}</td>
                <td className="num" style={{ color: "var(--ink-2)" }}>{r.count}</td>
                <td className="num money">{fmt(r.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 600 }}>Total</td>
              <td />
              <td className="num money" style={{ fontWeight: 600 }}>{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property detail panel
// ---------------------------------------------------------------------------

function PropertyDetail({ propId, onPropertyUpdated, onPropertyDeleted }) {
  const [prop, setProp]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [rules, setRules]       = useState([]);
  const [editProp, setEditProp] = useState(false);
  const [addUnit, setAddUnit]   = useState(false);
  const [editUnit, setEditUnit] = useState(null);
  const [addRule, setAddRule]   = useState(false);
  const [editRule, setEditRule] = useState(null);

  const load = useCallback(() => {
    if (!propId) return;
    setLoading(true);
    Promise.all([
      api(`/properties/${propId}`),
      api(`/allocation-rules?property_id=${propId}`),
    ]).then(([p, r]) => {
      setProp(p);
      setRules(r);
    }).finally(() => setLoading(false));
  }, [propId]);

  useEffect(() => { load(); }, [load]);

  async function deleteUnit(unit) {
    if (!confirm(`Delete unit "${unit.name}"?`)) return;
    await api(`/units/${unit.id}`, { method: "DELETE" });
    load();
  }

  async function deleteRule(rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    await api(`/allocation-rules/${rule.id}`, { method: "DELETE" });
    load();
  }

  async function deleteProp() {
    if (!confirm(`Delete property "${prop.name}"? This cannot be undone.`)) return;
    await api(`/properties/${prop.id}`, { method: "DELETE" });
    onPropertyDeleted(prop.id);
  }

  if (!propId) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--ink-3)", fontSize: 14 }}>
      Select a property or add a new one
    </div>
  );

  if (loading || !prop) return (
    <div style={{ padding: 32, color: "var(--ink-3)", fontSize: 14 }}>Loading…</div>
  );

  return (
    <div style={{ padding: "28px 28px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{prop.name}</div>
          {prop.address && <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 4 }}>{prop.address}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <span className="pill brand">{PROPERTY_TYPE_LABELS[prop.property_type] ?? prop.property_type}</span>
            {prop.personal_use_days > 0 && (
              <span className="pill warn">{prop.personal_use_days} personal days</span>
            )}
            <span className="pill">{prop.unit_count ?? prop.units?.length ?? 0} units</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditProp(true)}>
            <Icon name="edit" size={13} /> Edit
          </button>
          <button className="btn btn-secondary btn-sm" onClick={deleteProp} style={{ color: "var(--expense)" }}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>

      {/* Units */}
      <div className="card flush">
        <div className="card-head">
          <div className="card-title">Units / Spaces</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddUnit(true)}>
            <Icon name="plus" size={13} /> Add Unit
          </button>
        </div>
        {prop.units?.length === 0 ? (
          <div style={{ padding: "16px 20px", color: "var(--ink-3)", fontSize: 13 }}>No units yet — add one to track expenses per space.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Usage</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prop.units?.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 500 }}>{u.name}</td>
                  <td>
                    <span className={`pill ${u.usage_type === "rental" ? "income" : u.usage_type === "personal" ? "" : "warn"}`}>
                      {USAGE_LABELS[u.usage_type] ?? u.usage_type}
                    </span>
                  </td>
                  <td style={{ color: "var(--ink-2)", fontSize: 13 }}>{u.notes ?? "—"}</td>
                  <td style={{ width: 70 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditUnit(u)} style={{ padding: "4px 6px" }}>
                        <Icon name="edit" size={13} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => deleteUnit(u)} style={{ padding: "4px 6px", color: "var(--ink-3)" }}>
                        <Icon name="trash" size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Allocation rules */}
      <div className="card flush" style={{ marginTop: 20 }}>
        <div className="card-head">
          <div className="card-title">Allocation Rules</div>
          <button className="btn btn-secondary btn-sm" onClick={() => setAddRule(true)}>
            <Icon name="plus" size={13} /> Add Rule
          </button>
        </div>
        {rules.length === 0 ? (
          <div style={{ padding: "16px 20px", color: "var(--ink-3)", fontSize: 13 }}>
            No allocation rules yet. Rules let you split shared expenses (e.g. utilities) across units by percentage.
          </div>
        ) : (
          <div style={{ padding: "0 0 4px" }}>
            {rules.map(rule => (
              <div key={rule.id} style={{ borderBottom: "1px solid var(--paper-3)", padding: "14px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{rule.name}</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditRule(rule)} style={{ padding: "4px 6px" }}>
                      <Icon name="edit" size={13} />
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteRule(rule)} style={{ padding: "4px 6px", color: "var(--ink-3)" }}>
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  {rule.splits.map(s => (
                    <span key={s.id} className="pill brand" style={{ fontSize: 12 }}>
                      {s.label} — {s.percentage}%
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Schedule E */}
      <ScheduleETable propId={propId} />

      {/* Modals */}
      {editProp && (
        <PropertyModal prop={prop} onClose={() => setEditProp(false)} onSave={updated => {
          setProp(p => ({ ...p, ...updated }));
          setEditProp(false);
          onPropertyUpdated(updated);
        }} />
      )}
      {addUnit && (
        <UnitModal propId={prop.id} onClose={() => setAddUnit(false)} onSave={() => { setAddUnit(false); load(); }} />
      )}
      {editUnit && (
        <UnitModal propId={prop.id} unit={editUnit} onClose={() => setEditUnit(null)} onSave={() => { setEditUnit(null); load(); }} />
      )}
      {addRule && (
        <AllocationRuleModal propId={prop.id} units={prop.units ?? []} onClose={() => setAddRule(false)} onSave={() => { setAddRule(false); load(); }} />
      )}
      {editRule && (
        <AllocationRuleModal propId={prop.id} units={prop.units ?? []} rule={editRule} onClose={() => setEditRule(null)} onSave={() => { setEditRule(null); load(); }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Properties() {
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showAdd, setShowAdd]       = useState(false);

  function loadList() {
    api("/properties").then(list => {
      setProperties(list);
      if (list.length && !selectedId) setSelectedId(list[0].id);
    });
  }

  useEffect(() => { loadList(); }, []);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", minHeight: "100vh" }}>
      {/* Left panel — property list */}
      <div style={{
        borderRight: "1px solid var(--paper-3)",
        background: "var(--paper-0)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "20px 16px 12px", borderBottom: "1px solid var(--paper-3)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>Properties</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} style={{ padding: "5px 10px" }}>
              <Icon name="plus" size={13} /> Add
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
          {properties.length === 0 && (
            <div style={{ padding: "20px 8px", color: "var(--ink-3)", fontSize: 13, textAlign: "center" }}>
              No properties yet.<br />Add one to get started.
            </div>
          )}
          {properties.map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "10px 12px", borderRadius: "var(--r-md)",
                background: selectedId === p.id ? "var(--brand-700)" : "transparent",
                color: selectedId === p.id ? "var(--paper-0)" : "var(--ink-0)",
                marginBottom: 2,
                transition: "background 140ms ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "var(--r-sm)",
                  background: selectedId === p.id ? "rgba(255,255,255,0.15)" : "var(--brand-50)",
                  color: selectedId === p.id ? "var(--paper-0)" : "var(--brand-700)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                }}>
                  <Icon name="home" size={14} stroke={1.6} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
                    {PROPERTY_TYPE_LABELS[p.property_type] ?? p.property_type} · {p.unit_count ?? 0} units
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel — detail */}
      <div style={{ background: "var(--paper-1)", overflowY: "auto" }}>
        <PropertyDetail
          propId={selectedId}
          onPropertyUpdated={updated => {
            setProperties(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          }}
          onPropertyDeleted={id => {
            const remaining = properties.filter(p => p.id !== id);
            setProperties(remaining);
            setSelectedId(remaining[0]?.id ?? null);
          }}
        />
      </div>

      {showAdd && (
        <PropertyModal onClose={() => setShowAdd(false)} onSave={newProp => {
          setShowAdd(false);
          loadList();
          setSelectedId(newProp.id);
        }} />
      )}
    </div>
  );
}
