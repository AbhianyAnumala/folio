/**
 * chatParser.js — v3
 *
 * Handles real-world Ctrl+C full-page copy from:
 *  - Claude.ai   (name on own line)
 *  - ChatGPT     ("You said:" / "ChatGPT said:")
 *  - Gemini      (name on own line)
 *  + JSON exports from all platforms
 *
 * Key improvements over v2:
 *  1. Strips UI chrome (sidebar, headers, footers) before parsing
 *  2. Handles ChatGPT's "You said:" / "ChatGPT said:" format
 *  3. Pattern scoring picks the best match for ambiguous text
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clean(t) {
  return (t || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function makeMsg(role, content, index) {
  return { role, content: clean(content), index };
}

const USER_LABELS = new Set([
  "you", "user", "human", "me", "you said", "human turn"
]);

function toRole(label) {
  return USER_LABELS.has((label || "").toLowerCase().trim()) ? "user" : "assistant";
}

// ─── UI Chrome Stripper ───────────────────────────────────────────────────────
/**
 * When you Ctrl+C a whole page, you get sidebar nav, page titles,
 * timestamps, "Copy" buttons, disclaimers etc mixed in.
 * This strips the most common noise from each platform.
 */
function stripUIChrome(text) {
  let t = text;

  // ── Claude.ai chrome ──
  // Sidebar: "New chat\nChats\nProjects\nToday\nYesterday\n[chat titles]"
  // Footer: "Claude can make mistakes. Please double-check responses."
  // Buttons: "Copy\nRetry\nEdit"
  t = t.replace(/^Claude\s*\nClaude\.ai\s*\n/i, "");
  t = t.replace(/\bNew chat\b[\s\S]*?(?=\n(?:You|Human|Claude)\s*\n)/i, "");
  t = t.replace(/\b(Copy|Retry|Edit|Regenerate|Stop generating)\s*\n/gi, "");
  t = t.replace(/Claude can make mistakes\..*$/im, "");
  t = t.replace(/Always review outputs.*$/im, "");

  // ── ChatGPT chrome ──
  // Header: "ChatGPT\nChatGPT\n"
  // Sidebar items, model labels like "4o", "GPT-4"
  // Footer: "ChatGPT can make mistakes. Consider checking important information."
  t = t.replace(/^ChatGPT\s*\nChatGPT\s*\n/i, "");
  t = t.replace(/\bNew chat\b[\s\S]*?(?=\n(?:You said:|ChatGPT said:|You\n|ChatGPT\n))/i, "");
  t = t.replace(/ChatGPT can make mistakes\..*$/im, "");
  t = t.replace(/^(4o|GPT-4o?|GPT-3\.5[^\n]*)\s*$/gim, "");
  t = t.replace(/\b(Copy code|Copy|Regenerate|Edit message|Like|Dislike)\s*\n/gi, "");

  // ── Gemini chrome ──
  t = t.replace(/^Gemini\s*\nGemini\s*\n/i, "");
  t = t.replace(/\bNew chat\b[\s\S]*?(?=\nYou\s*\n)/i, "");
  t = t.replace(/Gemini (may display|can be inaccurate).*$/im, "");
  t = t.replace(/^(Show drafts|Expand|Collapse|Share|More)\s*$/gim, "");

  // ── Generic noise ──
  // Remove lines that are only dates/times like "Today", "Yesterday", "Monday"
  t = t.replace(/^(Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Last week|Last month)\s*$/gim, "");
  // Remove standalone single-word sidebar entries (chat history titles often appear as 2-5 word lines)
  // Only strip if they appear BEFORE the first real message marker
  t = t.replace(/\n{3,}/g, "\n\n"); // collapse excessive blank lines

  return t.trim();
}

// ─── Core Splitter ────────────────────────────────────────────────────────────

function splitSegments(text, regex, roleResolver) {
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const label = (m[1] || m[2] || m[3] || "").trim();
    matches.push({ label, headerStart: m.index, contentStart: m.index + m[0].length });
  }
  if (matches.length < 2) return [];

  const segments = [];
  for (let i = 0; i < matches.length; i++) {
    const contentStart = matches[i].contentStart;
    const contentEnd = i + 1 < matches.length ? matches[i + 1].headerStart : text.length;
    const content = text.slice(contentStart, contentEnd).trim();
    if (content) segments.push(makeMsg(roleResolver(matches[i].label), content, segments.length));
  }
  return segments;
}

