import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Crowd LED Bracelets — Project Cockpit (Supabase + realtime, shared board)
// ---------------------------------------------------------------------------

const C = {
  ink: "#07080d", panel: "#11131f", panel2: "#161a2a", line: "#262b40",
  txt: "#e8eaf2", dim: "#9aa0b8", faint: "#646b86",
  r: "#ff3b6b", g: "#27e0a3", b: "#4d7bff", amber: "#ffc34d",
};
const OWNERS = ["Unassigned", "Eng", "Hardware", "Firmware", "Sourcing", "Design", "PM"];
const STATUSES = ["Not started", "In progress", "Blocked", "Done"];
const STATUS_COLOR = { "Not started": C.faint, "In progress": C.b, "Blocked": C.r, "Done": C.g };

// Debounce helper so typing doesn't fire a write per keystroke
function useDebouncedWriter() {
  const timers = useRef({});
  return (key, fn, ms = 500) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };
}

export default function App() {
  const [tab, setTab] = useState("tasks");
  const [tasks, setTasks] = useState([]);
  const [budget, setBudget] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [risks, setRisks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(false);
  const [filterOwner, setFilterOwner] = useState("All");
  const debounce = useDebouncedWriter();

  // ---- initial load ----
  useEffect(() => {
    (async () => {
      const [t, b, d, r] = await Promise.all([
        supabase.from("tasks").select("*").order("sort"),
        supabase.from("budget").select("*").order("sort"),
        supabase.from("decisions").select("*").order("sort"),
        supabase.from("risks").select("*").order("sort"),
      ]);
      if (t.data) setTasks(t.data);
      if (b.data) setBudget(b.data);
      if (d.data) setDecisions(d.data);
      if (r.data) setRisks(r.data);
      setLoaded(true);
      setOnline(!t.error);
    })();
  }, []);

  // ---- realtime: re-pull a table when anyone changes it ----
  useEffect(() => {
    const pull = {
      tasks: async () => { const { data } = await supabase.from("tasks").select("*").order("sort"); if (data) setTasks(data); },
      budget: async () => { const { data } = await supabase.from("budget").select("*").order("sort"); if (data) setBudget(data); },
      decisions: async () => { const { data } = await supabase.from("decisions").select("*").order("sort"); if (data) setDecisions(data); },
      risks: async () => { const { data } = await supabase.from("risks").select("*").order("sort"); if (data) setRisks(data); },
    };
    const ch = supabase.channel("cockpit")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, pull.tasks)
      .on("postgres_changes", { event: "*", schema: "public", table: "budget" }, pull.budget)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, pull.decisions)
      .on("postgres_changes", { event: "*", schema: "public", table: "risks" }, pull.risks)
      .subscribe((status) => setOnline(status === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ---- generic optimistic update + debounced persist ----
  const patchRow = (table, setter, id, patch) => {
    setter(rows => rows.map(x => x.id === id ? { ...x, ...patch } : x));
    debounce(table + id, async () => {
      await supabase.from(table).update(patch).eq("id", id);
    });
  };
  const addRow = async (table, setter, row) => {
    const { data } = await supabase.from(table).insert(row).select().single();
    if (data) setter(rows => [...rows, data]);
  };
  const delRow = async (table, setter, id) => {
    setter(rows => rows.filter(x => x.id !== id));
    await supabase.from(table).delete().eq("id", id);
  };

  // ---- derived ----
  const progress = useMemo(() => tasks.length ? Math.round(tasks.filter(t => t.status === "Done").length / tasks.length * 100) : 0, [tasks]);
  const phases = useMemo(() => { const m = {}; tasks.forEach(t => (m[t.phase] = m[t.phase] || []).push(t)); return m; }, [tasks]);
  const totals = useMemo(() => {
    let recurring = 0, oneTime = 0, perUnit = 0;
    budget.forEach(b => { recurring += (+b.per_unit || 0) * (+b.qty || 0); oneTime += (+b.one_time || 0); perUnit += (+b.per_unit || 0); });
    return { recurring, oneTime, total: recurring + oneTime, perUnit };
  }, [budget]);

  const nextSort = (arr) => (arr.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1);
  const mono = { fontFamily: "ui-monospace, 'SFMono-Regular', monospace" };
  const inputStyle = { background: "transparent", border: "1px solid transparent", color: C.txt, font: "inherit", padding: "4px 6px", borderRadius: 6, width: "100%", outline: "none" };
  const fIn = (e) => { e.target.style.borderColor = C.line; e.target.style.background = C.ink; };
  const fOut = (e) => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; };
  const owners = ["All", ...OWNERS];

  const TabBtn = ({ id, label, count }) => (
    <button onClick={() => setTab(id)} style={{ ...mono, fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", background: tab === id ? C.panel2 : "transparent", color: tab === id ? C.txt : C.faint, border: "1px solid " + (tab === id ? C.line : "transparent"), borderRadius: 8, padding: "8px 14px", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}{count != null ? <span style={{ color: C.faint, marginLeft: 6 }}>{count}</span> : null}
    </button>
  );
  const sel = (val, opts, onChange, color) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={{ ...mono, fontSize: 12, background: C.ink, color: color || C.dim, border: "1px solid " + C.line, borderRadius: 6, padding: "5px 8px", cursor: "pointer", outline: "none" }}>
      {opts.map(o => <option key={o} value={o} style={{ background: C.panel }}>{o}</option>)}
    </select>
  );
  const del = (onClick) => (
    <button onClick={onClick} title="delete" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}
      onMouseEnter={e => e.target.style.color = C.r} onMouseLeave={e => e.target.style.color = C.faint}>×</button>
  );

  if (!loaded) return <div style={{ background: C.ink, color: C.dim, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono }}>Loading project…</div>;

  return (
    <div style={{ background: C.ink, color: C.txt, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", paddingBottom: 60 }}>
      {/* HEADER */}
      <div style={{ padding: "28px 28px 20px", borderBottom: "1px solid " + C.line, background: "radial-gradient(circle at 12% 0%, rgba(255,59,107,.10), transparent 40%), radial-gradient(circle at 88% 0%, rgba(77,123,255,.10), transparent 42%)" }}>
        <div style={{ ...mono, fontSize: 11, letterSpacing: ".26em", textTransform: "uppercase", color: C.dim, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: online ? C.g : C.amber, boxShadow: `0 0 10px ${online ? C.g : C.amber}` }} />
          Crowd LED Bracelets · Project Cockpit · {online ? "live" : "connecting…"}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", margin: "0 0 4px" }}>Rechargeable + RF + RTC · 100–500 unit build</h1>
        <div style={{ color: C.dim, fontSize: 14 }}>Shared board — everyone with the link edits the same data, live.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 22, alignItems: "center" }}>
          <div style={{ minWidth: 220, flex: 1 }}>
            <div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 6 }}>Progress · {progress}% · {tasks.filter(t => t.status === "Done").length}/{tasks.length} tasks</div>
            <div style={{ height: 10, background: C.panel2, borderRadius: 6, overflow: "hidden", border: "1px solid " + C.line }}>
              <div style={{ height: "100%", width: progress + "%", background: `linear-gradient(90deg, ${C.r}, ${C.amber} 40%, ${C.g})`, transition: "width .4s" }} />
            </div>
          </div>
          <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".12em", textTransform: "uppercase" }}>Per unit (sum)</div><div style={{ ...mono, fontSize: 20, fontWeight: 700, color: C.g }}>${totals.perUnit.toFixed(2)}</div></div>
          <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".12em", textTransform: "uppercase" }}>Est. total</div><div style={{ ...mono, fontSize: 20, fontWeight: 700, color: C.b }}>${Math.round(totals.total).toLocaleString()}</div></div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: "flex", gap: 8, padding: "16px 28px", flexWrap: "wrap", borderBottom: "1px solid " + C.line, position: "sticky", top: 0, background: C.ink, zIndex: 10 }}>
        <TabBtn id="tasks" label="Tasks" count={tasks.length} />
        <TabBtn id="budget" label="Budget" />
        <TabBtn id="decisions" label="Decisions" count={decisions.length} />
        <TabBtn id="risks" label="Risks" count={risks.length} />
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1080, margin: "0 auto" }}>
        {/* TASKS */}
        {tab === "tasks" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>Filter by owner:</span>
              {owners.map(o => (
                <button key={o} onClick={() => setFilterOwner(o)} style={{ ...mono, fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer", background: filterOwner === o ? C.panel2 : "transparent", color: filterOwner === o ? C.txt : C.faint, border: "1px solid " + (filterOwner === o ? C.line : "transparent") }}>{o}</button>
              ))}
            </div>
            {Object.keys(phases).map(phase => {
              const list = phases[phase].filter(t => filterOwner === "All" || t.owner === filterOwner);
              if (!list.length) return null;
              const done = phases[phase].filter(t => t.status === "Done").length;
              return (
                <div key={phase} style={{ marginBottom: 26 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{phase}</h3>
                    <span style={{ ...mono, fontSize: 11, color: C.faint }}>{done}/{phases[phase].length}</span>
                    <div style={{ flex: 1, height: 1, background: C.line }} />
                  </div>
                  {list.map(t => (
                    <div key={t.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr 110px 120px 110px 24px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: C.panel, border: "1px solid " + C.line, marginBottom: 6 }}>
                      <input type="checkbox" checked={t.status === "Done"} onChange={e => patchRow("tasks", setTasks, t.id, { status: e.target.checked ? "Done" : "Not started" })} style={{ width: 16, height: 16, accentColor: C.g, cursor: "pointer" }} />
                      <input value={t.title} onChange={e => patchRow("tasks", setTasks, t.id, { title: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? C.faint : C.txt, fontSize: 13.5 }} />
                      {sel(t.owner, OWNERS, v => patchRow("tasks", setTasks, t.id, { owner: v }))}
                      {sel(t.status, STATUSES, v => patchRow("tasks", setTasks, t.id, { status: v }), STATUS_COLOR[t.status])}
                      <input type="date" value={t.due || ""} onChange={e => patchRow("tasks", setTasks, t.id, { due: e.target.value || null })} style={{ ...mono, fontSize: 11, background: C.ink, color: t.due ? C.dim : C.faint, border: "1px solid " + C.line, borderRadius: 6, padding: "5px 6px", outline: "none" }} />
                      {del(() => delRow("tasks", setTasks, t.id))}
                    </div>
                  ))}
                  <button onClick={() => addRow("tasks", setTasks, { phase, title: "New task", owner: "Unassigned", status: "Not started", sort: nextSort(tasks) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginTop: 2 }}>+ add task</button>
                </div>
              );
            })}
          </div>
        )}

        {/* BUDGET */}
        {tab === "budget" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 90px 110px 24px", gap: 8, ...mono, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, padding: "0 10px 8px" }}>
              <div>Line item</div><div style={{ textAlign: "right" }}>$/unit</div><div style={{ textAlign: "right" }}>Qty</div><div style={{ textAlign: "right" }}>One-time</div><div style={{ textAlign: "right" }}>Subtotal</div><div />
            </div>
            {budget.map(b => {
              const sub = (+b.per_unit || 0) * (+b.qty || 0) + (+b.one_time || 0);
              return (
                <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 70px 90px 110px 24px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: C.panel, border: "1px solid " + C.line, marginBottom: 6 }}>
                  <input value={b.item} onChange={e => patchRow("budget", setBudget, b.id, { item: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 13.5 }} />
                  <input type="number" step="0.01" value={b.per_unit} onChange={e => patchRow("budget", setBudget, b.id, { per_unit: e.target.value })} style={{ ...mono, ...inputStyle, textAlign: "right", fontSize: 12, border: "1px solid " + C.line, background: C.ink }} />
                  <input type="number" value={b.qty} onChange={e => patchRow("budget", setBudget, b.id, { qty: e.target.value })} style={{ ...mono, ...inputStyle, textAlign: "right", fontSize: 12, border: "1px solid " + C.line, background: C.ink }} />
                  <input type="number" value={b.one_time} onChange={e => patchRow("budget", setBudget, b.id, { one_time: e.target.value })} style={{ ...mono, ...inputStyle, textAlign: "right", fontSize: 12, border: "1px solid " + C.line, background: C.ink }} />
                  <div style={{ ...mono, fontSize: 13, textAlign: "right", color: C.txt }}>${Math.round(sub).toLocaleString()}</div>
                  {del(() => delRow("budget", setBudget, b.id))}
                </div>
              );
            })}
            <button onClick={() => addRow("budget", setBudget, { item: "New line item", per_unit: 0, qty: 500, one_time: 0, sort: nextSort(budget) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginTop: 2 }}>+ add line item</button>
            <div style={{ marginTop: 22, padding: 18, background: C.panel2, border: "1px solid " + C.line, borderRadius: 12, display: "flex", gap: 36, flexWrap: "wrap" }}>
              <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>Per-unit (sum)</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, color: C.amber }}>${totals.perUnit.toFixed(2)}</div></div>
              <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>Recurring (×qty)</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, color: C.txt }}>${Math.round(totals.recurring).toLocaleString()}</div></div>
              <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>One-time</div><div style={{ ...mono, fontSize: 22, fontWeight: 700, color: C.txt }}>${Math.round(totals.oneTime).toLocaleString()}</div></div>
              <div><div style={{ ...mono, fontSize: 11, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>Grand total</div><div style={{ ...mono, fontSize: 22, fontWeight: 800, color: C.g }}>${Math.round(totals.total).toLocaleString()}</div></div>
            </div>
          </div>
        )}

        {/* DECISIONS */}
        {tab === "decisions" && (
          <div>
            {decisions.map(d => (
              <div key={d.id} style={{ padding: 16, background: C.panel, border: "1px solid " + C.line, borderRadius: 12, marginBottom: 10, position: "relative" }}>
                <div style={{ position: "absolute", top: 12, right: 10 }}>{del(() => delRow("decisions", setDecisions, d.id))}</div>
                <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", paddingRight: 24 }}>
                  <input value={d.topic} onChange={e => patchRow("decisions", setDecisions, d.id, { topic: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, ...mono, fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, width: 160, flexShrink: 0 }} />
                  <input value={d.choice || ""} onChange={e => patchRow("decisions", setDecisions, d.id, { choice: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 15, fontWeight: 700, color: C.g, flex: 1, minWidth: 180 }} />
                </div>
                <textarea value={d.why || ""} onChange={e => patchRow("decisions", setDecisions, d.id, { why: e.target.value })} onFocus={fIn} onBlur={fOut} rows={2} style={{ ...inputStyle, fontSize: 13, color: C.dim, resize: "vertical", marginTop: 6, lineHeight: 1.5 }} placeholder="Rationale…" />
              </div>
            ))}
            <button onClick={() => addRow("decisions", setDecisions, { topic: "New decision", choice: "", why: "", sort: nextSort(decisions) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>+ log a decision</button>
          </div>
        )}

        {/* RISKS */}
        {tab === "risks" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1.4fr 110px 24px", gap: 8, ...mono, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, padding: "0 10px 8px" }}>
              <div>Risk</div><div>Severity</div><div>Mitigation</div><div>Owner</div><div />
            </div>
            {risks.map(r => (
              <div key={r.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 1.4fr 110px 24px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: C.panel, border: "1px solid " + C.line, marginBottom: 6 }}>
                <input value={r.risk} onChange={e => patchRow("risks", setRisks, r.id, { risk: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 13.5, fontWeight: 600 }} />
                {sel(r.sev, ["High", "Med", "Low"], v => patchRow("risks", setRisks, r.id, { sev: v }), r.sev === "High" ? C.r : r.sev === "Med" ? C.amber : C.g)}
                <input value={r.mit || ""} onChange={e => patchRow("risks", setRisks, r.id, { mit: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 12.5, color: C.dim }} />
                {sel(r.owner, OWNERS, v => patchRow("risks", setRisks, r.id, { owner: v }))}
                {del(() => delRow("risks", setRisks, r.id))}
              </div>
            ))}
            <button onClick={() => addRow("risks", setRisks, { risk: "New risk", sev: "Med", mit: "", owner: "Unassigned", sort: nextSort(risks) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginTop: 2 }}>+ add risk</button>
          </div>
        )}
      </div>
    </div>
  );
}
