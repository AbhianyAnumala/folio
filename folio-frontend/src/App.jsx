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
  return { label: m.label, color: m.color, bg: dark ? "rgba(255,255,255,0.06)" : m.bg };
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

// ─── Markdown renderer ────────────────────────────────────────────────────────
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

// ─── Empty attachments factory ────────────────────────────────────────────────
function emptyAttachments() {
  return { images: [], tables: [], urls: [] };
}

function hasAnyAttachment(att) {
  if (!att) return false;
  return (att.images?.length > 0) || (att.tables?.length > 0) || (att.urls?.length > 0);
}

// ─── Rich Attachments Renderer ────────────────────────────────────────────────
function AttachmentsView({ attachments, dark }) {
  const d = dark;
  if (!hasAnyAttachment(attachments)) return null;
  const { images=[], tables=[], urls=[] } = attachments;

  return (
    <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:12 }}>

      {/* Images */}
      {images.length > 0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {images.map((img, i) => (
            <div key={i} style={{ borderRadius:8, overflow:"hidden", border:`1px solid ${d?"#2e2218":"#e0d4c4"}`, maxWidth:320 }}>
              <img src={img.url} alt={img.caption||`image ${i+1}`}
                style={{ display:"block", maxWidth:"100%", maxHeight:240, objectFit:"cover" }}
                onError={e => { e.target.style.display="none"; }}
              />
              {img.caption && (
                <div style={{ padding:"6px 10px", fontSize:11.5, color:d?"#9a8a78":"#9a7a5a", fontStyle:"italic", background:d?"#1e1812":"#faf6f0" }}>
                  {img.caption}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tables */}
      {tables.map((tbl, ti) => (
        <div key={ti} style={{ borderRadius:8, overflow:"hidden", border:`1px solid ${d?"#2e2218":"#e0d4c4"}` }}>
          {tbl.caption && (
            <div style={{ padding:"7px 12px", fontSize:12, fontWeight:600, background:d?"#2a2018":"#f5ede2", color:d?"#c0a878":"#7a5030", borderBottom:`1px solid ${d?"#2e2218":"#e0d4c4"}` }}>
              {tbl.caption}
            </div>
          )}
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13, fontFamily:"Lora,serif" }}>
              {tbl.headers?.length > 0 && (
                <thead>
                  <tr>
                    {tbl.headers.map((h,hi) => (
                      <th key={hi} style={{ padding:"8px 12px", textAlign:"left", background:d?"#241e14":"#f0e8dc", color:d?"#c0a878":"#7a5030", fontWeight:600, fontSize:12, letterSpacing:"0.05em", borderBottom:`1px solid ${d?"#3a2e20":"#ddd0be"}`, whiteSpace:"nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {tbl.rows?.map((row, ri) => (
                  <tr key={ri} style={{ background: ri%2===0 ? "transparent" : (d?"rgba(255,255,255,0.02)":"rgba(0,0,0,0.015)") }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding:"8px 12px", color:d?"#d0c0a8":"#3c2a18", borderBottom:`1px solid ${d?"#2a2018":"#ede4d8"}` }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* URLs */}
      {urls.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {urls.map((u, i) => (
            <a key={i} href={u.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none" }}>
              <div style={{
                display:"flex", gap:12, alignItems:"flex-start", padding:"10px 14px",
                borderRadius:8, border:`1px solid ${d?"#2e2218":"#e0d4c4"}`,
                background:d?"#1e1812":"#fff",
                transition:"background 0.15s",
              }}>
                {u.favicon && (
                  <img src={u.favicon} alt="" style={{ width:16, height:16, marginTop:2, flexShrink:0, borderRadius:2 }}
                    onError={e=>e.target.style.display="none"} />
                )}
                {!u.favicon && <span style={{ fontSize:14, marginTop:1, flexShrink:0 }}>🔗</span>}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13.5, fontWeight:500, color:d?"#c0d0e8":"#2a4a7a", marginBottom:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {u.title || u.href}
                  </div>
                  {u.description && (
                    <div style={{ fontSize:12, color:d?"#9a8a78":"#9a7a5a", lineHeight:1.5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>
                      {u.description}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:d?"#5a4a38":"#c0a080", marginTop:4, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {u.href}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tag Pill ─────────────────────────────────────────────────────────────────
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

// ─── Image Uploader (for turn builder) ───────────────────────────────────────
function ImageUploader({ apiBase, onUploaded, dark }) {
  const d = dark;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef();

  async function handleFile(file) {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch(`${apiBase.replace(/\/api\/chats.*/,"/api/upload")}`, {
        method:"POST", body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUploaded({ url: data.url, publicId: data.publicId, width: data.width, height: data.height, caption: "" });
    } catch(e) { setError(e.message); }
    finally { setUploading(false); }
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display:"none" }}
        onChange={e => handleFile(e.target.files[0])} />
      <button onClick={()=>inputRef.current.click()} disabled={uploading} style={{
        padding:"6px 12px", borderRadius:7, border:`1px dashed ${d?"#5a4a38":"#c0a070"}`,
        background:"transparent", cursor:"pointer", fontSize:12.5, fontFamily:"Lora,serif",
        color:d?"#b09070":"#8a6040", opacity: uploading ? 0.6 : 1,
      }}>
        {uploading ? "Uploading…" : "📷 Add Image"}
      </button>
      {error && <span style={{ fontSize:11.5, color:"#c06050", marginLeft:8 }}>{error}</span>}
    </div>
  );
}

// ─── Table Editor ─────────────────────────────────────────────────────────────
function TableEditor({ table, onChange, onRemove, dark }) {
  const d = dark;
  const inp = (extra={}) => ({
    padding:"5px 8px", border:`1px solid ${d?"#3a2e20":"#d0b898"}`,
    background:d?"#2a2018":"#fff", color:d?"#e8ddd0":"#2c1f0e",
    fontSize:12.5, fontFamily:"Lora,serif", outline:"none", borderRadius:5,
    width:"100%", ...extra,
  });

  function setCaption(v)  { onChange({ ...table, caption: v }); }
  function setHeader(i,v) { const h=[...table.headers]; h[i]=v; onChange({...table,headers:h}); }
  function setCell(r,c,v) { const rows=table.rows.map(row=>[...row]); rows[r][c]=v; onChange({...table,rows}); }
  function addCol() {
    onChange({ ...table, headers:[...table.headers,""], rows: table.rows.map(r=>[...r,""]) });
  }
  function addRow() {
    onChange({ ...table, rows: [...table.rows, table.headers.map(()=>"")] });
  }
  function removeCol(ci) {
    onChange({ ...table, headers: table.headers.filter((_,i)=>i!==ci), rows: table.rows.map(r=>r.filter((_,i)=>i!==ci)) });
  }
  function removeRow(ri) {
    onChange({ ...table, rows: table.rows.filter((_,i)=>i!==ri) });
  }

  return (
    <div style={{ border:`1px solid ${d?"#2e2218":"#e0d0c0"}`, borderRadius:8, overflow:"hidden", marginBottom:8 }}>
      {/* Table header bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:d?"#241e14":"#f5ede2", borderBottom:`1px solid ${d?"#2e2218":"#e0d0c0"}` }}>
        <input value={table.caption} onChange={e=>setCaption(e.target.value)} placeholder="Table caption (optional)"
          style={{ ...inp(), flex:1 }} />
        <button onClick={onRemove} style={{ background:"none",border:"none",cursor:"pointer",color:"#c06050",fontSize:14 }}>✕</button>
      </div>
      {/* Column headers */}
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr>
              {table.headers.map((h,ci) => (
                <th key={ci} style={{ padding:"4px 6px", background:d?"#1e1812":"#faf0e0" }}>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    <input value={h} onChange={e=>setHeader(ci,e.target.value)} placeholder={`Col ${ci+1}`}
                      style={{ ...inp(), fontWeight:600 }} />
                    <button onClick={()=>removeCol(ci)} style={{ background:"none",border:"none",cursor:"pointer",color:d?"#5a4a38":"#c0a080",fontSize:12,flexShrink:0 }}>✕</button>
                  </div>
                </th>
              ))}
              <th style={{ padding:"4px 6px", background:d?"#1e1812":"#faf0e0", width:32 }}>
                <button onClick={addCol} style={{ background:"none",border:"none",cursor:"pointer",color:d?"#c0a878":"#8a6040",fontSize:18 }}>+</button>
              </th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row,ri) => (
              <tr key={ri}>
                {row.map((cell,ci) => (
                  <td key={ci} style={{ padding:"4px 6px", borderTop:`1px solid ${d?"#2a2018":"#ede4d8"}` }}>
                    <input value={cell} onChange={e=>setCell(ri,ci,e.target.value)} style={inp()} />
                  </td>
                ))}
                <td style={{ padding:"4px 6px", borderTop:`1px solid ${d?"#2a2018":"#ede4d8"}`, width:32 }}>
                  <button onClick={()=>removeRow(ri)} style={{ background:"none",border:"none",cursor:"pointer",color:d?"#5a4a38":"#c0a080",fontSize:13 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ padding:"6px 12px", background:d?"#1a1510":"#faf6f0", borderTop:`1px solid ${d?"#2a2018":"#ede4d8"}` }}>
        <button onClick={addRow} style={{ background:"none",border:"none",cursor:"pointer",color:d?"#c0a878":"#8a6040",fontSize:12.5,fontFamily:"Lora,serif" }}>
          + Add Row
        </button>
      </div>
    </div>
  );
}

// ─── URL Entry ────────────────────────────────────────────────────────────────
function UrlEntry({ url, onChange, onRemove, dark }) {
  const d = dark;
  const inp = (ph) => ({
    style:{ width:"100%", padding:"7px 10px", borderRadius:7,
      border:`1px solid ${d?"#3a2e20":"#d0b898"}`,
      background:d?"#2a2018":"#fff", color:d?"#e8ddd0":"#2c1f0e",
      fontSize:12.5, fontFamily:"Lora,serif", outline:"none" },
    placeholder:ph,
  });

  async function fetchMeta() {
    if (!url.href?.startsWith("http")) return;
    try {
      // Pull favicon from Google's service + try to get page title via proxy
      const favicon = `https://www.google.com/s2/favicons?domain=${new URL(url.href).hostname}&sz=32`;
      onChange({ ...url, favicon });
    } catch {}
  }

  return (
    <div style={{ border:`1px solid ${d?"#2e2218":"#e0d0c0"}`, borderRadius:8, padding:"10px 12px", marginBottom:8 }}>
      <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:7 }}>
        <span style={{ fontSize:16 }}>🔗</span>
        <input value={url.href} onChange={e=>onChange({...url,href:e.target.value})} onBlur={fetchMeta}
          {...inp("https://example.com")} />
        <button onClick={onRemove} style={{ background:"none",border:"none",cursor:"pointer",color:"#c06050",fontSize:14,flexShrink:0 }}>✕</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
        <input value={url.title} onChange={e=>onChange({...url,title:e.target.value})}
          {...inp("Title (optional)")} />
        <input value={url.description} onChange={e=>onChange({...url,description:e.target.value})}
          {...inp("Description (optional)")} />
      </div>
    </div>
  );
}

// ─── Rich Turn Builder ────────────────────────────────────────────────────────
function TurnCard({ turn, index, total, onUpdate, onRemove, onMove, apiBase, dark }) {
  const d = dark;
  const [panel, setPanel] = useState(null); // null | "images" | "table" | "url"
  const att = turn.attachments || emptyAttachments();

  function updateAtt(key, val) {
    onUpdate({ ...turn, attachments: { ...att, [key]: val } });
  }
  function addImage(img)  { updateAtt("images", [...att.images, img]); }
  function updateImage(i, img) { const imgs=[...att.images]; imgs[i]=img; updateAtt("images",imgs); }
  function removeImage(i) { updateAtt("images", att.images.filter((_,idx)=>idx!==i)); }
  function addTable()     { updateAtt("tables", [...att.tables, { caption:"", headers:["Column 1","Column 2"], rows:[["",""]] }]); setPanel("table"); }
  function updateTable(i, t) { const tbls=[...att.tables]; tbls[i]=t; updateAtt("tables",tbls); }
  function removeTable(i) { updateAtt("tables", att.tables.filter((_,idx)=>idx!==i)); }
  function addUrl()       { updateAtt("urls", [...att.urls, { href:"", title:"", description:"", favicon:"" }]); setPanel("url"); }
  function updateUrl(i,u) { const urls=[...att.urls]; urls[i]=u; updateAtt("urls",urls); }
  function removeUrl(i)   { updateAtt("urls", att.urls.filter((_,idx)=>idx!==i)); }

  const isUser = turn.role === "user";
  const borderColor = isUser ? (d?"#4a3825":"#d4b896") : (d?"#1e3028":"#b8dcc8");
  const bgColor     = isUser ? (d?"#221c12":"#fffaf4") : (d?"#121e18":"#f4fcf6");
  const headerBg    = isUser ? (d?"#2a2014":"#fff8ee") : (d?"#141e18":"#eef8f2");
  const roleColor   = isUser ? (d?"#c0a060":"#8a5820") : (d?"#60a878":"#2a7a50");

  const attCount = att.images.length + att.tables.length + att.urls.length;

  return (
    <div style={{ borderRadius:10, border:`1px solid ${borderColor}`, background:bgColor, overflow:"hidden", marginBottom:10 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:headerBg, borderBottom:`1px solid ${borderColor}` }}>
        <span style={{ fontSize:11, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", color:roleColor }}>
          {isUser ? "👤 User Query" : "🤖 AI Response"}
        </span>
        <div style={{ marginLeft:"auto", display:"flex", gap:3 }}>
          <button onClick={()=>onUpdate({...turn,role:isUser?"assistant":"user"})} title="Swap role"
            style={{ background:"none",border:"none",cursor:"pointer",fontSize:13,color:d?"#7a6a58":"#a08060",padding:"2px 6px",borderRadius:4 }}>⇄</button>
          {index > 0 && <button onClick={()=>onMove(index,-1)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:d?"#7a6a58":"#a08060",padding:"2px 5px",borderRadius:4 }}>↑</button>}
          {index < total-1 && <button onClick={()=>onMove(index,1)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:d?"#7a6a58":"#a08060",padding:"2px 5px",borderRadius:4 }}>↓</button>}
          {total > 1 && <button onClick={onRemove} style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:"#c06050",padding:"2px 5px",borderRadius:4 }}>✕</button>}
        </div>
      </div>

      {/* Text body */}
      <textarea
        value={turn.content}
        onChange={e=>onUpdate({...turn,content:e.target.value})}
        placeholder={isUser ? "Type the user's question or message…" : "Type the AI's response…"}
        style={{ width:"100%", padding:"12px", border:"none", background:"transparent",
          color:d?"#e8ddd0":"#2c1f0e", fontSize:13.5, fontFamily:"Lora,serif",
          lineHeight:1.7, resize:"vertical", minHeight:80, outline:"none", boxSizing:"border-box" }}
      />

      {/* Attachments area */}
      {(att.images.length > 0 || att.tables.length > 0 || att.urls.length > 0) && (
        <div style={{ padding:"0 12px 12px", borderTop:`1px solid ${borderColor}` }}>
          {/* Uploaded images preview */}
          {att.images.length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:7 }}>Images</div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                {att.images.map((img,i)=>(
                  <div key={i} style={{ position:"relative",borderRadius:6,overflow:"hidden",border:`1px solid ${d?"#2e2218":"#e0d4c4"}` }}>
                    <img src={img.url} alt={img.caption||"uploaded"} style={{ height:72,width:96,objectFit:"cover",display:"block" }} />
                    <div style={{ position:"absolute",top:3,right:3 }}>
                      <button onClick={()=>removeImage(i)} style={{ background:"rgba(0,0,0,0.6)",border:"none",cursor:"pointer",color:"#fff",fontSize:11,borderRadius:10,width:18,height:18,lineHeight:"18px" }}>✕</button>
                    </div>
                    <input value={img.caption} onChange={e=>updateImage(i,{...img,caption:e.target.value})}
                      placeholder="Caption…"
                      style={{ width:"100%",padding:"3px 6px",border:"none",background:d?"#1e1812":"#faf6f0",color:d?"#c0b0a0":"#6a5040",fontSize:11,fontFamily:"Lora,serif",outline:"none" }} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Tables */}
          {att.tables.length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:7 }}>Tables</div>
              {att.tables.map((tbl,i)=>(
                <TableEditor key={i} table={tbl} dark={d}
                  onChange={t=>updateTable(i,t)} onRemove={()=>removeTable(i)} />
              ))}
            </div>
          )}
          {/* URLs */}
          {att.urls.length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",letterSpacing:"0.07em",textTransform:"uppercase",marginBottom:7 }}>URLs</div>
              {att.urls.map((u,i)=>(
                <UrlEntry key={i} url={u} dark={d}
                  onChange={u=>updateUrl(i,u)} onRemove={()=>removeUrl(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display:"flex",gap:6,padding:"8px 12px",borderTop:`1px solid ${borderColor}`,background:headerBg,flexWrap:"wrap" }}>
        <ImageUploader apiBase={apiBase} onUploaded={addImage} dark={d} />
        <button onClick={addTable} style={{ padding:"5px 11px",borderRadius:7,border:`1px dashed ${d?"#3a3020":"#c0a070"}`,background:"transparent",cursor:"pointer",fontSize:12.5,fontFamily:"Lora,serif",color:d?"#b09070":"#7a5a30" }}>
          📊 Add Table
        </button>
        <button onClick={addUrl} style={{ padding:"5px 11px",borderRadius:7,border:`1px dashed ${d?"#20303a":"#80a8c0"}`,background:"transparent",cursor:"pointer",fontSize:12.5,fontFamily:"Lora,serif",color:d?"#70a0b8":"#2a5a7a" }}>
          🔗 Add URL
        </button>
        {attCount > 0 && (
          <span style={{ marginLeft:"auto",fontSize:11.5,color:d?"#7a6a58":"#a08060",alignSelf:"center" }}>
            {attCount} attachment{attCount!==1?"s":""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, onSaved, apiBase, dark }) {
  const d = dark;
  const [tab, setTab]   = useState("manual");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Manual meta
  const [title, setTitle]   = useState("");
  const [tags, setTags]     = useState("");
  const [source, setSource] = useState("claude");
  const [turns, setTurns]   = useState([
    { role:"user",      content:"", attachments: emptyAttachments() },
    { role:"assistant", content:"", attachments: emptyAttachments() },
  ]);

  function addTurn(role) { setTurns(p=>[...p,{role,content:"",attachments:emptyAttachments()}]); }
  function updateTurn(i,t) { setTurns(p=>p.map((x,idx)=>idx===i?t:x)); }
  function removeTurn(i) { setTurns(p=>p.filter((_,idx)=>idx!==i)); }
  function moveTurn(i,dir) {
    setTurns(p=>{ const a=[...p]; const s=i+dir; if(s<0||s>=a.length)return a; [a[i],a[s]]=[a[s],a[i]]; return a; });
  }

  async function saveManual() {
    const msgs = turns.filter(t=>t.content.trim()||hasAnyAttachment(t.attachments));
    if (!msgs.length)      { setError("Add at least one message."); return; }
    if (!title.trim())     { setError("Please add a title."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(apiBase, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ manual:true, title:title.trim(), source, tags:tags.split(",").map(t=>t.trim()).filter(Boolean), messages:msgs.map((t,i)=>({...t,index:i})) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"Save failed");
      onSaved(data.chat); setSaved(true);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  // Paste
  const [raw,setRaw]         = useState("");
  const [step,setStep]       = useState("paste");
  const [preview,setPreview] = useState(null);
  const [pTitle,setPTitle]   = useState("");
  const [pTags,setPTags]     = useState("");

  async function doParse() {
    if (!raw.trim()){ setError("Paste something first."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`${apiBase}/parse`,{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({raw}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"Parse failed");
      setPreview(data); setPTitle(data.title||""); setStep("preview");
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  async function doPasteSave() {
    setLoading(true); setError("");
    try {
      const res = await fetch(apiBase,{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({raw,title:pTitle||undefined,tags:pTags.split(",").map(t=>t.trim()).filter(Boolean)}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error||"Save failed");
      onSaved(data.chat); setSaved(true);
    } catch(e){ setError(e.message); }
    finally{ setLoading(false); }
  }

  const overlay = { position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16 };
  const modal   = { background:d?"#1a1610":"#faf6f0",borderRadius:16,width:"100%",maxWidth:720,boxShadow:"0 24px 80px rgba(0,0,0,0.35)",fontFamily:"Lora,serif",color:d?"#e8ddd0":"#2c1f0e",position:"relative",maxHeight:"94vh",display:"flex",flexDirection:"column" };
  const inp     = { width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:d?"#2a2018":"#fff",color:d?"#e8ddd0":"#2c1f0e",fontSize:13,fontFamily:"Lora,serif",outline:"none" };
  const lbl     = { fontSize:11,letterSpacing:"0.09em",textTransform:"uppercase",color:d?"#7a6a58":"#a08060",display:"block",marginBottom:5 };
  const btnP    = { padding:"10px 20px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:13,fontFamily:"Lora,serif",fontWeight:500,cursor:"pointer" };
  const btnS    = { padding:"10px 20px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:"transparent",color:d?"#9a8a78":"#8a6a4a",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer" };

  if (saved) return (
    <div style={overlay}>
      <div style={{ ...modal,alignItems:"center",justifyContent:"center",padding:"48px 32px",textAlign:"center" }}>
        <div style={{ fontSize:52,marginBottom:16 }}>✓</div>
        <div style={{ fontFamily:"Playfair Display,serif",fontSize:24,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>Saved!</div>
        <p style={{ fontSize:13,color:d?"#9a8a78":"#9a7a5a",marginTop:8 }}>Your chat is now in Folio.</p>
        <button onClick={onClose} style={{ ...btnP,marginTop:24,padding:"10px 36px" }}>Done</button>
      </div>
    </div>
  );

  return (
    <div style={overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={modal}>
        {/* Header */}
        <div style={{ padding:"22px 26px 0",flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <div style={{ fontFamily:"Playfair Display,serif",fontSize:21,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>Add Chat</div>
            <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:d?"#7a6a58":"#a08060",lineHeight:1 }}>✕</button>
          </div>
          <div style={{ display:"flex",gap:4,background:d?"#2a2018":"#e8d8c0",borderRadius:10,padding:4,marginBottom:4 }}>
            {[["manual","✏️  Manual Entry"],["paste","📋  Paste Import"]].map(([id,lb])=>(
              <button key={id} onClick={()=>{setTab(id);setError("");}} style={{ flex:1,padding:"8px 12px",borderRadius:7,border:"none",cursor:"pointer",fontFamily:"Lora,serif",fontSize:13,background:tab===id?(d?"#e8c88a":"#7a4a1a"):"transparent",color:tab===id?(d?"#1a1510":"#fff"):(d?"#9a8a78":"#8a6a4a"),fontWeight:tab===id?500:400,transition:"all 0.15s" }}>{lb}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex:1,overflowY:"auto",padding:"16px 26px 0" }}>

          {/* ── MANUAL ── */}
          {tab==="manual" && <>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12 }}>
              <div><span style={lbl}>Chat Title *</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. React hooks question" style={inp} /></div>
              <div><span style={lbl}>AI Source</span>
                <select value={source} onChange={e=>setSource(e.target.value)} style={{ ...inp,appearance:"none" }}>
                  <option value="claude">Claude</option>
                  <option value="chatgpt">ChatGPT</option>
                  <option value="gemini">Gemini</option>
                  <option value="generic">Other</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom:16 }}><span style={lbl}>Tags</span><input value={tags} onChange={e=>setTags(e.target.value)} placeholder="work, ideas, research" style={inp} /></div>

            <span style={lbl}>Conversation ({turns.length} messages)</span>
            <div style={{ marginTop:8 }}>
              {turns.map((turn,i)=>(
                <TurnCard key={i} turn={turn} index={i} total={turns.length}
                  onUpdate={t=>updateTurn(i,t)}
                  onRemove={()=>removeTurn(i)}
                  onMove={(idx,dir)=>moveTurn(idx,dir)}
                  apiBase={apiBase} dark={d}
                />
              ))}
            </div>
            <div style={{ display:"flex",gap:8,marginBottom:16 }}>
              <button onClick={()=>addTurn("user")} style={{ flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontFamily:"Lora,serif",fontSize:13,border:`1px dashed ${d?"#4a3825":"#c8a870"}`,background:"transparent",color:d?"#c0a060":"#8a5820" }}>+ User Query</button>
              <button onClick={()=>addTurn("assistant")} style={{ flex:1,padding:"9px",borderRadius:8,cursor:"pointer",fontFamily:"Lora,serif",fontSize:13,border:`1px dashed ${d?"#1e3828":"#98c8a8"}`,background:"transparent",color:d?"#60a878":"#2a7a50" }}>+ AI Response</button>
            </div>
          </>}

          {/* ── PASTE ── */}
          {tab==="paste" && <>
            {step==="paste" && <>
              <p style={{ fontSize:13,color:d?"#9a8a78":"#9a7a5a",marginBottom:14,lineHeight:1.65 }}>
                Paste from Claude, ChatGPT, Gemini — copy-paste or JSON export. Auto-detected.
              </p>
              <textarea value={raw} onChange={e=>setRaw(e.target.value)}
                placeholder={"Paste your chat here…\n\nWorks with:\n• Claude.ai copy-paste\n• ChatGPT copy-paste\n• Gemini copy-paste\n• Any JSON export"}
                style={{ ...inp,height:240,resize:"vertical",lineHeight:1.65,marginBottom:4 }} />
            </>}
            {step==="preview" && preview && <>
              <div style={{ display:"flex",gap:8,marginBottom:14,flexWrap:"wrap" }}>
                <span style={{ padding:"3px 12px",borderRadius:20,fontSize:12,background:sourceMeta(preview.source,d).bg,color:sourceMeta(preview.source,d).color,fontWeight:500 }}>{sourceMeta(preview.source,d).label}</span>
                <span style={{ padding:"3px 12px",borderRadius:20,fontSize:12,background:d?"#2a2018":"#f0e4d4",color:d?"#c0a878":"#8a6040" }}>{preview.messageCount} messages</span>
              </div>
              <div style={{ marginBottom:10 }}><span style={lbl}>Title</span><input value={pTitle} onChange={e=>setPTitle(e.target.value)} style={inp} /></div>
              <div style={{ marginBottom:14 }}><span style={lbl}>Tags</span><input value={pTags} onChange={e=>setPTags(e.target.value)} placeholder="work, ideas, research" style={inp} /></div>
              <div style={{ background:d?"#2a2018":"#f5ede2",borderRadius:10,padding:14,marginBottom:4 }}>
                <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",marginBottom:10,letterSpacing:"0.07em",textTransform:"uppercase" }}>Preview</div>
                {preview.messages.map((m,i)=>(
                  <div key={i} style={{ marginBottom:8,display:"flex",gap:10,alignItems:"flex-start" }}>
                    <span style={{ fontSize:11,padding:"2px 8px",borderRadius:10,flexShrink:0,marginTop:2,background:m.role==="user"?(d?"#3a2e20":"#e8d8c0"):(d?"#1a3020":"#d8f0e0"),color:m.role==="user"?(d?"#c0a878":"#7a5030"):(d?"#78b890":"#2a7a50") }}>{m.role==="user"?"user":"ai"}</span>
                    <span style={{ fontSize:12.5,lineHeight:1.6,color:d?"#c0b0a0":"#5a4030" }}>{m.content.slice(0,180)}{m.content.length>180?"…":""}</span>
                  </div>
                ))}
              </div>
            </>}
          </>}
        </div>

        {/* Footer */}
        <div style={{ padding:"14px 26px 22px",flexShrink:0,borderTop:`1px solid ${d?"#2e2218":"#e8ddd0"}`,marginTop:10 }}>
          {error && <div style={{ color:"#c0604a",fontSize:12.5,marginBottom:10 }}>{error}</div>}
          {tab==="manual" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={onClose} style={{ ...btnS,flex:1 }}>Cancel</button>
              <button onClick={saveManual} disabled={loading} style={{ ...btnP,flex:3,opacity:loading?0.6:1 }}>
                {loading?"Saving…":`Save Chat (${turns.filter(t=>t.content.trim()||hasAnyAttachment(t.attachments)).length} messages) ✓`}
              </button>
            </div>
          )}
          {tab==="paste" && step==="paste" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={onClose} style={{ ...btnS,flex:1 }}>Cancel</button>
              <button onClick={doParse} disabled={loading} style={{ ...btnP,flex:3,opacity:loading?0.6:1 }}>{loading?"Parsing…":"Parse & Preview →"}</button>
            </div>
          )}
          {tab==="paste" && step==="preview" && (
            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setStep("paste")} style={{ ...btnS,flex:1 }}>← Back</button>
              <button onClick={doPasteSave} disabled={loading} style={{ ...btnP,flex:3,opacity:loading?0.6:1 }}>{loading?"Saving…":"Save to Folio ✓"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bubble View ──────────────────────────────────────────────────────────────
function BubbleView({ messages, dark }) {
  const d = dark;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20,padding:"8px 0" }}>
      {messages.map((msg,i)=>(
        <div key={i} style={{ display:"flex",flexDirection:"column",alignItems:msg.role==="user"?"flex-end":"flex-start" }}>
          <div style={{ fontSize:11,color:d?"#7a6a58":"#a08060",marginBottom:5,marginLeft:msg.role!=="user"?4:0,marginRight:msg.role==="user"?4:0 }}>
            {msg.role==="user"?"You":"AI"}
          </div>
          <div style={{ maxWidth:"82%" }}>
            {msg.content && (
              <div style={{
                padding:"14px 18px",
                borderRadius:msg.role==="user"?"18px 18px 4px 18px":"18px 18px 18px 4px",
                background:msg.role==="user"?(d?"#3a2e1e":"#7a4a1a"):(d?"#252018":"#fff"),
                color:msg.role==="user"?(d?"#f0e0c8":"#fff"):(d?"#d8c8b0":"#2c1f0e"),
                fontSize:14,lineHeight:1.75,fontFamily:"Lora,serif",
                border:msg.role!=="user"?`1px solid ${d?"#2e2218":"#e8dcd0"}`:undefined,
                boxShadow:d?"0 2px 10px rgba(0,0,0,0.25)":"0 2px 10px rgba(120,80,30,0.07)",
                marginBottom: hasAnyAttachment(msg.attachments)?8:0,
              }} dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
            )}
            <AttachmentsView attachments={msg.attachments} dark={d} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Transcript View ──────────────────────────────────────────────────────────
function TranscriptView({ messages, dark }) {
  const d = dark;
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:0 }}>
      {messages.map((msg,i)=>(
        <div key={i} style={{ padding:"22px 0",borderBottom:`1px solid ${d?"#2e2218":"#ede4d8"}`,display:"flex",gap:24 }}>
          <div style={{ width:76,flexShrink:0,paddingTop:3 }}>
            <span style={{ fontSize:11,fontWeight:600,letterSpacing:"0.09em",textTransform:"uppercase",color:msg.role==="user"?(d?"#c0a878":"#7a4a1a"):(d?"#78b890":"#2a7a50") }}>
              {msg.role==="user"?"You":"AI"}
            </span>
          </div>
          <div style={{ flex:1 }}>
            {msg.content && (
              <div style={{ fontSize:14,lineHeight:1.85,color:d?"#d0c0a8":"#3c2a18",fontFamily:"Lora,serif" }}
                dangerouslySetInnerHTML={{ __html: renderMd(msg.content) }} />
            )}
            <AttachmentsView attachments={msg.attachments} dark={d} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function FolioApp() {
  const [dark, setDark]           = useState(false);
  const [chats, setChats]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [activeChat, setActiveChat]   = useState(null);
  const [chatDetail, setChatDetail]   = useState(null);
  const [viewMode, setViewMode]       = useState("bubble");
  const [search, setSearch]           = useState("");
  const [activeTag, setActiveTag]     = useState(null);
  const [sidebarSection, setSidebarSection] = useState("browse");
  const [apiBase, setApiBase]         = useState("http://localhost:3001/api/chats");
  const [showImport, setShowImport]   = useState(false);
  const [loaded, setLoaded]           = useState(false);
  const [fetchError, setFetchError]   = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const d = dark;

  useEffect(()=>{ setTimeout(()=>setLoaded(true),100); },[]);

  async function loadChats() {
    setLoading(true); setFetchError("");
    try {
      const res = await fetch(apiBase);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChats(data.chats||[]);
    } catch(e){ setFetchError(e.message); }
    finally{ setLoading(false); }
  }

  async function openChat(chat) {
    setActiveChat(chat.id); setChatDetail(null);
    try {
      const res = await fetch(`${apiBase.replace(/\/+$/,"")}/${chat.id}`);
      const data = await res.json();
      setChatDetail(data);
    } catch(e){ setChatDetail({...chat,messages:[]}); }
  }

  function deleteChat(id,e) { e.stopPropagation(); setConfirmDeleteId(id); }

  async function doDelete(id) {
    try {
      await fetch(`${apiBase.replace(/\/+$/,"")}/${id}`,{method:"DELETE"});
      setChats(p=>p.filter(c=>c.id!==id));
      if (activeChat===id){ setActiveChat(null); setChatDetail(null); }
    } catch{}
    setConfirmDeleteId(null);
  }

  const allTags  = [...new Set(chats.flatMap(c=>c.tags||[]))];
  const filtered = chats.filter(c=>{
    const q=search.toLowerCase();
    return (!q||c.title.toLowerCase().includes(q)||(c.preview||"").toLowerCase().includes(q))
        && (!activeTag||(c.tags||[]).includes(activeTag));
  });
  const grouped = groupByDate(filtered);

  const SBtn = ({id,icon,label})=>(
    <button onClick={()=>setSidebarSection(id)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",marginBottom:2,background:sidebarSection===id?(d?"rgba(232,200,138,0.12)":"rgba(120,74,26,0.1)"):"transparent",color:sidebarSection===id?(d?"#e8c88a":"#7a4a1a"):(d?"#9a8a78":"#8a6a4a"),fontSize:13.5,fontFamily:"Lora,serif",cursor:"pointer",fontWeight:sidebarSection===id?500:400 }}>
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
        .fade-in{opacity:0;animation:fadeUp 0.45s forwards;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        input,textarea,select{outline:none;}
        input::placeholder,textarea::placeholder{color:${d?"#5a4a38":"#b89a78"}}
        a{color:inherit;}
      `}</style>

      {showImport && (
        <ImportModal dark={d} apiBase={apiBase}
          onClose={()=>setShowImport(false)}
          onSaved={chat=>{ setChats(p=>[chat,...p]); setShowImport(false); }} />
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

      {/* Sidebar */}
      <div style={{ width:260,minHeight:"100vh",background:d?"#120f0b":"#f0e8dc",borderRight:`1px solid ${d?"#2e2218":"#ddd0be"}`,display:"flex",flexDirection:"column",flexShrink:0,transition:"background 0.4s" }}>
        <div style={{ padding:"28px 24px 18px",borderBottom:`1px solid ${d?"#2e2218":"#ddd0be"}` }}>
          <div style={{ fontFamily:"Playfair Display,serif",fontSize:22,fontWeight:700,color:d?"#e8c88a":"#7a4a1a" }}>Folio</div>
          <div style={{ fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",marginTop:2,color:d?"#7a6a58":"#a08060" }}>AI Chat Archive</div>
        </div>
        <div style={{ padding:"14px 16px 6px" }}>
          <button onClick={()=>setShowImport(true)} style={{ width:"100%",padding:"10px",borderRadius:8,border:`1px dashed ${d?"#5a4a38":"#c8a870"}`,background:"transparent",cursor:"pointer",fontSize:13,fontFamily:"Lora,serif",color:d?"#c0a878":"#8a6040",display:"flex",alignItems:"center",justifyContent:"center",gap:8 }}>
            <span style={{fontSize:18}}>+</span> Import / Add Chat
          </button>
        </div>
        <div style={{ padding:"10px 12px 4px" }}>
          <SBtn id="browse" icon="◈" label="Browse Chats" />
          <SBtn id="search" icon="⌕" label="Search" />
          <SBtn id="tags"   icon="◇" label="Tags" />
          <SBtn id="api"    icon="⇡" label="API Settings" />
        </div>
        <div style={{ flex:1,padding:"8px 16px 16px",overflowY:"auto" }}>
          {sidebarSection==="search" && <>
            <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>Search</div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title or content…" style={inputStyle} />
            {search && <div style={{ fontSize:12,color:d?"#9a8a78":"#9a7a5a" }}>{filtered.length} result{filtered.length!==1?"s":""}</div>}
          </>}
          {sidebarSection==="tags" && <>
            <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>Filter by Tag</div>
            <TagPill tag="all" active={!activeTag} onClick={()=>setActiveTag(null)} dark={d} />
            {allTags.map(t=><TagPill key={t} tag={t} active={activeTag===t} onClick={()=>setActiveTag(activeTag===t?null:t)} dark={d} />)}
            {!allTags.length && <div style={{ fontSize:12,color:d?"#5a4a38":"#c0a080",fontStyle:"italic" }}>No tags yet</div>}
          </>}
          {sidebarSection==="api" && <>
            <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>API Base URL</div>
            <input value={apiBase} onChange={e=>setApiBase(e.target.value)} placeholder="http://localhost:3001/api/chats" style={inputStyle} />
            <button onClick={loadChats} disabled={loading} style={{ width:"100%",padding:"10px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:13,fontFamily:"Lora,serif",cursor:"pointer",opacity:loading?0.6:1,marginBottom:10 }}>
              {loading?"Loading…":"Load Chats"}
            </button>
            {fetchError && <div style={{ fontSize:12,color:"#c0604a" }}>{fetchError}</div>}
            <div style={{ fontSize:11,color:d?"#5a4a38":"#b09070",lineHeight:1.7,marginTop:8,background:d?"#1e1812":"#f0e8dc",padding:"10px 12px",borderRadius:8 }}>
              <strong>Local mode:</strong> Images are stored as base64 inside <code>data/chats.json</code>.<br/><br/>
              When ready for cloud, swap the <code>/api/upload</code> route to Cloudinary or S3 — nothing else changes.
            </div>
          </>}
          {sidebarSection==="browse" && <>
            <div style={{ fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>{filtered.length} chat{filtered.length!==1?"s":""}</div>
            {grouped.map(([date,dayChats])=>(
              <div key={date} style={{ marginBottom:14 }}>
                <div style={{ fontSize:10.5,color:d?"#9a8a78":"#a08060",marginBottom:4 }}>
                  {new Date(date).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </div>
                {dayChats.map(c=>{
                  const sm=sourceMeta(c.source,d);
                  return (
                    <div key={c.id} className="chat-row" onClick={()=>openChat(c)} style={{ padding:"7px 8px",borderRadius:6,marginBottom:3,background:activeChat===c.id?(d?"rgba(232,200,138,0.1)":"rgba(120,74,26,0.08)"):"transparent",borderLeft:`2px solid ${activeChat===c.id?(d?"#e8c88a":"#7a4a1a"):"transparent"}`,transition:"all 0.15s" }}>
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
            {!filtered.length && <div style={{ fontSize:12,color:d?"#5a4a38":"#c0a080",fontStyle:"italic",marginTop:8 }}>No chats yet. Add one!</div>}
          </>}
        </div>
        <div style={{ padding:16,borderTop:`1px solid ${d?"#2e2218":"#ddd0be"}` }}>
          <button onClick={()=>setDark(!d)} style={{ display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${d?"#3a2e20":"#d0b898"}`,background:"transparent",cursor:"pointer",color:d?"#9a8a78":"#8a6a4a",fontSize:13,fontFamily:"Lora,serif" }}>
            <span style={{fontSize:16}}>{d?"☀":"◑"}</span>{d?"Light mode":"Dark mode"}
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column" }}>
        {!activeChat && (
          <div style={{ flex:1,padding:"48px 56px",opacity:loaded?1:0,transition:"opacity 0.6s" }}>
            <div style={{ marginBottom:48 }}>
              <div style={{ fontSize:12,letterSpacing:"0.15em",textTransform:"uppercase",color:d?"#7a6a58":"#a08060",marginBottom:8 }}>
                {new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
              </div>
              <h1 style={{ fontFamily:"Playfair Display,serif",fontSize:40,fontWeight:700,lineHeight:1.1,color:d?"#e8ddd0":"#2c1f0e",letterSpacing:"-0.5px" }}>
                {activeTag?`#${activeTag}`:search?`"${search}"`:"Chat Archive"}
              </h1>
              <div style={{ width:64,height:2,background:d?"#e8c88a":"#7a4a1a",marginTop:16,borderRadius:1 }} />
            </div>

            {!grouped.length && (
              <div style={{ textAlign:"center",padding:"80px 0" }}>
                <div style={{ fontSize:48,marginBottom:16 }}>◈</div>
                <div style={{ fontFamily:"Playfair Display,serif",fontSize:22,color:d?"#5a4a38":"#c0a880",fontStyle:"italic" }}>No chats yet</div>
                <p style={{ fontSize:14,color:d?"#5a4a38":"#c0a080",marginTop:10 }}>Click <strong>Import / Add Chat</strong> to get started.</p>
                <button onClick={()=>setShowImport(true)} style={{ marginTop:24,padding:"12px 32px",borderRadius:8,border:"none",background:d?"#e8c88a":"#7a4a1a",color:d?"#1a1510":"#fff",fontSize:14,fontFamily:"Lora,serif",cursor:"pointer" }}>+ Add Chat</button>
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
                  {dayChats.map(chat=>{
                    const sm=sourceMeta(chat.source,d);
                    return (
                      <div key={chat.id} className="chat-row" onClick={()=>openChat(chat)} style={{ background:d?"#1e1812":"#fff",border:`1px solid ${d?"#2e2218":"#ddd0be"}`,borderRadius:12,padding:"22px 24px",boxShadow:d?"0 2px 12px rgba(0,0,0,0.25)":"0 2px 12px rgba(120,80,30,0.06)",cursor:"pointer",position:"relative" }}>
                        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8 }}>
                          <span style={{ fontSize:11.5,padding:"3px 10px",borderRadius:20,background:sm.bg,color:sm.color,fontWeight:500 }}>{sm.label}</span>
                          <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                            <span style={{ fontSize:11,color:d?"#5a4a38":"#c0a080" }}>{fmtTime(chat.createdAt)}</span>
                            <button onClick={e=>deleteChat(chat.id,e)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:14,color:d?"#5a4a38":"#c0a080",padding:"2px 4px",borderRadius:4,opacity:0.6 }}>✕</button>
                          </div>
                        </div>
                        <h2 style={{ fontFamily:"Playfair Display,serif",fontSize:17,fontWeight:700,lineHeight:1.3,color:d?"#e8ddd0":"#2c1f0e",marginBottom:8 }}>{chat.title}</h2>
                        <p style={{ fontSize:13,lineHeight:1.7,color:d?"#8a7a68":"#7a6050",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical" }}>{chat.preview||"—"}</p>
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
            <div style={{ padding:"22px 40px 18px",borderBottom:`1px solid ${d?"#2e2218":"#e8ddd0"}`,background:d?"#161210":"#f5ede2",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
              <button onClick={()=>{setActiveChat(null);setChatDetail(null);}} style={{ background:"none",border:"none",cursor:"pointer",fontSize:18,color:d?"#9a8a78":"#8a6a4a",padding:"4px 8px",borderRadius:6 }}>←</button>
              <div style={{ flex:1,minWidth:200 }}>
                <div style={{ fontFamily:"Playfair Display,serif",fontSize:20,fontWeight:700,color:d?"#e8ddd0":"#2c1f0e" }}>{chatDetail.title}</div>
                <div style={{ display:"flex",gap:10,marginTop:6,flexWrap:"wrap",alignItems:"center" }}>
                  <span style={{ fontSize:11.5,padding:"2px 10px",borderRadius:20,...(()=>{const sm=sourceMeta(chatDetail.source,d);return{background:sm.bg,color:sm.color};})() }}>{sourceMeta(chatDetail.source,d).label}</span>
                  <span style={{ fontSize:12,color:d?"#7a6a58":"#a08060" }}>{chatDetail.messageCount} messages · {fmtDate(chatDetail.createdAt)}</span>
                  {(chatDetail.tags||[]).map(t=><span key={t} style={{ fontSize:11,padding:"2px 8px",borderRadius:20,background:d?"#2a2018":"#f0e4d4",color:d?"#b09070":"#8a6040" }}>#{t}</span>)}
                </div>
              </div>
              <div style={{ display:"flex",background:d?"#2a2018":"#e8d8c0",borderRadius:8,padding:3,gap:2 }}>
                {["bubble","transcript"].map(mode=>(
                  <button key={mode} onClick={()=>setViewMode(mode)} style={{ padding:"6px 14px",borderRadius:6,border:"none",cursor:"pointer",fontSize:12.5,fontFamily:"Lora,serif",background:viewMode===mode?(d?"#e8c88a":"#7a4a1a"):"transparent",color:viewMode===mode?(d?"#1a1510":"#fff"):(d?"#9a8a78":"#8a6a4a"),fontWeight:viewMode===mode?500:400,transition:"all 0.15s" }}>
                    {mode==="bubble"?"💬 Bubbles":"📄 Transcript"}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:viewMode==="bubble"?"32px 10% 48px":"0 10% 48px" }}>
              {viewMode==="bubble"
                ? <BubbleView messages={chatDetail.messages||[]} dark={d} />
                : <TranscriptView messages={chatDetail.messages||[]} dark={d} />}
              {!(chatDetail.messages?.length) && (
                <div style={{ textAlign:"center",padding:"60px 0",color:d?"#5a4a38":"#c0a080",fontStyle:"italic" }}>No messages.</div>
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