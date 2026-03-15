import { useState, useEffect, useRef } from "react";

// ─── Source badges ────────────────────────────────────────────────────────────
const SOURCE_META = {
  claude:   { label: "Claude",   color: "#c87941", bg: "#fdf0e6" },
  chatgpt:  { label: "ChatGPT",  color: "#19a37e", bg: "#e8f8f3" },
  gemini:   { label: "Gemini",   color: "#4285f4", bg: "#e8f0fd" },
  markdown: { label: "Markdown", color: "#7c5cbf", bg: "#f2eeff" },
  generic:  { label: "Import",   color: "#888",    bg: "#f0f0f0" },
  unknown:  { label: "Import",   color: "#888",    bg: "#f0f0f0" },
};

function sourceMeta(source, dark) {
  const m = SOURCE_META[source] || SOURCE_META.unknown;
  return {
    label: m.label,
    color: dark ? m.color : m.color,
    bg: dark ? "rgba(255,255,255,0.06)" : m.bg,
  };
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
}
function groupByDate(chats) {
  const g = {};
  chats.forEach(c => {
    const k = new Date(c.createdAt).toISOString().split("T")[0];
    if (!g[k]) g[k] = [];
    g[k].push(c);
  });
  return Object.entries(g).sort(([a],[b]) => b.localeCompare(a));
}

