export const getRelevantHistory = (currentPrompt, allMessages) => {
  // 1. Agar history khali hai, toh bas empty array return karo
  if (!allMessages || allMessages.length <= 1) return [];

  // 2. Sirf 'user' aur 'ai' ke messages lo (system/welcome message hatao)
  const chatHistory = allMessages.filter(msg => msg.role !== 'system' && msg.role !== 'welcome');

  // 3. Conversation ka flow banaye rakhne ke liye AAKHRI 2 messages hamesha uthao
  const recentMessages = chatHistory.slice(-2);

  // 4. Current question se main "Keywords" nikalo (chhote words jaise 'hai', 'kya' hata do)
  const ignoreWords = ['hai', 'kya', 'kaise', 'aur', 'the', 'main', 'tum'];
  const keywords = currentPrompt.toLowerCase().split(' ')
    .filter(word => word.length > 3 && !ignoreWords.includes(word));

  // 5. Ab purani chats mein se wo messages dhoondho jinme ye keywords hon
  const oldMessages = chatHistory.slice(0, -2); // Aakhri 2 toh pehle hi le liye hain
  
  const relatedOlderMessages = oldMessages.filter(msg => {
    return keywords.some(kw => msg.text.toLowerCase().includes(kw));
  });

  // 6. Tokens bachane ke liye sirf Top 2 sabse related purane message lo
  const topRelatedMessages = relatedOlderMessages.slice(-2);

  // 7. Dono ko mila kar return kar do (Total max 4 messages jayenge)
  return [...topRelatedMessages, ...recentMessages];
};