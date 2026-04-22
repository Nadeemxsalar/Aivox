import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  
  // NEW STATES
  const [toastMsg, setToastMsg] = useState(''); 
  const [isRoasterMode, setIsRoasterMode] = useState(false); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); 
  
  const getCurrentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const [messages, setMessages] = useState([
    { 
      id: Date.now(),
      role: 'ai', 
      text: 'Hello! Main **Aivox** hoon. Main aapki kya aasan bhasha mein madad kar sakta hoon? ✨',
      time: getCurrentTime(),
      isBookmarked: false
    }
  ]);
  const [loading, setLoading] = useState(false);
  
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollHeight - scrollTop - clientHeight > 100) {
        setShowScrollBtn(true);
      } else {
        setShowScrollBtn(false);
      }
    }
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const suggestedPrompts = [
    "Explain Quantum Computing",
    "Write a formal email for leave",
    "Give me a React code snippet",
    "Tell me a tech joke"
  ];

  const handleGenerate = async (e, customPrompt = null, isRegenerate = false) => {
    if (e) e.preventDefault();
    const textToProcess = customPrompt || prompt.trim();
    if (!textToProcess || loading) return;

    setPrompt('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (!isRegenerate) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'user', text: textToProcess, time: getCurrentTime(), isBookmarked: false }]);
    }
    setLoading(true);

    // NORMAL MODE PROMPT (Updated for extreme clarity)
    let systemPrompt = `Tumhara naam Aivox hai, ek advanced AI assistant. Tumhe 'Nadeem' ne banaya hai.
    Nadeem ki Details: Aspiring Full-Stack Web Developer, Final-year BCA student (Rank #1), Content Creator ('Nadeem Fact Star').
    
    STRICT RULES FOR EXTREME CLARITY:
    - Humesha ekdum aasan, simple aur clear bhasha (Aasan Hinglish) mein jawab do jo kisi normal insaan ko bhi aasani se samajh aa jaye.
    - Jawab bilkul bhi confusing ya complex nahi hona chahiye. Bhari technical words ka use mat karo.
    - Agar technical topic samjhana ho, toh daily-life ka aasan example do.
    - Seedhi aur to-the-point baat karo, idhar-udhar ki baatein mat ghumao.
    - Bullet points use karo agar list ho taaki padhne mein aasan lage.`;

    // ROASTER MODE PROMPT (Savage AI)
    if (isRoasterMode) {
      systemPrompt = `Tum ek SAVAGE, SARCASTIC aur brutally honest stand-up comedian AI ho. Tumhara kaam hai user ki baaton ka mazak udana.
      Rules:
      - Hinglish slang aur sarcasm ka heavy use karo.
      - User ke sawal ko taunt maarke jawab do, par end mein uska aasan aur clear answer bhi zaroor dena taaki user confuse na ho.
      - BCA students, developers aur coders ke struggle ka mazak udao.
      - Gaaliyan use MAT karna, par beizzati ekdum top-level ki honi chahiye! (Savage & Witty).`;
    }

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt,
        generationConfig: { maxOutputTokens: 300, temperature: isRoasterMode ? 0.8 : 0.4 } 
      });
      const result = await model.generateContent(textToProcess);
      const aiText = result.response.text();
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: aiText, time: getCurrentTime(), isBookmarked: false }]);

    } catch (geminiError) {
      try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant", 
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: textToProcess }],
            max_tokens: 300, temperature: isRoasterMode ? 0.8 : 0.4
          })
        });
        
        if (!groqResponse.ok) throw new Error(`Groq Error`);
        const groqData = await groqResponse.json();
        setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: groqData.choices[0].message.content, time: getCurrentTime(), isBookmarked: false }]);

      } catch (groqError) {
        try {
          const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openRouterApiKey}`,
              "HTTP-Referer": "http://localhost:5173", 
              "X-Title": "Aivox", 
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: "meta-llama/llama-3.1-8b-instruct:free", 
              messages: [{ role: "system", content: systemPrompt }, { role: "user", content: textToProcess }],
              max_tokens: 300, temperature: isRoasterMode ? 0.8 : 0.4
            })
          });

          if (!orResponse.ok) throw new Error(`OpenRouter Error`);
          const orData = await orResponse.json();
          setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: orData.choices[0].message.content, time: getCurrentTime(), isBookmarked: false }]);

        } catch (openRouterError) {
          setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: '⚠️ Servers busy hain bro. Thodi der mein try karna.', time: getCurrentTime(), isBookmarked: false }]);
        }
      }
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleRegenerate = () => {
    const lastUserMsgIndex = messages.map(m => m.role).lastIndexOf('user');
    if (lastUserMsgIndex !== -1) {
      const lastPrompt = messages[lastUserMsgIndex].text;
      setMessages(prev => prev.slice(0, lastUserMsgIndex + 1));
      handleGenerate(null, lastPrompt, true);
    }
  };

  const toggleBookmark = (id) => {
    setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, isBookmarked: !msg.isBookmarked } : msg));
    const isNowBookmarked = !messages.find(m => m.id === id).isBookmarked;
    if (isNowBookmarked) showToast("Message bookmarked! ⭐");
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleGenerate(e);
    }
  };

  const handleInputResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
    setPrompt(e.target.value);
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    showToast("Copied to clipboard! 📋"); 
  };

  const handleSpeak = (text) => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Browser doesn't support voice input 🎙️");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => showToast("Listening... Speak now 🎙️");
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(prev => prev + " " + transcript);
    };
    recognition.start();
  };

  const handleClearChat = () => {
    if(window.confirm("Sahi mein chat udani hai?")) {
      setMessages([{ id: Date.now(), role: 'ai', text: 'Chat cleared! Main aapki aasan bhasha mein kya madad kar sakta hoon? ✨', time: getCurrentTime(), isBookmarked: false }]);
      showToast("Chat Cleared 🗑️");
      setIsMobileMenuOpen(false); 
    }
  };

  const handleDownloadChat = () => {
    const chatText = messages.map(m => `[${m.time}] ${m.role === 'ai' ? 'Aivox' : 'Nadeem'}:\n${m.text}\n\n`).join('');
    const blob = new Blob([chatText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Aivox_Chat.txt";
    a.click();
    showToast("Chat Downloaded 💾");
    setIsMobileMenuOpen(false);
  };

  const filteredMessages = messages.filter(msg => msg.text.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'} ${isRoasterMode ? 'roaster-active-theme' : ''}`}>
      
      {toastMsg && <div className="custom-toast">{toastMsg}</div>}

      <div className="chat-wrapper">
        <div className="chat-header">
          <img src="/logo.svg" alt="Aivox Logo" className="header-logo" />
          <div className="header-info">
            <h1>Aivox</h1>
            <p>Created by <strong>Nadeem</strong></p>
          </div>

          <div className="search-box">
             <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
             <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          
          <button className="hamburger-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
             <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          <div className={`header-actions ${isMobileMenuOpen ? 'open' : ''}`}>
            
            <button onClick={() => { setIsRoasterMode(!isRoasterMode); setIsMobileMenuOpen(false); showToast(isRoasterMode ? "Normal Mode Activated ✨" : "Roaster Mode: Savage level Max 🔥"); }} title="Toggle Roaster Mode" className={`action-btn ${isRoasterMode ? 'roaster-btn-active' : ''}`}>
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
            </button>

            <button onClick={() => { setIsDarkMode(!isDarkMode); setIsMobileMenuOpen(false); }} title="Toggle Theme" className="action-btn">
              {isDarkMode ? (
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              )}
            </button>
            <button onClick={handleDownloadChat} title="Download Chat" className="action-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            <button onClick={handleClearChat} title="Clear Chat" className="action-btn clear-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>

        <div className="chat-messages" onScroll={handleScroll} ref={chatContainerRef}>
          {filteredMessages.map((msg, index) => {
            const isLastAI = msg.role === 'ai' && index === messages.length - 1;
            return (
              <div key={msg.id} className={`message-row ${msg.role}`}>
                {msg.role === 'ai' && (
                  <img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} />
                )}
                
                <div className="message-content-wrapper">
                  <div className={`message-bubble ${msg.role} ${msg.isBookmarked ? 'bookmarked-bubble' : ''} ${isRoasterMode && msg.role === 'ai' ? 'roast-bubble' : ''}`}>
                    {msg.role === 'ai' ? (
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    ) : (
                      <span>{msg.text}</span>
                    )}
                  </div>
                  
                  <div className={`message-meta ${msg.role}`}>
                    <span className="timestamp">{msg.time}</span>
                    {msg.role === 'ai' && (
                      <div className="msg-tools">
                        <button onClick={() => toggleBookmark(msg.id)} title="Bookmark" className={msg.isBookmarked ? 'star-active' : ''}>
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill={msg.isBookmarked ? 'currentColor' : 'none'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        </button>
                        <button onClick={() => handleCopy(msg.text)} title="Copy">
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button onClick={() => handleSpeak(msg.text)} title="Listen/Stop">
                          {isSpeaking ? (
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                          ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                          )}
                        </button>
                        {isLastAI && (
                          <button onClick={handleRegenerate} title="Regenerate Response">
                            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="msg-avatar user-avatar">U</div>
                )}
              </div>
            );
          })}

          {loading && (
            <div className="message-row ai">
              <img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} />
              <div className="message-bubble ai typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {showScrollBtn && (
          <button className="scroll-bottom-btn" onClick={scrollToBottom} title="Scroll to bottom">
            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
          </button>
        )}

        {messages.length === 1 && !searchQuery && (
          <div className="suggestions-container">
            {suggestedPrompts.map((text, i) => (
              <button key={i} onClick={() => handleGenerate(null, text)} className="suggestion-chip">
                {text}
              </button>
            ))}
          </div>
        )}

        <div className="input-container-wrapper">
          <form onSubmit={handleGenerate} className="input-area">
            <button type="button" onClick={handleVoiceInput} className="mic-btn" title="Voice Input">
              <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
            
            <div className="textarea-wrapper">
              <textarea
                ref={inputRef}
                value={prompt}
                onChange={handleInputResize}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything..."  
                disabled={loading}
                rows={1}
                className="auto-resize-textarea"
              />
              <div className="char-counter">{prompt.length} / 500</div>
            </div>

            <button type="submit" disabled={!prompt.trim() || loading} aria-label="Send" className="send-btn">
              <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

export default App;