// ─── Simple markdown renderer ────────────────────────────────────────────────
function renderMd(text) {
  if (!text) return "";
  return text
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/```([\s\S]*?)```/g, (_,c) => `<pre style="background:rgba(0,0,0,0.06);border-radius:6px;padding:10px 12px;overflow-x:auto;font-size:12.5px;font-family:monospace;margin:8px 0;white-space:pre-wrap">${c}</pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.07);border-radius:3px;padding:1px 5px;font-size:0.9em;font-family:monospace">$1</code>')
    .replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.+?)\*/g,"<em>$1</em>")
    .replace(/^#{3}\s(.+)$/gm,"<h3 style='font-size:14px;margin:10px 0 4px;font-family:Playfair Display,serif'>$1</h3>")
    .replace(/^#{2}\s(.+)$/gm,"<h2 style='font-size:16px;margin:12px 0 4px;font-family:Playfair Display,serif'>$1</h2>")
    .replace(/^#{1}\s(.+)$/gm,"<h1 style='font-size:18px;margin:14px 0 6px;font-family:Playfair Display,serif'>$1</h1>")
    .replace(/\n/g,"<br/>");
}

// ─── Components ───────────────────────────────────────────────────────────────

function TagPill({ tag, active, onClick, dark }) {
  return (
    <span onClick={onClick} style={{
      display:"inline-block", padding:"3px 10px", borderRadius:20, fontSize:11.5,
      background: active ? (dark?"#e8c88a":"#7a4a1a") : (dark?"#2a2018":"#f0e4d4"),
      color: active ? (dark?"#1a1510":"#fff") : (dark?"#b09070":"#8a6040"),
      cursor:"pointer", marginRight:5, marginBottom:4, letterSpacing:"0.03em",
    }}>#{tag}</span>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onSaved, apiBase, dark }) {
  const d = dark;
  const [tab, setTab] = useState("manual");  // "manual" | "paste"
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Shared meta ──
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [source, setSource] = useState("claude");

  // ── Manual tab state ──
  const [turns, setTurns] = useState([{ role:"user", content:"" }]);

  function addTurn(role) {
    setTurns(prev => [...prev, { role, content:"" }]);
  }
  function updateTurn(i, content) {
    setTurns(prev => prev.map((t, idx) => idx === i ? { ...t, content } : t));
  }
  function removeTurn(i) {
    setTurns(prev => prev.filter((_, idx) => idx !== i));
  }
  function moveTurn(i, dir) {
    setTurns(prev => {
      const arr = [...prev];
      const swap = i + dir;
      if (swap < 0 || swap >= arr.length) return arr;
      [arr[i], arr[swap]] = [arr[swap], arr[i]];
      return arr;
    });
  }

  async function saveManual() {
    const msgs = turns.filter(t => t.content.trim());
    if (msgs.length === 0) { setError("Add at least one message."); return; }
    if (!title.trim()) { setError("Please add a title."); return; }
    setLoading(true); setError("");
    try {
      const payload = {
        manual: true,
        title: title.trim(),
        source,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        messages: msgs.map((t, i) => ({ role: t.role, content: t.content.trim(), index: i })),
      };
      const res = await fetch(apiBase, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.chat);
      setSaved(true);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Paste tab state ──
  const [raw, setRaw] = useState("");
  const [step, setStep] = useState("paste");
  const [preview, setPreview] = useState(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewTags, setPreviewTags] = useState("");

  async function doParse() {
    if (!raw.trim()) { setError("Paste something first."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/parse`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setPreview(data);
      setPreviewTitle(data.title || "");
      setStep("preview");
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function doPasteSave() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiBase, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ raw, title: previewTitle || undefined, tags: previewTags.split(",").map(t=>t.trim()).filter(Boolean) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      onSaved(data.chat);
      setSaved(true);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  }

  // ── Styles ──
  const overlay = { position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:20 };
  const modal = { background:d?"#1a1610":"#faf6f0",borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",fontFamily:"Lora,serif",color:d?"#e8ddd0":"#2c1f0e",position:"relative",maxHeight:"92vh",display:"flex",flexDirection:"column" };
  const inp = { width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:d?"#2a2018":"#fff",color:d?"#e8ddd0":"#2c1f0e",fontSize:13,fontFamily:"Lora,serif",outline:"none" };
  const label = { fontSize:11,letterSpacing:"0.09em",textTransform:"uppercase",color:d?"#7a6a58":"#a08060",display:"block",marginBottom:5 };
  const btnPrimary = { padding:"10px 20px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:13,fontFamily:"Lora,serif",fontWeight:500,cursor:"pointer" };
  const btnSecondary = { padding:"10px 20px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:"transparent",color:d?"#9a8a78":"#8a6a4a",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer" };

  if (saved) return (
    <div style={overlay}>
      <div style={{ ...modal, alignItems:"center", justifyContent:"center", padding:"48px 32px", textAlign:"center" }}>
        <div style={{ fontSize:52, marginBottom:16 }}>✓</div>
        <div style={{ fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>Saved!</div>
        <p style={{ fontSize:13,color:d?"#9a8a78":"#9a7a5a",marginTop:8 }}>Your chat is now in Folio.</p>
        <button onClick={onClose} style={{ ...btnPrimary, marginTop:24, padding:"10px 36px" }}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={modal}>

        {/* ── Header ── */}
        <div style={{ padding:"24px 28px 0", flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18 }}>
            <div style={{ fontFamily:"Playfair Display,serif",fontSize:21,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>
              Add Chat
            </div>
            <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:d?"#7a6a58":"#a08060",lineHeight:1 }}>✕</button>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex",gap:4,background:d?"#2a2018":"#e8d8c0",borderRadius:10,padding:4 }}>
            {[["manual","✏️  Manual Entry"],["paste","📋  Paste Import"]].map(([id,label]) => (
              <button key={id} onClick={()=>{ setTab(id); setError(""); }} style={{
                flex:1,padding:"8px 12px",borderRadius:7,border:"none",cursor:"pointer",
                fontFamily:"Lora,serif",fontSize:13,
                background:tab===id?(d?"#e8c88a":"#7a4a1a"):"transparent",
                color:tab===id?(d?"#1a1510":"#fff"):(d?"#9a8a78":"#8a6a4a"),
                fontWeight:tab===id?500:400,transition:"all 0.15s",
              }}>{label}</button>
            ))}
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex:1,overflowY:"auto",padding:"20px 28px 0" }}>

          {/* ════ MANUAL TAB ════ */}
          {tab === "manual" && <>

            {/* Meta row */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16 }}>
              <div>
                <span style={label}>Chat Title *</span>
                <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. React hooks question" style={inp} />
              </div>
              <div>
                <span style={label}>AI Source</span>
                <select value={source} onChange={e=>setSource(e.target.value)} style={{ ...inp, appearance:"none" }}>
                  <option value="claude">Claude</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="generic">Other</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <span style={label}>Tags (comma separated)</span>
              <input value={tags} onChange={e=>setTags(e.target.value)} placeholder="work, ideas, research" style={inp} />
            </div>

            {/* Turns builder */}
            <div style={{ marginBottom:12 }}>
              <span style={label}>Conversation ({turns.length} message{turns.length!==1?"s":""})</span>
            </div>

            <div style={{ display:"flex",flexDirection:"column",gap:10,marginBottom:16 }}>
              {turns.map((turn, i) => (
                <div key={i} style={{
                  borderRadius:10,
                  border:`1px solid ${turn.role==="user"?(d?"#4a3825":"#d4b896"):(d?"#1e3028":"#b8dcc8")}`,
                  background:turn.role==="user"?(d?"#221c12":"#fffaf4"):(d?"#121e18":"#f4fcf6"),
                  overflow:"hidden",
                }}>
                  {/* Turn header */}
                  <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`1px solid ${turn.role==="user"?(d?"#3a2e1a":"#e8d4b8"):(d?"#1a2e22":"#c8e8d4")}`,background:turn.role==="user"?(d?"#2a2014":"#fff8ee"):(d?"#141e18":"#eef8f2") }}>
                    <span style={{ fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",color:turn.role==="user"?(d?"#c0a060":"#8a5820"):(d?"#60a878":"#2a7a50") }}>
                      {turn.role === "user" ? "👤 User Query" : "🤖 AI Response"}
                    </span>
                    <div style={{ marginLeft:"auto",display:"flex",gap:4 }}>
                      {/* Swap role button */}
                      <button onClick={()=>setTurns(prev=>prev.map((t,idx)=>idx===i?{...t,role:t.role==="user"?"assistant":"user"}:t))}
                        title="Swap role"
                        style={{ background:"none",border:"none",cursor:"pointer",fontSize:13,color:d?"#7a6a58":"#a08060",padding:"2px 5px",borderRadius:4 }}>⇄</button>
                      {/* Move up */}
                      {i > 0 && <button onClick={()=>moveTurn(i,-1)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:d?"#7a6a58":"#a08060",padding:"2px 5px",borderRadius:4 }}>↑</button>}
                      {/* Move down */}
                      {i < turns.length-1 && <button onClick={()=>moveTurn(i,1)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:d?"#7a6a58":"#a08060",padding:"2px 5px",borderRadius:4 }}>↓</button>}
                      {/* Remove */}
                      {turns.length > 1 && <button onClick={()=>removeTurn(i)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#c06050",padding:"2px 5px",borderRadius:4 }}>✕</button>}
                    </div>
                  </div>
                  {/* Textarea */}
                  <textarea
                    value={turn.content}
                    onChange={e=>updateTurn(i,e.target.value)}
                    placeholder={turn.role==="user" ? "Type the user's question or message…" : "Type the AI's response…"}
                    style={{ width:"100%",padding:"12px",border:"none",background:"transparent",color:d?"#e8ddd0":"#2c1f0e",fontSize:13.5,fontFamily:"Lora,serif",lineHeight:1.7,resize:"vertical",minHeight:80,outline:"none",boxSizing:"border-box" }}
                  />
                </div>
              ))}
            </div>

            {/* Add turn buttons */}
            <div style={{ display:"flex",gap:8,marginBottom:20 }}>
              <button onClick={()=>addTurn("user")} style={{
                flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontFamily:"Lora,serif",fontSize:13,
                border:`1px dashed ${d?"#4a3825":"#c8a870"}`,background:"transparent",
                color:d?"#c0a060":"#8a5820",
              }}>+ User Query</button>
              <button onClick={()=>addTurn("assistant")} style={{
                flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontFamily:"Lora,serif",fontSize:13,
                border:`1px dashed ${d?"#1e3828":"#98c8a8"}`,background:"transparent",
                color:d?"#60a878":"#2a7a50",
              }}>+ AI Response</button>
            </div>
          </>}

          {/* ════ PASTE TAB ════ */}
          {tab === "paste" && <>
            {step === "paste" && <>
              <p style={{ fontSize:13,color:d?"#9a8a78":"#9a7a5a",marginBottom:16,lineHeight:1.65 }}>
                Paste anything — Claude, ChatGPT, Gemini copy-paste or JSON export. Format is auto-detected.
              </p>
              <textarea
                value={raw} onChange={e=>setRaw(e.target.value)}
                placeholder={"Paste your chat here… Works with: • Claude.ai copy-paste /n• ChatGPT copy-paste /n• Gemini copy-paste /n• Any JSON export"}
                style={{ ...inp,height:240,resize:"vertical",lineHeight:1.65,marginBottom:4 }}
              />
            </>}

            {step === "preview" && preview && <>
              <div style={{ display:"flex",gap:8,marginBottom:16,flexWrap:"wrap" }}>
                <span style={{ padding:"3px 12px",borderRadius:20,fontSize:12,background:sourceMeta(preview.source,d).bg,color:sourceMeta(preview.source,d).color,fontWeight:500 }}>{sourceMeta(preview.source,d).label}</span>
                <span style={{ padding:"3px 12px",borderRadius:20,fontSize:12,background:d?"#2a2018":"#f0e4d4",color:d?"#c0a878":"#8a6040" }}>{preview.messageCount} messages detected</span>
              </div>
              <div style={{ marginBottom:12 }}>
                <span style={label}>Title</span>
                <input value={previewTitle} onChange={e=>setPreviewTitle(e.target.value)} style={inp} />
              </div>
              <div style={{ marginBottom:16 }}>
                <span style={label}>Tags</span>
                <input value={previewTags} onChange={e=>setPreviewTags(e.target.value)} placeholder="work, ideas, research" style={inp} />
              </div>
              <div style={{ background:d?"#2a2018":"#f5ede2",borderRadius:10,padding:14,marginBottom:4 }}>
                <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",marginBottom:10,letterSpacing:"0.07em",textTransform:"uppercase" }}>Preview (first 4 messages)</div>
                {preview.messages.map((m,i) => (
                  <div key={i} style={{ marginBottom:8,display:"flex",gap:10,alignItems:"flex-start" }}>
                    <span style={{ fontSize:11,padding:"2px 8px",borderRadius:10,flexShrink:0,marginTop:2,background:m.role==="user"?(d?"#3a2e20":"#e8d8c0"):(d?"#1a3020":"#d8f0e0"),color:m.role==="user"?(d?"#c0a878":"#7a5030"):(d?"#78b890":"#2a7a50") }}>{m.role==="user"?"user":"ai"}</span>
                    <span style={{ fontSize:12.5,lineHeight:1.6,color:d?"#c0b0a0":"#5a4030" }}>{m.content.slice(0,180)}{m.content.length>180?"…":""}</span>
                  </div>
                ))}
              </div>
            </>}
          </>}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding:"16px 28px 24px",flexShrink:0,borderTop:`1px solid ${d?"#2e2218":"#e8ddd0"}`,marginTop:12 }}>
          {error && <div style={{ color:"#c0604a",fontSize:12.5,marginBottom:10 }}>{error}</div>}

          {tab === "manual" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={onClose} style={{ ...btnSecondary,flex:1 }}>Cancel</button>
              <button onClick={saveManual} disabled={loading} style={{ ...btnPrimary,flex:3,opacity:loading?0.6:1 }}>
                {loading ? "Saving…" : `Save Chat (${turns.filter(t=>t.content.trim()).length} messages) ✓`}
              </button>
            </div>
          )}

          {tab === "paste" && step === "paste" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={onClose} style={{ ...btnSecondary,flex:1 }}>Cancel</button>
              <button onClick={doParse} disabled={loading} style={{ ...btnPrimary,flex:3,opacity:loading?0.6:1 }}>
                {loading ? "Parsing…" : "Parse & Preview →"}
              </button>
            </div>
          )}

          {tab === "paste" && step === "preview" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setStep("paste")} style={{ ...btnSecondary,flex:1 }}>← Back</button>
              <button onClick={doPasteSave} disabled={loading} style={{ ...btnPrimary,flex:3,opacity:loading?0.6:1 }}>
                {loading ? "Saving…" : "Save to Folio ✓"}
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Chat bubble view
function BubbleView({ messages, dark }) {
  const d = dark;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:16,padding:"8px 0" }}>
      {messages.map((msg, i) => (
        <div key={i} style={{ display:"flex",flexDirection:"column",alignItems:msg.role==="user"?"flex-end":"flex-start" }}>
          <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",marginBottom:5,marginLeft:msg.role!=="user"?4:0,marginRight:msg.role==="user"?4:0 }}>
            {msg.role === "user" ? "You" : "AI"}
          </div>
          <div style={{
            maxWidth:"78%",padding:"14px 18px",borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
            background:msg.role==="user"?(d?"#3a2e1e":"#7a4a1a"):(d?"#252018":"#fff"),
            color:msg.role==="user"?(d?"#f0e0c8":"#fff"):(d?"#d8c8b0":"#2c1f0e"),
            fontSize:14,lineHeight:1.75,fontFamily:"Lora,serif",
            border:msg.role!=="user"?`1px solid ${d?"#2e2218":"#e8dcd0"}`:undefined,
            boxShadow:d?"0 2px 10px rgba(0,0,0,0.25)":"0 2px 10px rgba(120,80,30,0.07)",
          }} dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
        </div>
      ))}
    </div>
  );
}

