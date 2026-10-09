// ============================================================
//  SMART MEMORY v2.2 — FREE API OPTIMIZED (Fixed for Hinglish)
//  1000 tokens/min rate limit ke liye tuned
//  4 msgs/min avg → ~500 tokens context budget per call
// ============================================================

// ─── CONFIG ─────────────────────────────────────────────────
const CFG = {
  TOKEN_BUDGET:       150,   // Thoda sa budget badhaya taaki context theek rahe
  HARD_LIMIT:         200,   // Kabhi bhi is se zyada mat bhejo

  RECENT_WINDOW:      3,     // Last N messages ALWAYS include
  MAX_OLD_ANCHORS:    1,     // Purane anchor messages max
  MAX_OLD_RELEVANT:   1,     // Purane relevant messages max

  COMPRESS_AT:        100,   // Itne chars se lamba = compress
  COMPRESS_TO:        60,    // Compress target chars

  SCORE_KEYWORD:      4,
  SCORE_ENTITY:       3,
  SCORE_QUESTION:     2,
  ANCHOR_THRESHOLD:   8,
  RELEVANT_THRESHOLD: 3,
};

// ─── TOKEN ESTIMATOR ─────────────────────────────────────────
// (Fixed for Hinglish and Emojis)
const estimateTokens = (text = "") => Math.ceil(text.length / 2.5);

// ─── FAST HASH ───────────────────────────────────────────────
const hashStr = (str = "") => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
};

// ─── AGGRESSIVE COMPRESSOR ───────────────────────────────────
// (Fixed to not cut mid-sentence)
const compress = (text = "") => {
  if (text.length <= CFG.COMPRESS_AT) return text;
  const sliced = text.slice(0, CFG.COMPRESS_TO + 20); 
  const match = sliced.match(/.*[.!?\n]/); 
  if (match && match[0].length <= CFG.COMPRESS_TO + 10) {
    return match[0].trim() + "…";
  }
  const lastSpace = sliced.slice(0, CFG.COMPRESS_TO).lastIndexOf(" ");
  return (lastSpace > 10 ? sliced.slice(0, lastSpace) : sliced.slice(0, CFG.COMPRESS_TO)) + "…";
};

// ─── STOPWORDS ───────────────────────────────────────────────
const STOP = new Set([
  "hai","hain","kya","kaise","aur","the","main","tum","ho","ko","se",
  "ye","wo","bhi","me","mein","ki","ke","ka","kar","raha","rhi","tha",
  "karo","batao","please","wala","wali","yeh","voh","toh","phir","ab",
  "lekin","par","agar","sahi","can","you","what","how","is","are","was",
  "were","this","that","and","for","with","have","has","not","but","from",
  "will","just","also","some","more","when","then","they","would","could",
  "should","about","which","there","does","did","use","one","all","out",
  "do","it","to","a","of","in","on","at","be","by","as","an","or","if",
]);

// ─── KEYWORD + ENTITY EXTRACT ────────────────────────────────
export const extractKeywords = (text = "") =>
  text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
    .filter(w => w.length > 3 && !STOP.has(w));

// (Fixed regex to catch normal words too)
const extractEntities = (text = "") => {
  const e = new Set();
  (text.match(/\b[a-zA-Z0-9_]{3,}\b/g) || []).forEach(x => {
    const lower = x.toLowerCase();
    if (!STOP.has(lower)) e.add(lower);
  });
  return e;
};

// ─── SCORER ──────────────────────────────────────────────────
const scoreMessage = (msgText, keywords, entities, index, total) => {
  const lower = msgText.toLowerCase();
  let score = 0;
  keywords.forEach(kw => { if (lower.includes(kw)) score += CFG.SCORE_KEYWORD; });
  entities.forEach(en => { if (lower.includes(en)) score += CFG.SCORE_ENTITY; });
  if (msgText.includes("?")) score += CFG.SCORE_QUESTION;
  score += (index / Math.max(total - 1, 1)) * 1.5;
  return score;
};

