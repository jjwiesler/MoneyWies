import { useState, useEffect, useRef } from "react";
import Icon from "../components/Icon.jsx";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function SectionCard({ title, subtitle, children }) {
  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-head">
        <div>
          <div className="card-title">{title}</div>
          {subtitle && <div className="card-sub">{subtitle}</div>}
        </div>
      </div>
      <div style={{ padding: "0 20px 20px" }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "var(--paper-0)",
  border: "1px solid var(--paper-3)",
  borderRadius: "var(--r-md)",
  padding: "8px 12px",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  color: "var(--ink-0)",
  outline: "none",
  boxSizing: "border-box",
};

// ---------------------------------------------------------------------------
// Inline rename row (shared by categories + labels)
// ---------------------------------------------------------------------------

function RenameRow({ name, onRename, onDelete, deleteLabel = "Delete" }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(name);
  const inputRef = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  function cancel() { setEditing(false); setDraft(name); }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { cancel(); return; }
    await onRename(name, trimmed);
    setEditing(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--paper-2)" }}>
      {editing ? (
        <>
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") cancel(); }}
            style={{ ...inputStyle, flex: 1, padding: "4px 8px" }}
          />
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={cancel}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { setDraft(name); setEditing(true); }}>Rename</button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--expense)" }}
            onClick={() => onDelete(name)}
          >
            {deleteLabel}
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Configuration section
// ---------------------------------------------------------------------------

function KeyInput({ value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, fontFamily: "var(--font-mono)", paddingRight: 36 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, cursor: "pointer", color: "var(--ink-3)", padding: 2 }}
      >
        <Icon name={show ? "eyeOff" : "eye"} size={14} />
      </button>
    </div>
  );
}

function AISection() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey,    setOpenaiKey]    = useState("");
  const [geminiKey,    setGeminiKey]    = useState("");
  const [provider,     setProvider]     = useState("anthropic");
  const [saved,        setSaved]        = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [loaded,       setLoaded]       = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(data => {
        if (data.anthropic_api_key) setAnthropicKey(data.anthropic_api_key);
        if (data.openai_api_key)    setOpenaiKey(data.openai_api_key);
        if (data.gemini_api_key)    setGeminiKey(data.gemini_api_key);
        if (data.ai_provider)       setProvider(data.ai_provider);
        setLoaded(true);
      });
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const saves = [
      fetch("/api/settings/ai_provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: provider }),
      }),
    ];
    if (anthropicKey.trim()) {
      saves.push(fetch("/api/settings/anthropic_api_key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: anthropicKey.trim() }),
      }));
    }
    if (openaiKey.trim()) {
      saves.push(fetch("/api/settings/openai_api_key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: openaiKey.trim() }),
      }));
    }
    if (geminiKey.trim()) {
      saves.push(fetch("/api/settings/gemini_api_key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: geminiKey.trim() }),
      }));
    }
    await Promise.all(saves);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const providerBtnStyle = (p) => ({
    padding: "6px 14px",
    fontSize: 13,
    border: "1px solid var(--paper-3)",
    borderRadius: "var(--r-md)",
    cursor: "pointer",
    background: provider === p ? "var(--brand-400)" : "var(--paper-0)",
    color: provider === p ? "#fff" : "var(--ink-1)",
    fontFamily: "var(--font-sans)",
  });

  return (
    <SectionCard title="AI Configuration" subtitle="Powers AI search, rule suggestions, and bulk categorization">
      {loaded && (
        <form onSubmit={save}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Active Provider</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" style={providerBtnStyle("anthropic")} onClick={() => setProvider("anthropic")}>
                Claude (Anthropic)
              </button>
              <button type="button" style={providerBtnStyle("openai")} onClick={() => setProvider("openai")}>
                GPT-4o (OpenAI)
              </button>
              <button type="button" style={providerBtnStyle("gemini")} onClick={() => setProvider("gemini")}>
                Gemini (Google)
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <span>Anthropic API Key</span>
                <span style={{ color: "var(--ink-4)" }}>console.anthropic.com</span>
              </div>
              <KeyInput value={anthropicKey} onChange={setAnthropicKey} placeholder="sk-ant-…" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <span>OpenAI API Key</span>
                <span style={{ color: "var(--ink-4)" }}>platform.openai.com</span>
              </div>
              <KeyInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-…" />
            </div>
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, display: "flex", justifyContent: "space-between" }}>
                <span>Google API Key</span>
                <span style={{ color: "var(--ink-4)" }}>aistudio.google.com</span>
              </div>
              <KeyInput value={geminiKey} onChange={setGeminiKey} placeholder="AIza…" />
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </form>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Categories section
// ---------------------------------------------------------------------------

function CategoriesSection() {
  const [categories, setCategories] = useState([]);
  const [newCat,     setNewCat]     = useState("");
  const [adding,     setAdding]     = useState(false);
  const [banner,     setBanner]     = useState(null);

  function load() {
    fetch("/api/categories").then(r => r.json()).then(setCategories);
  }
  useEffect(load, []);

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(null), 2500); }

  async function handleRename(old_name, new_name) {
    await fetch(`/api/categories/rename?old_name=${encodeURIComponent(old_name)}&new_name=${encodeURIComponent(new_name)}`, { method: "POST" });
    flash(`Renamed "${old_name}" → "${new_name}"`);
    load();
  }

  async function handleDelete(name) {
    await fetch(`/api/categories/${encodeURIComponent(name)}`, { method: "DELETE" });
    flash(`Removed "${name}" from custom list`);
    load();
  }

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = newCat.trim();
    if (!trimmed) return;
    setAdding(true);
    await fetch(`/api/categories?name=${encodeURIComponent(trimmed)}`, { method: "POST" });
    setNewCat("");
    setAdding(false);
    load();
  }

  return (
    <SectionCard
      title="Categories"
      subtitle={`${categories.length} categories · rename applies to all transactions and rules`}
    >
      {banner && (
        <div style={{ background: "var(--brand-50)", color: "var(--brand-700)", borderRadius: "var(--r-sm)", padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          {banner}
        </div>
      )}

      <div style={{ maxHeight: 340, overflowY: "auto", marginBottom: 16 }}>
        {categories.map(cat => (
          <RenameRow
            key={cat}
            name={cat}
            onRename={handleRename}
            onDelete={handleDelete}
            deleteLabel="Remove"
          />
        ))}
        {categories.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>No categories yet.</div>
        )}
      </div>

      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8 }}>
        <input
          value={newCat}
          onChange={e => setNewCat(e.target.value)}
          placeholder="Add a custom category…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={adding || !newCat.trim()}>
          <Icon name="plus" size={13} /> Add
        </button>
      </form>
      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
        "Remove" only removes it from the custom list. Categories in use on transactions are always shown.
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Labels section
// ---------------------------------------------------------------------------