// Transcript view
function TranscriptView({ messages, dark }) {
  const d = dark;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
      {messages.map((msg, i) => (
        <div key={i} style={{ padding:"20px 0",borderBottom:`1px solid ${d?"#2e2218":"#ede4d8"}`,display:"flex",gap:20 }}>
          <div style={{ width:80,flexShrink:0,paddingTop:3 }}>
            <span style={{
              fontSize:11,fontWeight:600,letterSpacing:"0.09em",textTransform:"uppercase",
              color:msg.role==="user"?(d?"#c0a878":"#7a4a1a"):(d?"#78b890":"#2a7a50"),
            }}>{msg.role==="user"?"You":"AI"}</span>
          </div>
          <div style={{ flex:1,fontSize:14,lineHeight:1.85,color:d?"#d0c0a8":"#3c2a18",fontFamily:"Lora,serif" }}
            dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function FolioApp() {
  const [dark, setDark] = useState(false);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [chatDetail, setChatDetail] = useState(null);
  const [viewMode, setViewMode] = useState("bubble"); // bubble | transcript
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [sidebarSection, setSidebarSection] = useState("browse");
  const [apiBase, setApiBase] = useState("http://localhost:3001/api/chats");
  const [showImport, setShowImport] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const d = dark;

  useEffect(() => { setTimeout(()=>setLoaded(true),100); }, []);

  async function loadChats() {
    setLoading(true); setFetchError("");
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChats(data.chats || []);
    } catch(e) {
      setFetchError(e.message);
    } finally { setLoading(false); }
  }

  async function openChat(chat) {
    setActiveChat(chat.id);
    setChatDetail(null);
    try {
      const res = await fetch(`${apiBase.replace(/\/+$/, "")}/${chat.id}`);
      const data = await res.json();
      setChatDetail(data);
    } catch(e) { setChatDetail({ ...chat, messages:[] }); }
  }

  function deleteChat(id, e) {
    e.stopPropagation();
    setConfirmDeleteId(id);
  }

  async function doDelete(id) {
    try {
      await fetch(`${apiBase.replace(/\/+$/,"")}/${id}`, { method:"DELETE" });
      setChats(prev => prev.filter(c=>c.id!==id));
      if (activeChat===id) { setActiveChat(null); setChatDetail(null); }
    } catch {}
    setConfirmDeleteId(null);
  }

  const allTags = [...new Set(chats.flatMap(c=>c.tags||[]))];
  const filtered = chats.filter(c => {
    const q = search.toLowerCase();
    const mS = !q || c.title.toLowerCase().includes(q) || (c.preview||"").toLowerCase().includes(q);
    const mT = !activeTag || (c.tags||[]).includes(activeTag);
    return mS && mT;
  });
  const grouped = groupByDate(filtered);

  // sidebar button
  const SBtn = ({id, icon, label}) => (
    <button onClick={()=>setSidebarSection(id)} style={{
      display:"flex",alignItems:"center",gap:10,width:"100%",
      padding:"9px 12px",borderRadius:8,border:"none",marginBottom:2,
      background:sidebarSection===id?(d?"rgba(232,200,138,0.12)":"rgba(120,74,26,0.1)"):"transparent",
      color:sidebarSection===id?(d?"#e8c88a":"#7a4a1a"):(d?"#9a8a78":"#8a6a4a"),
      fontSize:13.5,fontFamily:"Lora,serif",cursor:"pointer",fontWeight:sidebarSection===id?500:400,
    }}>
      <span style={{fontSize:16,opacity:0.8}}>{icon}</span>{label}
    </button>
  );

  const inputStyle = { width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:d?"#1e1812":"#faf6f0",color:d?"#e8ddd0":"#2c1f0e",fontSize:13,fontFamily:"Lora,serif",outline:"none",marginBottom:8 };

  return (
    <div style={{ minHeight:"100vh",display:"flex",fontFamily:"Lora,Georgia,serif",background:d?"#1a1510":"#faf6f0",color:d?"#e8ddd0":"#2c1f0e",transition:"background 0.4s,color 0.4s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital,wght@0,400;0,500;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:${d?"#5a4a38":"#c8a97e"};border-radius:3px}
        .chat-row{cursor:pointer;transition:background 0.15s;}
        .chat-row:hover{background:${d?"rgba(255,255,255,0.04)":"rgba(120,80,30,0.04)"} !important;}
        .sb-btn:hover{background:${d?"rgba(255,255,255,0.06)":"rgba(120,80,30,0.06)"} !important;}
        .fade-in{opacity:0;animation:fadeUp 0.45s forwards;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input,textarea{outline:none;}
        input::placeholder,textarea::placeholder{color:${d?"#5a4a38":"#b89a78"}}
      `}</style>

      {showImport && (
        <ImportModal
          dark={d}
          apiBase={apiBase}
          onClose={() => setShowImport(false)}
          onSaved={(chat) => { setChats(prev=>[chat,...prev]); setShowImport(false); }}
        />
      )}

      {confirmDeleteId && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ background:d?"#1e1812":"#faf6f0",borderRadius:14,padding:"32px 36px",maxWidth:360,width:"100%",fontFamily:"Lora,serif",textAlign:"center",boxShadow:"0 16px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize:32,marginBottom:12 }}>🗑</div>
            <div style={{ fontFamily:"Playfair Display,serif",fontSize:18,fontWeight:700,color:d?"#e8ddd0":"#2c1f0e",marginBottom:8 }}>Delete this chat?</div>
            <p style={{ fontSize:13,color:d?"#9a8a78":"#9a7a5a",marginBottom:24,lineHeight:1.6 }}>This cannot be undone.</p>
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setConfirmDeleteId(null)} style={{ flex:1,padding:"10px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:"transparent",color:d?"#9a8a78":"#8a6a4a",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>doDelete(confirmDeleteId)} style={{ flex:1,padding:"10px",borderRadius:8,border:"none",background:"#c0504a",color:"#fff",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer",fontWeight:500 }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sidebar ── */}
      <div style={{ width:260,minHeight:"100vh",background:d?"#120f0b":"#f0e8dc",borderRight:`1px solid ${d?"#2e2218":"#ddd0be"}`,display:"flex",flexDirection:"column",flexShrink:0,transition:"background 0.4s" }}>
        {/* Logo */}
        <div style={{ padding:"28px 24px 18px",borderBottom:`1px solid ${d?"#2e2218":"#ddd0be"}` }}>
          <div style={{ fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>Folio</div>
          <div style={{ fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:2,color:d?"#7a6a58":"#a08060" }}>AI Chat Archive</div>
        </div>

        {/* Import button */}
        <div style={{ padding:"14px 16px 6px" }}>
          <button onClick={()=>setShowImport(true)} style={{
            width:"100%",padding:"10px",borderRadius:8,border:`1px dashed ${d?"#5a4a38":"#c8a870"}`,
            background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"Lora,serif",
            color:d?"#c0a878":"#8a6040",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
            transition:"background 0.15s",
          }}>
            <span style={{fontSize:18}}>+</span> Import Chat
          </button>
        </div>

        {/* Nav */}
        <div style={{ padding:"10px 12px 4px" }}>
          <SBtn id="browse" icon="◈" label="Browse Chats" />
          <SBtn id="search" icon="⌕" label="Search" />
          <SBtn id="tags"   icon="◇" label="Tags" />
          <SBtn id="api"    icon="⇡" label="API Settings" />
        </div>

        {/* Section panels */}
        <div style={{ flex:1,padding:"8px 16px 16px",overflowY:"auto" }}>
          {sidebarSection==="search" && (
            <>
              <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>Search</div>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title or content…" style={inputStyle} />
              {search && <div style={{ fontSize:12,color:d?"#9a8a78":"#9a7a5a" }}>{filtered.length} result{filtered.length!==1?"s":""}</div>}
            </>
          )}

          {sidebarSection==="tags" && (
            <>
              <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>Filter by Tag</div>
              <TagPill tag="all" active={!activeTag} onClick={()=>setActiveTag(null)} dark={d} />
              {allTags.map(t=><TagPill key={t} tag={t} active={activeTag===t} onClick={()=>setActiveTag(activeTag===t?null:t)} dark={d} />)}
              {allTags.length===0 && <div style={{ fontSize:12,color:d?"#5a4a38":"#c0a080",fontStyle:"italic" }}>No tags yet</div>}
            </>
          )}

          {sidebarSection==="api" && (
            <>
              <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>API Base URL</div>
              <input value={apiBase} onChange={e=>setApiBase(e.target.value)} placeholder="http://localhost:3001/api/chats" style={inputStyle} />
              <button onClick={loadChats} disabled={loading} style={{ width:"100%",padding:"10px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer",opacity:loading?0.6:1,marginBottom:10 }}>
                {loading?"Loading…":"Load Chats"}
              </button>
              {fetchError && <div style={{ fontSize:12,color:"#c0604a" }}>{fetchError}</div>}
              <div style={{ fontSize:11.5,color:d?"#5a4a38":"#b09070",lineHeight:1.7,marginTop:10 }}>
                Default: <code>localhost:3001</code><br/>
                Deploy your backend then update this URL for your phone app to sync.
              </div>
            </>
          )}

          {sidebarSection==="browse" && (
            <>
              <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>
                {filtered.length} chat{filtered.length!==1?"s":""}
              </div>
              {grouped.map(([date,dayChats])=>(
                <div key={date} style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10.5,color:d?"#9a8a78":"#a08060",marginBottom:4,letterSpacing:"0.04em" }}>
                    {new Date(date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                  </div>
                  {dayChats.map(c=>{
                    const sm = sourceMeta(c.source,d);
                    return (
                      <div key={c.id} className="chat-row" onClick={()=>openChat(c)} style={{
                        padding:"7px 8px",borderRadius:6,marginBottom:3,
                        background:activeChat===c.id?(d?"rgba(232,200,138,0.1)":"rgba(120,74,26,0.08)"):"transparent",
                        borderLeft:`2px solid ${activeChat===c.id?(d?"#e8c88a":"#7a4a1a"):"transparent"}`,
                        transition:"all 0.15s",
                      }}>
                        <div style={{ fontSize:12.5,color:d?"#c8b898":"#5a3a1a",marginBottom:2 }}>{c.title}</div>
                        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                          <span style={{ fontSize:10.5,padding:"1px 7px",borderRadius:10,background:sm.bg,color:sm.color }}>{sm.label}</span>
                          <span style={{ fontSize:10.5,color:d?"#5a4a38":"#c0a080" }}>{c.messageCount}msg</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              {filtered.length===0 && <div style={{ fontSize:12,color:d?"#5a4a38":"#c0a080",fontStyle:"italic",marginTop:8 }}>No chats yet. Import one!</div>}
            </>
          )}
        </div>

        {/* Dark toggle */}
        <div style={{ padding:16,borderTop:`1px solid ${d?"#2e2218":"#ddd0be"}` }}>
          <button onClick={()=>setDark(!d)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:"transparent",cursor:"pointer",color:d?"#9a8a78":"#8a6a4a",fontSize:13,fontFamily:"Lora,serif" }}>
            <span style={{fontSize:16}}>{d?"☀":"◑"}</span>{d?"Light mode":"Dark mode"}
          </button>
        </div>
      </div>

      {/* ── Main area ── */}
      <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column" }}>
        {!activeChat && (
          <div style={{ flex:1,padding:"48px 56px",opacity:loaded?1:0,transition:"opacity 0.6s" }}>
            {/* Header */}
            <div style={{ marginBottom:48 }}>
              <div style={{ fontSize:12,letterSpacing:"0.15em",textTransform:"uppercase",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>
                {new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
              </div>
              <h1 style={{ fontFamily:"Playfair Display,serif",fontSize:40,fontWeight:700,lineHeight:1.1,color:d?"#e8ddd0":"#2c1f0e",letterSpacing:"-0.5px" }}>
                {activeTag?`#${activeTag}`:search?`"${search}"`:"Chat Archive"}
              </h1>
              <div style={{ width:64,height:2,background:d?"#e8c88a":"#7a4a1a",marginTop:16,borderRadius:1 }} />
            </div>

            {grouped.length===0 && (
              <div style={{ textAlign:"center",padding:"80px 0" }}>
                <div style={{ fontSize:48,marginBottom:16 }}>◈</div>
                <div style={{ fontFamily:"Playfair Display,serif",fontSize:22,color:d?"#5a4a38":"#c0a880",fontStyle:"italic" }}>No chats yet</div>
                <p style={{ fontSize:14,color:d?"#5a4a38":"#c0a080",marginTop:10 }}>Click <strong>Import Chat</strong> in the sidebar to get started.</p>
                <button onClick={()=>setShowImport(true)} style={{ marginTop:24,padding:"12px 32px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:14,fontFamily:"Lora,serif",cursor:"pointer" }}>+ Import Chat</button>
              </div>
            )}

            {grouped.map(([date,dayChats],gi)=>(
              <div key={date} className="fade-in" style={{ marginBottom:48,animationDelay:`${gi*0.08}s` }}>
                <div style={{ display:"flex",alignItems:"center",gap:16,marginBottom:20 }}>
                  <div style={{ fontFamily:"Playfair Display,serif",fontStyle:"italic",fontSize:15,color:d?"#c0a878":"#8a6040" }}>{fmtDate(dayChats[0].createdAt)}</div>
                  <div style={{ flex:1,height:1,background:d?"#2e2218":"#ddd0be" }} />
                  <div style={{ fontSize:12,color:d?"#5a4a38":"#c0a080" }}>{dayChats.length} chat{dayChats.length!==1?"s":""}</div>
                </div>

                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:18 }}>
                  {dayChats.map((chat)=>{
                    const sm = sourceMeta(chat.source,d);
                    return (
                      <div key={chat.id} className="chat-row" onClick={()=>openChat(chat)} style={{
                        background:d?"#1e1812":"#fff",
                        border:`1px solid ${d?"#2e2218":"#ddd0be"}`,
                        borderRadius:12,padding:"22px 24px",
                        boxShadow:d?"0 2px 12px rgba(0,0,0,0.25)":"0 2px 12px rgba(120,80,30,0.06)",
                        cursor:"pointer",position:"relative",
                      }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                          <span style={{ fontSize:11.5,padding:"3px 10px",borderRadius:20,background:sm.bg,color:sm.color,fontWeight:500 }}>{sm.label}</span>
                          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                            <span style={{ fontSize:11,color:d?"#5a4a38":"#c0a080" }}>{fmtTime(chat.createdAt)}</span>
                            <button onClick={e=>deleteChat(chat.id,e)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:d?"#5a4a38":"#c0a080",padding:"2px 4px",borderRadius:4,opacity:0.6 }}>✕</button>
                          </div>
                        </div>
                        <h2 style={{ fontFamily:"Playfair Display,serif",fontSize:17,fontWeight:700,lineHeight:1.3,color:d?"#e8ddd0":"#2c1f0e",marginBottom:8 }}>{chat.title}</h2>
                        <p style={{ fontSize:13,lineHeight:1.7,color:d?"#8a7a68":"#7a6050",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" }}>
                          {chat.preview || "—"}
                        </p>
                        <div style={{ marginTop:12,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center" }}>
                          <span style={{ fontSize:11.5,color:d?"#5a4a38":"#c0a080" }}>{chat.messageCount} messages</span>
                          {(chat.tags||[]).map(t=><span key={t} style={{ fontSize:11,padding:"2px 8px",borderRadius:20,background:d?"#2a2018":"#f0e4d4",color:d?"#b09070":"#8a6040" }}>#{t}</span>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeChat && chatDetail && (
          <div style={{ flex:1,display:"flex",flexDirection:"column" }}>
            {/* Chat header */}
            <div style={{ padding:"24px 40px 20px",borderBottom:`1px solid ${d?"#2e2218":"#e8ddd0"}`,background:d?"#161210":"#f5ede2",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
              <button onClick={()=>{setActiveChat(null);setChatDetail(null);}} style={{ background:"none",border:"none",cursor:"pointer",fontSize:18,color:d?"#9a8a78":"#8a6a4a",padding:"4px 8px",borderRadius:6,marginRight:4 }}>←</button>
              <div style={{ flex:1,minWidth:200 }}>
                <div style={{ fontFamily:"Playfair Display,serif",fontSize:20,fontWeight:700,color:d?"#e8ddd0":"#2c1f0e" }}>{chatDetail.title}</div>
                <div style={{ display:"flex",gap:10,marginTop:6,flexWrap:"wrap",alignItems:"center" }}>
                  <span style={{ fontSize:11.5,padding:"2px 10px",borderRadius:20,...(()=>{const sm=sourceMeta(chatDetail.source,d);return{background:sm.bg,color:sm.color};})() }}>{sourceMeta(chatDetail.source,d).label}</span>
                  <span style={{ fontSize:12,color:d?"#7a6a58":"#a08060" }}>{chatDetail.messageCount} messages · {fmtDate(chatDetail.createdAt)}</span>
                  {(chatDetail.tags||[]).map(t=><span key={t} style={{ fontSize:11,padding:"2px 8px",borderRadius:20,background:d?"#2a2018":"#f0e4d4",color:d?"#b09070":"#8a6040" }}>#{t}</span>)}
                </div>
              </div>
              {/* View toggle */}
              <div style={{ display:"flex",background:d?"#2a2018":"#e8d8c0",borderRadius:8,padding:3,gap:2 }}>
                {["bubble","transcript"].map(mode=>(
                  <button key={mode} onClick={()=>setViewMode(mode)} style={{
                    padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12.5,fontFamily:"Lora,serif",
                    background:viewMode===mode?(d?"#e8c88a":"#7a4a1a"):"transparent",
                    color:viewMode===mode?(d?"#1a1510":"#fff"):(d?"#9a8a78":"#8a6a4a"),
                    fontWeight:viewMode===mode?500:400,transition:"all 0.15s",
                  }}>{mode==="bubble"?"💬 Bubbles":"📄 Transcript"}</button>
                ))}
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex:1,overflowY:"auto",padding:viewMode==="bubble"?"32px 10% 48px":"0 10% 48px" }}>
              {viewMode==="bubble"
                ? <BubbleView messages={chatDetail.messages||[]} dark={d} />
                : <TranscriptView messages={chatDetail.messages||[]} dark={d} />
              }
              {(!chatDetail.messages||chatDetail.messages.length===0) && (
                <div style={{ textAlign:"center",padding:"60px 0",color:d?"#5a4a38":"#c0a080",fontStyle:"italic" }}>No messages found.</div>
              )}
            </div>
          </div>
        )}

        {activeChat && !chatDetail && (
          <div style={{ flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:d?"#5a4a38":"#c0a080",fontStyle:"italic" }}>Loading…</div>
        )}
      </div>
    </div>
  );
}