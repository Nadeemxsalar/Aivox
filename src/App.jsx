import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import { trackUserActivity, onPromptStart, onPromptKey } from './utils/tracker'; 
import { getSystemPrompt } from './utils/aiConfig'; 
import { getRelevantHistory } from './utils/smartMemory';
import { auth } from './firebase'; 
import { onAuthStateChanged } from 'firebase/auth';
import './App.css';

function App() {
  const [authUser, setAuthUser] = useState(null);
  const [guestName, setGuestName] = useState(localStorage.getItem('aivox_guest_name') || '');
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [prompt, setPrompt] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [toastMsg, setToastMsg] = useState(''); 
  
  // 🔥 ACTIVE EGO STATE 🔥
  const [activeEgo, setActiveEgo] = useState(localStorage.getItem('aivox_alter_ego') || 'smart');
  const [isRoasterMode, setIsRoasterMode] = useState(activeEgo === 'savage'); 
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const getCurrentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const [messages, setMessages] = useState(() => {
    const savedChats = localStorage.getItem('aivox_chat_history');
    if (savedChats) return JSON.parse(savedChats);
    return [{ id: Date.now(), role: 'ai', text: 'Hello! Main **Aivox** hoon. Main aapki kya madad kar sakta hoon? ✨', time: getCurrentTime(), isBookmarked: false }];
  });

  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  // 🔥 EGO UI DETAILS 🔥
  const egoDetails = {
    smart: { name: "Normal Mode", color: "#8c82f2", bg: "rgba(140, 130, 242, 0.15)", icon: "✨" },
    savage: { name: "Savage Roaster", color: "#ff4d4f", bg: "rgba(255, 77, 79, 0.15)", icon: "🔥" },
    corporate: { name: "Strict Boss", color: "#f5b942", bg: "rgba(245, 185, 66, 0.15)", icon: "👔" },
    genz: { name: "Gen-Z Mode", color: "#00e5ff", bg: "rgba(0, 229, 255, 0.15)", icon: "💀" }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const handleMobileChange = (e) => {
      const mobile = e.matches;
      setIsMobile(mobile);
      setIsSidebarOpen(!mobile);
    };
    setIsMobile(mediaQuery.matches);
    setIsSidebarOpen(!mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMobileChange);
    return () => mediaQuery.removeEventListener('change', handleMobileChange);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setAuthUser(currentUser);
      } else {
        setAuthUser(null);
        if (!localStorage.getItem('aivox_guest_name')) {
          window.location.href = '/auth';
        }
      }
      setIsAuthChecking(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => { localStorage.setItem('aivox_chat_history', JSON.stringify(messages)); }, [messages]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const handleScroll = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    }
  };
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const currentDisplayName = authUser ? authUser.displayName : (guestName || 'User');

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

    const currentEgo = localStorage.getItem('aivox_alter_ego') || 'smart';
    const isActuallyRoasting = isRoasterMode || currentEgo === 'savage';
    const systemPrompt = getSystemPrompt(isActuallyRoasting, "Nadeem");
    let finalResponse = "";
    let finalModel = "";
    const startTime = Date.now(); 

    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        systemInstruction: systemPrompt, 
        generationConfig: { maxOutputTokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 } 
      });

      const smartHistory = getRelevantHistory(textToProcess, messages);
      const geminiHistory = smartHistory.map(msg => ({
        role: msg.role === 'ai' ? 'model' : 'user',
        parts: [{ text: msg.text }],
      }));

      const chat = model.startChat({ history: geminiHistory });
      const result = await chat.sendMessage(textToProcess);
      finalResponse = result.response.text();
      finalModel = "Gemini";

    } catch (geminiError) {
      try {
        const smartHistory = getRelevantHistory(textToProcess, messages);
        const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: textToProcess }], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
        });
        const groqData = await groqResponse.json();
        finalResponse = groqData.choices[0].message.content;
        finalModel = "Llama-3.1 (Groq)";
      } catch (groqError) {
        try {
            const smartHistory = getRelevantHistory(textToProcess, messages);
            const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
            const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST", headers: { "Authorization": `Bearer ${openRouterApiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({ model: "meta-llama/llama-3.1-8b-instruct:free", messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: textToProcess }], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
            });
            const orData = await orResponse.json();
            finalResponse = orData.choices[0].message.content;
            finalModel = "Llama-3.1 (OpenRouter)";
        } catch (error) {
            finalResponse = "⚠️ Servers busy hain bro. Thodi der mein try karna.";
            finalModel = "Failed";
        }
      }
    } finally {
      const timeTakenMs = Date.now() - startTime; 
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: finalResponse, time: getCurrentTime(), isBookmarked: false }]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      
      if (finalModel !== "Failed" && finalResponse) {
        trackUserActivity({
          prompt: textToProcess, response: finalResponse, model: finalModel, timeTakenMs, isRoasterMode: isActuallyRoasting,
          userName: currentDisplayName
        });
      }
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

  const toggleBookmark = (id) => setMessages(prev => prev.map(msg => msg.id === id ? { ...msg, isBookmarked: !msg.isBookmarked } : msg));
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(e); } };
  const handleInputResize = (e) => { e.target.style.height = 'auto'; e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`; setPrompt(e.target.value); };
  const handleCopy = (text) => { navigator.clipboard.writeText(text); showToast("Copied to clipboard! 📋"); };
  const handleSpeak = (text) => {
    if (isSpeaking) { window.speechSynthesis.cancel(); setIsSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsSpeaking(false);
    setIsSpeaking(true); window.speechSynthesis.speak(utterance);
  };
  const handleVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showToast("Mic not supported 🎙️");
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.onstart = () => showToast("Listening... 🎙️");
    recognition.onresult = (event) => setPrompt(prev => prev + " " + event.results[0][0].transcript);
    recognition.start();
  };

  const handleClearChat = () => {
    if(window.confirm("Sahi mein chat udani hai?")) {
      const resetMsg = [{ id: Date.now(), role: 'ai', text: 'Chat cleared! ✨', time: getCurrentTime(), isBookmarked: false }];
      setMessages(resetMsg); localStorage.setItem('aivox_chat_history', JSON.stringify(resetMsg)); showToast("Chat Cleared 🗑️");
    }
  };

  const handleDownloadChat = () => {
    const chatText = messages.map(m => `[${m.time}] ${m.role === 'ai' ? 'Aivox' : currentDisplayName}:\n${m.text}\n\n`).join('');
    const blob = new Blob([chatText], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "Aivox_Chat.txt"; a.click(); showToast("Chat Downloaded 💾");
  };

  const toggleSidebarRoaster = () => {
    const newEgo = activeEgo === 'savage' ? 'smart' : 'savage';
    setActiveEgo(newEgo);
    setIsRoasterMode(newEgo === 'savage');
    localStorage.setItem('aivox_alter_ego', newEgo);
    showToast(newEgo === 'savage' ? "Savage Mode Activated 🔥" : "Normal Mode Activated ✨");
  };

  const filteredMessages = messages.filter(msg => msg.text.toLowerCase().includes(searchQuery.toLowerCase()));

  if (isAuthChecking) return <div className="app-container dark-mode" style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#8c82f2'}}>Loading...</div>;

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'} ${activeEgo === 'savage' ? 'roaster-active-theme' : ''}`}>
      {toastMsg && <div className="custom-toast">{toastMsg}</div>}

      <aside 
        className={`main-sidebar ${isSidebarOpen ? 'open' : 'closed'}`}
        style={{
          position: isMobile ? 'fixed' : 'relative',
          top: 0, left: 0, bottom: 0,
          width: isMobile ? '280px' : (isSidebarOpen ? '280px' : '0px'),
          transform: isSidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          opacity: isMobile ? 1 : (isSidebarOpen ? 1 : 0),
          zIndex: 100,
          boxShadow: (isMobile && isSidebarOpen) ? '10px 0 30px rgba(0,0,0,0.5)' : 'none',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden', 
          borderRight: (isMobile || isSidebarOpen) ? '1px solid var(--border-color)' : 'none',
          flexShrink: 0,
          whiteSpace: 'nowrap' 
        }}
      >
        <div className="sidebar-header">
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: '#8c82f2', flexShrink: 0 }}>
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
          <h2>Aivox Pro</h2>
          {isMobile && (
            <button type="button" className="close-sidebar-btn" onClick={() => setIsSidebarOpen(false)} style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>

        <div className="sidebar-content">
          <button type="button" className="new-chat-btn" onClick={handleClearChat}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Chat
          </button>

          <div className="features-section">
            <p className="features-title">God-Mode Capabilities</p>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg></div>
              <div className="feat-text"><h4>Digital Mirror</h4><p>Analyze chat psychology</p></div>
            </div>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
              <div className="feat-text"><h4>Alter-Ego Mode</h4><p>Switch AI personalities</p></div>
            </div>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
              <div className="feat-text"><h4>Memory Lock</h4><p>Permanently save secrets</p></div>
            </div>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg></div>
              <div className="feat-text"><h4>Timeline Predictor</h4><p>Simulate future decisions</p></div>
            </div>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box"><svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
              <div className="feat-text"><h4>Vibe Sync</h4><p>Real-time energy match</p></div>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button type="button" onClick={toggleSidebarRoaster} className={`sidebar-action-btn ${activeEgo === 'savage' ? 'roaster-btn-active' : ''}`}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
            Roaster Mode
          </button>
          
          <button type="button" onClick={() => setIsDarkMode(!isDarkMode)} className="sidebar-action-btn">
            {isDarkMode ? 
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> 
              : 
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </button>

          <button type="button" onClick={handleDownloadChat} className="sidebar-action-btn">
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Chat
          </button>

          <div className="user-profile-bar" onClick={() => window.location.href = '/profile'}>
            <div className="user-avatar-small">{currentDisplayName.charAt(0).toUpperCase()}</div>
            <div className="user-name-text">{currentDisplayName}</div>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </div>
        </div>
      </aside>

      {/* OVERLAY FOR MOBILE */}
      {isMobile && isSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsSidebarOpen(false)}
          style={{ display: 'block', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, backdropFilter: 'blur(4px)' }}
        ></div>
      )}

      {/* ⬛ MAIN CHAT AREA */}
      <div className={`chat-main-area ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="chat-wrapper">
          
          <div className="chat-header">
            {/* 🍔 ORIGINAL HAMBURGER ICON */}
            <button 
              type="button"
              className={`hamburger-btn ${isSidebarOpen ? 'active' : ''}`} 
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsSidebarOpen(prev => !prev); }}
              style={{ zIndex: 110, position: 'relative', flexShrink: 0 }}
            >
              <div className="ham-line line-1" style={{ pointerEvents: 'none' }}></div>
              <div className="ham-line line-2" style={{ pointerEvents: 'none' }}></div>
              <div className="ham-line line-3" style={{ pointerEvents: 'none' }}></div>
            </button>

            {/* 🔍 ORIGINAL SEARCH BOX */}
            <div className="search-box">
               <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
               <input type="text" placeholder="Search chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            {/* 🛡️ ORIGINAL UNTOUCHED LOGO AND INFO */}
            <div className="header-info right-aligned">
              <div className="header-text">
                <h1>Aivox</h1>
                <p>By <strong>Nadeem</strong></p>
              </div>
              <img src="/logo.svg" alt="Aivox Logo" className="header-logo" />
            </div>
          </div>

          <div className="chat-messages" onScroll={handleScroll} ref={chatContainerRef}>
            
            {filteredMessages.map((msg, index) => {
              const isLastAI = msg.role === 'ai' && index === messages.length - 1;
              return (
                <div key={msg.id} className={`message-row ${msg.role}`}>
                  {msg.role === 'ai' && <img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} />}
                  <div className="message-content-wrapper">
                    <div className={`message-bubble ${msg.role} ${msg.isBookmarked ? 'bookmarked-bubble' : ''} ${activeEgo === 'savage' && msg.role === 'ai' ? 'roast-bubble' : ''}`}>
                      {msg.role === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : <span>{msg.text}</span>}
                    </div>
                    <div className={`message-meta ${msg.role}`}>
                      <span className="timestamp">{msg.time}</span>
                      {msg.role === 'ai' && (
                        <div className="msg-tools">
                          <button type="button" onClick={() => toggleBookmark(msg.id)} className={msg.isBookmarked ? 'star-active' : ''}><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill={msg.isBookmarked ? 'currentColor' : 'none'}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></button>
                          <button type="button" onClick={() => handleCopy(msg.text)}><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                          <button type="button" onClick={() => handleSpeak(msg.text)}>{isSpeaking ? <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg> : <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>}</button>
                          {isLastAI && <button type="button" onClick={handleRegenerate}><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg></button>}
                        </div>
                      )}
                    </div>
                  </div>
                  {msg.role === 'user' && <div className="msg-avatar user-avatar">{currentDisplayName ? currentDisplayName.charAt(0).toUpperCase() : 'U'}</div>}
                </div>
              );
            })}
            {loading && (
              <div className="message-row ai"><img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} /><div className="message-bubble ai typing-indicator"><span></span><span></span><span></span></div></div>
            )}
            <div ref={chatEndRef} />
          </div>

          {showScrollBtn && <button type="button" className="scroll-bottom-btn" onClick={scrollToBottom}><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>}

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
                  onFocus={onPromptStart} 
                  onKeyDown={(e) => { onPromptKey(); handleKeyDown(e); }} 
                  placeholder={activeEgo === 'smart' ? "Message Aivox..." : `Message Aivox (${egoDetails[activeEgo].name})...`}
                  disabled={loading} 
                  rows={1} 
                  className="auto-resize-textarea" 
                />
                <div className="char-counter">{prompt.length} / 500</div>
              </div>
              
              <button type="submit" disabled={!prompt.trim() || loading} className="send-btn" title="Send Message">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;