// ─── JSON Detection & Parsing ─────────────────────────────────────────────────

function looksLikeJSON(text) {
  const t = text.trimStart();
  return t[0] === "{" || t[0] === "[";
}

function isClaudeJSON(p) {
  if (Array.isArray(p)) return !!(p[0]?.chat_messages || p[0]?.sender);
  return !!(p.chat_messages || (p.uuid && p.name));
}
function isChatGPTJSON(p) {
  if (Array.isArray(p)) return !!(p[0]?.mapping);
  return !!(p.mapping);
}
function isMessagesArray(p) {
  const arr = Array.isArray(p) ? p : (p.messages || p.data || []);
  if (!Array.isArray(arr) || !arr.length) return false;
  const f = arr[0];
  return !!(f && (f.role || f.sender || f.from) && (f.content || f.text || f.message));
}

function extractTextContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(c => typeof c === "string" ? c : (c.text || "")).join("\n");
  return "";
}

function parseClaudeJSON(p) {
  const conv = Array.isArray(p) ? p[0] : p;
  const raw = conv.chat_messages || (Array.isArray(p) ? p : []);
  const messages = raw.map((msg, i) => {
    const role = (msg.sender === "human" || msg.role === "user") ? "user" : "assistant";
    const content = extractTextContent(msg.content) || msg.text || "";
    return makeMsg(role, content, i);
  }).filter(m => m.content);
  return { title: conv.name || "Claude Chat", source: "claude", messages };
}

function parseChatGPTJSON(p) {
  const conv = Array.isArray(p) ? p[0] : p;
  const messages = [];
  if (conv.mapping) {
    Object.values(conv.mapping)
      .filter(n => n.message?.content && n.message?.author)
      .sort((a, b) => (a.message.create_time || 0) - (b.message.create_time || 0))
      .forEach((node, i) => {
        const msg = node.message;
        if (msg.author.role === "system") return;
        const role = msg.author.role === "user" ? "user" : "assistant";
        const parts = msg.content.parts || [];
        const content = parts.filter(x => typeof x === "string").join("\n");
        if (content.trim()) messages.push(makeMsg(role, content, i));
      });
  }
  return { title: conv.title || "ChatGPT Chat", source: "chatgpt", messages };
}

function parseGenericJSON(p) {
  const arr = Array.isArray(p) ? p : (p.messages || p.data || p.chats || []);
  const title = (!Array.isArray(p) && (p.title || p.name)) || "Imported Chat";
  const messages = arr.map((msg, i) => {
    const role = toRole(msg.role || msg.sender || msg.from || "assistant");
    const content = extractTextContent(msg.content) || msg.text || msg.message || "";
    return makeMsg(role, content, i);
  }).filter(m => m.content);
  return { title, source: "generic", messages };
}

// ─── Text Patterns ────────────────────────────────────────────────────────────

// Pattern A: ChatGPT "You said:" / "ChatGPT said:" — unique and reliable
// These appear on their own line above the message content
const CHATGPT_SAID_RE = /^(You said|ChatGPT said|GPT-4 said|GPT-3\.5 said)\s*:\s*$/gim;

// Pattern B: Standalone name on own line (Claude.ai, Gemini, older ChatGPT)
const STANDALONE_RE = /^(You|Human|Claude|Assistant|ChatGPT|GPT-4[^\n]*?|GPT-3[^\n]*?|Gemini|AI|User|Bot|Me)\s*$/gim;

// Pattern C: Inline "Role: text" (classic format)
const INLINE_RE = /^(Human|Assistant|You|ChatGPT|GPT-4[^:\n]*|GPT-3[^:\n]*|Gemini|Claude|User|AI|Bot|Me)\s*:\s*/gim;

