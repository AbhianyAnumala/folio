/**
 * server.js — Folio Backend v2 (Local Storage)
 *
 * Images stored as base64 in chats.json — no cloud needed.
 * When ready for cloud, swap /api/upload only.
 *
 * Routes:
 *   POST   /api/upload           — receive image, return base64 data URL
 *   POST   /api/chats/parse      — parse raw paste, return preview
 *   POST   /api/chats            — save chat (text + images + tables + urls)
 *   GET    /api/chats            — list all chats (summaries)
 *   GET    /api/chats/:id        — get full chat with messages
 *   PUT    /api/chats/:id        — update title / tags
 *   DELETE /api/chats/:id        — delete chat
 *   GET    /api/chats/search?q=  — full-text search
 */

const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const { v4: uuidv4 } = require("uuid");
const { parseChat }  = require("./chatParser");
const storage        = require("./storage");

const app  = express();
const PORT = process.env.PORT || 3001;

// ─── Multer — memory storage (we base64 it ourselves) ────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per image
  fileFilter: (_, file, cb) => {
    const ok = ["image/jpeg","image/png","image/gif","image/webp","image/svg+xml"];
    cb(null, ok.includes(file.mimetype));
  },
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET","POST","PUT","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.use(express.json({ limit: "50mb" })); // large because base64 images
app.use(express.text({ limit: "50mb", type: "text/plain" }));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "2.0-local", storage: "local-json", time: new Date().toISOString() });
});

// ─── Upload image → base64 data URL ──────────────────────────────────────────
app.post("/api/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image provided." });

    const b64      = req.file.buffer.toString("base64");
    const dataUrl  = `data:${req.file.mimetype};base64,${b64}`;
    const id       = `img_${uuidv4()}`;

    res.json({
      url:       dataUrl,   // stored directly — no cloud needed
      publicId:  id,
      width:     null,
      height:    null,
      format:    req.file.mimetype.split("/")[1],
      bytes:     req.file.size,
      local:     true,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Parse preview ────────────────────────────────────────────────────────────
app.post("/api/chats/parse", (req, res) => {
  try {
    const raw = typeof req.body === "string" ? req.body : req.body?.raw || req.body?.content || "";
    if (!raw.trim()) return res.status(400).json({ error: "No content provided." });
    const result = parseChat(raw);
    res.json({
      preview:      true,
      title:        result.title,
      source:       result.source,
      messageCount: result.messages.length,
      messages:     result.messages.slice(0, 4),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Save chat ────────────────────────────────────────────────────────────────
app.post("/api/chats", (req, res) => {
  try {
    const body = req.body || {};
    let title, source, tags, messages;

    if (body.manual === true) {
      if (!body.messages?.length)
        return res.status(400).json({ error: "No messages provided." });
      if (!body.title?.trim())
        return res.status(400).json({ error: "Title is required." });

      title    = body.title.trim();
      source   = body.source || "generic";
      tags     = body.tags || [];
      messages = body.messages.map(normalizeMessage).filter(m => m.content || hasAttachments(m));

    } else {
      const raw = typeof body === "string" ? body : body.raw || body.content || "";
      if (!raw.trim()) return res.status(400).json({ error: "No content provided." });
      const parsed = parseChat(raw);
      title    = body.title || parsed.title;
      source   = parsed.source;
      tags     = body.tags || [];
      messages = parsed.messages.map(normalizeMessage);
    }

    const chat = {
      id:           uuidv4(),
      title,
      source,
      tags,
      messageCount: messages.length,
      messages,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    };

    storage.create(chat);
    res.status(201).json({ success: true, chat: summarize(chat) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── List all chats ───────────────────────────────────────────────────────────
app.get("/api/chats", (req, res) => {
  try {
    res.json({ chats: storage.getAll().map(summarize), total: storage.getAll().length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────
app.get("/api/chats/search", (req, res) => {
  try {
    const results = storage.search(req.query.q || "").map(summarize);
    res.json({ chats: results, total: results.length, query: req.query.q });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Get single chat ──────────────────────────────────────────────────────────
app.get("/api/chats/:id", (req, res) => {
  try {
    const chat = storage.getById(req.params.id);
    if (!chat) return res.status(404).json({ error: "Chat not found." });
    res.json(chat);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Update chat ──────────────────────────────────────────────────────────────
app.put("/api/chats/:id", (req, res) => {
  try {
    const updated = storage.update(req.params.id, { title: req.body.title, tags: req.body.tags });
    if (!updated) return res.status(404).json({ error: "Chat not found." });
    res.json({ success: true, chat: summarize(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete chat ──────────────────────────────────────────────────────────────
app.delete("/api/chats/:id", (req, res) => {
  try {
    if (!storage.delete(req.params.id)) return res.status(404).json({ error: "Chat not found." });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalizeMessage(m, i) {
  return {
    role:    m.role === "user" ? "user" : "assistant",
    content: (m.content || "").trim(),
    index:   i,
    attachments: {
      images: (m.attachments?.images || []).map(img => ({
        url:      img.url || "",       // base64 data URL stored directly
        publicId: img.publicId || "",
        caption:  img.caption || "",
        width:    img.width  || null,
        height:   img.height || null,
      })),
      tables: (m.attachments?.tables || []).map(tbl => ({
        caption: tbl.caption || "",
        headers: tbl.headers || [],
        rows:    tbl.rows    || [],
      })),
      urls: (m.attachments?.urls || []).map(u => ({
        href:        u.href        || "",
        title:       u.title       || "",
        description: u.description || "",
        favicon:     u.favicon     || "",
      })),
    },
  };
}

function hasAttachments(m) {
  const a = m.attachments;
  return !!(a && (a.images?.length || a.tables?.length || a.urls?.length));
}

function summarize(chat) {
  return {
    id:           chat.id,
    title:        chat.title,
    source:       chat.source,
    tags:         chat.tags || [],
    messageCount: chat.messageCount || chat.messages?.length || 0,
    preview:      chat.messages?.[0]?.content?.slice(0, 120) || "",
    createdAt:    chat.createdAt,
    updatedAt:    chat.updatedAt,
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🗂  Folio Backend (local) → http://localhost:${PORT}`);
  console.log(`   Images stored as base64 in data/chats.json`);
  console.log(`   POST /api/upload  — receive image → base64`);
  console.log(`   POST /api/chats   — save chat\n`);
});

module.exports = app;