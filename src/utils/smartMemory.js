export const getRelevantHistory = (currentPrompt, allMessages) => {
  if (!allMessages || allMessages.length <= 1) return [];

  // ✅ 1. Valid chat messages filter
  const chatHistory = allMessages.filter(
    msg => msg.role === 'user' || msg.role === 'ai'
  );

  // ✅ 2. Token saver truncate (clean version)
  const truncateText = (text = "") => {
    const MAX_LEN = 120; // thoda aur optimize
    return text.length > MAX_LEN 
      ? text.slice(0, MAX_LEN).trim() + "..." 
      : text;
  };

  // ✅ 3. Always keep last 2 messages (context important)
  const recentMessages = chatHistory.slice(-2).map(msg => ({
    role: msg.role,
    text: truncateText(msg.text)
  }));

  // ✅ 4. Better stopwords list
  const ignoreWords = new Set([
    'hai','kya','kaise','aur','the','main','tum','ho','ko','se',
    'ye','wo','bhi','me','mein','ki','ke','ka','kar','raha','rhi','tha'
  ]);

  // ✅ 5. Extract clean keywords
  const keywords = currentPrompt
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // punctuation remove
    .split(/\s+/)
    .filter(word => word.length > 3 && !ignoreWords.has(word));

  // ✅ 6. Score-based relevance (NEW 🔥)
  const oldMessages = chatHistory.slice(0, -2);

  const scoredMessages = oldMessages.map(msg => {
    const text = msg.text.toLowerCase();
    let score = 0;

    keywords.forEach(kw => {
      if (text.includes(kw)) score += 2; // keyword match strong
    });

    // small bonus for longer meaningful msgs
    if (msg.text.length > 50) score += 1;

    return {
      role: msg.role,
      text: truncateText(msg.text),
      score
    };
  });

  // ✅ 7. Top relevant messages pick karo
  const topRelatedMessages = scoredMessages
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2) // max 2 hi
    .map(({ role, text }) => ({ role, text }));

  // ✅ 8. Merge + deduplicate (NEW)
  const finalMessages = [...topRelatedMessages, ...recentMessages];

  const unique = [];
  const seen = new Set();

  for (let msg of finalMessages) {
    const key = msg.role + msg.text;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(msg);
    }
  }

  return unique;
};