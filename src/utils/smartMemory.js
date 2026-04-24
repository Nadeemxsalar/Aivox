export const getRelevantHistory = (currentPrompt, allMessages) => {
  if (!allMessages || allMessages.length <= 1) return [];

  // ✅ 1. Valid chat messages filter
  const chatHistory = allMessages.filter(
    msg => msg.role === 'user' || msg.role === 'ai'
  );

  // ✅ 2. Token saver truncate (OPTIMIZED: 120 bahut kam tha, isliye 800 kiya taaki context na toote)
  const truncateText = (text = "") => {
    const MAX_LEN = 800; 
    return text.length > MAX_LEN 
      ? text.slice(0, MAX_LEN).trim() + "..." 
      : text;
  };

  // ✅ 3. THE SWEET SPOT: Hamesha last 6 messages yaad rakho (Conversational Flow ke liye zaroori hai)
  const recentMessages = chatHistory.slice(-6).map(msg => ({
    role: msg.role,
    text: truncateText(msg.text)
  }));

  // Agar total messages hi 6 ya us se kam hain, toh wahi return kar do
  if (chatHistory.length <= 6) return recentMessages;

  // ✅ 4. Better stopwords list (Thodi aur badi taaki faltu words skip hon)
  const ignoreWords = new Set([
    'hai','kya','kaise','aur','the','main','tum','ho','ko','se',
    'ye','wo','bhi','me','mein','ki','ke','ka','kar','raha','rhi','tha',
    'hain','karo','batao','please','can','you','what','how','is','are'
  ]);

  // ✅ 5. Extract clean keywords
  const keywords = currentPrompt
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // punctuation remove
    .split(/\s+/)
    .filter(word => word.length > 3 && !ignoreWords.has(word));

  // ✅ 6. Score-based relevance (Purane bache hue messages ke liye)
  const oldMessages = chatHistory.slice(0, -6); // Jo last 6 mein nahi hain

  const scoredMessages = oldMessages.map((msg, index) => {
    const text = msg.text.toLowerCase();
    let score = 0;

    keywords.forEach(kw => {
      if (text.includes(kw)) score += 3; // Keyword match ko strong weightage
    });

    // Recency bias: Naye messages ko thoda zyada score (flow maintain karne ke liye)
    score += (index * 0.1);

    return {
      role: msg.role,
      text: truncateText(msg.text),
      score
    };
  });

  // ✅ 7. Top 2 purane relevant messages pick karo (Sirf tab jab solid match ho)
  const topRelatedMessages = scoredMessages
    .filter(m => m.score > 2) 
    .sort((a, b) => b.score - a.score)
    .slice(0, 2) 
    .map(({ role, text }) => ({ role, text }));

  // ✅ 8. Merge: Old Relevant Context + Immediate Recent Context
  // Format: [Purani yaad aayi baat] + [Abhi jo chal raha hai]
  const finalMessages = [...topRelatedMessages, ...recentMessages];

  // Deduplicate (Kahin same message do baar na chala jaye)
  const unique = [];
  const seen = new Set();

  for (let msg of finalMessages) {
    const key = msg.text; // Text ke base par duplicate check
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(msg);
    }
  }

  return unique;
};