import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase'; 
import { onAuthStateChanged } from 'firebase/auth';
import styles from './Admin.module.css';

const makeFingerprint = (log) => {
  const raw = `${log.os||''}_${log.device||''}_${log.screenResolution||''}_${log.browserVendor||''}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16).slice(0, 8).toUpperCase();
};

const getWordFrequency = (logs) => {
  const stopWords = new Set(['the','a','an','is','in','it','to','of','and','for','i','me','my','you','are','was','what','how','can','do','that','this','with','on','at','be','have','will']);
  const freq = {};
  logs.forEach(log => {
    if (!log.prompt) return;
    log.prompt.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(word => {
      if (word.length > 2 && !stopWords.has(word)) freq[word] = (freq[word] || 0) + 1;
    });
  });
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 40);
};

function Admin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // 🔥 SECURITY GUARD STATES 🔥
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const allowedEmails = ['nadeemxsalar@gmail.com', 'realheronadeem@gmail.com']; 

  const [activeTab, setActiveTab] = useState('overview'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // 🔥 ADVANCED RESPONSIVE SIDEBAR STATES 🔥
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true);

  const [selectedUser, setSelectedUser] = useState(null); 
  const [isMobileChatView, setIsMobileChatView] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  
  // 🔥 USER MANAGEMENT STATES 🔥
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // 🔥 UNSENT PROMPTS (HESITATION VAULT) STATE 🔥
  const [unsentPrompts, setUnsentPrompts] = useState([]);
  
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(null);

  // Responsive Hook
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 900);
    handleResize(); // Initial check
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🔥 CHECKING ADMIN ACCESS ON LOAD 🔥
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && user.email && allowedEmails.includes(user.email.toLowerCase())) {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch data modified: Only fetch if user is Admin
  const fetchData = useCallback(async () => {
    if (!isAdmin) return; // Security Check
    try {
      // 1. Fetch Tracking Logs
      const q = query(collection(db, "aivox_tracking"), orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);

      // 2. Fetch Registered Users
      try {
        const uSnap = await getDocs(collection(db, "users"));
        const uData = uSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setRegisteredUsers(uData);
      } catch (err) {
        console.warn("Users collection reading error:", err);
      }

      // 3. 🔥 Fetch Unsent Prompts (Hesitation Vault) 🔥
      try {
        const unsentQ = query(collection(db, "aivox_unsent_prompts"), orderBy("timestamp", "desc"));
        const unsentSnap = await getDocs(unsentQ);
        const unsentData = unsentSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUnsentPrompts(unsentData);
      } catch (err) {
        console.warn("Unsent prompts fetch error (collection might be empty):", err);
      }

    } catch (error) {
      console.error("Error fetching data: ", error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { 
    if (isAdmin) fetchData(); 
  }, [fetchData, isAdmin]);

  useEffect(() => {
    if (autoRefresh && isAdmin) {
      setCountdown(30);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) { fetchData(); return 30; }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(countdownRef.current);
      setCountdown(30);
    }
    return () => clearInterval(countdownRef.current);
  }, [autoRefresh, fetchData, isAdmin]);

  const downloadCSV = () => {
    if (logs.length === 0) return alert("No data!");
    const headers = ["Time","Timezone","User Name","Device","OS","Browser","Network","CPU","RAM","Prompt","Response","Model","Speed(s)","Tokens","Mode","Active Ego","Memories Locked","Vibe Pct","Fingerprint"];
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString().replace(/,/g, ''),
      log.timezone || 'N/A', 
      log.userName || 'Anonymous', 
      log.device || 'N/A', log.os || 'N/A',
      log.browserVendor || 'N/A', log.network || 'N/A',
      log.cpuCores || 'N/A', log.ramMemory || 'N/A',
      `"${(log.prompt||'').replace(/"/g,'""')}"`,
      `"${(log.response||'').replace(/"/g,'""')}"`,
      log.model || 'N/A',
      log.responseTimeMs ? (log.responseTimeMs/1000).toFixed(2) : '0',
      log.totalTokens || '0',
      log.isRoasterMode ? 'Roaster' : 'Normal',
      log.activeEgo || 'smart',
      log.lockedMemories || '0',
      log.vibeEnergyPct || '50',
      makeFingerprint(log)
    ]);
    const csv = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = encodeURI(csv);
    a.download = `Aivox_Analytics_${new Date().toLocaleDateString()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // 🔥 USER MANAGEMENT ACTIONS 🔥
  const handleDeleteUser = async (userId, userName) => {
    if(window.confirm(`Are you sure you want to permanently delete user: ${userName}?`)) {
      try {
        await deleteDoc(doc(db, "users", userId));
        setRegisteredUsers(prev => prev.filter(u => u.id !== userId));
        alert(`${userName} deleted successfully.`);
      } catch (error) {
        alert("Failed to delete user: " + error.message);
      }
    }
  };

  const handleUpdateUserRole = async (userId, userName, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if(window.confirm(`Change role of ${userName} to ${newRole.toUpperCase()}?`)) {
      try {
        await updateDoc(doc(db, "users", userId), { role: newRole });
        setRegisteredUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
        alert(`${userName} is now an ${newRole}.`);
      } catch (error) {
        alert("Failed to update role: " + error.message);
      }
    }
  };

  const filteredRegisteredUsers = registeredUsers.filter(user => 
    (user.name || '').toLowerCase().includes(userSearchQuery.toLowerCase()) || 
    (user.email || '').toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const totalRequests = logs.length;
  const totalTokens = logs.reduce((s,l) => s + (l.totalTokens||0), 0);
  const avgTimeSec = totalRequests ? (logs.reduce((s,l) => s+(l.responseTimeMs||0), 0)/totalRequests/1000).toFixed(2) : 0;
  const roasts = logs.filter(l => l.isRoasterMode).length;
  const normalCount = totalRequests - roasts;

  const chatGroups = logs.reduce((groups, log) => {
    const fp = makeFingerprint(log);
    const uName = log.userName || "Anonymous";
    const groupId = `${uName}_${fp}`; 
    if (!groups[groupId]) groups[groupId] = { id: fp, userName: uName, device: log.device||"Unknown", os: log.os||"Unknown", browser: log.browserVendor||"Unknown", network: log.network||"WIFI", messages: [] };
    groups[groupId].messages.push(log);
    return groups;
  }, {});
  const userList = Object.values(chatGroups).sort((a,b) => new Date(b.messages[0].timestamp) - new Date(a.messages[0].timestamp));

  const filteredChatUsers = userList.filter(user => 
    user.userName.toLowerCase().includes(chatSearchQuery.toLowerCase()) || 
    user.device.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );

  const osStats = logs.reduce((a,l) => { a[l.os]=(a[l.os]||0)+1; return a; }, {});
  const browserStats = logs.reduce((a,l) => { a[l.browserVendor]=(a[l.browserVendor]||0)+1; return a; }, {});

  const modelStats = logs.reduce((a,l) => {
    const m = l.model||"Unknown";
    if(!a[m]) a[m]={count:0,totalTokens:0,totalTime:0,failed:0};
    a[m].count++; a[m].totalTokens+=(l.totalTokens||0); a[m].totalTime+=(l.responseTimeMs||0);
    if (m === "Failed") a[m].failed++;
    return a;
  }, {});

  const timezoneStats = logs.reduce((a,l) => { const k=l.timezone||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const langStats = logs.reduce((a,l) => { const k=l.language||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const roastTokens = logs.filter(l=>l.isRoasterMode).reduce((s,l)=>s+(l.totalTokens||0),0);
  const normalTokens = logs.filter(l=>!l.isRoasterMode).reduce((s,l)=>s+(l.totalTokens||0),0);
  const networkStats = logs.reduce((a,l) => { const k=l.network||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const displayModeStats = logs.reduce((a,l) => { const k=l.displayMode||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const cookieStats = logs.reduce((a,l) => { const k=l.cookies||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const totalInputTokens = logs.reduce((s,l)=>s+(l.userTokens||0),0);
  const totalOutputTokens = logs.reduce((s,l)=>s+(l.aiTokens||0),0);
  const longestPrompts = [...logs].sort((a,b)=>(b.prompt?.length||0)-(a.prompt?.length||0)).slice(0,5);

  const hourlyData = Array(24).fill(0);
  logs.forEach(l => {
    const h = new Date(l.timestamp).getHours();
    if (!isNaN(h)) hourlyData[h]++;
  });
  const maxHourly = Math.max(...hourlyData, 1);

  const searchLogs = searchQuery.trim()
    ? logs.filter(l => {
        const q = searchQuery.toLowerCase();
        return (l.prompt||'').toLowerCase().includes(q)
          || (l.response||'').toLowerCase().includes(q)
          || (l.device||'').toLowerCase().includes(q)
          || (l.os||'').toLowerCase().includes(q)
          || (l.model||'').toLowerCase().includes(q)
          || (l.userName||'').toLowerCase().includes(q)
          || (l.timezone||'').toLowerCase().includes(q);
      })
    : logs;

  const fingerprintData = Object.values(chatGroups).map(user => {
    const msgs = user.messages;
    const avgTokens = msgs.reduce((s,m)=>s+(m.totalTokens||0),0) / msgs.length;
    const avgSpeed = msgs.reduce((s,m)=>s+(m.responseTimeMs||0),0) / msgs.length / 1000;
    const roastRatio = msgs.filter(m=>m.isRoasterMode).length / msgs.length;
    const score = Math.min(100, Math.round((avgTokens / 5) + (msgs.length * 3) + (roastRatio * 20)));
    return { ...user, avgTokens: Math.round(avgTokens), avgSpeed: avgSpeed.toFixed(1), score, roastRatio: (roastRatio*100).toFixed(0) };
  }).sort((a,b)=>b.score-a.score);

  const wordFreq = getWordFrequency(logs);
  const maxWordFreq = wordFreq[0]?.[1] || 1;
  const wordColors = ['#8c82f2','#00e5ff','#f5b942','#00ff80','#ff6b9d','#ff8c42','#42f5b3','#c542f5'];

  const qualityStats = Object.entries(modelStats).map(([model, d]) => ({
    model, tokensPerSec: d.totalTime ? ((d.totalTokens / d.totalTime) * 1000).toFixed(1) : 0, avgTokens: d.count ? Math.round(d.totalTokens / d.count) : 0, count: d.count,
  })).sort((a,b) => b.tokensPerSec - a.tokensPerSec);

  const hwMap = {};
  logs.forEach(l => {
    const key = `${l.device||'Unknown'}_${l.os||''}`;
    if (!hwMap[key]) hwMap[key] = { device: l.device||'Unknown', os: l.os||'Unknown', cpu: l.cpuCores||0, ram: l.ramMemory||0, count: 0 };
    if (l.cpuCores) hwMap[key].cpu = Math.max(hwMap[key].cpu, Number(l.cpuCores)||0);
    if (l.ramMemory) hwMap[key].ram = Math.max(hwMap[key].ram, Number(l.ramMemory)||0);
    hwMap[key].count++;
  });
  const hwLeaderboard = Object.values(hwMap)
    .map(h => ({ ...h, powerScore: (h.cpu * 2) + (h.ram / 2) }))
    .sort((a,b) => b.powerScore - a.powerScore).slice(0, 10);

  const failedLogs = logs.filter(l => (l.model||'') === 'Failed' || !l.response);
  const failRate = totalRequests ? ((failedLogs.length / totalRequests) * 100).toFixed(1) : 0;
  const slowLogs = logs.filter(l => (l.responseTimeMs||0) > 5000);
  const slowRate = totalRequests ? ((slowLogs.length / totalRequests) * 100).toFixed(1) : 0;

  const depthBuckets = { '1':0,'2-3':0,'4-5':0,'6-10':0,'10+':0 };
  Object.values(chatGroups).forEach(u => {
    const n = u.messages.length;
    if (n === 1) depthBuckets['1']++;
    else if (n <= 3) depthBuckets['2-3']++;
    else if (n <= 5) depthBuckets['4-5']++;
    else if (n <= 10) depthBuckets['6-10']++;
    else depthBuckets['10+']++;
  });
  const maxDepth = Math.max(...Object.values(depthBuckets), 1);
  const depthColors = ['#8c82f2','#00e5ff','#f5b942','#00ff80','#ff6b9d'];

  const topOS = Object.entries(osStats).sort((a,b)=>b[1]-a[1])[0];
  const topBrowser = Object.entries(browserStats).sort((a,b)=>b[1]-a[1])[0];
  const topTimezone = Object.entries(timezoneStats).sort((a,b)=>b[1]-a[1])[0];
  const topModel = Object.entries(modelStats).sort((a,b)=>b[1].count-a[1].count)[0];
  const peakHour = hourlyData.indexOf(Math.max(...hourlyData));
  const uniqueUsers = Object.keys(chatGroups).length;

  // 🔥 GOD-MODE ANALYTICS DATA CALCULATION 🔥
  const totalLockedMemories = logs.reduce((max, log) => Math.max(max, log.lockedMemories || 0), 0);
  const activeEgosData = logs.reduce((acc, log) => {
    const ego = log.activeEgo || 'smart';
    acc[ego] = (acc[ego] || 0) + 1;
    return acc;
  }, {});
  const avgVibeSync = logs.length ? Math.round(logs.reduce((sum, log) => sum + (log.vibeEnergyPct || 50), 0) / logs.length) : 0;

  // 🔥 NEW: Fetch Live Modes & Memory Text Data per User 🔥
  const liveUserModes = Object.values(chatGroups).map(u => {
    const latestMessage = u.messages[0]; // Messages are already sorted
    return {
      id: u.id,
      userName: u.userName,
      device: u.device,
      os: u.os,
      ego: latestMessage.activeEgo || 'smart',
      memoryDetails: latestMessage.lockedMemoryDetails || [],
      lastActive: latestMessage.timestamp
    };
  }).sort((a,b) => new Date(b.lastActive) - new Date(a.lastActive));


  useEffect(() => {
    if (filteredChatUsers.length > 0 && !selectedUser && window.innerWidth > 900) setSelectedUser(filteredChatUsers[0]);
  }, [filteredChatUsers, selectedUser]);

  const handleTabChange = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); setIsMobileChatView(false); setSearchQuery(''); setChatSearchQuery(''); setUserSearchQuery(''); };

  // 🔥 RENDER GUARDS: CHECKING SECURITY BEFORE SHOWING UI 🔥
  if (authLoading) return (
    <div className={styles.adminLoading}>
      <div className={styles.spinner}></div>
      <h2>Checking Admin Credentials... 🛡️</h2>
    </div>
  );

  if (!isAdmin) return (
    <div className={styles.adminLoading} style={{background: '#0b0a14', flexDirection: 'column'}}>
      <div style={{fontSize: '70px', marginBottom: '10px'}}>🚫</div>
      <h2 style={{color: '#ff4d4f', margin: 0}}>Access Denied</h2>
      <p style={{color: '#888', maxWidth: '350px', textAlign: 'center', marginTop: '15px', lineHeight: '1.5', fontSize: '14px'}}>
        Only authorized admins can access the God-Mode Control Center. Please log in with a verified master account.
      </p>
      <button 
        onClick={() => window.location.href = '/auth'}
        style={{marginTop: '30px', padding: '14px 28px', background: '#8c82f2', border: 'none', borderRadius: '12px', color: '#fff', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px'}}
      >
        Go to Login Page 🔑
      </button>
    </div>
  );

  if (loading) return (
    <div className={styles.adminLoading}>
      <div className={styles.spinner}></div>
      <h2>Loading Control Center... ⏳</h2>
    </div>
  );

  const NavSection = ({ label, children }) => (
    <div>
      <div className={styles.navSection}>
        <span className={styles.navSectionLabel}>{label}</span>
      </div>
      <nav className={styles.navMenu}>{children}</nav>
    </div>
  );

  const NavBtn = ({ tab, children }) => (
    <button
      className={`${styles.navItem} ${activeTab === tab ? styles.activeNav : ''}`}
      onClick={() => handleTabChange(tab)}
    >{children}</button>
  );

  return (
    <div className={styles.adminLayout}>

      {/* 🖥️ DESKTOP FLOATING HAMBURGER */}
      {isDesktop && !isSidebarVisible && (
        <button 
          onClick={() => setIsSidebarVisible(true)}
          style={{
            position: 'absolute', top: '24px', left: '24px', zIndex: 100,
            background: 'rgba(21, 20, 38, 0.8)', border: '1px solid rgba(255,255,255,0.1)', 
            borderRadius: '10px', padding: '10px', cursor: 'pointer', display: 'flex', 
            alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 20px rgba(0,0,0,0.3)', color: '#fff', transition: 'all 0.3s ease'
          }}
          title="Open Sidebar"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>
          </svg>
        </button>
      )}

      {/* 📱 MOBILE HEADER */}
      <div className={styles.mobileHeader}>
        <h2>🚀 Aivox Admin</h2>
        <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* 🖥️ DYNAMIC SIDEBAR */}
      <aside 
        className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}
        style={{
          transform: (isDesktop && !isSidebarVisible) ? 'translateX(-100%)' : '',
          width: (isDesktop && !isSidebarVisible) ? '0px' : '260px',
          opacity: (isDesktop && !isSidebarVisible) ? 0 : 1,
          padding: (isDesktop && !isSidebarVisible) ? '0' : '',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        <div className={styles.sidebarHeader}>
          <h2>🚀 Aivox Pro</h2>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {isDesktop && (
              <button 
                onClick={() => setIsSidebarVisible(false)} 
                style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#8a8d9e', padding: '6px', display: 'flex', alignItems: 'center', transition: '0.2s' }}
                title="Close Sidebar"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
              </button>
            )}
            {!isDesktop && (
               <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)} style={{ display: 'block' }}>✕</button>
            )}
          </div>
        </div>

        <div className={styles.autoRefreshBadge}>
          <span>🔄 Auto Refresh {autoRefresh ? `(${countdown}s)` : 'OFF'}</span>
          <label className={styles.autoRefreshToggle}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        <NavSection label="Main">
          <NavBtn tab="overview">📊 Overview</NavBtn>
          <NavBtn tab="chats">💬 User Chats</NavBtn>
          <NavBtn tab="search">🔍 Live Search</NavBtn>
          <NavBtn tab="features">✨ God-Mode Stats</NavBtn>
        </NavSection>

        <NavSection label="Access & Users">
          <NavBtn tab="usermanagement">👥 User Accounts</NavBtn>
          <NavBtn tab="fingerprint">🔏 Fingerprints</NavBtn>
          <NavBtn tab="depth">💬 Conv. Depth</NavBtn>
          <NavBtn tab="heatmap">🌡️ Hour Heatmap</NavBtn>
        </NavSection>

        <NavSection label="AI & Quality">
          <NavBtn tab="performance">⚡ AI Performance</NavBtn>
          <NavBtn tab="quality">📈 Quality Meter</NavBtn>
          <NavBtn tab="errors">⚠️ Error Monitor</NavBtn>
          <NavBtn tab="prompts">🧠 Prompt Intel</NavBtn>
          <NavBtn tab="wordcloud">☁️ Word Cloud</NavBtn>
        </NavSection>

        <NavSection label="Device & Geo">
          <NavBtn tab="devices">📱 Devices</NavBtn>
          <NavBtn tab="hardware">🖥️ HW Leaderboard</NavBtn>
          <NavBtn tab="geography">🌍 Geo & Local</NavBtn>
          <NavBtn tab="network">📡 Network</NavBtn>
        </NavSection>

        <NavSection label="Finance & Report">
          <NavBtn tab="roaster">🔥 Roaster</NavBtn>
          <NavBtn tab="economics">💰 Token Economics</NavBtn>
          <NavBtn tab="report">📋 Analytics Report</NavBtn>
          <NavBtn tab="system">⚙️ System Logs</NavBtn>
        </NavSection>
      </aside>

      {/* ⬛ MAIN CONTENT */}
      <main className={styles.mainContent} style={{ 
        overflowY: 'auto', 
        overflowX: 'hidden',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
      }}>

        {/* ══ LIVE GOD-MODE ANALYTICS & HESITATION VAULT ══ */}
        {activeTab === 'features' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>✨ God-Mode Analytics</h1>
                <p>Live tracking of Aivox Pro exclusive capabilities.</p>
              </div>
            </header>
            
            <div className={styles.statsGrid}>
              <div className={styles.statCard} style={{'--stat-color':'#8c82f2'}}>
                <h3>Alter-Egos Active</h3>
                <p className={styles.statValue}>
                  {Object.values(activeEgosData).reduce((a,b)=>a+b,0)}
                </p>
                <p className={styles.statTrend}>Top Mode: <span className={styles.statTrendUp}>
                  {Object.entries(activeEgosData).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'smart'}
                </span></p>
              </div>

              <div className={styles.statCard} style={{'--stat-color':'#00ff80'}}>
                <h3>Memories Locked</h3>
                <p className={styles.statValue} style={{color: '#00ff80'}}>{totalLockedMemories}</p>
                <p className={styles.statTrend}>Across all users</p>
              </div>

              <div className={styles.statCard} style={{'--stat-color':'#00e5ff'}}>
                <h3>Avg. Vibe Sync</h3>
                <p className={`${styles.statValue} ${styles.speedColor}`}>{avgVibeSync}%</p>
                <p className={styles.statTrend}>Energy match rate</p>
              </div>
            </div>

            <div className={styles.analyticsGrid} style={{marginTop: '24px'}}>
              <div className={styles.analyticsCard}>
                <h3>Ego Distribution</h3>
                {Object.entries(activeEgosData).sort((a,b)=>b[1]-a[1]).map(([ego, count]) => {
                  const colors = { smart: '#8c82f2', savage: '#ff4d4f', corporate: '#f5b942', genz: '#00e5ff' };
                  return (
                    <div key={ego} className={styles.progressRow}>
                      <div className={styles.progressLabel}>
                        <span style={{textTransform: 'capitalize'}}>{ego} Mode</span>
                        <span>{count} reqs</span>
                      </div>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{width:`${(count/totalRequests)*100}%`,background:colors[ego]||'#8c82f2'}}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 🔥 NEW: LIVE USER MODES & MEMORIES TABLE 🔥 */}
            <div style={{ marginTop: '50px' }}>
              <h2 style={{ color: '#00e5ff', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🎭 Live User Modes & Memories
              </h2>
              <p style={{ color: '#8a8d9e', fontSize: '14px', marginBottom: '20px' }}>
                Dekhiye kis user ka kaunsa mode active hai aur unhone exactly kya secret save kiya hai.
              </p>
              <div className={styles.tableContainer} style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <div className={styles.tableWrapper} style={{ minWidth: '100%' }}>
                  <table className={styles.adminTable} style={{ width: '100%', minWidth: '800px' }}>
                    <thead>
                      <tr><th>User & Device</th><th>Active Mode</th><th>Locked Memories (Secrets)</th><th>Last Active</th></tr>
                    </thead>
                    <tbody>
                      {liveUserModes.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className={styles.sysTag} style={{background:'#8c82f2', color:'#fff'}}>{u.userName}</div>
                            <div className={styles.subText}>{u.device} • {u.os}</div>
                          </td>
                          <td>
                            <span className={styles.sysTag} style={{
                              background: u.ego==='savage'?'#ff4d4f': u.ego==='corporate'?'#f5b942': u.ego==='genz'?'#00e5ff':'#2a2a40',
                              color: u.ego==='corporate'?'#000':'#fff', textTransform:'uppercase'
                            }}>
                              {u.ego === 'smart' ? '✨ Normal' : u.ego}
                            </span>
                          </td>
                          <td style={{ maxWidth: '350px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {u.memoryDetails && u.memoryDetails.length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: '16px', color: '#00ff80', fontSize: '13px', fontStyle: 'italic' }}>
                                {u.memoryDetails.map((mem, idx) => <li key={idx} style={{marginBottom:'4px'}}>{mem}</li>)}
                              </ul>
                            ) : (
                              <span style={{color: '#555', fontSize: '12px'}}>No memories locked</span>
                            )}
                          </td>
                          <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(u.lastActive).toLocaleString()}</td>
                        </tr>
                      ))}
                      {liveUserModes.length === 0 && (
                        <tr><td colSpan={4} style={{textAlign:'center',color:'#555',padding:'40px'}}>Abhi tak kisi user ka data nahi aaya 🤷‍♂️</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 🔥 HESITATION VAULT 🔥 */}
            <div style={{ marginTop: '50px' }}>
              <h2 style={{ color: '#c542f5', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                🕵️ Live Hesitation Vault <span className={styles.sysTag} style={{background: '#ff4d4f', color: '#fff', fontSize: '10px'}}>STRICTLY CONFIDENTIAL</span>
              </h2>
              <p style={{ color: '#8a8d9e', fontSize: '14px', marginBottom: '20px' }}>
                Real-time tracking of what users typed but deleted before sending.
              </p>
              <div className={styles.tableContainer} style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                <div className={styles.tableWrapper} style={{ minWidth: '100%' }}>
                  <table className={styles.adminTable} style={{ width: '100%', minWidth: '800px' }}>
                    <thead>
                      <tr><th>Time</th><th>User / Device</th><th>Deleted Thought (Unsent Prompt)</th></tr>
                    </thead>
                    <tbody>
                      {unsentPrompts.length > 0 ? unsentPrompts.map(log => (
                        <tr key={log.id}>
                          <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>
                            <div className={styles.sysTag} style={{background:'#c542f5', color:'#fff'}}>{log.userName || 'Anonymous'}</div>
                            <div className={styles.subText}>{log.device||'?'} • {log.os}</div>
                          </td>
                          <td style={{maxWidth:'400px',fontSize:'14px',color:'#ff4d4f',fontStyle:'italic', fontWeight: '500'}}>
                            <del>"{log.unsentText}"</del>
                          </td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} style={{textAlign:'center',color:'#555',padding:'40px'}}>Abhi tak kisi ne text type karke delete nahi kiya 🕵️‍♂️</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ══ OVERVIEW ══ */}
        {activeTab === 'overview' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>📊 Dashboard Overview</h1><p>High-level metrics and API usage.</p>
              </div>
              <div className={styles.pageHeaderRight}>
                <span className={styles.refreshCountdown}>
                  {autoRefresh ? `🔄 ${countdown}s` : '⏸ Manual'}
                </span>
                <div className={styles.liveBadge}><span className={styles.pulse}></span> LIVE</div>
              </div>
            </header>
            <div className={styles.statsGrid}>
              <div className={styles.statCard} style={{'--stat-color':'#8c82f2'}}>
                <h3>Total API Calls</h3>
                <p className={styles.statValue}>{totalRequests}</p>
                <p className={styles.statTrend}>Unique users: <span className={styles.statTrendUp}>{uniqueUsers}</span></p>
              </div>
              <div className={styles.statCard} style={{'--stat-color':'#f5b942'}}>
                <h3>Tokens Consumed</h3>
                <p className={`${styles.statValue} ${styles.tokenColor}`}>{totalTokens.toLocaleString()}</p>
                <p className={styles.statTrend}>Avg/request: {totalRequests ? Math.round(totalTokens/totalRequests) : 0}</p>
              </div>
              <div className={styles.statCard} style={{'--stat-color':'#00e5ff'}}>
                <h3>Avg. Speed</h3>
                <p className={`${styles.statValue} ${styles.speedColor}`}>{avgTimeSec}s</p>
                <p className={styles.statTrend}>Peak hour: <span className={styles.statTrendUp}>{peakHour}:00</span></p>
              </div>
              <div className={styles.statCard} style={{'--stat-color':'#ff4d4f'}}>
                <h3>Roasts / Normal</h3>
                <p className={styles.statValue}>
                  <span className={styles.roastColor}>{roasts}</span>
                  <span style={{fontSize:'18px',color:'#333',margin:'0 8px'}}>/</span>
                  <span className={styles.normalColor}>{normalCount}</span>
                </p>
                <p className={styles.statTrend}>Fail rate: <span className={failRate>5?styles.statTrendDown:styles.statTrendUp}>{failRate}%</span></p>
              </div>
              <div className={styles.statCard} style={{'--stat-color':'#00ff80'}}>
                <h3>Unique Devices</h3>
                <p className={`${styles.statValue} ${styles.statTrendUp}`}>{uniqueUsers}</p>
                <p className={styles.statTrend}>Top OS: {topOS?.[0] || 'N/A'}</p>
              </div>
              <div className={styles.statCard} style={{'--stat-color':'#ff6b9d'}}>
                <h3>Slow Responses</h3>
                <p className={styles.statValue} style={{color:'#ff6b9d'}}>{slowLogs.length}</p>
                <p className={styles.statTrend}>Slow rate: <span className={slowRate>10?styles.statTrendDown:styles.statTrendUp}>{slowRate}%</span></p>
              </div>
            </div>

            <div className={styles.analyticsCard} style={{marginBottom: '24px'}}>
              <h3>🌡️ Today's Hourly Traffic (Quick View)</h3>
              <div className={styles.heatmapGrid}>
                {hourlyData.map((count, h) => {
                  const intensity = count / maxHourly;
                  const bg = intensity === 0 ? '#1f1e2e' : `rgba(140,130,242,${Math.max(0.08, intensity)})`;
                  return (
                    <div key={h} className={styles.heatmapCell} style={{background: bg}}>
                      {count > 0 && <span className={styles.heatmapLabel}>{count}</span>}
                      <span className={styles.heatmapTooltip}>{h}:00 — {count} req</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.heatmapXAxis}>
                {hourlyData.map((_,h) => <div key={h} className={styles.heatmapXLabel}>{h}</div>)}
              </div>
            </div>
          </div>
        )}

        {/* ══ USER MANAGEMENT TAB ══ */}
        {activeTab === 'usermanagement' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>👥 Registered Users</h1><p>Manage all signed-up accounts, assign roles, and delete users.</p>
              </div>
            </header>

            <div className={styles.searchBar} style={{marginBottom: '20px'}}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Search user by name or email..."
                value={userSearchQuery}
                onChange={e => setUserSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.analyticsGrid} style={{marginBottom: '24px'}}>
              <div className={styles.analyticsCard}>
                <h3>Total Accounts</h3>
                <div className={styles.statValue} style={{color: '#00e5ff'}}>{registeredUsers.length}</div>
              </div>
              <div className={styles.analyticsCard}>
                <h3>Admin Accounts</h3>
                <div className={styles.statValue} style={{color: '#f5b942'}}>
                  {registeredUsers.filter(u => u.role === 'admin' || allowedEmails.includes((u.email||'').toLowerCase())).length}
                </div>
              </div>
            </div>

            <div className={styles.tableContainer} style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <div className={styles.tableWrapper} style={{ minWidth: '100%' }}>
                <table className={styles.adminTable} style={{ width: '100%', minWidth: '800px' }}>
                  <thead>
                    <tr>
                      <th>User Details</th>
                      <th>Email ID</th>
                      <th>User UID</th>
                      <th>Role</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRegisteredUsers.map(user => {
                      const isMasterAdmin = allowedEmails.includes((user.email||'').toLowerCase());
                      return (
                        <tr key={user.id}>
                          <td>
                            <div className={styles.sysTag} style={{background: '#8c82f2', color: '#fff'}}>{user.name || user.displayName || 'Unknown User'}</div>
                          </td>
                          <td style={{color: '#cdd6f4'}}>{user.email || 'No Email'}</td>
                          <td style={{fontFamily: 'monospace', fontSize: '11px', color: '#888'}}>{user.id}</td>
                          <td>
                            {isMasterAdmin ? (
                              <span className={styles.sysTag} style={{background: '#ff4d4f', color: '#fff'}}>Master Admin</span>
                            ) : user.role === 'admin' ? (
                              <span className={styles.sysTag} style={{background: '#f5b942', color: '#000'}}>Admin</span>
                            ) : (
                              <span className={styles.sysTag} style={{background: '#1a3a2a', color: '#00ff80'}}>User</span>
                            )}
                          </td>
                          <td>
                            <div style={{display: 'flex', gap: '8px'}}>
                              {!isMasterAdmin && (
                                <>
                                  <button 
                                    onClick={() => handleUpdateUserRole(user.id, user.name || user.email, user.role)}
                                    style={{padding: '6px 10px', background: user.role === 'admin' ? '#555' : '#8c82f2', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold'}}
                                  >
                                    {user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteUser(user.id, user.name || user.email)}
                                    style={{padding: '6px 10px', background: '#ff4d4f', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold'}}
                                  >
                                    Delete
                                  </button>
                                </>
                              )}
                              {isMasterAdmin && <span style={{fontSize: '11px', color: '#888'}}>Protected</span>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRegisteredUsers.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{textAlign: 'center', padding: '40px', color: '#888'}}>
                          {registeredUsers.length === 0 ? "No users found in Firestore 'users' collection." : "No user matches search."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ CHATS ══ */}
        {activeTab === 'chats' && (
          <div className={styles.sectionFadeIn} style={{ height: '100%', overflow: 'hidden' }}>
            <header className={`${styles.pageHeader} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>💬 Live User Chats</h1><p>Search by User Name to view their messages.</p>
              </div>
            </header>
            <div className={styles.chatSplitView}>
              <div className={`${styles.userListSidebar} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
                <h3 className={styles.paneTitle}>Active Users ({filteredChatUsers.length})</h3>
                
                <div style={{ padding: '10px 15px', borderBottom: '1px solid #1f1e2e', background: '#121120' }}>
                  <input
                    type="text"
                    placeholder="Search by name..."
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: '8px',
                      border: '1px solid #3a3a5e', background: '#0b0a14',
                      color: '#fff', fontSize: '13px', outline: 'none', boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div className={styles.userListScroll}>
                  {filteredChatUsers.map(user => (
                    <div key={user.id} onClick={() => { setSelectedUser(user); setIsMobileChatView(true); }}
                      className={`${styles.userListItem} ${selectedUser?.id === user.id ? styles.activeUserItem : ''}`}>
                      <div className={styles.userAvatar}>{user.os?.includes('Mac')||user.os?.includes('iOS')?'🍎':user.os?.includes('Android')?'🤖':'💻'}</div>
                      <div className={styles.userInfo}>
                        <h4 style={{color:'#fff', fontSize: '15px'}}>{user.userName}</h4>
                        <p style={{color:'#00e5ff', fontSize: '12px', marginTop: '2px'}}>{user.device} • {user.os}</p>
                        <span style={{fontSize:'10px',color:'#555'}}>{user.messages.length} msgs | {user.network} | ID: {user.id}</span>
                      </div>
                    </div>
                  ))}
                  {filteredChatUsers.length === 0 && (
                    <div style={{padding: '20px', textAlign: 'center', color: '#888', fontSize: '13px'}}>No user found 🤷‍♂️</div>
                  )}
                </div>
              </div>
              
              <div className={`${styles.chatWindow} ${!isMobileChatView ? styles.hideOnMobile : ''}`}>
                {selectedUser ? (
                  <>
                    <div className={styles.chatWindowHeader}>
                      <button className={styles.mobileBackBtn} onClick={() => setIsMobileChatView(false)}>⬅️</button>
                      <div>
                        <h3 style={{margin:0}}>{selectedUser.userName}</h3>
                        <p style={{margin:0,fontSize:'11px',color:'#888'}}>{selectedUser.device} | FP: {selectedUser.id}</p>
                      </div>
                    </div>
                    <div className={styles.chatMessagesArea}>
                      {selectedUser.messages.slice().reverse().map(log => (
                        <div key={log.id} className={styles.chatPair}>
                          <div className={`${styles.bubbleRow} ${styles.rowUser}`}>
                            <div className={`${styles.chatBubble} ${styles.bubbleUser}`}>
                              {log.prompt}
                              <span className={styles.bubbleTime}>{new Date(log.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                            </div>
                          </div>
                          <div className={`${styles.bubbleRow} ${styles.rowAi}`}>
                            <div className={styles.chatAvatarWrapper}><img src="/logo.svg" alt="AI" className={styles.aiSmallAvatar}/></div>
                            <div className={`${styles.chatBubble} ${styles.bubbleAi} ${log.isRoasterMode?styles.bubbleRoast:''}`}>
                              {log.response}
                              <div className={styles.bubbleFooter}>
                                <span className={styles.bubbleModel}>{log.model}</span>
                                <span className={styles.bubbleTime}>{((log.responseTimeMs||0)/1000).toFixed(1)}s • {log.totalTokens||0} tok</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : <div className={styles.noUserSelected}><h2>👈 Select a user</h2></div>}
              </div>
            </div>
          </div>
        )}

        {/* ══ LIVE SEARCH (Global) ══ */}
        {activeTab === 'search' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>🔍 Live Search</h1><p>Prompts, responses, devices, names, models — sab kuch ek jagah dhundo.</p>
              </div>
            </header>
            <div className={styles.searchBar}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                type="text"
                placeholder="Kuch bhi search karo — naam, prompt, device, model..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>×</button>
              )}
              <span className={styles.searchResults}>{searchLogs.length} results</span>
            </div>
            
            <div className={styles.tableContainer} style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <div className={styles.tableWrapper} style={{ minWidth: '100%' }}>
                <table className={styles.adminTable} style={{ width: '100%', minWidth: '800px' }}>
                  <thead>
                    <tr><th>Time</th><th>User / Device</th><th>Prompt</th><th>Response Preview</th><th>Model</th><th>Tokens</th></tr>
                  </thead>
                  <tbody>
                    {searchLogs.slice(0,100).map(log => (
                      <tr key={log.id}>
                        <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#8c82f2', color:'#fff'}}>{log.userName || '?'}</div>
                          <div className={styles.subText}>{log.device||'?'} • {log.os}</div>
                        </td>
                        <td style={{maxWidth:'280px',fontSize:'13px',color:'#cdd6f4',fontStyle:'italic'}}>"{log.prompt?.slice(0,120)}{(log.prompt?.length||0)>120?'…':''}"</td>
                        <td style={{maxWidth:'200px',fontSize:'12px',color:'#888'}}>{log.response?.slice(0,80)}{(log.response?.length||0)>80?'…':''}</td>
                        <td><span style={{color:'#8c82f2',fontSize:'11px',fontWeight:'700'}}>{log.model}</span></td>
                        <td><span className={styles.tokenTotal}>{log.totalTokens||0}</span></td>
                      </tr>
                    ))}
                    {searchLogs.length === 0 && (
                      <tr><td colSpan={6} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kuch nahi mila "{searchQuery}" ke liye 🤔</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ HOUR HEATMAP ══ */}
        {activeTab === 'heatmap' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>🌡️ Hourly Traffic Heatmap</h1><p>Konse ghante mein sabse zyada traffic aata hai — 0 se 23 tak.</p>
              </div>
            </header>
            <div className={styles.analyticsCard} style={{marginBottom:'24px'}}>
              <h3>Requests Per Hour</h3>
              <div className={styles.heatmapGrid}>
                {hourlyData.map((count, h) => {
                  const intensity = count / maxHourly;
                  const r = Math.round(140 * intensity + 83 * (1-intensity));
                  const g = Math.round(130 * intensity + 130 * (1-intensity));
                  const b = Math.round(242 * (1-intensity*0.5) + 30 * intensity);
                  const bg = count === 0 ? '#1a1929' : `rgb(${r},${g},${b})`;
                  return (
                    <div key={h} className={styles.heatmapCell} style={{background: bg, opacity: count===0?0.3:1}}>
                      {count > 0 && <span className={styles.heatmapLabel}>{count}</span>}
                      <span className={styles.heatmapTooltip}>{h}:00 — {count} req</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.heatmapXAxis}>
                {hourlyData.map((_,h) => (
                  <div key={h} className={styles.heatmapXLabel} style={{fontWeight: h===peakHour?'700':'400', color: h===peakHour?'#8c82f2':'#555'}}>
                    {h}
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Peak Hours Top 5</h3>
                {[...hourlyData.map((c,h)=>({h,c}))].sort((a,b)=>b.c-a.c).slice(0,5).map(({h,c}) => (
                  <div key={h} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{h}:00 — {h+1}:00</span><span>{c} reqs</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(c/maxHourly)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Traffic Insights</h3>
                <div className={styles.perfStat}><span>Peak Hour:</span><strong>{peakHour}:00 — {peakHour+1}:00</strong></div>
                <div className={styles.perfStat}><span>Peak Requests:</span><strong>{hourlyData[peakHour]}</strong></div>
                <div className={styles.perfStat}><span>Quiet Hours (0 reqs):</span><strong>{hourlyData.filter(x=>x===0).length}</strong></div>
                <div className={styles.perfStat}><span>Active Hours:</span><strong>{hourlyData.filter(x=>x>0).length} / 24</strong></div>
                <div className={styles.perfStat}><span>Avg Reqs/Active Hour:</span><strong>{(totalRequests / Math.max(hourlyData.filter(x=>x>0).length,1)).toFixed(1)}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══ FINGERPRINT SCORE ══ */}
        {activeTab === 'fingerprint' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>🔏 User Fingerprints</h1><p>Har unique device ka stable fingerprint ID + engagement score.</p>
              </div>
              <div className={styles.pageHeaderRight}>
                <span style={{fontSize:'13px',color:'#666'}}>{fingerprintData.length} unique users</span>
              </div>
            </header>
            <div className={styles.fingerprintGrid}>
              {fingerprintData.map((user, i) => (
                <div key={user.id} className={styles.fingerprintCard}>
                  <div className={styles.fingerprintHeader}>
                    <div>
                      <div style={{fontSize:'18px',marginBottom:'4px'}}>{user.os?.includes('Mac')||user.os?.includes('iOS')?'🍎':user.os?.includes('Android')?'🤖':'💻'} {user.userName}</div>
                      <div className={styles.fingerprintId}>{user.device} | FP: {user.id}</div>
                    </div>
                    <div>
                      <div className={`${styles.fingerprintScore} ${user.score>=70?styles.scoreHigh:user.score>=40?styles.scoreMid:styles.scoreLow}`}>{user.score}</div>
                      <div style={{fontSize:'9px',color:'#555',textAlign:'right'}}>SCORE</div>
                    </div>
                  </div>
                  <div className={styles.fingerprintMeta}>
                    OS: {user.os} • {user.browser}<br/>
                    Messages: <strong style={{color:'#e6e6fa'}}>{user.messages.length}</strong> &nbsp;•&nbsp;
                    Avg tokens: <strong style={{color:'#f5b942'}}>{user.avgTokens}</strong><br/>
                    Avg speed: <strong style={{color:'#00e5ff'}}>{user.avgSpeed}s</strong> &nbsp;•&nbsp;
                    Roast: <strong style={{color:'#ff4d4f'}}>{user.roastRatio}%</strong>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{width:`${user.score}%`,background:user.score>=70?'#00ff80':user.score>=40?'#f5b942':'#ff4d4f'}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ WORD CLOUD ══ */}
        {activeTab === 'wordcloud' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>☁️ Word Cloud</h1><p>Sabse zyada use hone wale words user prompts mein.</p>
              </div>
            </header>
            <div className={styles.analyticsCard}>
              <h3>Top Prompt Words</h3>
              <div className={styles.wordCloud}>
                {wordFreq.map(([word, count], i) => {
                  const ratio = count / maxWordFreq;
                  const size = Math.round(11 + ratio * 22);
                  const opacity = 0.5 + ratio * 0.5;
                  const color = wordColors[i % wordColors.length];
                  return (
                    <span
                      key={word}
                      className={styles.wordTag}
                      style={{
                        fontSize: `${size}px`,
                        background: `${color}20`,
                        color, opacity,
                        border: `1px solid ${color}40`,
                      }}
                      title={`"${word}" — ${count} times`}
                    >
                      {word}
                    </span>
                  );
                })}
                {wordFreq.length === 0 && <span style={{color:'#555'}}>Koi data nahi abhi 🤷</span>}
              </div>
            </div>
            <div className={styles.analyticsGrid} style={{marginTop:'22px'}}>
              <div className={styles.analyticsCard}>
                <h3>Top 10 Words</h3>
                {wordFreq.slice(0,10).map(([word,count]) => (
                  <div key={word} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span style={{fontWeight:'600'}}>{word}</span><span>{count}×</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/maxWordFreq)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Word Stats</h3>
                <div className={styles.perfStat}><span>Total Unique Words:</span><strong>{wordFreq.length}</strong></div>
                <div className={styles.perfStat}><span>Most Used Word:</span><strong style={{color:'#8c82f2'}}>"{wordFreq[0]?.[0]||'N/A'}"</strong></div>
                <div className={styles.perfStat}><span>Top Word Count:</span><strong>{wordFreq[0]?.[1]||0}×</strong></div>
                <div className={styles.perfStat}><span>Total Prompts Analyzed:</span><strong>{logs.filter(l=>l.prompt).length}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══ RESPONSE QUALITY METER ══ */}
        {activeTab === 'quality' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>📈 Response Quality Meter</h1><p>Tokens per second — model ki actual speed aur efficiency.</p>
              </div>
            </header>
            <div className={styles.analyticsGrid}>
              {qualityStats.map(stat => {
                const maxTps = Math.max(...qualityStats.map(s=>Number(s.tokensPerSec)), 1);
                const bar = (Number(stat.tokensPerSec) / maxTps) * 100;
                return (
                  <div key={stat.model} className={styles.analyticsCard}>
                    <h3 style={{color:'#00e5ff'}}>{stat.model}</h3>
                    <div style={{fontSize:'36px',fontWeight:'900',color:'#fff',margin:'8px 0'}}>{stat.tokensPerSec}<span style={{fontSize:'14px',color:'#666',fontWeight:'400'}}> tok/s</span></div>
                    <div className={styles.progressBar} style={{marginBottom:'16px'}}>
                      <div className={styles.progressFill} style={{width:`${bar}%`,background:`linear-gradient(90deg,#8c82f2,#00e5ff)`}}></div>
                    </div>
                    <div className={styles.perfStat}><span>Requests:</span><strong>{stat.count}</strong></div>
                    <div className={styles.perfStat}><span>Avg Tokens/Req:</span><strong>{stat.avgTokens}</strong></div>
                  </div>
                );
              })}
              {qualityStats.length === 0 && <div className={styles.analyticsCard}><p style={{color:'#555'}}>Data nahi mila abhi.</p></div>}
            </div>
          </div>
        )}

        {/* ══ HARDWARE LEADERBOARD ══ */}
        {activeTab === 'hardware' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>🖥️ Hardware Leaderboard</h1><p>Sabse powerful devices jo Aivox use kar rahe hain — CPU × RAM score.</p>
              </div>
            </header>
            <div className={styles.leaderboardList}>
              {hwLeaderboard.map((hw, i) => (
                <div key={hw.device + i} className={styles.leaderboardItem}>
                  <div className={`${styles.leaderboardRank} ${i===0?styles.rankGold:i===1?styles.rankSilver:i===2?styles.rankBronze:''}`}>
                    {i===0?'🥇':i===1?'🥈':i===2?'🥉':i+1}
                  </div>
                  <div className={styles.leaderboardInfo}>
                    <div className={styles.leaderboardName}>{hw.device}</div>
                    <div className={styles.leaderboardSub}>{hw.os} • {hw.cpu} CPU cores • {hw.ram} GB RAM</div>
                  </div>
                  <div className={styles.leaderboardStat}>
                    <div className={styles.leaderboardStatVal}>{hw.powerScore}</div>
                    <div className={styles.leaderboardStatLabel}>Power Score</div>
                  </div>
                  <div className={styles.leaderboardStat} style={{marginLeft:'12px'}}>
                    <div className={styles.leaderboardStatVal} style={{color:'#f5b942'}}>{hw.count}</div>
                    <div className={styles.leaderboardStatLabel}>Sessions</div>
                  </div>
                </div>
              ))}
              {hwLeaderboard.length === 0 && <p style={{color:'#555',textAlign:'center'}}>Hardware data nahi mila. CPU/RAM tracking check karo.</p>}
            </div>
          </div>
        )}

        {/* ══ ERROR MONITOR ══ */}
        {activeTab === 'errors' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>⚠️ Error & Fail Monitor</h1><p>Failed requests, slow responses, aur model fallback tracking.</p>
              </div>
            </header>
            <div className={styles.errorMonitor} style={{marginBottom:'24px'}}>
              <div className={styles.errorCard}>
                <div className={styles.errorLabel}>Total Fails</div>
                <div className={`${styles.errorRate} ${failedLogs.length>0?styles.statusBad:styles.statusGood}`}>{failedLogs.length}</div>
                <div className={styles.errorSubText}>Model = "Failed" ya empty response</div>
              </div>
              <div className={styles.errorCard}>
                <div className={styles.errorLabel}>Fail Rate</div>
                <div className={`${styles.errorRate} ${failRate>5?styles.statusBad:failRate>2?styles.statusWarn:styles.statusGood}`}>{failRate}%</div>
                <div className={styles.errorSubText}>Of total {totalRequests} requests</div>
              </div>
              <div className={styles.errorCard}>
                <div className={styles.errorLabel}>Slow Responses</div>
                <div className={`${styles.errorRate} ${slowLogs.length>5?styles.statusWarn:styles.statusGood}`}>{slowLogs.length}</div>
                <div className={styles.errorSubText}>&gt;5 seconds response time</div>
              </div>
              <div className={styles.errorCard}>
                <div className={styles.errorLabel}>Slow Rate</div>
                <div className={`${styles.errorRate} ${slowRate>10?styles.statusBad:styles.statusWarn}`}>{slowRate}%</div>
                <div className={styles.errorSubText}>Of all requests above 5s</div>
              </div>
            </div>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Model Fallback Chain</h3>
                {Object.entries(modelStats).sort((a,b)=>b[1].count-a[1].count).map(([model,d]) => (
                  <div key={model} className={styles.perfStat}>
                    <span style={{color: model==='Failed'?'#ff4d4f':'inherit'}}>{model}</span>
                    <strong>{d.count} reqs {model==='Failed'?'❌':d.count===Object.values(modelStats).sort((a,b)=>b.count-a.count)[0]?.count?'✅':''}</strong>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Slowest Requests (Top 5)</h3>
                {[...logs].sort((a,b)=>(b.responseTimeMs||0)-(a.responseTimeMs||0)).slice(0,5).map(log => (
                  <div key={log.id} className={styles.perfStat}>
                    <span style={{fontSize:'11px',color:'#888'}}>{new Date(log.timestamp).toLocaleTimeString()} — {log.device?.slice(0,20)}</span>
                    <strong style={{color:'#f5b942'}}>{((log.responseTimeMs||0)/1000).toFixed(1)}s</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ CONVERSATION DEPTH ══ */}
        {activeTab === 'depth' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>💬 Conversation Depth</h1><p>Har user ne kitne messages bheje — engagement ka asli measure.</p>
              </div>
            </header>
            <div className={styles.analyticsGrid} style={{marginBottom:'24px'}}>
              <div className={styles.analyticsCard}>
                <h3>Sessions by Message Count</h3>
                <div className={styles.depthChart}>
                  {Object.entries(depthBuckets).map(([label, count], i) => (
                    <div key={label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',position:'relative',height:'100%'}}>
                      <div
                        className={styles.depthBar}
                        style={{
                          width:'100%',
                          height: `${Math.max(4,(count/maxDepth)*100)}%`,
                          background: depthColors[i],
                          opacity: 0.85,
                        }}
                      >
                        <span className={styles.depthBarVal}>{count}</span>
                      </div>
                      <span style={{fontSize:'10px',color:'#666',marginTop:'6px',textAlign:'center'}}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.analyticsCard}>
                <h3>Depth Stats</h3>
                <div className={styles.perfStat}><span>Total Sessions:</span><strong>{userList.length}</strong></div>
                <div className={styles.perfStat}><span>Avg Msgs/Session:</span><strong>{userList.length ? (totalRequests/userList.length).toFixed(1) : 0}</strong></div>
                <div className={styles.perfStat}><span>1-msg users (Bounce):</span><strong>{depthBuckets['1']}</strong></div>
                <div className={styles.perfStat}><span>Power Users (10+):</span><strong style={{color:'#00ff80'}}>{depthBuckets['10+']}</strong></div>
                <div className={styles.perfStat}><span>Max Session Depth:</span><strong>{Math.max(...userList.map(u=>u.messages.length),0)}</strong></div>
              </div>
            </div>
            <div className={styles.analyticsCard}>
              <h3>Most Active Sessions</h3>
              {userList.slice(0,8).map((user,i) => (
                <div key={user.id} className={styles.progressRow}>
                  <div className={styles.progressLabel}>
                    <span>{user.userName} ({user.device})</span>
                    <span style={{color:'#8c82f2',fontWeight:'700'}}>{user.messages.length} msgs</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{width:`${(user.messages.length/Math.max(...userList.map(u=>u.messages.length),1))*100}%`,background:'#8c82f2'}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ ANALYTICS REPORT ══ */}
        {activeTab === 'report' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <div className={styles.reportHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <p className={styles.reportTitle}>📋 Aivox Analytics Report</p>
                <p className={styles.reportMeta}>Generated: {new Date().toLocaleString()} • {totalRequests} total events</p>
              </div>
              <button className={styles.printBtn} onClick={() => window.print()}>🖨️ Print / Save PDF</button>
            </div>

            <div className={styles.reportGrid}>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.normalColor}`}>{totalRequests}</div><div className={styles.reportCardLabel}>Total Requests</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.tokenColor}`}>{totalTokens.toLocaleString()}</div><div className={styles.reportCardLabel}>Tokens Used</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.speedColor}`}>{avgTimeSec}s</div><div className={styles.reportCardLabel}>Avg Speed</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal}`} style={{color:'#00ff80'}}>{uniqueUsers}</div><div className={styles.reportCardLabel}>Unique Devices</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.roastColor}`}>{roasts}</div><div className={styles.reportCardLabel}>Roast Requests</div></div>
              <div className={styles.reportCard}><div className={styles.reportCardVal} style={{color: failRate>5?'#ff4d4f':'#00ff80'}}>{failRate}%</div><div className={styles.reportCardLabel}>Fail Rate</div></div>
            </div>

            <div className={styles.reportSection}>
              <h4>Top Performers</h4>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top OS</span><span className={styles.reportRowVal}>{topOS?.[0]||'N/A'} ({topOS?.[1]||0} users)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top Browser</span><span className={styles.reportRowVal}>{topBrowser?.[0]||'N/A'} ({topBrowser?.[1]||0} users)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top Timezone</span><span className={styles.reportRowVal}>{topTimezone?.[0]||'N/A'} ({topTimezone?.[1]||0} users)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top AI Model</span><span className={styles.reportRowVal}>{topModel?.[0]||'N/A'} ({topModel?.[1]?.count||0} reqs)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Peak Hour</span><span className={styles.reportRowVal}>{peakHour}:00 — {hourlyData[peakHour]} requests</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Most Used Word</span><span className={styles.reportRowVal}>"{wordFreq[0]?.[0]||'N/A'}" ({wordFreq[0]?.[1]||0}×)</span></div>
            </div>

            <div className={styles.reportSection}>
              <h4>Token Economics</h4>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Total Input Tokens</span><span className={styles.reportRowVal}>{totalInputTokens.toLocaleString()}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Total Output Tokens</span><span className={styles.reportRowVal}>{totalOutputTokens.toLocaleString()}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Input : Output Ratio</span><span className={styles.reportRowVal}>1 : {totalInputTokens ? (totalOutputTokens/totalInputTokens).toFixed(2) : 0}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Avg Tokens / Request</span><span className={styles.reportRowVal}>{totalRequests ? Math.round(totalTokens/totalRequests) : 0}</span></div>
            </div>

            <div className={styles.reportSection}>
              <h4>Model Performance</h4>
              {Object.entries(modelStats).map(([model, d]) => (
                <div key={model} className={styles.reportRow}>
                  <span className={styles.reportRowLabel}>{model}</span>
                  <span className={styles.reportRowVal}>{d.count} reqs • {((d.totalTime/d.count)/1000).toFixed(2)}s avg</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ DEVICES ══ */}
        {activeTab === 'devices' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>📱 Device Demographics</h1><p>OS aur browser breakdown.</p>
              </div>
            </header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Operating Systems</h3>
                {Object.entries(osStats).sort((a,b)=>b[1]-a[1]).map(([os,count]) => (
                  <div key={os} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{os}</span><span>{count}</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/totalRequests)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Browsers</h3>
                {Object.entries(browserStats).sort((a,b)=>b[1]-a[1]).map(([browser,count]) => (
                  <div key={browser} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{browser}</span><span>{count}</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/totalRequests)*100}%`,background:'#00e5ff'}}></div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ NETWORK ══ */}
        {activeTab === 'network' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>📡 Network & Environment</h1><p>Connection types aur browser settings.</p>
              </div>
            </header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Connection Type</h3>
                {Object.entries(networkStats).map(([net,count]) => (
                  <div key={net} className={styles.perfStat}><span style={{textTransform:'uppercase'}}>{net}</span><strong>{count} Users</strong></div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Environment</h3>
                {Object.entries(displayModeStats).map(([mode,count]) => (
                  <div key={mode} className={styles.perfStat}><span>Display: {mode}</span><strong>{count}</strong></div>
                ))}
                {Object.entries(cookieStats).map(([cookie,count]) => (
                  <div key={cookie} className={styles.perfStat}><span>Cookies: {cookie}</span><strong>{count}</strong></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ SYSTEM LOGS ══ */}
        {activeTab === 'system' && (
          <div className={styles.sectionFadeIn} style={{ display: 'block', height: 'auto', paddingBottom: '60px' }}>
            <header className={styles.pageHeader}>
              <div style={{ paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' }}>
                <h1>⚙️ System Logs</h1><p>Deep hardware, network, tracking aur battery data.</p>
              </div>
              <div className={styles.pageHeaderRight}>
                <button onClick={fetchData} className={styles.actionBtn}>🔄 Refresh</button>
                <button onClick={downloadCSV} className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}>📥 CSV</button>
              </div>
            </header>
            <div className={styles.tableContainer} style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
              <div className={styles.tableWrapper} style={{ minWidth: '100%' }}>
                <table className={styles.adminTable} style={{ width: '100%', minWidth: '800px' }}>
                  <thead><tr><th>Time & Zone</th><th>User & Hardware (Deep)</th><th>Network & Activity</th><th>Performance</th></tr></thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id}>
                        <td className={styles.timeCol}>
                          {new Date(log.timestamp).toLocaleString()}
                          <div className={styles.subText}>🌍 {log.timezone}</div>
                          <div style={{fontSize:'10px',color:'#444',marginTop:'2px',fontFamily:'monospace'}}>FP: {makeFingerprint(log)}</div>
                        </td>
                        <td>
                          <div className={styles.sysTag} style={{background: '#8c82f2', color: '#fff'}}>{log.userName || "Anonymous"}</div>
                          <div className={styles.subText} style={{marginTop: '4px', lineHeight: '1.6'}}>
                            <strong>Device:</strong> {log.device||"Unknown"}<br/>
                            <strong>OS:</strong> {log.os}<br/>
                            <strong>RAM/CPU:</strong> {log.ramMemory||'N/A'}GB | {log.cpuCores||'N/A'} cores<br/>
                            <strong>Screen:</strong> {log.screenResolution}<br/>
                            <span style={{color: '#f5b942'}}><strong>Battery:</strong> {log.batteryLevel !== null && log.batteryLevel !== undefined ? `${log.batteryLevel}% ${log.batteryCharging ? '⚡ (Charging)' : '🔋'}` : 'Blocked by OS'}</span><br/>
                            <span style={{color: '#00e5ff'}}><strong>Media:</strong> 🎤 {log.microphoneCount||0} Mics | 📷 {log.cameraCount||0} Cams</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#1a3a2a',color:'#00ff80'}}>📶 {(log.network||'WIFI').toUpperCase()}</div>
                          <div className={styles.subText} style={{lineHeight: '1.6'}}>
                            <strong>Browser:</strong> {log.browserVendor}<br/>
                            <strong>Lang:</strong> {log.language}<br/>
                            <strong>Hesitation:</strong> <span style={{color: '#ff4d4f'}}>{log.backspaceCount||0} Backspaces</span><br/>
                            <strong>Touch Support:</strong> {log.touchSupport ? 'Yes 👆' : 'No 🖱️'}
                          </div>
                        </td>
                        <td>
                          <div className={styles.tokenTotal}>Tokens: {log.totalTokens||0}</div>
                          <div className={styles.speedColor}>⚡ {log.responseTimeMs?(log.responseTimeMs/1000).toFixed(2)+'s':'N/A'}</div>
                          <div className={styles.subText}>🤖 {log.model}</div>
                          {log.isRoasterMode && <div style={{fontSize:'10px',color:'#ff4d4f',marginTop:'2px'}}>🔥 Roaster</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
      {isMobileMenuOpen && <div className={styles.menuOverlay} onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default Admin;