// Pattern D: Markdown bold/heading
const MARKDOWN_RE = /^(?:\*{1,2}(User|Assistant|Human|AI|Bot|You|Claude|ChatGPT|Gemini)\*{1,2}|#{1,3}\s*(User|Assistant|Human|AI|Bot|You|Claude|ChatGPT|Gemini))\s*:?\s*$/gim;

function countMatches(text, re) {
  return (text.match(new RegExp(re.source, re.flags)) || []).length;
}

function detectSource(labels) {
  const s = labels.map(l => (l || "").toLowerCase()).join(" ");
  if (s.includes("claude")) return "claude";
  if (s.includes("chatgpt") || s.includes("gpt")) return "chatgpt";
  if (s.includes("gemini")) return "gemini";
  if (s.includes("human") || s.includes("assistant")) return "claude";
  return "generic";
}

function guessTitle(messages) {
  const first = messages.find(m => m.role === "user");
  if (!first) return "Imported Chat";
  const line = first.content.split("\n").find(l => l.trim()) || "";
  const t = line.trim();
  return t.length > 65 ? t.slice(0, 62) + "…" : t || "Imported Chat";
}

// ─── ChatGPT "said:" format special handling ──────────────────────────────────
/**
 * ChatGPT full-page copy produces:
 *   You said:
 *   <user message>
 *
 *   ChatGPT said:
 *   <assistant message>
 *
 * The "said:" is on its own line, content follows on the next line(s).
 */
function parseChatGPTSaid(text) {
  const segs = splitSegments(text, CHATGPT_SAID_RE, (label) => {
    return label.toLowerCase().startsWith("you") ? "user" : "assistant";
  });
  return { title: guessTitle(segs), source: "chatgpt", messages: segs };
}

// ─── Main Text Parser ─────────────────────────────────────────────────────────

function parseText(rawText) {
  const text = stripUIChrome(rawText);

  // Score each pattern
  const chatgptSaidCount = countMatches(text, CHATGPT_SAID_RE);
  const standaloneCount  = countMatches(text, STANDALONE_RE);
  const inlineCount      = countMatches(text, INLINE_RE);
  const mdCount          = countMatches(text, MARKDOWN_RE);

  // ChatGPT "said:" is the most unambiguous — if present, use it
  if (chatgptSaidCount >= 2) {
    const result = parseChatGPTSaid(text);
    if (result.messages.length >= 2) return result;
  }

  // Pick highest-scoring pattern
  const best = Math.max(standaloneCount, inlineCount, mdCount);

  if (best >= 2) {
    let segs = [];
    let source = "generic";

    if (standaloneCount === best) {
      segs = splitSegments(text, STANDALONE_RE, toRole);
      source = detectSource([...text.matchAll(new RegExp(STANDALONE_RE.source, STANDALONE_RE.flags))].map(m => m[1]));
    } else if (inlineCount === best) {
      segs = splitSegments(text, INLINE_RE, toRole);
      source = detectSource([...text.matchAll(new RegExp(INLINE_RE.source, INLINE_RE.flags))].map(m => m[1]));
    } else {
      segs = splitSegments(text, MARKDOWN_RE, toRole);
      source = "markdown";
    }

    if (segs.length >= 2) return { title: guessTitle(segs), source, messages: segs };
  }

  // Fallback: blank-line separated blocks, alternate user/assistant
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  if (blocks.length >= 2) {
    const messages = blocks.map((b, i) => makeMsg(i % 2 === 0 ? "user" : "assistant", b, i));
    return { title: guessTitle(messages), source: "unknown", messages };
  }

  return { title: "Imported Text", source: "unknown", messages: [makeMsg("assistant", text, 0)] };
}

// ─── Main Export ──────────────────────────────────────────────────────────────

function parseChat(rawInput) {
  const text = clean(rawInput);
  if (!text) return { title: "Empty", source: "unknown", messages: [] };

  if (looksLikeJSON(text)) {
    try {
      const parsed = JSON.parse(text);
      if (isClaudeJSON(parsed))    return parseClaudeJSON(parsed);
      if (isChatGPTJSON(parsed))   return parseChatGPTJSON(parsed);
      if (isMessagesArray(parsed)) return parseGenericJSON(parsed);
      return parseGenericJSON(parsed);
    } catch (_) {}
  }

  return parseText(text);
}

module.exports = { parseChat };
