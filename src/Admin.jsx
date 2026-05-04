import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, getDocs, query, orderBy, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import styles from './Admin.module.css';

// ─── HELPERS ───
const makeFingerprint = (log) => {
  const raw = `${log.os||''}_${log.device||''}_${log.screenResolution||''}_${log.browserVendor||''}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) { hash = ((hash << 5) - hash) + raw.charCodeAt(i); hash |= 0; }
  return Math.abs(hash).toString(16).slice(0, 8).toUpperCase();
};

const getWordFrequency = (logs) => {
  const stopWords = new Set(['the','a','an','is','in','it','to','of','and','for','i','me','my','you','are','was','what','how','can','do','that','this','with','on','at','be','have','will','like','just','want','please','make','help','give','tell','get','use','need','know','think','would','could','should']);
  const freq = {};
  logs.forEach(log => {
    if (!log.prompt) return;
    log.prompt.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(word => {
      if (word.length > 2 && !stopWords.has(word)) freq[word] = (freq[word] || 0) + 1;
    });
  });
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, 40);
};

// Token cost estimator (approximate rates)
const MODEL_COSTS = {
  'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku':  { input: 0.0008, output: 0.004 },
  'claude-3-opus':     { input: 0.015, output: 0.075 },
  'claude-3-sonnet':   { input: 0.003, output: 0.015 },
  'claude-3-haiku':    { input: 0.00025, output: 0.00125 },
  'gpt-4':             { input: 0.03, output: 0.06 },
  'gpt-3.5':           { input: 0.0005, output: 0.0015 },
  'Unknown':           { input: 0.003, output: 0.015 },
  'Failed':            { input: 0, output: 0 },
};

function estimateCost(log) {
  const modelKey = Object.keys(MODEL_COSTS).find(k => (log.model||'').toLowerCase().includes(k.toLowerCase())) || 'Unknown';
  const rates = MODEL_COSTS[modelKey];
  const inputCost  = ((log.userTokens || 0) / 1000) * rates.input;
  const outputCost = ((log.aiTokens   || 0) / 1000) * rates.output;
  return inputCost + outputCost;
}

function groupByDay(logs) {
  const map = {};
  logs.forEach(log => {
    const day = new Date(log.timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    if (!map[day]) map[day] = { tokens: 0, cost: 0, count: 0 };
    map[day].tokens += (log.totalTokens || 0);
    map[day].cost   += estimateCost(log);
    map[day].count  += 1;
  });
  // last 14 days sorted
  return Object.entries(map)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
    .slice(-14);
}

function MiniBar({ value, max, color = '#8c82f2' }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 6, height: 6, overflow: 'hidden', marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function StatCard({ title, value, sub, color = '#8c82f2', subColor }) {
  return (
    <div className={styles.statCard} style={{ '--stat-color': color }}>
      <h3>{title}</h3>
      <p className={styles.statValue} style={{ color }}>{value}</p>
      {sub && <p className={styles.statTrend} style={subColor ? { color: subColor } : {}}>{sub}</p>}
    </div>
  );
}

// ─── SIMPLE INLINE CHART using canvas (mobile-safe) ───
function DailyChart({ data, valueKey, color = '#8c82f2', formatter = v => v }) {
  const canvasRef = useRef(null);
  const wrapperRef = useRef(null);

  const draw = useCallback(() => {
    if (!canvasRef.current || !data.length || !wrapperRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = wrapperRef.current.clientWidth || 300;
    const H = 170;
    canvas.width = W;
    canvas.height = H;
    ctx.clearRect(0, 0, W, H);

    const vals = data.map(([, d]) => d[valueKey]);
    const maxV = Math.max(...vals, 1);
    const slotW = (W - 16) / data.length;
    const barW = Math.max(4, slotW - 5);
    const startX = 8;

    data.forEach(([day, d], i) => {
      const v = d[valueKey];
      const barH = Math.max(4, ((v / maxV) * (H - 46)));
      const x = startX + i * slotW + (slotW - barW) / 2;
      const y = H - 28 - barH;

      ctx.fillStyle = color + 'cc';
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(x, y, barW, barH, 4); }
      else { ctx.rect(x, y, barW, barH); }
      ctx.fill();

      if (v > 0 && barW > 16) {
        ctx.fillStyle = '#e6e6fa';
        ctx.font = `${Math.max(8, Math.min(10, Math.floor(slotW * 0.48)))}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(formatter(v), x + barW / 2, y - 3);
      }

      if (slotW > 18) {
        ctx.fillStyle = '#6a6b8c';
        ctx.font = `${Math.max(7, Math.min(9, Math.floor(slotW * 0.42)))}px Inter,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(day.split(' ')[0], x + barW / 2, H - 6);
      }
    });
  }, [data, valueKey, color, formatter]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [draw]);

  if (!data.length) return <p style={{ color: '#555', textAlign: 'center', padding: '30px 0' }}>Koi data nahi abhi 📊</p>;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: 170, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ─── MAIN COMPONENT ───
function Admin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const allowedEmails = ['nadeemxsalar@gmail.com', 'realheronadeem@gmail.com'];

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isMobileChatView, setIsMobileChatView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [unsentPrompts, setUnsentPrompts] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(null);

  // Responsive Hook
  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth > 900);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Auth check
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

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const q = query(collection(db, "aivox_tracking"), orderBy("timestamp", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);

      try {
        const uSnap = await getDocs(collection(db, "users"));
        setRegisteredUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.warn("Users fetch error:", err); }

      try {
        const unsentQ = query(collection(db, "aivox_unsent_prompts"), orderBy("timestamp", "desc"));
        const unsentSnap = await getDocs(unsentQ);
        setUnsentPrompts(unsentSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) { console.warn("Unsent prompts fetch error:", err); }

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { if (isAdmin) fetchData(); }, [fetchData, isAdmin]);

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

  // ─── CSV Download ───
  const downloadCSV = () => {
    if (logs.length === 0) return alert("No data!");
    const headers = ["Time","Timezone","User Name","Device","OS","Browser","Network","CPU","RAM","Prompt","Response","Model","Speed(s)","Tokens","Cost($)","Mode","Active Ego","Memories Locked","Vibe Pct","Fingerprint"];
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
      estimateCost(log).toFixed(5),
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

  // ─── User Management ───
  const handleDeleteUser = async (userId, userName) => {
    if (window.confirm(`Delete user: ${userName}?`)) {
      try {
        await deleteDoc(doc(db, "users", userId));
        setRegisteredUsers(prev => prev.filter(u => u.id !== userId));
        alert(`${userName} deleted.`);
      } catch (error) { alert("Failed: " + error.message); }
    }
  };

  const handleUpdateUserRole = async (userId, userName, currentRole) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (window.confirm(`Change ${userName} to ${newRole}?`)) {
      try {
        await updateDoc(doc(db, "users", userId), { role: newRole });
        setRegisteredUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      } catch (error) { alert("Failed: " + error.message); }
    }
  };

  // ─── COMPUTED STATS ───
  const totalRequests   = logs.length;
  const totalTokens     = logs.reduce((s, l) => s + (l.totalTokens || 0), 0);
  const totalInputTok   = logs.reduce((s, l) => s + (l.userTokens || 0), 0);
  const totalOutputTok  = logs.reduce((s, l) => s + (l.aiTokens || 0), 0);
  const totalCostUSD    = logs.reduce((s, l) => s + estimateCost(l), 0);
  const avgTimeSec      = totalRequests ? (logs.reduce((s, l) => s + (l.responseTimeMs || 0), 0) / totalRequests / 1000).toFixed(2) : 0;
  const roasts          = logs.filter(l => l.isRoasterMode).length;
  const normalCount     = totalRequests - roasts;
  const failedLogs      = logs.filter(l => (l.model || '') === 'Failed' || !l.response);
  const failRate        = totalRequests ? ((failedLogs.length / totalRequests) * 100).toFixed(1) : 0;
  const slowLogs        = logs.filter(l => (l.responseTimeMs || 0) > 5000);
  const slowRate        = totalRequests ? ((slowLogs.length / totalRequests) * 100).toFixed(1) : 0;

  const hourlyData = Array(24).fill(0);
  logs.forEach(l => { const h = new Date(l.timestamp).getHours(); if (!isNaN(h)) hourlyData[h]++; });
  const maxHourly = Math.max(...hourlyData, 1);
  const peakHour = hourlyData.indexOf(Math.max(...hourlyData));

  const chatGroups = logs.reduce((groups, log) => {
    const fp = makeFingerprint(log);
    const uName = log.userName || "Anonymous";
    const groupId = `${uName}_${fp}`;
    if (!groups[groupId]) groups[groupId] = { id: fp, userName: uName, device: log.device||"Unknown", os: log.os||"Unknown", browser: log.browserVendor||"Unknown", network: log.network||"WIFI", messages: [] };
    groups[groupId].messages.push(log);
    return groups;
  }, {});
  const userList = Object.values(chatGroups).sort((a, b) => new Date(b.messages[0].timestamp) - new Date(a.messages[0].timestamp));
  const uniqueUsers = userList.length;

  const filteredChatUsers = userList.filter(u =>
    u.userName.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    u.device.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );
  const filteredRegisteredUsers = registeredUsers.filter(u =>
    (u.name||'').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (u.email||'').toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  const osStats      = logs.reduce((a, l) => { a[l.os]=(a[l.os]||0)+1; return a; }, {});
  const browserStats = logs.reduce((a, l) => { a[l.browserVendor]=(a[l.browserVendor]||0)+1; return a; }, {});
  const modelStats   = logs.reduce((a, l) => {
    const m = l.model||"Unknown";
    if (!a[m]) a[m] = { count:0, totalTokens:0, totalTime:0, totalCost:0 };
    a[m].count++; a[m].totalTokens += (l.totalTokens||0); a[m].totalTime += (l.responseTimeMs||0); a[m].totalCost += estimateCost(l);
    return a;
  }, {});
  const networkStats  = logs.reduce((a, l) => { const k=l.network||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const timezoneStats = logs.reduce((a, l) => { const k=l.timezone||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const langStats     = logs.reduce((a, l) => { const k=l.language||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const displayModeStats = logs.reduce((a, l) => { const k=l.displayMode||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});
  const cookieStats   = logs.reduce((a, l) => { const k=l.cookies||'Unknown'; a[k]=(a[k]||0)+1; return a; }, {});

  const topOS       = Object.entries(osStats).sort((a,b)=>b[1]-a[1])[0];
  const topBrowser  = Object.entries(browserStats).sort((a,b)=>b[1]-a[1])[0];
  const topTimezone = Object.entries(timezoneStats).sort((a,b)=>b[1]-a[1])[0];
  const topModel    = Object.entries(modelStats).sort((a,b)=>b[1].count-a[1].count)[0];
  const topLang     = Object.entries(langStats).sort((a,b)=>b[1]-a[1])[0];

  const roastTokens  = logs.filter(l=>l.isRoasterMode).reduce((s,l)=>s+(l.totalTokens||0),0);
  const normalTokens = logs.filter(l=>!l.isRoasterMode).reduce((s,l)=>s+(l.totalTokens||0),0);
  const roastCost    = logs.filter(l=>l.isRoasterMode).reduce((s,l)=>s+estimateCost(l),0);
  const normalCost   = logs.filter(l=>!l.isRoasterMode).reduce((s,l)=>s+estimateCost(l),0);

  const dailyData = groupByDay(logs);

  const wordFreq    = getWordFrequency(logs);
  const maxWordFreq = wordFreq[0]?.[1] || 1;
  const wordColors  = ['#8c82f2','#00e5ff','#f5b942','#00ff80','#ff6b9d','#ff8c42','#42f5b3','#c542f5'];

  const qualityStats = Object.entries(modelStats).map(([model, d]) => ({
    model,
    tokensPerSec: d.totalTime ? ((d.totalTokens / d.totalTime) * 1000).toFixed(1) : 0,
    avgTokens: d.count ? Math.round(d.totalTokens / d.count) : 0,
    count: d.count,
    totalCost: d.totalCost,
  })).sort((a, b) => b.tokensPerSec - a.tokensPerSec);

  const hwMap = {};
  logs.forEach(l => {
    const key = `${l.device||'Unknown'}_${l.os||''}`;
    if (!hwMap[key]) hwMap[key] = { device:l.device||'Unknown', os:l.os||'Unknown', cpu:0, ram:0, count:0 };
    if (l.cpuCores) hwMap[key].cpu = Math.max(hwMap[key].cpu, Number(l.cpuCores)||0);
    if (l.ramMemory) hwMap[key].ram = Math.max(hwMap[key].ram, Number(l.ramMemory)||0);
    hwMap[key].count++;
  });
  const hwLeaderboard = Object.values(hwMap)
    .map(h => ({ ...h, powerScore: (h.cpu * 2) + (h.ram / 2) }))
    .sort((a,b) => b.powerScore - a.powerScore).slice(0, 10);

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

  const fingerprintData = Object.values(chatGroups).map(user => {
    const msgs = user.messages;
    const avgTokens = msgs.reduce((s,m)=>s+(m.totalTokens||0),0) / msgs.length;
    const avgSpeed  = msgs.reduce((s,m)=>s+(m.responseTimeMs||0),0) / msgs.length / 1000;
    const roastRatio = msgs.filter(m=>m.isRoasterMode).length / msgs.length;
    const totalCostUser = msgs.reduce((s,m)=>s+estimateCost(m),0);
    const score = Math.min(100, Math.round((avgTokens / 5) + (msgs.length * 3) + (roastRatio * 20)));
    return { ...user, avgTokens: Math.round(avgTokens), avgSpeed: avgSpeed.toFixed(1), score, roastRatio:(roastRatio*100).toFixed(0), totalCostUser };
  }).sort((a,b) => b.score - a.score);

  const totalLockedMemories = logs.reduce((max, log) => Math.max(max, log.lockedMemories || 0), 0);
  const activeEgosData = logs.reduce((acc, log) => {
    const ego = log.activeEgo || 'smart';
    acc[ego] = (acc[ego] || 0) + 1;
    return acc;
  }, {});
  const avgVibeSync = logs.length ? Math.round(logs.reduce((sum, log) => sum + (log.vibeEnergyPct || 50), 0) / logs.length) : 0;

  const liveUserModes = Object.values(chatGroups).map(u => {
    const latestMessage = u.messages[0];
    return {
      id: u.id, userName: u.userName, device: u.device, os: u.os,
      ego: latestMessage.activeEgo || 'smart',
      memoryDetails: latestMessage.lockedMemoryDetails || [],
      lastActive: latestMessage.timestamp,
    };
  }).sort((a,b) => new Date(b.lastActive) - new Date(a.lastActive));

  const searchLogs = searchQuery.trim()
    ? logs.filter(l => {
        const q = searchQuery.toLowerCase();
        return (l.prompt||'').toLowerCase().includes(q) || (l.response||'').toLowerCase().includes(q)
          || (l.device||'').toLowerCase().includes(q) || (l.os||'').toLowerCase().includes(q)
          || (l.model||'').toLowerCase().includes(q) || (l.userName||'').toLowerCase().includes(q)
          || (l.timezone||'').toLowerCase().includes(q);
      })
    : logs;

  // Prompt analysis
  const avgPromptLen    = totalRequests ? Math.round(logs.reduce((s,l)=>s+(l.promptLength||l.prompt?.length||0),0)/totalRequests) : 0;
  const avgTypingSpeed  = logs.filter(l=>l.typingSpeedCPM).length ? Math.round(logs.filter(l=>l.typingSpeedCPM).reduce((s,l)=>s+(l.typingSpeedCPM||0),0) / logs.filter(l=>l.typingSpeedCPM).length) : 0;
  const avgBackspaces   = totalRequests ? Math.round(logs.reduce((s,l)=>s+(l.backspaceCount||0),0)/totalRequests) : 0;
  const longestPrompts  = [...logs].sort((a,b)=>(b.prompt?.length||0)-(a.prompt?.length||0)).slice(0,5);
  const totalCopyPaste  = logs.reduce((s,l)=>s+(l.copyCount||0)+(l.pasteCount||0),0);

  // Today's data
  const today = new Date().toDateString();
  const todayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === today);
  const todayTokens = todayLogs.reduce((s,l)=>s+(l.totalTokens||0),0);
  const todayCost   = todayLogs.reduce((s,l)=>s+estimateCost(l),0);
  const todayRequests = todayLogs.length;

  useEffect(() => {
    if (filteredChatUsers.length > 0 && !selectedUser && window.innerWidth > 900) setSelectedUser(filteredChatUsers[0]);
  }, [filteredChatUsers, selectedUser]);

  const handleTabChange = (tab) => {
    setActiveTab(tab); setIsMobileMenuOpen(false); setIsMobileChatView(false);
    setSearchQuery(''); setChatSearchQuery(''); setUserSearchQuery('');
  };

  // ─── RENDER GUARDS ───
  if (authLoading) return (
    <div className={styles.adminLoading}>
      <div className={styles.spinner}></div>
      <h2>Checking Admin Credentials... 🛡️</h2>
    </div>
  );

  if (!isAdmin) return (
    <div className={styles.adminLoading} style={{ background:'#0b0a14', flexDirection:'column' }}>
      <div style={{ fontSize:'70px', marginBottom:'10px' }}>🚫</div>
      <h2 style={{ color:'#ff4d4f', margin:0 }}>Access Denied</h2>
      <p style={{ color:'#888', maxWidth:'350px', textAlign:'center', marginTop:'15px', lineHeight:'1.5', fontSize:'14px' }}>
        Only authorized admins can access the Control Center.
      </p>
      <button onClick={() => window.location.href = '/auth'}
        style={{ marginTop:'30px', padding:'14px 28px', background:'#8c82f2', border:'none', borderRadius:'12px', color:'#fff', cursor:'pointer', fontWeight:'bold', fontSize:'15px' }}>
        Go to Login 🔑
      </button>
    </div>
  );

  if (loading) return (
    <div className={styles.adminLoading}>
      <div className={styles.spinner}></div>
      <h2>Loading Control Center... ⏳</h2>
    </div>
  );

  // ─── NAV COMPONENTS ───
  const NavSection = ({ label, children }) => (
    <div>
      <div className={styles.navSection}><span className={styles.navSectionLabel}>{label}</span></div>
      <nav className={styles.navMenu}>{children}</nav>
    </div>
  );

  const NavBtn = ({ tab, children }) => (
    <button className={`${styles.navItem} ${activeTab === tab ? styles.activeNav : ''}`}
      onClick={() => handleTabChange(tab)}>{children}</button>
  );

  const padLeft = { paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' };

  // ─── RENDER ───
  return (
    <div className={styles.adminLayout}>

      {/* Desktop floating hamburger */}
      {isDesktop && !isSidebarVisible && (
        <button onClick={() => setIsSidebarVisible(true)}
          style={{ position:'absolute', top:'24px', left:'24px', zIndex:100, background:'rgba(21,20,38,0.8)',
            border:'1px solid rgba(255,255,255,0.1)', borderRadius:'10px', padding:'10px', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(10px)',
            boxShadow:'0 8px 20px rgba(0,0,0,0.3)', color:'#fff' }}>
          <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>
          </svg>
        </button>
      )}

      {/* Mobile Header */}
      <div className={styles.mobileHeader}>
        <h2>🚀 Aivox Admin</h2>
        <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}
        style={{
          transform: (isDesktop && !isSidebarVisible) ? 'translateX(-100%)' : '',
          width: (isDesktop && !isSidebarVisible) ? '0px' : '260px',
          opacity: (isDesktop && !isSidebarVisible) ? 0 : 1,
          padding: (isDesktop && !isSidebarVisible) ? '0' : '',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
        <div className={styles.sidebarHeader}>
          <h2>🚀 Aivox Pro</h2>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            {isDesktop && (
              <button onClick={() => setIsSidebarVisible(false)}
                style={{ background:'rgba(255,255,255,0.05)', border:'none', borderRadius:'6px', cursor:'pointer', color:'#8a8d9e', padding:'6px', display:'flex', alignItems:'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
              </button>
            )}
            {!isDesktop && <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}>✕</button>}
          </div>
        </div>

        <div className={styles.autoRefreshBadge}>
          <span>🔄 Auto Refresh {autoRefresh ? `(${countdown}s)` : 'OFF'}</span>
          <label className={styles.autoRefreshToggle}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        {/* Today's quick stats in sidebar */}
        <div style={{ margin:'0 16px 16px', background:'rgba(140,130,242,0.08)', borderRadius:10, padding:'10px 14px', border:'1px solid rgba(140,130,242,0.2)' }}>
          <div style={{ fontSize:10, color:'#8c82f2', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>📅 Today</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>{todayRequests}</div>
              <div style={{ color:'#6a6b8c' }}>Requests</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#f5b942', fontWeight:800, fontSize:16 }}>{(todayTokens/1000).toFixed(1)}K</div>
              <div style={{ color:'#6a6b8c' }}>Tokens</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#00ff80', fontWeight:800, fontSize:16 }}>${todayCost.toFixed(3)}</div>
              <div style={{ color:'#6a6b8c' }}>Cost</div>
            </div>
          </div>
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

      {/* ─── MAIN CONTENT ─── */}
      <main className={styles.mainContent} style={{ overflowY:'auto', overflowX:'hidden', transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        {/* ══════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}>
                <h1>📊 Dashboard Overview</h1>
                <p>High-level metrics aur API usage — sab ek jagah.</p>
              </div>
              <div className={styles.pageHeaderRight}>
                <span className={styles.refreshCountdown}>{autoRefresh ? `🔄 ${countdown}s` : '⏸ Manual'}</span>
                <div className={styles.liveBadge}><span className={styles.pulse}></span> LIVE</div>
                <button onClick={fetchData} className={styles.actionBtn}>🔄 Refresh</button>
              </div>
            </header>

            {/* Stats Grid */}
            <div className={styles.statsGrid}>
              <StatCard title="Total API Calls" value={totalRequests} sub={`Unique users: ${uniqueUsers}`} color="#8c82f2" />
              <StatCard title="Tokens Consumed" value={totalTokens.toLocaleString()} sub={`Avg/req: ${totalRequests ? Math.round(totalTokens/totalRequests) : 0}`} color="#f5b942" />
              <StatCard title="Total Cost (Est.)" value={`$${totalCostUSD.toFixed(4)}`} sub={`Today: $${todayCost.toFixed(4)}`} color="#00ff80" />
              <StatCard title="Avg. Speed" value={`${avgTimeSec}s`} sub={`Peak hour: ${peakHour}:00`} color="#00e5ff" />
              <StatCard title="Roasts / Normal" value={<><span style={{color:'#ff4d4f'}}>{roasts}</span><span style={{color:'#555',margin:'0 6px'}}>/</span><span style={{color:'#8c82f2'}}>{normalCount}</span></>} sub={`Fail rate: ${failRate}%`} color="#ff4d4f" />
              <StatCard title="Slow Responses" value={slowLogs.length} sub={`Slow rate: ${slowRate}%`} color="#ff6b9d" />
            </div>

            {/* Daily Tokens Chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>📈 Daily Token Usage (Last 14 Days)</h3>
              <DailyChart data={dailyData} valueKey="tokens" label="Tokens" color="#8c82f2" formatter={v => v > 1000 ? `${(v/1000).toFixed(1)}K` : v} />
            </div>

            {/* Daily Cost Chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>💰 Daily Cost in USD (Last 14 Days)</h3>
              <DailyChart data={dailyData} valueKey="cost" label="Cost" color="#00ff80" formatter={v => `$${v.toFixed(3)}`} />
            </div>

            {/* Hourly Heatmap quick view */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>🌡️ Today's Hourly Traffic</h3>
              <div className={styles.heatmapGrid}>
                {hourlyData.map((count, h) => {
                  const intensity = count / maxHourly;
                  const bg = intensity === 0 ? '#1f1e2e' : `rgba(140,130,242,${Math.max(0.08, intensity)})`;
                  return (
                    <div key={h} className={styles.heatmapCell} style={{ background: bg }}>
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

            {/* Quick model breakdown */}
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Model Usage Breakdown</h3>
                {Object.entries(modelStats).sort((a,b)=>b[1].count-a[1].count).map(([model, d]) => (
                  <div key={model} className={styles.progressRow}>
                    <div className={styles.progressLabel}>
                      <span style={{ color: model==='Failed'?'#ff4d4f':'#e6e6fa' }}>{model}</span>
                      <span>${d.totalCost.toFixed(4)} | {d.count} reqs</span>
                    </div>
                    <MiniBar value={d.count} max={totalRequests} color={model==='Failed'?'#ff4d4f':'#8c82f2'} />
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Quick Summary</h3>
                <div className={styles.perfStat}><span>Total Input Tokens</span><strong>{totalInputTok.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Total Output Tokens</span><strong>{totalOutputTok.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Input:Output Ratio</span><strong>1:{totalInputTok ? (totalOutputTok/totalInputTok).toFixed(2) : 0}</strong></div>
                <div className={styles.perfStat}><span>Avg Tokens/Req</span><strong>{totalRequests ? Math.round(totalTokens/totalRequests) : 0}</strong></div>
                <div className={styles.perfStat}><span>Top Language</span><strong>{topLang?.[0]||'N/A'}</strong></div>
                <div className={styles.perfStat}><span>Avg Prompt Length</span><strong>{avgPromptLen} chars</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            TOKEN ECONOMICS (FULL)
        ══════════════════════════════════════════ */}
        {activeTab === 'economics' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>💰 Token Economics</h1><p>Daily spending, model costs aur full token breakdown.</p></div>
              <div className={styles.pageHeaderRight}>
                <button onClick={downloadCSV} className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}>📥 CSV with Cost</button>
              </div>
            </header>

            {/* Top summary cards */}
            <div className={styles.statsGrid}>
              <StatCard title="Total Est. Cost" value={`$${totalCostUSD.toFixed(4)}`} sub="Based on public API rates" color="#00ff80" />
              <StatCard title="Today's Cost" value={`$${todayCost.toFixed(4)}`} sub={`${todayTokens.toLocaleString()} tokens today`} color="#f5b942" />
              <StatCard title="Avg Cost/Request" value={`$${totalRequests ? (totalCostUSD/totalRequests).toFixed(5) : 0}`} sub="Per API call" color="#00e5ff" />
              <StatCard title="Total Tokens" value={totalTokens.toLocaleString()} sub={`In: ${totalInputTok.toLocaleString()} | Out: ${totalOutputTok.toLocaleString()}`} color="#8c82f2" />
            </div>

            {/* Daily cost chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>💰 Daily Cost Trend (USD) — Last 14 Days</h3>
              <DailyChart data={dailyData} valueKey="cost" color="#00ff80" formatter={v => `$${v.toFixed(3)}`} />
            </div>

            {/* Daily token chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>📊 Daily Token Consumption — Last 14 Days</h3>
              <DailyChart data={dailyData} valueKey="tokens" color="#f5b942" formatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : String(v)} />
            </div>

            <div className={styles.analyticsGrid} style={{ marginBottom:24 }}>
              {/* Daily table */}
              <div className={styles.analyticsCard}>
                <h3>Day-wise Breakdown</h3>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr>
                        {['Date','Requests','Tokens','Cost (USD)'].map(h => (
                          <th key={h} style={{ padding:'8px 10px', textAlign:'left', color:'#8a8d9e', borderBottom:'1px solid rgba(255,255,255,0.06)', fontWeight:700, fontSize:11, textTransform:'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dailyData.slice().reverse().map(([day, d]) => (
                        <tr key={day} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding:'8px 10px', color:'#cdd6f4', fontWeight:600 }}>{day}</td>
                          <td style={{ padding:'8px 10px', color:'#8c82f2' }}>{d.count}</td>
                          <td style={{ padding:'8px 10px', color:'#f5b942' }}>{d.tokens.toLocaleString()}</td>
                          <td style={{ padding:'8px 10px', color:'#00ff80', fontWeight:700 }}>${d.cost.toFixed(4)}</td>
                        </tr>
                      ))}
                      {dailyData.length === 0 && (
                        <tr><td colSpan={4} style={{ padding:'30px', textAlign:'center', color:'#555' }}>Koi data nahi</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Model cost breakdown */}
              <div className={styles.analyticsCard}>
                <h3>Cost per Model</h3>
                {Object.entries(modelStats).sort((a,b)=>b[1].totalCost-a[1].totalCost).map(([model, d]) => (
                  <div key={model} className={styles.progressRow}>
                    <div className={styles.progressLabel}>
                      <span style={{ color: model==='Failed'?'#ff4d4f':'#e6e6fa' }}>{model}</span>
                      <span style={{ color:'#00ff80', fontWeight:700 }}>${d.totalCost.toFixed(4)}</span>
                    </div>
                    <div className={styles.progressBar}>
                      <div className={styles.progressFill} style={{ width:`${(d.totalCost/Math.max(totalCostUSD,0.0001))*100}%`, background:'#00ff80' }}></div>
                    </div>
                    <div style={{ fontSize:11, color:'#6a6b8c', marginTop:4 }}>
                      {d.count} reqs • {d.totalTokens.toLocaleString()} tokens • Avg ${d.count ? (d.totalCost/d.count).toFixed(5) : 0}/req
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Token ratio */}
            <div className={styles.analyticsCard}>
              <h3>Token Type Breakdown</h3>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:16, overflow:'hidden' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:24, fontWeight:900, color:'#8c82f2' }}>{totalInputTok.toLocaleString()}</div>
                  <div style={{ fontSize:12, color:'#8a8d9e' }}>Input Tokens (User)</div>
                  <div style={{ fontSize:12, color:'#00ff80', marginTop:4 }}>${((totalInputTok/1000)*0.003).toFixed(4)} est.</div>
                </div>
                <div style={{ fontSize:24, color:'#555', display:'flex', alignItems:'center' }}>→</div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:24, fontWeight:900, color:'#00e5ff' }}>{totalOutputTok.toLocaleString()}</div>
                  <div style={{ fontSize:12, color:'#8a8d9e' }}>Output Tokens (AI)</div>
                  <div style={{ fontSize:12, color:'#00ff80', marginTop:4 }}>${((totalOutputTok/1000)*0.015).toFixed(4)} est.</div>
                </div>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressLabel}><span>Input</span><span>{totalInputTok.toLocaleString()} ({totalTokens ? Math.round(totalInputTok/totalTokens*100) : 0}%)</span></div>
                <div className={styles.progressBar}><div className={styles.progressFill} style={{ width:`${totalTokens ? (totalInputTok/totalTokens)*100 : 0}%`, background:'#8c82f2' }}></div></div>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressLabel}><span>Output</span><span>{totalOutputTok.toLocaleString()} ({totalTokens ? Math.round(totalOutputTok/totalTokens*100) : 0}%)</span></div>
                <div className={styles.progressBar}><div className={styles.progressFill} style={{ width:`${totalTokens ? (totalOutputTok/totalTokens)*100 : 0}%`, background:'#00e5ff' }}></div></div>
              </div>

              <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(0,255,128,0.06)', borderRadius:10, border:'1px solid rgba(0,255,128,0.15)' }}>
                <div style={{ fontSize:12, color:'#8a8d9e', marginBottom:4 }}>⚠️ Note: Costs are estimates based on public Claude/OpenAI API rates. Actual billing depends on your provider.</div>
                <div style={{ fontSize:13, color:'#00ff80', fontWeight:600 }}>Total Estimated: ${totalCostUSD.toFixed(5)} USD</div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            ROASTER
        ══════════════════════════════════════════ */}
        {activeTab === 'roaster' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🔥 Roaster Analytics</h1><p>Roast mode vs Normal mode ka detailed breakdown.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Roast Requests" value={roasts} sub={`${totalRequests ? ((roasts/totalRequests)*100).toFixed(1) : 0}% of total`} color="#ff4d4f" />
              <StatCard title="Normal Requests" value={normalCount} sub={`${totalRequests ? ((normalCount/totalRequests)*100).toFixed(1) : 0}% of total`} color="#8c82f2" />
              <StatCard title="Roast Tokens" value={roastTokens.toLocaleString()} sub={`Cost: $${roastCost.toFixed(4)}`} color="#ff6b9d" />
              <StatCard title="Normal Tokens" value={normalTokens.toLocaleString()} sub={`Cost: $${normalCost.toFixed(4)}`} color="#00e5ff" />
            </div>

            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>🔥 Roast vs Normal Comparison</h3>
                {[
                  { label:'Requests', roastV:roasts, normalV:normalCount },
                  { label:'Tokens', roastV:roastTokens, normalV:normalTokens },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, color:'#8a8d9e', marginBottom:8, fontWeight:600 }}>{row.label}</div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:12, overflow:'hidden' }}>
                      <span style={{ color:'#ff4d4f', minWidth:56, fontSize:11 }}>🔥 {row.roastV.toLocaleString()}</span>
                      <div style={{ flex:1, minWidth:0, background:'rgba(0,0,0,0.3)', borderRadius:6, height:10, overflow:'hidden' }}>
                        <div style={{ width:`${(row.roastV/(row.roastV+row.normalV||1))*100}%`, height:'100%', background:'linear-gradient(90deg,#ff4d4f,#ff6b9d)', borderRadius:6 }} />
                      </div>
                      <span style={{ color:'#8c82f2', minWidth:56, textAlign:'right', fontSize:11 }}>{row.normalV.toLocaleString()} ✅</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.analyticsCard}>
                <h3>Top Roasters</h3>
                {Object.values(chatGroups)
                  .map(u => ({ ...u, roastCount: u.messages.filter(m=>m.isRoasterMode).length }))
                  .filter(u => u.roastCount > 0)
                  .sort((a,b)=>b.roastCount-a.roastCount)
                  .slice(0,8)
                  .map(u => (
                    <div key={u.id} className={styles.progressRow}>
                      <div className={styles.progressLabel}>
                        <span>🔥 {u.userName}</span>
                        <span style={{ color:'#ff4d4f', fontWeight:700 }}>{u.roastCount} roasts</span>
                      </div>
                      <MiniBar value={u.roastCount} max={Math.max(...Object.values(chatGroups).map(uu=>uu.messages.filter(m=>m.isRoasterMode).length),1)} color="#ff4d4f" />
                    </div>
                  ))}
                {Object.values(chatGroups).every(u=>u.messages.every(m=>!m.isRoasterMode)) && (
                  <p style={{ color:'#555', textAlign:'center', padding:'20px 0' }}>Koi roast nahi hua abhi 😅</p>
                )}
              </div>
            </div>

            <div className={styles.analyticsCard} style={{ marginTop:24 }}>
              <h3>Recent Roasts 🔥</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {logs.filter(l=>l.isRoasterMode).slice(0,10).map(log => (
                  <div key={log.id} style={{ background:'rgba(255,77,79,0.08)', border:'1px solid rgba(255,77,79,0.2)', borderRadius:12, padding:'14px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span className={styles.sysTag} style={{ background:'#ff4d4f', color:'#fff' }}>🔥 {log.userName || 'Anonymous'}</span>
                      <span style={{ fontSize:11, color:'#8a8d9e' }}>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize:13, color:'#ff9999', fontStyle:'italic', marginBottom:8 }}>"{log.prompt?.slice(0,120)}{(log.prompt?.length||0)>120?'…':''}"</div>
                    <div style={{ fontSize:12, color:'#cdd6f4' }}>{log.response?.slice(0,200)}{(log.response?.length||0)>200?'…':''}</div>
                  </div>
                ))}
                {!logs.some(l=>l.isRoasterMode) && (
                  <p style={{ color:'#555', textAlign:'center', padding:'40px' }}>Koi roast data nahi mila 🤷‍♂️</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            PROMPT INTEL (FULLY WORKING)
        ══════════════════════════════════════════ */}
        {activeTab === 'prompts' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🧠 Prompt Intel</h1><p>User behavior analysis — typing speed, hesitation, prompt patterns.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Avg Prompt Length" value={`${avgPromptLen}`} sub="Characters per prompt" color="#8c82f2" />
              <StatCard title="Avg Typing Speed" value={avgTypingSpeed ? `${avgTypingSpeed} CPM` : 'N/A'} sub="Characters per minute" color="#00e5ff" />
              <StatCard title="Avg Backspaces" value={avgBackspaces} sub="Per session (hesitation)" color="#ff6b9d" />
              <StatCard title="Copy/Paste Events" value={totalCopyPaste} sub="Total across all users" color="#f5b942" />
            </div>

            <div className={styles.analyticsGrid} style={{ marginBottom:24 }}>
              <div className={styles.analyticsCard}>
                <h3>Longest Prompts (Top 5)</h3>
                {longestPrompts.map((log, i) => (
                  <div key={log.id} style={{ marginBottom:16, padding:'12px 14px', background:'rgba(0,0,0,0.2)', borderRadius:10, border:'1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <span className={styles.sysTag} style={{ background:'#8c82f2', color:'#fff' }}>#{i+1} {log.userName||'Anon'}</span>
                      <span style={{ color:'#f5b942', fontWeight:700, fontSize:12 }}>{log.prompt?.length||0} chars</span>
                    </div>
                    <div style={{ fontSize:12, color:'#8a8d9e', fontStyle:'italic' }}>
                      "{log.prompt?.slice(0,150)}{(log.prompt?.length||0)>150?'…':''}"
                    </div>
                  </div>
                ))}
              </div>

              <div className={styles.analyticsCard}>
                <h3>Typing Behavior Stats</h3>
                <div className={styles.perfStat}><span>Total Prompts Analyzed</span><strong>{logs.filter(l=>l.prompt).length}</strong></div>
                <div className={styles.perfStat}><span>Avg Think Time (Before typing)</span><strong>{logs.filter(l=>l.thinkTimeBeforeTypingMs).length ? `${Math.round(logs.filter(l=>l.thinkTimeBeforeTypingMs).reduce((s,l)=>s+(l.thinkTimeBeforeTypingMs||0),0)/logs.filter(l=>l.thinkTimeBeforeTypingMs).length/1000)}s` : 'N/A'}</strong></div>
                <div className={styles.perfStat}><span>Avg Typing Duration</span><strong>{logs.filter(l=>l.typingDurationMs).length ? `${(logs.filter(l=>l.typingDurationMs).reduce((s,l)=>s+(l.typingDurationMs||0),0)/logs.filter(l=>l.typingDurationMs).length/1000).toFixed(1)}s` : 'N/A'}</strong></div>
                <div className={styles.perfStat}><span>Total Backspaces</span><strong style={{color:'#ff6b9d'}}>{logs.reduce((s,l)=>s+(l.backspaceCount||0),0)}</strong></div>
                <div className={styles.perfStat}><span>Total Keystrokes</span><strong>{logs.reduce((s,l)=>s+(l.totalKeystrokes||0),0).toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Total Copy/Cut Events</span><strong>{logs.reduce((s,l)=>s+(l.copyCount||0),0)}</strong></div>
                <div className={styles.perfStat}><span>Total Paste Events</span><strong>{logs.reduce((s,l)=>s+(l.pasteCount||0),0)}</strong></div>
              </div>
            </div>

            {/* Unsent prompts vault */}
            <div>
              <h2 style={{ color:'#c542f5', marginBottom:15, display:'flex', alignItems:'center', gap:10 }}>
                🕵️ Hesitation Vault
                <span className={styles.sysTag} style={{ background:'#ff4d4f', color:'#fff', fontSize:10 }}>CONFIDENTIAL</span>
              </h2>
              <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
                <table className={styles.adminTable}>
                  <thead>
                    <tr><th>Time</th><th>User / Device</th><th>Deleted Thought (Unsent)</th></tr>
                  </thead>
                  <tbody>
                    {unsentPrompts.length > 0 ? unsentPrompts.map(log => (
                      <tr key={log.id}>
                        <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#c542f5',color:'#fff'}}>{log.userName||'Anonymous'}</div>
                          <div className={styles.subText}>{log.device||'?'} • {log.os}</div>
                        </td>
                        <td style={{maxWidth:'400px',fontSize:'14px',color:'#ff4d4f',fontStyle:'italic',fontWeight:'500'}}>
                          <del>"{log.unsentText}"</del>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kisi ne kuch delete nahi kiya abhi 🕵️‍♂️</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            GEOGRAPHY & LOCALE (WORKING)
        ══════════════════════════════════════════ */}
        {activeTab === 'geography' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🌍 Geo & Locale</h1><p>Timezone, language aur region breakdown.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Unique Timezones" value={Object.keys(timezoneStats).length} sub={`Top: ${topTimezone?.[0]||'N/A'}`} color="#00e5ff" />
              <StatCard title="Unique Languages" value={Object.keys(langStats).length} sub={`Top: ${topLang?.[0]||'N/A'}`} color="#8c82f2" />
              <StatCard title="Total Users" value={uniqueUsers} sub="Across all regions" color="#00ff80" />
              <StatCard title="Top Region" value={topTimezone?.[0]?.split('/')[1]?.replace(/_/g,' ')||'N/A'} sub={`${topTimezone?.[1]||0} users`} color="#f5b942" />
            </div>

            <div className={styles.analyticsGrid} style={{ marginBottom:24 }}>
              <div className={styles.analyticsCard}>
                <h3>🌍 Timezone Distribution</h3>
                {Object.entries(timezoneStats).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([tz, count]) => (
                  <div key={tz} className={styles.progressRow}>
                    <div className={styles.progressLabel}>
                      <span style={{ fontSize:12 }}>{tz}</span>
                      <span>{count} users</span>
                    </div>
                    <MiniBar value={count} max={Object.values(timezoneStats).reduce((a,b)=>a+b,0)} color="#00e5ff" />
                  </div>
                ))}
              </div>

              <div className={styles.analyticsCard}>
                <h3>🗣️ Language Distribution</h3>
                {Object.entries(langStats).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([lang, count]) => (
                  <div key={lang} className={styles.progressRow}>
                    <div className={styles.progressLabel}>
                      <span>{lang}</span>
                      <span>{count}</span>
                    </div>
                    <MiniBar value={count} max={totalRequests} color="#8c82f2" />
                  </div>
                ))}
              </div>
            </div>

            {/* Day of week activity */}
            <div className={styles.analyticsCard}>
              <h3>📅 Activity by Day of Week</h3>
              {(() => {
                const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                const dayCounts = days.map(d => ({ day: d, count: logs.filter(l => l.dayOfWeek === d).length }));
                const maxDay = Math.max(...dayCounts.map(d=>d.count), 1);
                return (
                  <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:90, marginTop:12, overflow:'hidden' }}>
                    {dayCounts.map(({ day, count }) => (
                      <div key={day} style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        <span style={{ fontSize:9, color:'#fff', fontWeight:700 }}>{count || ''}</span>
                        <div style={{ width:'100%', height:`${Math.max(4,(count/maxDay)*68)}px`, background:'#8c82f2cc', borderRadius:'3px 3px 0 0', transition:'height 0.6s ease' }} />
                        <span style={{ fontSize:8, color:'#6a6b8c', textAlign:'center', whiteSpace:'nowrap', overflow:'hidden', width:'100%', textOverflow:'ellipsis' }}>{day.slice(0,3)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            AI PERFORMANCE (ENHANCED)
        ══════════════════════════════════════════ */}
        {activeTab === 'performance' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>⚡ AI Performance</h1><p>Model speed, success rate aur response times.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Avg Response Time" value={`${avgTimeSec}s`} sub="All models combined" color="#00e5ff" />
              <StatCard title="Fail Rate" value={`${failRate}%`} sub={`${failedLogs.length} failed requests`} color="#ff4d4f" />
              <StatCard title="Slow Rate (>5s)" value={`${slowRate}%`} sub={`${slowLogs.length} slow requests`} color="#f5b942" />
              <StatCard title="Success Rate" value={`${(100 - parseFloat(failRate)).toFixed(1)}%`} sub="Successful API calls" color="#00ff80" />
            </div>

            <div className={styles.analyticsGrid}>
              {Object.entries(modelStats).map(([model, d]) => {
                const avgTime = d.count ? (d.totalTime / d.count / 1000).toFixed(2) : 0;
                const tps = d.totalTime ? ((d.totalTokens / d.totalTime) * 1000).toFixed(1) : 0;
                const maxTps = Math.max(...Object.values(modelStats).map(x => x.totalTime ? (x.totalTokens/x.totalTime)*1000 : 0), 1);
                return (
                  <div key={model} className={styles.analyticsCard}>
                    <h3 style={{ color: model==='Failed'?'#ff4d4f':'#00e5ff' }}>{model}</h3>
                    <div style={{ fontSize:36, fontWeight:900, color:'#fff', margin:'8px 0' }}>
                      {tps}<span style={{ fontSize:14, color:'#666', fontWeight:400 }}> tok/s</span>
                    </div>
                    <div className={styles.progressBar} style={{ marginBottom:16 }}>
                      <div className={styles.progressFill} style={{ width:`${(Number(tps)/maxTps)*100}%`, background:'linear-gradient(90deg,#8c82f2,#00e5ff)' }}></div>
                    </div>
                    <div className={styles.perfStat}><span>Requests</span><strong>{d.count}</strong></div>
                    <div className={styles.perfStat}><span>Avg Time</span><strong>{avgTime}s</strong></div>
                    <div className={styles.perfStat}><span>Avg Tokens/Req</span><strong>{d.count ? Math.round(d.totalTokens/d.count) : 0}</strong></div>
                    <div className={styles.perfStat}><span>Total Cost</span><strong style={{color:'#00ff80'}}>${d.totalCost.toFixed(4)}</strong></div>
                  </div>
                );
              })}
            </div>

            <div className={styles.analyticsCard} style={{ marginTop:24 }}>
              <h3>Slowest Requests (Top 10)</h3>
              {[...logs].sort((a,b)=>(b.responseTimeMs||0)-(a.responseTimeMs||0)).slice(0,10).map(log => (
                <div key={log.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <div>
                    <span className={styles.sysTag} style={{ background:'#8c82f2', color:'#fff', marginRight:8 }}>{log.userName||'Anon'}</span>
                    <span style={{ fontSize:11, color:'#8a8d9e' }}>{log.model} • {new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <strong style={{ color: (log.responseTimeMs||0)>10000?'#ff4d4f':(log.responseTimeMs||0)>5000?'#f5b942':'#00ff80' }}>
                    {((log.responseTimeMs||0)/1000).toFixed(1)}s
                  </strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            GOD-MODE FEATURES
        ══════════════════════════════════════════ */}
        {activeTab === 'features' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>✨ God-Mode Analytics</h1><p>Live tracking of Aivox Pro exclusive capabilities.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Alter-Egos Active" value={Object.values(activeEgosData).reduce((a,b)=>a+b,0)} sub={`Top: ${Object.entries(activeEgosData).sort((a,b)=>b[1]-a[1])[0]?.[0]||'smart'}`} color="#8c82f2" />
              <StatCard title="Memories Locked" value={totalLockedMemories} sub="Across all users" color="#00ff80" />
              <StatCard title="Avg. Vibe Sync" value={`${avgVibeSync}%`} sub="Energy match rate" color="#00e5ff" />
              <StatCard title="Hesitation Vault" value={unsentPrompts.length} sub="Deleted prompts captured" color="#c542f5" />
            </div>

            <div className={styles.analyticsGrid} style={{ marginTop:24 }}>
              <div className={styles.analyticsCard}>
                <h3>Ego Distribution</h3>
                {Object.entries(activeEgosData).sort((a,b)=>b[1]-a[1]).map(([ego, count]) => {
                  const colors = { smart:'#8c82f2', savage:'#ff4d4f', corporate:'#f5b942', genz:'#00e5ff' };
                  return (
                    <div key={ego} className={styles.progressRow}>
                      <div className={styles.progressLabel}>
                        <span style={{ textTransform:'capitalize' }}>{ego} Mode</span>
                        <span>{count} reqs</span>
                      </div>
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width:`${(count/totalRequests)*100}%`, background:colors[ego]||'#8c82f2' }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Vibe Energy Distribution</h3>
                {(() => {
                  const buckets = { '0-20':0, '21-40':0, '41-60':0, '61-80':0, '81-100':0 };
                  logs.forEach(l => {
                    const v = l.vibeEnergyPct || 50;
                    if (v <= 20) buckets['0-20']++;
                    else if (v <= 40) buckets['21-40']++;
                    else if (v <= 60) buckets['41-60']++;
                    else if (v <= 80) buckets['61-80']++;
                    else buckets['81-100']++;
                  });
                  const maxB = Math.max(...Object.values(buckets), 1);
                  const bColors = ['#ff4d4f','#f5b942','#8c82f2','#00e5ff','#00ff80'];
                  return Object.entries(buckets).map(([range, count], i) => (
                    <div key={range} className={styles.progressRow}>
                      <div className={styles.progressLabel} style={{ flexWrap:'nowrap', gap:8 }}>
                        <span style={{ fontSize:12, whiteSpace:'nowrap' }}>Vibe {range}%</span>
                        <span style={{ whiteSpace:'nowrap' }}>{count}</span>
                      </div>
                      <div className={styles.progressBar}><div className={styles.progressFill} style={{ width:`${(count/maxB)*100}%`, background:bColors[i] }}></div></div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Live User Modes */}
            <div style={{ marginTop:40 }}>
              <h2 style={{ color:'#00e5ff', marginBottom:15 }}>🎭 Live User Modes & Memories</h2>
              <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
                <table className={styles.adminTable} style={{ minWidth:800 }}>
                  <thead><tr><th>User & Device</th><th>Active Mode</th><th>Locked Memories</th><th>Last Active</th></tr></thead>
                  <tbody>
                    {liveUserModes.map(u => (
                      <tr key={u.id}>
                        <td>
                          <div className={styles.sysTag} style={{background:'#8c82f2',color:'#fff'}}>{u.userName}</div>
                          <div className={styles.subText}>{u.device} • {u.os}</div>
                        </td>
                        <td>
                          <span className={styles.sysTag} style={{ background:u.ego==='savage'?'#ff4d4f':u.ego==='corporate'?'#f5b942':u.ego==='genz'?'#00e5ff':'#2a2a40', color:u.ego==='corporate'?'#000':'#fff', textTransform:'uppercase' }}>
                            {u.ego === 'smart' ? '✨ Normal' : u.ego}
                          </span>
                        </td>
                        <td style={{ maxWidth:350, whiteSpace:'normal', wordBreak:'break-word' }}>
                          {u.memoryDetails?.length > 0 ? (
                            <ul style={{ margin:0, paddingLeft:16, color:'#00ff80', fontSize:13, fontStyle:'italic' }}>
                              {u.memoryDetails.map((mem, idx) => <li key={idx} style={{marginBottom:4}}>{mem}</li>)}
                            </ul>
                          ) : (
                            <span style={{color:'#555',fontSize:12}}>No memories locked</span>
                          )}
                        </td>
                        <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(u.lastActive).toLocaleString()}</td>
                      </tr>
                    ))}
                    {liveUserModes.length === 0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#555',padding:'40px'}}>Koi data nahi 🤷‍♂️</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hesitation Vault */}
            <div style={{ marginTop:40 }}>
              <h2 style={{ color:'#c542f5', marginBottom:15 }}>
                🕵️ Hesitation Vault <span className={styles.sysTag} style={{background:'#ff4d4f',color:'#fff',fontSize:10}}>CONFIDENTIAL</span>
              </h2>
              <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
                <table className={styles.adminTable} style={{ minWidth:800 }}>
                  <thead><tr><th>Time</th><th>User / Device</th><th>Deleted Thought (Unsent Prompt)</th></tr></thead>
                  <tbody>
                    {unsentPrompts.length > 0 ? unsentPrompts.map(log => (
                      <tr key={log.id}>
                        <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#c542f5',color:'#fff'}}>{log.userName||'Anonymous'}</div>
                          <div className={styles.subText}>{log.device||'?'} • {log.os}</div>
                        </td>
                        <td style={{maxWidth:'400px',fontSize:'14px',color:'#ff4d4f',fontStyle:'italic',fontWeight:'500'}}>
                          <del>"{log.unsentText}"</del>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={3} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kisi ne kuch delete nahi kiya abhi 🕵️‍♂️</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            USER CHATS
        ══════════════════════════════════════════ */}
        {activeTab === 'chats' && (
          <div className={styles.sectionFadeIn} style={{ height:'100%', overflow:'hidden' }}>
            <header className={`${styles.pageHeader} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
              <div style={padLeft}><h1>💬 Live User Chats</h1><p>User naam se search karke messages dekho.</p></div>
            </header>
            <div className={styles.chatSplitView}>
              <div className={`${styles.userListSidebar} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
                <h3 className={styles.paneTitle}>Active Users ({filteredChatUsers.length})</h3>
                <div style={{ padding:'10px 15px', borderBottom:'1px solid #1f1e2e', background:'#121120' }}>
                  <input type="text" placeholder="Search by name..."
                    value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)}
                    style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #3a3a5e', background:'#0b0a14', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                </div>
                <div className={styles.userListScroll}>
                  {filteredChatUsers.map(user => (
                    <div key={user.id} onClick={() => { setSelectedUser(user); setIsMobileChatView(true); }}
                      className={`${styles.userListItem} ${selectedUser?.id === user.id ? styles.activeUserItem : ''}`}>
                      <div className={styles.userAvatar}>{user.os?.includes('Mac')||user.os?.includes('iOS')?'🍎':user.os?.includes('Android')?'🤖':'💻'}</div>
                      <div className={styles.userInfo}>
                        <h4>{user.userName}</h4>
                        <p>{user.device} • {user.os}</p>
                        <span style={{fontSize:'10px',color:'#555'}}>{user.messages.length} msgs | {user.network} | ID: {user.id}</span>
                      </div>
                    </div>
                  ))}
                  {filteredChatUsers.length === 0 && <div style={{padding:'20px',textAlign:'center',color:'#888',fontSize:'13px'}}>No user found 🤷‍♂️</div>}
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
                              <span className={styles.bubbleTime}>
                                {new Date(log.timestamp).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
                                {' '}
                                {new Date(log.timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true })}
                              </span>
                            </div>
                          </div>
                          <div className={`${styles.bubbleRow} ${styles.rowAi}`}>
                            <div className={styles.chatAvatarWrapper}><img src="/logo.svg" alt="AI" className={styles.aiSmallAvatar}/></div>
                            <div className={`${styles.chatBubble} ${styles.bubbleAi} ${log.isRoasterMode?styles.bubbleRoast:''}`}>
                              {log.response}
                              <div className={styles.bubbleFooter}>
                                <span className={styles.bubbleModel}>{log.model}</span>
                                <span className={styles.bubbleTime}>{((log.responseTimeMs||0)/1000).toFixed(1)}s • {log.totalTokens||0} tok • ${estimateCost(log).toFixed(4)}</span>
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

        {/* ══════════════════════════════════════════
            LIVE SEARCH
        ══════════════════════════════════════════ */}
        {activeTab === 'search' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🔍 Live Search</h1><p>Prompts, responses, devices — sab ek jagah dhundo.</p></div>
            </header>
            <div className={styles.searchBar}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Naam, prompt, device, model kuch bhi..."
                value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoFocus />
              {searchQuery && <button className={styles.searchClear} onClick={() => setSearchQuery('')}>×</button>}
              <span className={styles.searchResults}>{searchLogs.length} results</span>
            </div>
            <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
              <table className={styles.adminTable} style={{ minWidth:800 }}>
                <thead><tr><th>Time</th><th>User / Device</th><th>Prompt</th><th>Response</th><th>Model</th><th>Tokens</th><th>Cost</th></tr></thead>
                <tbody>
                  {searchLogs.slice(0,100).map(log => (
                    <tr key={log.id}>
                      <td className={styles.timeCol} style={{fontSize:'11px'}}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>
                        <div className={styles.sysTag} style={{background:'#8c82f2',color:'#fff'}}>{log.userName||'?'}</div>
                        <div className={styles.subText}>{log.device||'?'} • {log.os}</div>
                      </td>
                      <td style={{maxWidth:'240px',fontSize:'13px',color:'#cdd6f4',fontStyle:'italic'}}>"{log.prompt?.slice(0,100)}{(log.prompt?.length||0)>100?'…':''}"</td>
                      <td style={{maxWidth:'180px',fontSize:'12px',color:'#888'}}>{log.response?.slice(0,60)}{(log.response?.length||0)>60?'…':''}</td>
                      <td><span style={{color:'#8c82f2',fontSize:'11px',fontWeight:'700'}}>{log.model}</span></td>
                      <td><span className={styles.tokenTotal}>{log.totalTokens||0}</span></td>
                      <td><span style={{color:'#00ff80',fontSize:'11px',fontWeight:'700'}}>${estimateCost(log).toFixed(4)}</span></td>
                    </tr>
                  ))}
                  {searchLogs.length === 0 && <tr><td colSpan={7} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kuch nahi mila "{searchQuery}" 🤔</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            USER MANAGEMENT
        ══════════════════════════════════════════ */}
        {activeTab === 'usermanagement' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>👥 Registered Users</h1><p>All accounts manage karo — role assign karo, delete karo.</p></div>
            </header>
            <div className={styles.searchBar} style={{ marginBottom:20 }}>
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input type="text" placeholder="Name ya email se search..."
                value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} />
            </div>
            <div className={styles.analyticsGrid} style={{ marginBottom:24 }}>
              <div className={styles.analyticsCard}><h3>Total Accounts</h3><div className={styles.statValue} style={{color:'#00e5ff'}}>{registeredUsers.length}</div></div>
              <div className={styles.analyticsCard}><h3>Admin Accounts</h3><div className={styles.statValue} style={{color:'#f5b942'}}>{registeredUsers.filter(u=>u.role==='admin'||allowedEmails.includes((u.email||'').toLowerCase())).length}</div></div>
            </div>
            <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
              <table className={styles.adminTable} style={{ minWidth:800 }}>
                <thead><tr><th>User</th><th>Email</th><th>UID</th><th>Role</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredRegisteredUsers.map(user => {
                    const isMaster = allowedEmails.includes((user.email||'').toLowerCase());
                    return (
                      <tr key={user.id}>
                        <td><div className={styles.sysTag} style={{background:'#8c82f2',color:'#fff'}}>{user.name||user.displayName||'Unknown'}</div></td>
                        <td style={{color:'#cdd6f4'}}>{user.email||'No Email'}</td>
                        <td style={{fontFamily:'monospace',fontSize:'11px',color:'#888'}}>{user.id}</td>
                        <td>
                          {isMaster ? <span className={styles.sysTag} style={{background:'#ff4d4f',color:'#fff'}}>Master Admin</span>
                            : user.role==='admin' ? <span className={styles.sysTag} style={{background:'#f5b942',color:'#000'}}>Admin</span>
                            : <span className={styles.sysTag} style={{background:'#1a3a2a',color:'#00ff80'}}>User</span>}
                        </td>
                        <td>
                          {!isMaster ? (
                            <div style={{display:'flex',gap:8}}>
                              <button onClick={() => handleUpdateUserRole(user.id, user.name||user.email, user.role)}
                                style={{padding:'6px 10px',background:user.role==='admin'?'#555':'#8c82f2',border:'none',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'11px',fontWeight:'bold'}}>
                                {user.role==='admin'?'Remove Admin':'Make Admin'}
                              </button>
                              <button onClick={() => handleDeleteUser(user.id, user.name||user.email)}
                                style={{padding:'6px 10px',background:'#ff4d4f',border:'none',borderRadius:'6px',color:'#fff',cursor:'pointer',fontSize:'11px',fontWeight:'bold'}}>
                                Delete
                              </button>
                            </div>
                          ) : <span style={{fontSize:'11px',color:'#888'}}>Protected</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {filteredRegisteredUsers.length === 0 && <tr><td colSpan={5} style={{textAlign:'center',padding:'40px',color:'#888'}}>Koi user nahi mila.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            HOUR HEATMAP
        ══════════════════════════════════════════ */}
        {activeTab === 'heatmap' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🌡️ Hourly Traffic Heatmap</h1><p>0 se 23 tak — konse ghante mein sabse zyada traffic.</p></div>
            </header>
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>Requests Per Hour</h3>
              <div className={styles.heatmapGrid}>
                {hourlyData.map((count, h) => {
                  const intensity = count / maxHourly;
                  const bg = count === 0 ? '#1a1929' : `rgba(140,130,242,${Math.max(0.12, intensity)})`;
                  return (
                    <div key={h} className={styles.heatmapCell} style={{ background:bg, opacity:count===0?0.3:1 }}>
                      {count > 0 && <span className={styles.heatmapLabel}>{count}</span>}
                      <span className={styles.heatmapTooltip}>{h}:00 — {count} req</span>
                    </div>
                  );
                })}
              </div>
              <div className={styles.heatmapXAxis}>
                {hourlyData.map((_,h) => (
                  <div key={h} className={styles.heatmapXLabel} style={{ fontWeight:h===peakHour?'700':'400', color:h===peakHour?'#8c82f2':'#555' }}>{h}</div>
                ))}
              </div>
            </div>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Peak Hours Top 5</h3>
                {[...hourlyData.map((c,h)=>({h,c}))].sort((a,b)=>b.c-a.c).slice(0,5).map(({h,c}) => (
                  <div key={h} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{h}:00–{h+1}:00</span><span>{c} reqs</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(c/maxHourly)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Traffic Insights</h3>
                <div className={styles.perfStat}><span>Peak Hour</span><strong>{peakHour}:00–{peakHour+1}:00</strong></div>
                <div className={styles.perfStat}><span>Peak Requests</span><strong>{hourlyData[peakHour]}</strong></div>
                <div className={styles.perfStat}><span>Quiet Hours (0 reqs)</span><strong>{hourlyData.filter(x=>x===0).length}</strong></div>
                <div className={styles.perfStat}><span>Active Hours</span><strong>{hourlyData.filter(x=>x>0).length} / 24</strong></div>
                <div className={styles.perfStat}><span>Avg Reqs/Active Hour</span><strong>{(totalRequests/Math.max(hourlyData.filter(x=>x>0).length,1)).toFixed(1)}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            FINGERPRINT
        ══════════════════════════════════════════ */}
        {activeTab === 'fingerprint' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🔏 User Fingerprints</h1><p>Har unique device ka stable fingerprint ID + engagement score + cost.</p></div>
              <div className={styles.pageHeaderRight}><span style={{fontSize:'13px',color:'#666'}}>{fingerprintData.length} unique users</span></div>
            </header>
            <div className={styles.fingerprintGrid}>
              {fingerprintData.map((user) => (
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
                    {user.os} • {user.browser}<br/>
                    Messages: <strong style={{color:'#e6e6fa'}}>{user.messages.length}</strong> &nbsp;•&nbsp;
                    Avg tokens: <strong style={{color:'#f5b942'}}>{user.avgTokens}</strong><br/>
                    Avg speed: <strong style={{color:'#00e5ff'}}>{user.avgSpeed}s</strong> &nbsp;•&nbsp;
                    Roast: <strong style={{color:'#ff4d4f'}}>{user.roastRatio}%</strong><br/>
                    Total cost: <strong style={{color:'#00ff80'}}>${user.totalCostUser.toFixed(4)}</strong>
                  </div>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{width:`${user.score}%`,background:user.score>=70?'#00ff80':user.score>=40?'#f5b942':'#ff4d4f'}}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            WORD CLOUD
        ══════════════════════════════════════════ */}
        {activeTab === 'wordcloud' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>☁️ Word Cloud</h1><p>Sabse zyada use hone wale words user prompts mein.</p></div>
            </header>
            <div className={styles.analyticsCard}>
              <h3>Top Prompt Words</h3>
              <div className={styles.wordCloud}>
                {wordFreq.map(([word, count], i) => {
                  const ratio = count / maxWordFreq;
                  const size = Math.round(11 + ratio * 22);
                  const color = wordColors[i % wordColors.length];
                  return (
                    <span key={word} className={styles.wordTag}
                      style={{ fontSize:`${size}px`, background:`${color}20`, color, opacity:0.5+ratio*0.5, border:`1px solid ${color}40` }}
                      title={`"${word}" — ${count} times`}>{word}</span>
                  );
                })}
                {wordFreq.length === 0 && <span style={{color:'#555'}}>Koi data nahi abhi 🤷</span>}
              </div>
            </div>
            <div className={styles.analyticsGrid} style={{ marginTop:22 }}>
              <div className={styles.analyticsCard}>
                <h3>Top 15 Words</h3>
                {wordFreq.slice(0,15).map(([word, count]) => (
                  <div key={word} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span style={{fontWeight:'600'}}>{word}</span><span>{count}×</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/maxWordFreq)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Word Stats</h3>
                <div className={styles.perfStat}><span>Unique Words</span><strong>{wordFreq.length}</strong></div>
                <div className={styles.perfStat}><span>Most Used</span><strong style={{color:'#8c82f2'}}>"{wordFreq[0]?.[0]||'N/A'}"</strong></div>
                <div className={styles.perfStat}><span>Top Count</span><strong>{wordFreq[0]?.[1]||0}×</strong></div>
                <div className={styles.perfStat}><span>Prompts Analyzed</span><strong>{logs.filter(l=>l.prompt).length}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            QUALITY METER
        ══════════════════════════════════════════ */}
        {activeTab === 'quality' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>📈 Response Quality Meter</h1><p>Tokens per second — model ki efficiency.</p></div>
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
                    <div className={styles.perfStat}><span>Requests</span><strong>{stat.count}</strong></div>
                    <div className={styles.perfStat}><span>Avg Tokens/Req</span><strong>{stat.avgTokens}</strong></div>
                    <div className={styles.perfStat}><span>Total Cost</span><strong style={{color:'#00ff80'}}>${stat.totalCost.toFixed(4)}</strong></div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            HARDWARE LEADERBOARD
        ══════════════════════════════════════════ */}
        {activeTab === 'hardware' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>🖥️ Hardware Leaderboard</h1><p>Sabse powerful devices jo Aivox use kar rahe hain.</p></div>
            </header>
            <div className={styles.leaderboardList}>
              {hwLeaderboard.map((hw, i) => (
                <div key={hw.device+i} className={styles.leaderboardItem}>
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
              {hwLeaderboard.length === 0 && <p style={{color:'#555',textAlign:'center'}}>Hardware data nahi mila.</p>}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            ERROR MONITOR
        ══════════════════════════════════════════ */}
        {activeTab === 'errors' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>⚠️ Error Monitor</h1><p>Failed requests, slow responses aur model fallback tracking.</p></div>
            </header>
            <div className={styles.errorMonitor} style={{marginBottom:'24px'}}>
              <div className={styles.errorCard}><div className={styles.errorLabel}>Total Fails</div><div className={`${styles.errorRate} ${failedLogs.length>0?styles.statusBad:styles.statusGood}`}>{failedLogs.length}</div><div className={styles.errorSubText}>Model = "Failed" ya empty</div></div>
              <div className={styles.errorCard}><div className={styles.errorLabel}>Fail Rate</div><div className={`${styles.errorRate} ${failRate>5?styles.statusBad:failRate>2?styles.statusWarn:styles.statusGood}`}>{failRate}%</div><div className={styles.errorSubText}>Of {totalRequests} requests</div></div>
              <div className={styles.errorCard}><div className={styles.errorLabel}>Slow (&gt;5s)</div><div className={`${styles.errorRate} ${slowLogs.length>5?styles.statusWarn:styles.statusGood}`}>{slowLogs.length}</div><div className={styles.errorSubText}>Response &gt;5 seconds</div></div>
              <div className={styles.errorCard}><div className={styles.errorLabel}>Slow Rate</div><div className={`${styles.errorRate} ${slowRate>10?styles.statusBad:styles.statusWarn}`}>{slowRate}%</div><div className={styles.errorSubText}>All requests &gt;5s</div></div>
            </div>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Model Fallback Chain</h3>
                {Object.entries(modelStats).sort((a,b)=>b[1].count-a[1].count).map(([model, d]) => (
                  <div key={model} className={styles.perfStat}>
                    <span style={{color:model==='Failed'?'#ff4d4f':'inherit'}}>{model}</span>
                    <strong>{d.count} reqs {model==='Failed'?'❌':'✅'}</strong>
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

        {/* ══════════════════════════════════════════
            CONVERSATION DEPTH
        ══════════════════════════════════════════ */}
        {activeTab === 'depth' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>💬 Conversation Depth</h1><p>Engagement ka asli measure — kitne messages bheje.</p></div>
            </header>
            <div className={styles.analyticsGrid} style={{marginBottom:'24px'}}>
              <div className={styles.analyticsCard}>
                <h3>Sessions by Message Count</h3>
                <div className={styles.depthChart}>
                  {Object.entries(depthBuckets).map(([label, count], i) => (
                    <div key={label} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',height:'100%'}}>
                      <div className={styles.depthBar} style={{width:'100%',height:`${Math.max(4,(count/maxDepth)*100)}%`,background:depthColors[i],opacity:0.85}}>
                        <span className={styles.depthBarVal}>{count}</span>
                      </div>
                      <span style={{fontSize:'10px',color:'#666',marginTop:'6px'}}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.analyticsCard}>
                <h3>Depth Stats</h3>
                <div className={styles.perfStat}><span>Total Sessions</span><strong>{userList.length}</strong></div>
                <div className={styles.perfStat}><span>Avg Msgs/Session</span><strong>{userList.length ? (totalRequests/userList.length).toFixed(1) : 0}</strong></div>
                <div className={styles.perfStat}><span>1-msg (Bounce)</span><strong>{depthBuckets['1']}</strong></div>
                <div className={styles.perfStat}><span>Power Users (10+)</span><strong style={{color:'#00ff80'}}>{depthBuckets['10+']}</strong></div>
                <div className={styles.perfStat}><span>Max Session Depth</span><strong>{Math.max(...userList.map(u=>u.messages.length),0)}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            DEVICES
        ══════════════════════════════════════════ */}
        {activeTab === 'devices' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>📱 Device Demographics</h1><p>OS aur browser breakdown.</p></div>
            </header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Operating Systems</h3>
                {Object.entries(osStats).sort((a,b)=>b[1]-a[1]).map(([os, count]) => (
                  <div key={os} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{os}</span><span>{count}</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/totalRequests)*100}%`,background:'#8c82f2'}}></div></div>
                  </div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Browsers</h3>
                {Object.entries(browserStats).sort((a,b)=>b[1]-a[1]).map(([browser, count]) => (
                  <div key={browser} className={styles.progressRow}>
                    <div className={styles.progressLabel}><span>{browser}</span><span>{count}</span></div>
                    <div className={styles.progressBar}><div className={styles.progressFill} style={{width:`${(count/totalRequests)*100}%`,background:'#00e5ff'}}></div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            NETWORK
        ══════════════════════════════════════════ */}
        {activeTab === 'network' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>📡 Network & Environment</h1><p>Connection types aur browser settings.</p></div>
            </header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Connection Types</h3>
                {Object.entries(networkStats).map(([net, count]) => (
                  <div key={net} className={styles.perfStat}><span style={{textTransform:'uppercase'}}>{net}</span><strong>{count} Users</strong></div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Environment</h3>
                {Object.entries(displayModeStats).map(([mode, count]) => (
                  <div key={mode} className={styles.perfStat}><span>Display: {mode}</span><strong>{count}</strong></div>
                ))}
                {Object.entries(cookieStats).map(([cookie, count]) => (
                  <div key={cookie} className={styles.perfStat}><span>Cookies: {cookie}</span><strong>{count}</strong></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            ANALYTICS REPORT
        ══════════════════════════════════════════ */}
        {activeTab === 'report' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <div className={styles.reportHeader}>
              <div style={padLeft}>
                <p className={styles.reportTitle}>📋 Aivox Analytics Report</p>
                <p className={styles.reportMeta}>Generated: {new Date().toLocaleString()} • {totalRequests} total events</p>
              </div>
              <button className={styles.printBtn} onClick={() => window.print()}>🖨️ Print / Save PDF</button>
            </div>
            <div className={styles.reportGrid}>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.normalColor}`}>{totalRequests}</div><div className={styles.reportCardLabel}>Total Requests</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.tokenColor}`}>{totalTokens.toLocaleString()}</div><div className={styles.reportCardLabel}>Tokens Used</div></div>
              <div className={styles.reportCard}><div className={styles.reportCardVal} style={{color:'#00ff80'}}>${totalCostUSD.toFixed(4)}</div><div className={styles.reportCardLabel}>Est. Total Cost</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.speedColor}`}>{avgTimeSec}s</div><div className={styles.reportCardLabel}>Avg Speed</div></div>
              <div className={styles.reportCard}><div className={styles.reportCardVal} style={{color:'#00ff80'}}>{uniqueUsers}</div><div className={styles.reportCardLabel}>Unique Devices</div></div>
              <div className={styles.reportCard}><div className={`${styles.reportCardVal} ${styles.roastColor}`}>{roasts}</div><div className={styles.reportCardLabel}>Roast Requests</div></div>
            </div>
            <div className={styles.reportSection}>
              <h4>Top Performers</h4>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top OS</span><span className={styles.reportRowVal}>{topOS?.[0]||'N/A'} ({topOS?.[1]||0} users)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top Browser</span><span className={styles.reportRowVal}>{topBrowser?.[0]||'N/A'} ({topBrowser?.[1]||0} users)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top Timezone</span><span className={styles.reportRowVal}>{topTimezone?.[0]||'N/A'}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top AI Model</span><span className={styles.reportRowVal}>{topModel?.[0]||'N/A'} ({topModel?.[1]?.count||0} reqs)</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Peak Hour</span><span className={styles.reportRowVal}>{peakHour}:00 — {hourlyData[peakHour]} requests</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Top Word</span><span className={styles.reportRowVal}>"{wordFreq[0]?.[0]||'N/A'}" ({wordFreq[0]?.[1]||0}×)</span></div>
            </div>
            <div className={styles.reportSection}>
              <h4>Token Economics</h4>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Total Input Tokens</span><span className={styles.reportRowVal}>{totalInputTok.toLocaleString()}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Total Output Tokens</span><span className={styles.reportRowVal}>{totalOutputTok.toLocaleString()}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Input:Output Ratio</span><span className={styles.reportRowVal}>1:{totalInputTok ? (totalOutputTok/totalInputTok).toFixed(2) : 0}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Avg Tokens/Request</span><span className={styles.reportRowVal}>{totalRequests ? Math.round(totalTokens/totalRequests) : 0}</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Est. Total Cost</span><span className={styles.reportRowVal} style={{color:'#00ff80',fontWeight:900}}>${totalCostUSD.toFixed(5)} USD</span></div>
              <div className={styles.reportRow}><span className={styles.reportRowLabel}>Today's Cost</span><span className={styles.reportRowVal} style={{color:'#f5b942'}}>${todayCost.toFixed(5)} USD</span></div>
            </div>
            <div className={styles.reportSection}>
              <h4>Model Performance</h4>
              {Object.entries(modelStats).map(([model, d]) => (
                <div key={model} className={styles.reportRow}>
                  <span className={styles.reportRowLabel}>{model}</span>
                  <span className={styles.reportRowVal}>{d.count} reqs • {d.count ? ((d.totalTime/d.count)/1000).toFixed(2) : 0}s avg • ${d.totalCost.toFixed(4)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            SYSTEM LOGS
        ══════════════════════════════════════════ */}
        {activeTab === 'system' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1>⚙️ System Logs</h1><p>Deep hardware, network aur battery data.</p></div>
              <div className={styles.pageHeaderRight}>
                <button onClick={fetchData} className={styles.actionBtn}>🔄 Refresh</button>
                <button onClick={downloadCSV} className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}>📥 CSV</button>
              </div>
            </header>
            <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
              <table className={styles.adminTable} style={{ minWidth:900 }}>
                <thead><tr><th>Time & Zone</th><th>User & Hardware</th><th>Network & Activity</th><th>Performance</th></tr></thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id}>
                      <td className={styles.timeCol}>
                        {new Date(log.timestamp).toLocaleString()}
                        <div className={styles.subText}>🌍 {log.timezone}</div>
                        <div style={{fontSize:'10px',color:'#444',marginTop:'2px',fontFamily:'monospace'}}>FP: {makeFingerprint(log)}</div>
                      </td>
                      <td>
                        <div className={styles.sysTag} style={{background:'#8c82f2',color:'#fff'}}>{log.userName||'Anonymous'}</div>
                        <div className={styles.subText} style={{marginTop:'4px',lineHeight:'1.6'}}>
                          <strong>Device:</strong> {log.device||'Unknown'}<br/>
                          <strong>OS:</strong> {log.os}<br/>
                          <strong>RAM/CPU:</strong> {log.ramMemory||'N/A'}GB | {log.cpuCores||'N/A'} cores<br/>
                          <strong>Screen:</strong> {log.screenResolution}<br/>
                          <span style={{color:'#f5b942'}}><strong>Battery:</strong> {log.batteryLevel!=null?`${log.batteryLevel}% ${log.batteryCharging?'⚡':'🔋'}`:'Blocked'}</span><br/>
                          <span style={{color:'#00e5ff'}}><strong>Media:</strong> 🎤 {log.microphoneCount||0} | 📷 {log.cameraCount||0}</span>
                        </div>
                      </td>
                      <td>
                        <div className={styles.sysTag} style={{background:'#1a3a2a',color:'#00ff80'}}>📶 {(log.network||'WIFI').toUpperCase()}</div>
                        <div className={styles.subText} style={{lineHeight:'1.6'}}>
                          <strong>Browser:</strong> {log.browserVendor}<br/>
                          <strong>Lang:</strong> {log.language}<br/>
                          <strong>Backspaces:</strong> <span style={{color:'#ff4d4f'}}>{log.backspaceCount||0}</span><br/>
                          <strong>Touch:</strong> {log.touchSupport?'Yes 👆':'No 🖱️'}
                        </div>
                      </td>
                      <td>
                        <div className={styles.tokenTotal}>Tokens: {log.totalTokens||0}</div>
                        <div style={{color:'#00ff80',fontSize:'11px',fontWeight:'700',marginTop:2}}>Cost: ${estimateCost(log).toFixed(5)}</div>
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
        )}

      </main>
      {isMobileMenuOpen && <div className={styles.menuOverlay} onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default Admin;