// ─── TOKEN BUDGET ENFORCER ───────────────────────────────────
const applyBudget = (messages, budget = CFG.TOKEN_BUDGET) => {
  if (!messages.length) return [];
  let result = messages.map(m =>
    m.text.length > CFG.COMPRESS_AT ? { ...m, text: compress(m.text) } : m
  );
  let total = result.reduce((s, m) => s + estimateTokens(m.text), 0);
  while (total > budget && result.length > 2) {
    const dropped = result.shift();
    total -= estimateTokens(dropped.text);
  }
  total = result.reduce((s, m) => s + estimateTokens(m.text), 0);
  if (total > CFG.HARD_LIMIT) {
    const ratio = CFG.HARD_LIMIT / total;
    result = result.map(m => ({
      ...m,
      text: m.text.slice(0, Math.floor(m.text.length * ratio)).trim() + "…"
    }));
  }
  return result;
};

// ─── MAIN EXPORT ─────────────────────────────────────────────
export const getRelevantHistory = (currentPrompt = "", allMessages = []) => {
  if (!allMessages?.length) return [];
  const chat = allMessages.filter(
    m => m && (m.role === "user" || m.role === "ai") && m.text?.trim()
  );
  if (chat.length <= 1) return [];

  const keywords = extractKeywords(currentPrompt);
  const entities  = extractEntities(currentPrompt);
  const recentRaw = chat.slice(-CFG.RECENT_WINDOW);
  const oldRaw    = chat.slice(0, -CFG.RECENT_WINDOW);

  const recentWindow = recentRaw.map(m => ({ role: m.role, text: compress(m.text) }));
  if (!oldRaw.length) return applyBudget(recentWindow);

  const scored = oldRaw.map((m, i) => ({
    role:  m.role,
    text:  compress(m.text),
    score: scoreMessage(m.text, keywords, entities, i, oldRaw.length),
    _hash: hashStr(m.text.slice(0, 60)),
  }));

  const anchors = scored
    .filter(m => m.score >= CFG.ANCHOR_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.MAX_OLD_ANCHORS)
    .map(({ role, text, _hash }) => ({ role, text, _hash }));

  const anchorHashes = new Set(anchors.map(m => m._hash));
  const relevant = scored
    .filter(m => m.score >= CFG.RELEVANT_THRESHOLD && !anchorHashes.has(m._hash))
    .sort((a, b) => b.score - a.score)
    .slice(0, CFG.MAX_OLD_RELEVANT)
    .map(({ role, text, _hash }) => ({ role, text, _hash }));

  const merged = [...anchors, ...relevant, ...recentWindow];
  const seen = new Set();
  const unique = [];
  for (const m of merged) {
    const key = m._hash || hashStr(m.text.slice(0, 50));
    if (!seen.has(key)) { seen.add(key); unique.push({ role: m.role, text: m.text }); }
  }
  return applyBudget(unique);
};

// ─── AICONFIG CRASH FIX ──────────────────────────────────────
// (Ye aiconfig.js me import hota hai, isliye iska hona zaroori hai varna app crash hogi)
export const buildEarlierDigest = () => {
  return ""; 
};

// ─── DEBUG (sirf development mein use karo) ──────────────────
export const debugMemory = (currentPrompt, allMessages) => {
  const result = getRelevantHistory(currentPrompt, allMessages);
  const tokens  = result.reduce((s, m) => s + estimateTokens(m.text), 0);
  console.group("Smart Memory v2.2 — Free API Mode");
  console.log(`Messages: ${result.length} | Tokens: ${tokens}/${CFG.TOKEN_BUDGET} (${((tokens/CFG.TOKEN_BUDGET)*100).toFixed(1)}%)`);
  console.table(result.map((m, i) => ({
    "#": i+1, role: m.role, chars: m.text.length,
    tokens: estimateTokens(m.text),
    preview: m.text.slice(0, 50).replace(/\n/g," ") + "…",
  })));
  console.groupEnd();
  return result;
};