import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Flamingods · Midburn Camp Task Manager
// Projects (left rail) -> tasks with start date, deadline, owner, status.
// People tab manages camp members (used as owner options). Live realtime sync.
// ---------------------------------------------------------------------------

const C = {
  ink: "#0a0712", panel: "#171026", panel2: "#1f1733", line: "#33264d",
  txt: "#f3ecff", dim: "#b3a3cc", faint: "#7a6b96",
  pink: "#ff5db1", coral: "#ff8a5b", gold: "#ffc94d", teal: "#3dd6c4", violet: "#a06bff",
};
const STATUSES = ["Not started", "In progress", "Blocked", "Done"];
const STATUS_COLOR = { "Not started": C.faint, "In progress": C.violet, "Blocked": C.pink, "Done": C.teal };

function useDebouncedWriter() {
  const timers = useRef({});
  return (key, fn, ms = 500) => { clearTimeout(timers.current[key]); timers.current[key] = setTimeout(fn, ms); };
}
const today = () => new Date().toISOString().slice(0, 10);
function daysUntil(d) {
  if (!d) return null;
  const ms = new Date(d + "T00:00:00") - new Date(today() + "T00:00:00");
  return Math.round(ms / 86400000);
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [people, setPeople] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [view, setView] = useState("tasks"); // tasks | people
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(false);
  const [filterOwner, setFilterOwner] = useState("All");
  const [errMsg, setErrMsg] = useState("");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 760);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const debounce = useDebouncedWriter();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 760);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Rows this client wrote recently — used to ignore the realtime echo of our
  // own changes so it can't overwrite an edit that's still in progress.
  const recentWrites = useRef({}); // { rowId: timestamp }
  const markWrite = (id) => { recentWrites.current[id] = Date.now(); };
  const isOwnEcho = (id) => {
    const ts = recentWrites.current[id];
    return ts && Date.now() - ts < 2500; // ignore echoes within 2.5s of our write
  };

  const SETTERS = { projects: setProjects, people: setPeople, tasks: setTasks };
  const flash = (m) => { setErrMsg(m); setTimeout(() => setErrMsg(""), 4000); };

  // ---- load ----
  useEffect(() => {
    (async () => {
      const [p, pe, t] = await Promise.all([
        supabase.from("projects").select("*").order("sort"),
        supabase.from("people").select("*").order("sort"),
        supabase.from("tasks").select("*").order("sort"),
      ]);
      if (p.data) { setProjects(p.data); if (p.data.length) setActiveProject(p.data[0].id); }
      if (pe.data) setPeople(pe.data);
      if (t.data) setTasks(t.data);
      setLoaded(true);
      setOnline(!p.error);
      if (p.error) flash("Load error: " + p.error.message);
    })();
  }, []);

  // ---- realtime: merge a single changed row, skip our own echoes ----
  useEffect(() => {
    const apply = (table) => (payload) => {
      const setter = SETTERS[table];
      if (payload.eventType === "DELETE") {
        const id = payload.old?.id;
        if (id && !isOwnEcho(id)) setter(rows => rows.filter(x => x.id !== id));
        return;
      }
      const row = payload.new;
      if (!row || isOwnEcho(row.id)) return; // our own change — already in state
      setter(rows => {
        const exists = rows.some(x => x.id === row.id);
        const merged = exists ? rows.map(x => x.id === row.id ? row : x) : [...rows, row];
        return merged.sort((a, b) => (a.sort || 0) - (b.sort || 0));
      });
    };
    const ch = supabase.channel("camp")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, apply("projects"))
      .on("postgres_changes", { event: "*", schema: "public", table: "people" }, apply("people"))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, apply("tasks"))
      .subscribe((s) => setOnline(s === "SUBSCRIBED"));
    return () => { supabase.removeChannel(ch); };
  }, []);

  // ---- mutators (optimistic + error-surfacing) ----
  const patchRow = (table, setter, id, patch) => {
    markWrite(id);
    setter(rows => rows.map(x => x.id === id ? { ...x, ...patch } : x));
    debounce(table + id, async () => {
      markWrite(id);
      const { error } = await supabase.from(table).update(patch).eq("id", id);
      if (error) flash("Save failed: " + error.message);
    });
  };
  const addRow = async (table, setter, row) => {
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) { flash("Couldn't add: " + error.message); return null; }
    if (data) { markWrite(data.id); setter(rows => [...rows, data]); return data; }
  };
  const delRow = async (table, setter, id) => {
    markWrite(id);
    setter(rows => rows.filter(x => x.id !== id));
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) flash("Delete failed: " + error.message);
  };

  const nextSort = (arr) => arr.reduce((m, x) => Math.max(m, x.sort || 0), 0) + 1;

  const ownerNames = useMemo(() => {
    const names = people.map(p => p.name);
    return names.includes("Unassigned") ? names : ["Unassigned", ...names];
  }, [people]);

  const projTasks = useMemo(
    () => tasks.filter(t => t.project_id === activeProject &&
      (filterOwner === "All" || t.owner === filterOwner)),
    [tasks, activeProject, filterOwner]
  );
  const phases = useMemo(() => {
    const m = {}; projTasks.forEach(t => (m[t.phase || "—"] = m[t.phase || "—"] || []).push(t)); return m;
  }, [projTasks]);

  const allProjTasks = useMemo(() => tasks.filter(t => t.project_id === activeProject), [tasks, activeProject]);
  const progress = allProjTasks.length ? Math.round(allProjTasks.filter(t => t.status === "Done").length / allProjTasks.length * 100) : 0;

  const mono = { fontFamily: "ui-monospace, 'SFMono-Regular', monospace" };
  const inputStyle = { background: "transparent", border: "1px solid transparent", color: C.txt, font: "inherit", padding: "4px 6px", borderRadius: 6, width: "100%", outline: "none" };
  const fIn = (e) => { e.target.style.borderColor = C.line; e.target.style.background = C.ink; };
  const fOut = (e) => { e.target.style.borderColor = "transparent"; e.target.style.background = "transparent"; };

  const sel = (val, opts, onChange, color) => (
    <select value={val} onChange={e => onChange(e.target.value)} style={{ ...mono, fontSize: 12, background: C.ink, color: color || C.dim, border: "1px solid " + C.line, borderRadius: 6, padding: "5px 8px", cursor: "pointer", outline: "none" }}>
      {opts.map(o => <option key={o} value={o} style={{ background: C.panel }}>{o}</option>)}
    </select>
  );
  const del = (onClick) => (
    <button onClick={onClick} title="delete" style={{ background: "transparent", border: "none", color: C.faint, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px" }}
      onMouseEnter={e => e.target.style.color = C.pink} onMouseLeave={e => e.target.style.color = C.faint}>×</button>
  );
  const dateInput = (val, onChange, accent) => (
    <input type="date" value={val || ""} onChange={e => onChange(e.target.value || null)}
      style={{ ...mono, fontSize: 11, background: C.ink, color: val ? accent || C.dim : C.faint, border: "1px solid " + C.line, borderRadius: 6, padding: "5px 6px", outline: "none", width: "100%" }} />
  );

  if (!loaded) return <div style={{ background: C.ink, color: C.dim, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", ...mono }}>Loading camp…</div>;

  const activeProjObj = projects.find(p => p.id === activeProject);

  return (
    <div style={{ background: C.ink, color: C.txt, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif", display: "flex" }}>

      {errMsg && (
        <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: C.pink, color: "#fff", padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 6px 24px rgba(0,0,0,.4)", maxWidth: "90vw" }}>
          {errMsg}
        </div>
      )}

      {/* Mobile top bar */}
      {isMobile && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60, height: 52, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", background: C.panel, borderBottom: "1px solid " + C.line }}>
          <button onClick={() => setDrawerOpen(true)} aria-label="Menu" style={{ background: "transparent", border: "none", color: C.txt, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: 4 }}>☰</button>
          <span style={{ fontSize: 16, fontWeight: 800, background: `linear-gradient(95deg, ${C.pink}, ${C.gold} 55%, ${C.teal})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Flamingods</span>
          <span style={{ ...mono, fontSize: 11, color: C.dim, marginLeft: "auto", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45vw" }}>
            {view === "people" ? "Camp Members" : (projects.find(p => p.id === activeProject)?.name || "")}
          </span>
        </div>
      )}

      {/* Drawer backdrop on mobile */}
      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 70 }} />
      )}

      {/* ---------------- LEFT RAIL: PROJECTS ---------------- */}
      <div style={isMobile
        ? { position: "fixed", top: 0, bottom: 0, left: 0, width: 250, zIndex: 80, transform: drawerOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform .25s ease", borderRight: "1px solid " + C.line, background: C.panel, display: "flex", flexDirection: "column", boxShadow: drawerOpen ? "4px 0 24px rgba(0,0,0,.5)" : "none" }
        : { width: 230, flexShrink: 0, borderRight: "1px solid " + C.line, background: C.panel, display: "flex", flexDirection: "column", minHeight: "100vh" }
      }>
        <div style={{ padding: "22px 18px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", background: `linear-gradient(95deg, ${C.pink}, ${C.gold} 55%, ${C.teal})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Flamingods</div>
            <div style={{ ...mono, fontSize: 10, letterSpacing: ".2em", textTransform: "uppercase", color: C.faint, marginTop: 4 }}>Midburn · Camp Tasks</div>
          </div>
          {isMobile && <button onClick={() => setDrawerOpen(false)} aria-label="Close" style={{ background: "transparent", border: "none", color: C.faint, fontSize: 22, cursor: "pointer", lineHeight: 1 }}>×</button>}
        </div>

        <div style={{ ...mono, fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: C.faint, padding: "8px 18px 6px" }}>Projects</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {projects.map(p => {
            const ts = tasks.filter(t => t.project_id === p.id);
            const done = ts.filter(t => t.status === "Done").length;
            const isActive = p.id === activeProject && view === "tasks";
            return (
              <div key={p.id} onClick={() => { setActiveProject(p.id); setView("tasks"); setDrawerOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", cursor: "pointer", background: isActive ? C.panel2 : "transparent", borderLeft: "3px solid " + (isActive ? C.gold : "transparent") }}>
                <span style={{ fontSize: 15 }}>{p.emoji || "•"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: isActive ? C.txt : C.dim, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  {ts.length > 0 && <div style={{ ...mono, fontSize: 10, color: C.faint }}>{done}/{ts.length} done</div>}
                </div>
              </div>
            );
          })}
          <button onClick={async () => { const np = await addRow("projects", setProjects, { name: "New project", emoji: "🌟", sort: nextSort(projects) }); if (np) { setActiveProject(np.id); setView("tasks"); } }}
            style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "none", padding: "10px 18px", cursor: "pointer", textAlign: "left", width: "100%" }}>+ new project</button>
        </div>

        <div onClick={() => { setView("people"); setDrawerOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", cursor: "pointer", borderTop: "1px solid " + C.line, background: view === "people" ? C.panel2 : "transparent", borderLeft: "3px solid " + (view === "people" ? C.gold : "transparent") }}>
          <span style={{ fontSize: 15 }}>🦩</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: view === "people" ? C.txt : C.dim }}>Camp Members</span>
          <span style={{ ...mono, fontSize: 10, color: C.faint, marginLeft: "auto" }}>{people.filter(p => p.name !== "Unassigned").length}</span>
        </div>
        <div style={{ ...mono, fontSize: 10, color: online ? C.teal : C.gold, padding: "8px 18px 14px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: online ? C.teal : C.gold, boxShadow: `0 0 8px ${online ? C.teal : C.gold}` }} />
          {online ? "live · synced" : "connecting…"}
        </div>
      </div>

      {/* ---------------- MAIN ---------------- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", paddingTop: isMobile ? 52 : 0 }}>

        {/* ===== PEOPLE VIEW ===== */}
        {view === "people" && (
          <div style={{ padding: isMobile ? "16px" : "28px 32px", maxWidth: 760 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 4px" }}>Camp Members</h1>
            <div style={{ color: C.dim, fontSize: 14, marginBottom: 22 }}>Add the real people in Flamingods. They become the owner options on every task.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 24px", gap: 8, ...mono, fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint, padding: "0 10px 8px" }}>
              <div>Name</div><div>Role / area</div><div />
            </div>
            {people.map(pe => (
              <div key={pe.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 24px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: C.panel, border: "1px solid " + C.line, marginBottom: 6 }}>
                <input value={pe.name} onChange={e => patchRow("people", setPeople, pe.id, { name: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} />
                <input value={pe.role || ""} placeholder="e.g. Build lead" onChange={e => patchRow("people", setPeople, pe.id, { role: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 13, color: C.dim }} />
                {pe.name !== "Unassigned" ? del(() => delRow("people", setPeople, pe.id)) : <span />}
              </div>
            ))}
            <button onClick={() => addRow("people", setPeople, { name: "New member", role: "", sort: nextSort(people) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginTop: 2 }}>+ add member</button>
          </div>
        )}

        {/* ===== TASKS VIEW ===== */}
        {view === "tasks" && activeProjObj && (
          <>
            <div style={{ padding: isMobile ? "16px 16px 14px" : "24px 32px 18px", borderBottom: "1px solid " + C.line, background: `radial-gradient(circle at 0% 0%, rgba(255,93,177,.10), transparent 45%), radial-gradient(circle at 100% 0%, rgba(61,214,196,.08), transparent 45%)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 24 }}>{activeProjObj.emoji || "•"}</span>
                <input value={activeProjObj.name} onChange={e => patchRow("projects", setProjects, activeProjObj.id, { name: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", maxWidth: 420 }} />
                {projects.length > 1 && del(() => { delRow("projects", setProjects, activeProjObj.id); const rest = projects.filter(p => p.id !== activeProjObj.id); setActiveProject(rest[0]?.id || null); })}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginTop: 16, alignItems: "center" }}>
                <div style={{ minWidth: 200, flex: 1, maxWidth: 360 }}>
                  <div style={{ ...mono, fontSize: 10.5, color: C.faint, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 6 }}>{progress}% · {allProjTasks.filter(t => t.status === "Done").length}/{allProjTasks.length} done</div>
                  <div style={{ height: 9, background: C.panel2, borderRadius: 6, overflow: "hidden", border: "1px solid " + C.line }}>
                    <div style={{ height: "100%", width: progress + "%", background: `linear-gradient(90deg, ${C.pink}, ${C.gold} 50%, ${C.teal})`, transition: "width .4s" }} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 10.5, color: C.faint, letterSpacing: ".1em", textTransform: "uppercase" }}>Owner:</span>
                  {["All", ...ownerNames].map(o => (
                    <button key={o} onClick={() => setFilterOwner(o)} style={{ ...mono, fontSize: 11, padding: "3px 9px", borderRadius: 20, cursor: "pointer", background: filterOwner === o ? C.panel2 : "transparent", color: filterOwner === o ? C.txt : C.faint, border: "1px solid " + (filterOwner === o ? C.line : "transparent") }}>{o}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding: isMobile ? "16px" : "20px 32px", overflowX: isMobile ? "visible" : "auto" }}>
              {Object.keys(phases).length === 0 && (
                <div style={{ color: C.faint, fontSize: 14, padding: "20px 0" }}>No tasks yet. Add the first one below.</div>
              )}
              {Object.keys(phases).map(phase => {
                const list = phases[phase];
                const done = allProjTasks.filter(t => (t.phase || "—") === phase && t.status === "Done").length;
                const total = allProjTasks.filter(t => (t.phase || "—") === phase).length;
                return (
                  <div key={phase} style={{ marginBottom: 24, minWidth: isMobile ? "auto" : 720 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: C.dim }}>{phase}</h3>
                      <span style={{ ...mono, fontSize: 10.5, color: C.faint }}>{done}/{total}</span>
                      <div style={{ flex: 1, height: 1, background: C.line }} />
                    </div>
                    {!isMobile && (
                    <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 120px 120px 120px 24px", gap: 8, ...mono, fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: C.faint, padding: "0 10px 6px" }}>
                      <div /><div>Task</div><div>Owner</div><div>Status</div><div>Start</div><div>Deadline</div><div />
                    </div>
                    )}
                    {list.map(t => {
                      const d = daysUntil(t.deadline);
                      const overdue = d != null && d < 0 && t.status !== "Done";
                      const soon = d != null && d >= 0 && d <= 7 && t.status !== "Done";
                      const dlAccent = t.status === "Done" ? C.teal : overdue ? C.pink : soon ? C.gold : C.dim;

                      if (isMobile) {
                        // ----- Stacked card layout for phones -----
                        return (
                          <div key={t.id} style={{ padding: "12px 14px", borderRadius: 10, background: C.panel, border: "1px solid " + (overdue ? C.pink : C.line), marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                              <input type="checkbox" checked={t.status === "Done"} onChange={e => patchRow("tasks", setTasks, t.id, { status: e.target.checked ? "Done" : "Not started" })} style={{ width: 20, height: 20, accentColor: C.teal, cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                              <textarea value={t.title} rows={1} onChange={e => patchRow("tasks", setTasks, t.id, { title: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 15, fontWeight: 600, resize: "none", lineHeight: 1.35, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? C.faint : C.txt }} />
                              {del(() => delRow("tasks", setTasks, t.id))}
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                              <label style={{ ...mono, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>Owner
                                <div style={{ marginTop: 3 }}>{sel(t.owner || "Unassigned", ownerNames, v => patchRow("tasks", setTasks, t.id, { owner: v }))}</div>
                              </label>
                              <label style={{ ...mono, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>Status
                                <div style={{ marginTop: 3 }}>{sel(t.status, STATUSES, v => patchRow("tasks", setTasks, t.id, { status: v }), STATUS_COLOR[t.status])}</div>
                              </label>
                              <label style={{ ...mono, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>Start
                                <div style={{ marginTop: 3 }}>{dateInput(t.start_date, v => patchRow("tasks", setTasks, t.id, { start_date: v }), C.dim)}</div>
                              </label>
                              <label style={{ ...mono, fontSize: 9, letterSpacing: ".1em", textTransform: "uppercase", color: C.faint }}>Deadline
                                <div style={{ marginTop: 3 }}>{dateInput(t.deadline, v => patchRow("tasks", setTasks, t.id, { deadline: v }), dlAccent)}</div>
                              </label>
                            </div>
                          </div>
                        );
                      }

                      // ----- Grid row layout for desktop -----
                      return (
                        <div key={t.id} style={{ display: "grid", gridTemplateColumns: "20px 1fr 120px 120px 120px 120px 24px", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 8, background: C.panel, border: "1px solid " + (overdue ? C.pink : C.line), marginBottom: 6 }}>
                          <input type="checkbox" checked={t.status === "Done"} onChange={e => patchRow("tasks", setTasks, t.id, { status: e.target.checked ? "Done" : "Not started" })} style={{ width: 16, height: 16, accentColor: C.teal, cursor: "pointer" }} />
                          <input value={t.title} onChange={e => patchRow("tasks", setTasks, t.id, { title: e.target.value })} onFocus={fIn} onBlur={fOut} style={{ ...inputStyle, fontSize: 13.5, textDecoration: t.status === "Done" ? "line-through" : "none", color: t.status === "Done" ? C.faint : C.txt }} />
                          {sel(t.owner || "Unassigned", ownerNames, v => patchRow("tasks", setTasks, t.id, { owner: v }))}
                          {sel(t.status, STATUSES, v => patchRow("tasks", setTasks, t.id, { status: v }), STATUS_COLOR[t.status])}
                          {dateInput(t.start_date, v => patchRow("tasks", setTasks, t.id, { start_date: v }), C.dim)}
                          {dateInput(t.deadline, v => patchRow("tasks", setTasks, t.id, { deadline: v }), dlAccent)}
                          {del(() => delRow("tasks", setTasks, t.id))}
                        </div>
                      );
                    })}
                    <button onClick={() => addRow("tasks", setTasks, { project_id: activeProject, phase: phase === "—" ? "" : phase, title: "New task", owner: "Unassigned", status: "Not started", sort: nextSort(tasks) })} style={{ ...mono, fontSize: 11, color: C.faint, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "7px 12px", cursor: "pointer", marginTop: 2 }}>+ add task</button>
                  </div>
                );
              })}
              <button onClick={() => addRow("tasks", setTasks, { project_id: activeProject, phase: "New phase", title: "New task", owner: "Unassigned", status: "Not started", sort: nextSort(tasks) })} style={{ ...mono, fontSize: 11, color: C.gold, background: "transparent", border: "1px dashed " + C.line, borderRadius: 8, padding: "8px 14px", cursor: "pointer", marginTop: 8 }}>+ add task in new phase</button>
            </div>
          </>
        )}

        {view === "tasks" && !activeProjObj && (
          <div style={{ padding: 40, color: C.faint }}>No project selected. Create one from the left rail.</div>
        )}
      </div>
    </div>
  );
}