function LabelsSection() {
  const [labels,  setLabels]  = useState([]);
  const [banner,  setBanner]  = useState(null);

  function load() {
    fetch("/api/labels").then(r => r.json()).then(setLabels);
  }
  useEffect(load, []);

  function flash(msg) { setBanner(msg); setTimeout(() => setBanner(null), 2500); }

  async function handleRename(old_name, new_name) {
    await fetch(`/api/labels/rename?old_name=${encodeURIComponent(old_name)}&new_name=${encodeURIComponent(new_name)}`, { method: "POST" });
    flash(`Renamed "${old_name}" → "${new_name}"`);
    load();
  }

  async function handleDelete(name) {
    await fetch(`/api/labels/${encodeURIComponent(name)}`, { method: "DELETE" });
    flash(`Removed label "${name}" from all transactions`);
    load();
  }

  return (
    <SectionCard
      title="Labels"
      subtitle={`${labels.length} labels · rename applies to all transactions · delete clears the label`}
    >
      {banner && (
        <div style={{ background: "var(--brand-50)", color: "var(--brand-700)", borderRadius: "var(--r-sm)", padding: "8px 12px", fontSize: 13, marginBottom: 12 }}>
          {banner}
        </div>
      )}

      <div style={{ maxHeight: 300, overflowY: "auto" }}>
        {labels.map(lbl => (
          <RenameRow
            key={lbl}
            name={lbl}
            onRename={handleRename}
            onDelete={handleDelete}
            deleteLabel="Delete"
          />
        ))}
        {labels.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>
            No labels yet. Add labels to transactions from the Transactions page.
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Settings() {
  return (
    <main className="main">
      <div className="topbar">
        <div>
          <div className="breadcrumb">
            <span>Household</span><span className="sep">/</span><span>Settings</span>
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "6px 0 0" }}>
            Settings
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: 680 }}>
        <AISection />
        <CategoriesSection />
        <LabelsSection />
      </div>
    </main>
  );
}
