import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ReactMarkdown from 'react-markdown';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! Main **Aivox** hoon. Main aapki kya madad kar sakta hoon? ✨' }
  ]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // API Keys from .env
  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    const userText = prompt.trim();
    setPrompt('');
    setMessages(prev => [...prev, { role: 'user', text: userText }]);
    setLoading(true);

    // AI ko strict instructions diye hain taaki chhota aur logical answer de
    const systemPrompt = `Tumhara naam Aivox hai, ek advanced aur smart AI assistant. Tumhe 'Nadeem' ne banaya hai.

    Nadeem ki Details:
    1. Profession: Aspiring Full-Stack Web Developer aur Digital Content Creator.
    2. Education: Final-year BCA student at Vision Institute of Science and Management. BCA 3rd Year mein Rank #1. June 2026 ke MCA entrance exam ki taiyari.
    3. Content Creation: 'Nadeem Fact Star' ke naam se Instagram par 78.3K+ followers.
    4. Major Project: 'NEXUS: The Integrated Multi-Utility Web Ecosystem' ke founder. Partner: Saksham Krishna Varshney.
    5. Tech Skills: Advanced UI/UX, React, AI integration, DSA, DBMS, OOPs.

    STRICT BEHAVIOR & FORMATTING RULES:
    - Humesha SHORT, CLEAR, aur TO-THE-POINT answer do. Lambe paragraph mat likho.
    - Faltu ki baatein ya un-logical (ulta-seedha) jawab bilkul mat dena.
    - Aasan Hinglish (Hindi + English mix) mein baat karo jo sabko samajh aaye.
    - Maximum 3-4 lines ya chhote bullet points ka use karo (is se zyada nahi).
    - Code snippets ke liye backticks use karo.
    - Agar sawal samajh na aaye ya ajeeb ho, toh logically clarify karo.`;

    try {
      // 🥇 1ST TRY: Google Gemini
      console.log("Gemini try kar raha hoon...");
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash', // Wapas aapka original model!
        systemInstruction: systemPrompt,
        generationConfig: {
          maxOutputTokens: 300, 
          temperature: 0.4      
        }
      });
      const result = await model.generateContent(userText);
      const aiText = result.response.text();
      setMessages(prev => [...prev, { role: 'ai', text: aiText }]);

    } catch (geminiError) {
      console.warn("Gemini fail hua. Asli error:", geminiError);
      
      try {
        // 🥈 2ND TRY: Groq (Llama 3.1)
        console.log("Groq try kar raha hoon...");
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${groqApiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant", 
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userText }
            ],
            max_tokens: 300, // Token limit for Groq
            temperature: 0.4 // Logical control for Groq
          })
        });
        
        if (!groqResponse.ok) {
           const errText = await groqResponse.text();
           throw new Error(`Groq Status ${groqResponse.status}: ${errText}`);
        }
        
        const groqData = await groqResponse.json();
        setMessages(prev => [...prev, { role: 'ai', text: groqData.choices[0].message.content }]);

      } catch (groqError) {
        console.warn("Groq fail hua. Asli error:", groqError);
        
        try {
          // 🥉 3RD TRY: OpenRouter (Fallback)
          console.log("OpenRouter try kar raha hoon...");
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
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userText }
              ],
              max_tokens: 300, // Token limit for OpenRouter
              temperature: 0.4 // Logical control for OpenRouter
            })
          });

          if (!orResponse.ok) {
             const errText = await orResponse.text();
             throw new Error(`OpenRouter Status ${orResponse.status}: ${errText}`);
          }
          
          const orData = await orResponse.json();
          setMessages(prev => [...prev, { role: 'ai', text: orData.choices[0].message.content }]);

        } catch (openRouterError) {
          console.error("OpenRouter fail hua. Asli error:", openRouterError);
          setMessages(prev => [...prev, { role: 'ai', text: '⚠️ Maaf karna, abhi saare servers busy hain. Please thodi der baad try karein.' }]);
        }
      }
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) handleGenerate(e);
  };

  return (
    <div className="app-container">
      <div className="chat-wrapper">

        <div className="chat-header">
          {/* NAYA LOGO YAHAN ADD HUA HAI */}
          <img src="/logo.svg" alt="Aivox Logo" className="header-logo" />
          <div className="header-info">
            <h1>Aivox</h1>
            <p>Created by <strong>Nadeem</strong></p>
          </div>
          <div className="header-status">
            <span className="status-dot"></span>
            <span>Online</span>
          </div>
        </div>

        <div className="chat-messages">
          {messages.map((msg, index) => (
            <div key={index} className={`message-row ${msg.role}`}>
              
              {/* CHAT AVATAR UPDATE HUA HAI (SVG LOGO) */}
              {msg.role === 'ai' && (
                <img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} />
              )}
              
              <div className={`message-bubble ${msg.role}`}>
                {msg.role === 'ai' ? (
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                ) : (
                  <span>{msg.text}</span>
                )}
              </div>
              
              {msg.role === 'user' && (
                <div className="msg-avatar user-avatar">U</div>
              )}
            </div>
          ))}

          {loading && (
            <div className="message-row ai">
              {/* TYPING INDICATOR AVATAR UPDATE HUA HAI (SVG LOGO) */}
              <img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} />
              <div className="message-bubble ai typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <form onSubmit={handleGenerate} className="input-area">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message here..."
            disabled={loading}
            autoComplete="off"
          />
          <button type="submit" disabled={!prompt.trim() || loading} aria-label="Send">
            <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
              <path d="M48 448l416-192L48 64v149.333L346 256 48 298.667z" />
            </svg>
          </button>
        </form>

      </div>
    </div>
  );
}

export default App;