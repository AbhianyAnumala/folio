# Folio Backend — AI Chat Notes API

A Node/Express backend that accepts raw pasted chats from Claude, ChatGPT, Gemini, or any JSON export — auto-detects the format, parses it into structured messages, and stores it for your frontend and future mobile app.

---

## Quick Start (Local)

```bash
cd folio-backend
npm install
npm start
# → running on http://localhost:3001
```

---

## API Endpoints

### Health
```
GET /api/health
```

---

### Parse Preview (don't save)
```
POST /api/chats/parse
Content-Type: application/json

{ "raw": "<paste your chat here>" }
```
Returns: `{ title, source, messageCount, messages[0..3] }`

---

### Save a Chat
```
POST /api/chats
Content-Type: application/json

{
  "raw": "<paste your chat here>",
  "title": "Optional custom title",    ← optional
  "tags": ["work", "ideas"]            ← optional
}
```

---

### List All Chats
```
GET /api/chats
```
Returns summaries (no full messages — fast for sidebar lists).

---

### Get Full Chat
```
GET /api/chats/:id
```
Returns full chat with all messages.

---

### Search
```
GET /api/chats/search?q=your+query
```
Searches title, source, and all message content.

---

### Update Chat
```
PUT /api/chats/:id
{ "title": "New title", "tags": ["updated"] }
```

---

### Delete Chat
```
DELETE /api/chats/:id
```

---

## Supported Input Formats

| Format | Auto-detected? |
|--------|---------------|
| Claude copy-paste (`Human:` / `Assistant:`) | ✅ |
| Claude JSON export | ✅ |
| ChatGPT copy-paste (`You:` / `ChatGPT:`) | ✅ |
| ChatGPT JSON export (with `mapping`) | ✅ |
| Gemini copy-paste (`You:` / `Gemini:`) | ✅ |
| Markdown (`**User**:` / `**Assistant**:`) | ✅ |
| Generic JSON (`[{role, content}]`) | ✅ |
| Raw text (blank-line separated) | ✅ fallback |

---

## Deploy to Railway (recommended — free tier)

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set `PORT` env var to `3001` (Railway sets it automatically)
4. Your API URL: `https://your-project.up.railway.app`

## Deploy to Render (free tier)

1. Push to GitHub
2. [render.com](https://render.com) → New Web Service
3. Build command: `npm install`
4. Start command: `npm start`

## Deploy to Fly.io

```bash
npm install -g flyctl
fly launch
fly deploy
```

---

## Data Storage

Currently: JSON file at `./data/chats.json` — zero config, works anywhere.

**To upgrade to MongoDB** (for production/mobile scale):
Replace `storage.js` with a Mongoose-based module — the interface (`getAll`, `getById`, `create`, `update`, `delete`, `search`) stays identical, so `server.js` needs zero changes.

---

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Server port |

---

## Frontend Integration

In your Folio frontend, point the API URL field to:
- Local: `http://localhost:3001/api/chats`
- Production: `https://your-deployed-url.railway.app/api/chats`
