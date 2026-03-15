/**
 * storage.js
 * Simple JSON file-based storage for chats.
 * Drop-in replaceable with MongoDB/Postgres later.
 * 
 * Each chat: { id, title, source, createdAt, updatedAt, messages: [{role, content, index}] }
 */

const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "data", "chats.json");

// Ensure data directory exists
function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([]));
}

function readAll() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(chats) {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(chats, null, 2));
}

const storage = {
  getAll() {
    return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getById(id) {
    return readAll().find(c => c.id === id) || null;
  },

  create(chat) {
    const all = readAll();
    all.push(chat);
    writeAll(all);
    return chat;
  },

  update(id, updates) {
    const all = readAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
    writeAll(all);
    return all[idx];
  },

  delete(id) {
    const all = readAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx === -1) return false;
    all.splice(idx, 1);
    writeAll(all);
    return true;
  },

  search(query) {
    const q = (query || "").toLowerCase();
    return readAll().filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.source.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  },
};

module.exports = storage;
