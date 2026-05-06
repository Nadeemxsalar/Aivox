import { useState, useRef, useEffect } from 'react';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
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
  
  // 🔥 ADVANCED IMAGE UPLOAD & PLUS MENU STATES 🔥
  const [selectedImageBase64, setSelectedImageBase64] = useState(null); 
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null); 
  const [isCompressing, setIsCompressing] = useState(false); 
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const fileInputRef = useRef(null);
  const plusMenuRef = useRef(null); 

  const [showClearModal, setShowClearModal] = useState(false);
  
  const [activeEgo, setActiveEgo] = useState(localStorage.getItem('aivox_alter_ego') || 'smart');
  const [isRoasterMode, setIsRoasterMode] = useState(activeEgo === 'savage'); 
  const isLoveMode = activeEgo === 'lover_girl' || activeEgo === 'lover_boy';
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  const getCurrentTime = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const [messages, setMessages] = useState(() => {
    const initialEgo = localStorage.getItem('aivox_alter_ego') || 'smart';
    const isInitiallyLove = initialEgo === 'lover_girl' || initialEgo === 'lover_boy';
    const storageKey = isInitiallyLove ? 'aivox_love_chat_history' : 'aivox_chat_history';
    
    const savedChats = localStorage.getItem(storageKey);
    if (savedChats) return JSON.parse(savedChats);
    
    const defaultGreeting = isInitiallyLove 
      ? (initialEgo === 'lover_girl' ? 'Kaise ho babu? ❤️' : 'Kaisi ho meri jaan? ❤️')
      : 'Hello! Main **Aivox** hoon. Main aapki kya madad kar sakta hoon? ✨';
      
    return [{ id: Date.now(), role: 'ai', text: defaultGreeting, image: null, time: getCurrentTime(), isBookmarked: false }];
  });

  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
  const openRouterApiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const mistralApiKey = import.meta.env.VITE_MISTRAL_API_KEY; 

  const egoDetails = {
    smart: { name: "Normal Mode", shortName: "Aivox ", color: "#8c82f2", bg: "rgba(140, 130, 242, 0.15)", icon: "✨" },
    savage: { name: "Savage Roaster", shortName: "Roaster", color: "#ff4d4f", bg: "rgba(255, 77, 79, 0.15)", icon: "🔥" },
    corporate: { name: "Strict Boss", shortName: "Boss Mode", color: "#f5b942", bg: "rgba(245, 185, 66, 0.15)", icon: "👔" },
    genz: { name: "Gen-Z Mode", shortName: "Gen-Z Mode", color: "#00e5ff", bg: "rgba(0, 229, 255, 0.15)", icon: "💀" },
    lover_girl: { name: "Girlfriend", shortName: "Girlfriend ", color: "#ff4d85", bg: "rgba(255, 77, 133, 0.15)", icon: "🌸" },
    lover_boy: { name: "Boyfriend", shortName: "Boyfriend", color: "#ff4d85", bg: "rgba(255, 77, 133, 0.15)", icon: "🦋" }
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

  // 🔥 CLICK OUTSIDE LISTENER TO CLOSE MENU 🔥
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target)) {
        setShowPlusMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 🔥 HELPER TO SWITCH CHAT HISTORY PROPERLY 🔥
  const loadChatHistory = (newEgo) => {
    const checkLoveMode = newEgo === 'lover_girl' || newEgo === 'lover_boy';
    const storageKey = checkLoveMode ? 'aivox_love_chat_history' : 'aivox_chat_history';
    const savedChats = localStorage.getItem(storageKey);
    
    if (savedChats) {
      setMessages(JSON.parse(savedChats));
    } else {
      const defaultGreeting = checkLoveMode 
        ? (newEgo === 'lover_girl' ? 'Kaise ho babu? ❤️' : 'Kaisi ho meri jaan? ❤️') 
        : 'Hello! Main **Aivox** hoon. Main aapki kya madad kar sakta hoon? ✨';
      setMessages([{ id: Date.now(), role: 'ai', text: defaultGreeting, image: null, time: getCurrentTime(), isBookmarked: false }]);
    }
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const savedEgo = localStorage.getItem('aivox_alter_ego') || 'smart';
      setActiveEgo(savedEgo);
      setIsRoasterMode(savedEgo === 'savage');
      loadChatHistory(savedEgo);
    };

    window.addEventListener('storage', handleStorageChange);
    handleStorageChange(); 
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => { 
    const storageKey = isLoveMode ? 'aivox_love_chat_history' : 'aivox_chat_history';
    localStorage.setItem(storageKey, JSON.stringify(messages)); 
  }, [messages, isLoveMode]);

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

  // 🔥 POWERFUL COMPRESSION ENGINE 🔥
  const fileToGenerativePart = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 512; 
          const MAX_HEIGHT = 512;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          
          const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
          const base64Data = dataUrl.split(',')[1];
          
          resolve({
            inlineData: { data: base64Data, mimeType: 'image/jpeg' },
          });
        };
        img.onerror = reject;
        img.src = event.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setShowPlusMenu(false);
    setImagePreviewUrl(URL.createObjectURL(file));
    setIsCompressing(true); 

    try {
      const compressedPart = await fileToGenerativePart(file);
      setSelectedImageBase64(compressedPart); 
    } catch (error) {
      console.error("Compression Failed", error);
      showToast("Photo compress nahi ho paayi! Dobara try karein.");
      setImagePreviewUrl(null);
    } finally {
      setIsCompressing(false); 
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = () => {
    setSelectedImageBase64(null);
    setImagePreviewUrl(null);
    setIsCompressing(false);
  };

  const buildOpenAIVisionMessage = (text, imagePart) => {
    if (!imagePart) return { role: "user", content: text };
    return {
      role: "user",
      content: [
        { type: "text", text: text || "Describe this image in detail." },
        { type: "image_url", image_url: { url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` } }
      ]
    };
  };

  const handleGenerate = async (e, customPrompt = null, isRegenerate = false) => {
    if (e) e.preventDefault();
    const textToProcess = customPrompt || prompt.trim();
    
    if ((!textToProcess && !selectedImageBase64) || loading || isCompressing) return;

    const imagePart = selectedImageBase64; 
    let userBase64Image = null;

    if (imagePart) {
      userBase64Image = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    }

    setPrompt('');
    setSelectedImageBase64(null); 
    setImagePreviewUrl(null);
    setShowPlusMenu(false);

    if (inputRef.current) inputRef.current.style.height = 'auto';

    if (!isRegenerate) {
      setMessages(prev => [...prev, { 
        id: Date.now(), 
        role: 'user', 
        text: textToProcess, 
        image: userBase64Image, 
        time: getCurrentTime(), 
        isBookmarked: false 
      }]);
      setTimeout(() => scrollToBottom(), 50);
    }

    setLoading(true);

    const currentEgo = localStorage.getItem('aivox_alter_ego') || 'smart';
    const isActuallyRoasting = isRoasterMode || currentEgo === 'savage';
    const isCurrentlyLove = currentEgo === 'lover_girl' || currentEgo === 'lover_boy';
    
    const systemPrompt = getSystemPrompt(currentEgo, "Nadeem"); 
    
    let finalResponse = "";
    let finalModel = "";
    const startTime = Date.now(); 

    try {
      const smartHistory = getRelevantHistory(textToProcess, messages);
      const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
      const userMessage = buildOpenAIVisionMessage(textToProcess, imagePart);
      
      const githubApiKey = import.meta.env.VITE_GITHUB_TOKEN;
      const ghResponse = await fetch("https://models.inference.ai.azure.com/chat/completions", {
          method: "POST", headers: { "Authorization": `Bearer ${githubApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, userMessage], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
      });
      if (!ghResponse.ok) throw new Error("GitHub API failed");
      const ghData = await ghResponse.json();
      finalResponse = ghData.choices[0].message.content;
      finalModel = imagePart ? "GPT-4o-mini Vision (GitHub)" : "GPT-4o-mini (GitHub)";
      
    } catch (githubError) {
      console.log("GitHub failed, trying Next...", githubError.message);
      try {
        if (imagePart) throw new Error("Skipping Mistral for Image/Vision support");
        const smartHistory = getRelevantHistory(textToProcess, messages);
        const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
        
        const mistralResponse = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${mistralApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "mistral-small-latest", messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, { role: "user", content: textToProcess }], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
        });
        if (!mistralResponse.ok) throw new Error("Mistral API failed");
        const mistralData = await mistralResponse.json();
        finalResponse = mistralData.choices[0].message.content;
        finalModel = "Mistral-Small";

      } catch (mistralError) {
        console.log("Mistral failed, trying Groq...", mistralError.message);
        try {
          const smartHistory = getRelevantHistory(textToProcess, messages);
          const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
          const userMessage = buildOpenAIVisionMessage(textToProcess, imagePart);
          const groqModel = imagePart ? "llama-3.2-11b-vision-preview" : "llama-3.1-8b-instant";
          
          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: groqModel, messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, userMessage], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
          });
          if (!groqResponse.ok) throw new Error("Groq API Limit/Failed");
          const groqData = await groqResponse.json();
          finalResponse = groqData.choices[0].message.content;
          finalModel = imagePart ? "Llama-Vision (Groq)" : "Llama-3.1 (Groq)";

        } catch (groqError) {
          console.log("Groq failed, trying Gemini...", groqError.message);
          try {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ 
              model: 'gemini-1.5-flash', 
              systemInstruction: systemPrompt, 
              generationConfig: { maxOutputTokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 },
              safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
              ]
            });

            const smartHistory = getRelevantHistory(textToProcess, messages);
            const geminiHistory = smartHistory.map(msg => ({
              role: msg.role === 'ai' ? 'model' : 'user',
              parts: [{ text: msg.text }],
            }));

            const chat = model.startChat({ history: geminiHistory });
            const messageParts = imagePart ? [textToProcess || "Explain this image.", imagePart] : [textToProcess];
            
            const result = await chat.sendMessage(messageParts);
            finalResponse = result.response.text();
            finalModel = imagePart ? "Gemini Vision" : "Gemini";

          } catch (geminiError) {
            console.log("Gemini failed, trying OpenRouter as Last Resort...", geminiError.message);
            try {
                const smartHistory = getRelevantHistory(textToProcess, messages);
                const formattedHistory = smartHistory.map(msg => ({ role: msg.role === 'ai' ? 'assistant' : 'user', content: msg.text }));
                const userMessage = buildOpenAIVisionMessage(textToProcess, imagePart);
                const orModel = imagePart ? "meta-llama/llama-3.2-11b-vision-instruct:free" : "meta-llama/llama-3.1-8b-instruct:free";
                
                const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST", headers: { "Authorization": `Bearer ${openRouterApiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://aivoxpro.co.in", "X-Title": "Aivox Pro" },
                    body: JSON.stringify({ model: orModel, messages: [{ role: "system", content: systemPrompt }, ...formattedHistory, userMessage], max_tokens: 250, temperature: isActuallyRoasting ? 0.8 : 0.4 })
                });
                if (!orResponse.ok) throw new Error("OpenRouter API limits reached");
                const orData = await orResponse.json();
                
                if (orData.choices && orData.choices[0]) {
                  finalResponse = orData.choices[0].message.content;
                  finalModel = imagePart ? "Llama-Vision (OpenRouter)" : "Llama-3.1 (OpenRouter)";
                } else {
                  throw new Error("Invalid OpenRouter Response");
                }
                
            } catch (finalError) {
                console.error("ALL 5 APIs FAILED! 💀", finalError);
                finalResponse = "⚠️ Servers busy hain bro. Thodi der mein try karna.";
                finalModel = "Failed";
            }
          }
        }
      }
    } finally {
      const timeTakenMs = Date.now() - startTime; 
      setMessages(prev => [...prev, { id: Date.now(), role: 'ai', text: finalResponse, image: null, time: getCurrentTime(), isBookmarked: false }]);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
      
      if (finalResponse) {
        trackUserActivity({
          prompt: imagePart ? `[📸 Image Sent] ${textToProcess}` : textToProcess, 
          response: finalResponse, 
          model: finalModel, 
          timeTakenMs, 
          isRoasterMode: isActuallyRoasting,
          userName: currentDisplayName, 
          activeMode: currentEgo, 
          isLoveMsg: isCurrentlyLove,
          attachedImage: userBase64Image 
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

  const executeClearChat = () => {
    trackUserActivity({
      prompt: "🧹 [SYSTEM ACTION]", 
      response: `User ne chat clear kar di hai. Delete karne se pehle chat mein **${messages.length} messages** the.`, 
      model: "System-Log", 
      timeTakenMs: 0, 
      isRoasterMode: isRoasterMode,
      userName: currentDisplayName, 
      activeMode: activeEgo, 
      isLoveMsg: isLoveMode
    });

    const storageKey = isLoveMode ? 'aivox_love_chat_history' : 'aivox_chat_history';
    const defaultGreeting = isLoveMode 
      ? (activeEgo === 'lover_girl' ? 'Hmm... kya kar rahe ho ab? 🥺' : 'Bolo jaan, kya chal raha hai? ❤️') 
      : 'Chat cleared! ✨';
    const resetMsg = [{ id: Date.now(), role: 'ai', text: defaultGreeting, image: null, time: getCurrentTime(), isBookmarked: false }];
    setMessages(resetMsg); 
    localStorage.setItem(storageKey, JSON.stringify(resetMsg)); 
    showToast("Chat Cleared 🗑️");
    setShowClearModal(false); 
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
    loadChatHistory(newEgo);
    showToast(newEgo === 'savage' ? "Savage Mode Activated 🔥" : "Normal Mode Activated ✨");
  };

  // 🔥 DIRECT NORMAL MODE FUNCTION 🔥
  const activateNormalMode = () => {
    setActiveEgo('smart');
    setIsRoasterMode(false);
    localStorage.setItem('aivox_alter_ego', 'smart');
    loadChatHistory('smart');
    showToast("Normal Mode Activated ✨");
    setShowPlusMenu(false);
  };

  const filteredMessages = messages.filter(msg => msg.text.toLowerCase().includes(searchQuery.toLowerCase()));
  const themeClass = activeEgo === 'savage' ? 'roaster-active-theme' : (isLoveMode ? 'love-active-theme' : '');

  if (isAuthChecking) return <div className="app-container dark-mode" style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'#8c82f2'}}>Loading...</div>;

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'} ${themeClass}`}>
      {toastMsg && <div className="custom-toast">{toastMsg}</div>}

      {showClearModal && (
        <div className="custom-modal-overlay" onClick={() => setShowClearModal(false)} style={{ display: 'flex', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
          <div className="custom-modal-box" onClick={e => e.stopPropagation()} style={{ background: isDarkMode ? '#151426' : '#ffffff', padding: '24px', borderRadius: '16px', border: `1px solid ${isLoveMode ? 'rgba(255,77,133,0.3)' : 'rgba(140,130,242,0.3)'}`, width: '85%', maxWidth: '320px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '40px', marginBottom: '10px' }}>{isLoveMode ? '💔' : '🧹'}</div>
            <h3 style={{ margin: '0 0 10px 0', color: isLoveMode ? '#ff4d85' : '#8c82f2', fontSize: '20px' }}>Clear Chat?</h3>
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: isDarkMode ? '#a0a0b0' : '#555', lineHeight: '1.5' }}>Sahi mein saari chat udani hai? Ek baar delete hui toh wapas nahi aayegi.</p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button onClick={() => setShowClearModal(false)} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: isDarkMode ? '#2a2a40' : '#f0f0f0', color: isDarkMode ? '#fff' : '#333', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: '0.2s' }}>Cancel</button>
              <button onClick={executeClearChat} style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#ff4d4f', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', transition: '0.2s' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

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
          <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" style={{ color: isLoveMode ? '#ff4d85' : '#8c82f2', flexShrink: 0 }}>
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
          <button type="button" className="new-chat-btn" onClick={() => setShowClearModal(true)} style={isLoveMode ? {background: 'linear-gradient(90deg, #ff4d85, #ff758c)'} : {}}>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Clear Chat
          </button>

          <div className="features-section">
            <p className="features-title">God-Mode Capabilities</p>
            <div className="feature-item" onClick={() => window.location.href = '/features'}>
              <div className="feat-icon-box" style={isLoveMode ? {color: '#ff4d85', borderColor: 'rgba(255, 77, 133, 0.3)'} : {}}>
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
              </div>
              <div className="feat-text"><h4>Love Mode 💖</h4><p>Virtual Companion</p></div>
            </div>
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

      {isMobile && isSidebarOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsSidebarOpen(false)}
          style={{ display: 'block', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 90, backdropFilter: 'blur(4px)' }}
        ></div>
      )}

      <div className={`chat-main-area ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        <div className="chat-wrapper">
          
          <div className="chat-header">
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

            <div className="search-box">
               <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
               <input type="text" placeholder="Search chat..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <div className="header-info right-aligned">
              <div className="header-text">
                <h1 style={isLoveMode ? {textShadow: '0 4px 15px rgba(255, 77, 133, 0.4)'} : {}}>Aivox</h1>
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
                    
                    <div className={`message-bubble ${msg.role} ${msg.isBookmarked ? 'bookmarked-bubble' : ''} ${activeEgo === 'savage' && msg.role === 'ai' ? 'roast-bubble' : ''} ${isLoveMode && msg.role === 'ai' ? 'love-bubble' : ''}`}>
                      
                      {msg.image && (
                        <div style={{ marginBottom: msg.text ? '12px' : '0' }}>
                          <img 
                            src={msg.image} 
                            alt="Uploaded" 
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: '220px', 
                              width: 'auto',
                              objectFit: 'cover',
                              borderRadius: '8px', 
                              boxShadow: '0 4px 15px rgba(0,0,0,0.15)',
                              animation: 'scaleIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28) forwards',
                              display: 'block'
                            }} 
                          />
                        </div>
                      )}

                      {/* 🔥 PREMIUM CODE COPY FEATURE APPLIED HERE 🔥 */}
                      {msg.role === 'ai' ? (
                        <ReactMarkdown
                          components={{
                            pre({node, children, ...props}) {
                              // Deep extract text to ensure clean copying of code
                              const extractText = (child) => {
                                if (typeof child === 'string') return child;
                                if (Array.isArray(child)) return child.map(extractText).join('');
                                if (child && child.props && child.props.children) return extractText(child.props.children);
                                return '';
                              };
                              const codeString = extractText(children);
                              
                              return (
                                <div style={{ background: '#0b0a14', borderRadius: '12px', border: '1px solid #2a2a40', overflow: 'hidden', margin: '14px 0', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#151426', padding: '8px 14px', borderBottom: '1px solid #2a2a40' }}>
                                    <span style={{ fontSize: '11px', color: '#8a8d9e', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Terminal / Code</span>
                                    <button 
                                      onClick={() => { navigator.clipboard.writeText(codeString); showToast("Code Copied! 📋"); }}
                                      style={{ background: 'transparent', border: 'none', color: '#8c82f2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 'bold', padding: 0 }}
                                    >
                                      <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                      Copy
                                    </button>
                                  </div>
                                  <pre {...props} style={{ margin: 0, padding: '16px', background: 'transparent', overflowX: 'auto', fontSize: '13px', color: '#cdd6f4' }}>
                                    {children}
                                  </pre>
                                </div>
                              );
                            }
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      ) : (
                        <span style={{whiteSpace: 'pre-wrap'}}>{msg.text}</span>
                      )}
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
              <div className="message-row ai"><img src="/logo.svg" alt="AI" className="msg-avatar" style={{ background: 'transparent' }} /><div className={`message-bubble ai typing-indicator ${isLoveMode ? 'love-bubble' : ''}`}><span></span><span></span><span></span></div></div>
            )}
            <div ref={chatEndRef} />
          </div>

          {showScrollBtn && <button type="button" className="scroll-bottom-btn" onClick={scrollToBottom}><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>}

          <div className="input-container-wrapper">
            <form onSubmit={handleGenerate} className={`input-area ${isLoveMode ? 'love-input-area' : ''}`}>
              
              <div style={{ position: 'relative' }} ref={plusMenuRef}>
                <button 
                  type="button" 
                  onClick={() => setShowPlusMenu(!showPlusMenu)} 
                  className="mic-btn plus-btn" 
                  title="More Options"
                  style={{ transform: showPlusMenu ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease' }}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>

                {showPlusMenu && (
                  <div className="plus-dropdown-menu">
                    <div className="dropdown-item" onClick={() => { fileInputRef.current.click(); setShowPlusMenu(false); }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      Upload Photo
                    </div>
                    <div className="dropdown-item" onClick={() => { setShowPlusMenu(false); handleVoiceInput(); }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                      Voice Input
                    </div>
                    <div className="dropdown-divider"></div>
                    <div className="dropdown-item" onClick={activateNormalMode}>
                      <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                      Normal Mode
                    </div>
                  </div>
                )}
                
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  hidden 
                  accept="image/*" 
                  onChange={handleImageSelect} 
                />
              </div>
              
              <div className="textarea-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                
                {imagePreviewUrl && (
                  <div className="image-preview-container" style={{ padding: '12px 20px 0 20px' }}>
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      
                      <img 
                        src={imagePreviewUrl} 
                        alt="Preview" 
                        className="image-preview-thumbnail" 
                        style={{ 
                          height: '60px', 
                          width: 'auto',
                          borderRadius: '8px', 
                          border: '1px solid var(--border-color)', 
                          objectFit: 'cover',
                          opacity: isCompressing ? 0.4 : 1,
                          transition: 'opacity 0.3s'
                        }} 
                      />
                      
                      {isCompressing && (
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                           <svg className="spinner-icon" viewBox="0 0 50 50" style={{ width: '24px', height: '24px', animation: 'spin 1s linear infinite' }}>
                             <circle cx="25" cy="25" r="20" fill="none" stroke="var(--bubble-user)" strokeWidth="5" strokeLinecap="round" strokeDasharray="90 150" />
                           </svg>
                        </div>
                      )}

                      {!isCompressing && (
                        <button 
                          type="button" 
                          className="remove-image-btn" 
                          onClick={removeSelectedImage} 
                          style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--text-main)', color: 'var(--app-bg)', border: 'none', borderRadius: '50%', width: '22px', height: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', transition: '0.2s' }}
                        >
                          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <textarea 
                  ref={inputRef} 
                  value={prompt} 
                  onChange={handleInputResize} 
                  onFocus={onPromptStart} 
                  onKeyDown={(e) => { onPromptKey(); handleKeyDown(e); }} 
                  placeholder={egoDetails[activeEgo] ? `Message ${egoDetails[activeEgo].shortName}...` : "Message Aivox..."}
                  disabled={loading || isCompressing} 
                  rows={1} 
                  className="auto-resize-textarea" 
                />
                <div className="char-counter">{prompt.length} / 500</div>
              </div>
              
              <button 
                type="submit" 
                disabled={(!prompt.trim() && !selectedImageBase64) || loading || isCompressing} 
                className="send-btn" 
                title="Send Message" 
                style={isLoveMode ? {background: 'linear-gradient(135deg, #ff4d85, #ff758c)'} : {}}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
}

export default App;