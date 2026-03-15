/**
 * server.js — Folio Backend
 *
 * Routes:
 *   POST   /api/chats/parse     — parse raw paste, return preview (don't save)
 *   POST   /api/chats           — parse + save chat
 *   GET    /api/chats           — list all chats (summary)
 *   GET    /api/chats/:id       — get full chat with messages
 *   PUT    /api/chats/:id       — update title / tags
 *   DELETE /api/chats/:id       — delete chat
 *   GET    /api/chats/search?q= — search across chats
 */

const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const { parseChat } = require("./chatParser");
const storage = require("./storage");

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: "*", // tighten in production
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "10mb" })); // chats can be large
app.use(express.text({ limit: "10mb", type: "text/plain" }));

// ─── Health ───────────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "1.0.0", time: new Date().toISOString() });
});

// ─── Parse preview (no save) ──────────────────────────────────────────────────

app.post("/api/chats/parse", (req, res) => {
  try {
    const raw = typeof req.body === "string" ? req.body : req.body?.raw || req.body?.content || "";
    if (!raw.trim()) return res.status(400).json({ error: "No content provided." });

    const result = parseChat(raw);
    res.json({
      preview: true,
      title: result.title,
      source: result.source,
      messageCount: result.messages.length,
      messages: result.messages.slice(0, 4), // first 4 for preview
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Save chat ────────────────────────────────────────────────────────────────

app.post("/api/chats", (req, res) => {
  try {
    const raw = typeof req.body === "string" ? req.body : req.body?.raw || req.body?.content || "";
    const customTitle = req.body?.title;
    const tags = req.body?.tags || [];

    if (!raw.trim()) return res.status(400).json({ error: "No content provided." });

    const parsed = parseChat(raw);

    const chat = {
      id: uuidv4(),
      title: customTitle || parsed.title,
      source: parsed.source,
      tags,
      messageCount: parsed.messages.length,
      messages: parsed.messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    const all = storage.getAll().map(summarize);
    res.json({ chats: all, total: all.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Search ───────────────────────────────────────────────────────────────────

app.get("/api/chats/search", (req, res) => {
  try {
    const q = req.query.q || "";
    const results = storage.search(q).map(summarize);
    res.json({ chats: results, total: results.length, query: q });
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
    const { title, tags } = req.body;
    const updated = storage.update(req.params.id, { title, tags });
    if (!updated) return res.status(404).json({ error: "Chat not found." });
    res.json({ success: true, chat: summarize(updated) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Delete chat ──────────────────────────────────────────────────────────────

app.delete("/api/chats/:id", (req, res) => {
  try {
    const deleted = storage.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Chat not found." });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function summarize(chat) {
  return {
    id: chat.id,
    title: chat.title,
    source: chat.source,
    tags: chat.tags || [],
    messageCount: chat.messageCount || chat.messages?.length || 0,
    preview: chat.messages?.[0]?.content?.slice(0, 120) || "",
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🗂  Folio Backend running on http://localhost:${PORT}`);
  console.log(`   POST /api/chats/parse  — preview parse`);
  console.log(`   POST /api/chats        — save chat`);
  console.log(`   GET  /api/chats        — list all\n`);
});

module.exports = app;
