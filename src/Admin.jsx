import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, orderBy, where, limit, startAfter, doc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import ReactMarkdown from 'react-markdown';
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

  if (!data.length) return <p style={{ color: '#555', textAlign: 'center', padding: '30px 0' }}>Koi data nahi abhi</p>;

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', height: 170, overflow: 'hidden' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}

// ─── ADVANCED CYBER-HUD LOADING SCREEN ───
function LoadingScreen({ message = 'System Initializing...' }) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Establishing secure connection...');

  useEffect(() => {
    const statuses = [
      "Bypassing security protocols...",
      "Decrypting neural pathways...",
      "Syncing global nodes...",
      "Fetching God-Mode analytics...",
      "Loading Aivox Core Engine..."
    ];
    let idx = 0;

    const pInt = setInterval(() => {
      setProgress(prev => {
        const next = prev + (Math.random() * 8);
        return next >= 99 ? 99 : next;
      });
    }, 200);

    const sInt = setInterval(() => {
      idx = (idx + 1) % statuses.length;
      setStatusText(statuses[idx]);
    }, 800);

    return () => { clearInterval(pInt); clearInterval(sInt); };
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05050a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 99999, overflow: 'hidden', fontFamily: '"Inter", monospace' }}>
      <style>{`
        @keyframes coreSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        @keyframes coreSpinRev { 0% { transform: rotate(360deg); } 100% { transform: rotate(0deg); } }
        @keyframes pulseRing { 0%, 100% { transform: scale(0.95); opacity: 0.5; } 50% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 35px rgba(0, 229, 255, 0.6); } }
        @keyframes floatUp { 0% { transform: translateY(100vh) scale(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateY(-10vh) scale(1.5); opacity: 0; } }
        @keyframes textFlicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        .cyber-particle { position: absolute; background: #00e5ff; border-radius: 50%; box-shadow: 0 0 12px #00e5ff; }
      `}</style>

      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(140, 130, 242, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(140, 130, 242, 0.04) 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      <div style={{ position: 'absolute', width: '50vw', height: '50vw', background: 'radial-gradient(circle, rgba(140,130,242,0.15) 0%, transparent 60%)', filter: 'blur(60px)', animation: 'pulseRing 4s infinite alternate' }}></div>

      {[...Array(20)].map((_, i) => (
        <div key={i} className="cyber-particle" style={{ left: `${Math.random() * 100}vw`, width: `${Math.random() * 4 + 1}px`, height: `${Math.random() * 4 + 1}px`, animation: `floatUp ${Math.random() * 3 + 2}s linear infinite`, animationDelay: `${Math.random() * 2}s` }}></div>
      ))}

      <div style={{ position: 'relative', width: 240, height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 40 }}>
        <svg viewBox="0 0 200 200" style={{ position: 'absolute', width: '100%', height: '100%', animation: 'coreSpin 12s linear infinite' }}>
          <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(140, 130, 242, 0.4)" strokeWidth="2" strokeDasharray="4 8" />
          <circle cx="100" cy="100" r="95" fill="none" stroke="#00e5ff" strokeWidth="3" strokeDasharray="40 250" strokeLinecap="round" />
        </svg>
        <svg viewBox="0 0 200 200" style={{ position: 'absolute', width: '80%', height: '80%', animation: 'coreSpinRev 8s linear infinite' }}>
          <circle cx="100" cy="100" r="85" fill="none" stroke="#8c82f2" strokeWidth="5" strokeDasharray="50 40 20 40" opacity="0.8" />
        </svg>
        <div style={{ position: 'absolute', width: '55%', height: '55%', background: 'linear-gradient(135deg, rgba(140,130,242,0.2), rgba(0,229,255,0.2))', border: '2px solid #00e5ff', borderRadius: '50%', animation: 'pulseRing 2s infinite', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(5px)' }}>
           <svg viewBox="0 0 24 24" width="45" height="45" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" style={{ filter: 'drop-shadow(0 0 10px #fff)' }}>
             <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
             <polyline points="2 17 12 22 22 17"></polyline>
             <polyline points="2 12 12 17 22 12"></polyline>
           </svg>
        </div>
      </div>

      <div style={{ zIndex: 10, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, background: 'linear-gradient(90deg, #8c82f2, #00e5ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 5, textTransform: 'uppercase', animation: 'textFlicker 3s infinite' }}>
          {message}
        </h1>
        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(0,0,0,0.5)', padding: '8px 24px', borderRadius: 30, border: '1px solid rgba(0,229,255,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#00ff80', boxShadow: '0 0 12px #00ff80', animation: 'textFlicker 1s infinite' }}></div>
          <span style={{ color: '#00e5ff', fontSize: 13, letterSpacing: 1 }}>{statusText}</span>
        </div>
        <div style={{ marginTop: 35, width: 320, height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #8c82f2, #00e5ff, #fff)', borderRadius: 10, transition: 'width 0.3s ease', boxShadow: '0 0 20px #00e5ff' }}></div>
        </div>
        <div style={{ marginTop: 12, color: '#8a8d9e', fontSize: 12, letterSpacing: 3 }}>SYS_LOAD: {Math.floor(progress)}%</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: DATE & TIME HELPERS (User Accounts)
// ═══════════════════════════════════════════════════════════
const toDateObj = (v) => {
  if (v === null || v === undefined || v === '') return null;
  let d = null;
  if (v instanceof Date) d = v;
  else if (typeof v.toDate === 'function') d = v.toDate();                              // Firestore Timestamp
  else if (typeof v === 'object' && typeof v.seconds === 'number') d = new Date(v.seconds * 1000);
  else if (typeof v === 'object' && typeof v._seconds === 'number') d = new Date(v._seconds * 1000);
  else if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
  else if (typeof v === 'string' && /^\d{10,13}$/.test(v)) { const n = Number(v); d = new Date(n < 1e12 ? n * 1000 : n); }
  else d = new Date(v);
  return d && !isNaN(d.getTime()) ? d : null;
};

// Signup / last-login field names jo aksar Firestore users docs mein hote hain
const getJoinedValue = (u) => u.createdAt ?? u.created_at ?? u.joinedAt ?? u.joined ?? u.registeredAt ?? u.signupAt ?? u.signupTime ?? u.timestamp ?? u.metadata?.creationTime ?? null;
const getLastLoginValue = (u) => u.lastLogin ?? u.lastLoginAt ?? u.last_login ?? u.lastSignInTime ?? u.lastActive ?? u.metadata?.lastSignInTime ?? null;

function DateTimeCell({ value, note }) {
  const d = toDateObj(value);
  if (!d) return <span style={{ color: '#555', fontSize: 12 }}>N/A</span>;
  return (
    <div style={{ lineHeight: 1.5, whiteSpace: 'nowrap' }}>
      <div style={{ color: '#e6e6fa', fontSize: 12, fontWeight: 600 }}>
        {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>
      <div style={{ color: '#8a8d9e', fontSize: 11 }}>
        {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
        {note ? <span style={{ color: '#6a6b8c' }}> • {note}</span> : null}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: SMALL UI PIECES (icons, copy helper)
// ═══════════════════════════════════════════════════════════
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) { return false; }
  }
};

const ICON_PATHS = {
  expand:   <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>,
  collapse: <><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></>,
  trash:    <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></>,
  copy:     <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  message:  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  check:    <polyline points="20 6 9 17 4 12"/>,
  alert:    <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
  // ── navigation / actions ──
  refresh:      <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
  arrowLeft:    <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>,
  chevronDown:  <polyline points="6 9 12 15 18 9"/>,
  chevronUp:    <polyline points="18 15 12 9 6 15"/>,
  chevronsDown: <><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></>,
  close:        <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  pause:        <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
  download:     <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  printer:      <><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>,
  calendar:     <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  edit:         <><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>,
  lock:         <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  key:          <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>,
  ban:          <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>,
  // ── sections ──
  overview:     <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  search:       <><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
  sparkles:     <><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z"/></>,
  users:        <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  fingerprint:  <><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></>,
  layers:       <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></>,
  grid:         <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
  zap:          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
  trendingUp:   <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></>,
  alertTriangle:<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  terminal:     <><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>,
  cloud:        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>,
  smartphone:   <><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></>,
  monitor:      <><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></>,
  cpu:          <><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></>,
  globe:        <><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  wifi:         <><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>,
  flame:        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>,
  dollar:       <><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>,
  fileText:     <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>,
  settings:     <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  eyeOff:       <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>,
  image:        <><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  heart:        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>,
  mic:          <><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></>,
  camera:       <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
  battery:      <><rect x="1" y="6" width="18" height="12" rx="2" ry="2"/><line x1="23" y1="13" x2="23" y2="11"/></>,
  award:        <><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></>,
  checkCircle:  <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>,
  xCircle:      <><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></>,
};

function Icon({ name, size = 18, spin = false }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" aria-hidden="true"
      style={spin ? { flexShrink: 0, animation: 'uiSpin 0.8s linear infinite' } : { flexShrink: 0 }}>
      {ICON_PATHS[name]}
    </svg>
  );
}

// Page title ke aage icon (h1 ke andar)
function TitleIcon({ name, size = 26 }) {
  return <span style={{ display: 'inline-flex', verticalAlign: '-4px', marginRight: 10, color: '#8c82f2' }}><Icon name={name} size={size} /></span>;
}

// Text ke beech chhota inline icon
function InlineIcon({ name, size = 14, color, style }) {
  return <span style={{ display: 'inline-flex', verticalAlign: '-2px', marginRight: 6, color, ...style }}><Icon name={name} size={size} /></span>;
}

// Device icon (OS ke hisaab se)
function OsIcon({ os, size = 18 }) {
  const t = os || '';
  return <Icon name={(t.includes('Android') || t.includes('iOS')) ? 'smartphone' : 'monitor'} size={size} />;
}

function IconButton({ title, onClick, tone = 'default', children, size = 36 }) {
  const [hover, setHover] = useState(false);
  const danger = tone === 'danger';
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, cursor: 'pointer', borderRadius: 10, padding: 0,
        color: danger ? '#ff6b6d' : '#cdd6f4',
        background: hover ? (danger ? 'rgba(255,77,79,0.2)' : 'rgba(140,130,242,0.22)') : (danger ? 'rgba(255,77,79,0.08)' : 'rgba(255,255,255,0.05)'),
        border: `1px solid ${hover ? (danger ? 'rgba(255,77,79,0.5)' : 'rgba(140,130,242,0.55)') : (danger ? 'rgba(255,77,79,0.28)' : 'rgba(255,255,255,0.1)')}`,
        transition: 'background 0.15s ease, border-color 0.15s ease'
      }}>
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: UI HOST — confirm popup + loader, message action sheet, toast
// Imperative (ref) so popups open/close WITHOUT re-rendering the heavy Admin page => lag free.
// ═══════════════════════════════════════════════════════════
const UI_KEYFRAMES = `
  @keyframes uiFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes uiPop { from { opacity: 0; transform: translateY(10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
  @keyframes uiSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes uiSpin { to { transform: rotate(360deg); } }
  @keyframes uiBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
  @keyframes uiToast { from { opacity: 0; transform: translate(-50%, 14px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes fsChatIn { from { opacity: 0; } to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .ui-motion { animation: none !important; } }
`;

const UiHost = forwardRef(function UiHost(_props, ref) {
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const openedAt = useRef(0);
  const busyRef = useRef(false);
  const toastTimer = useRef(null);

  const showToast = useCallback((text, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ text, type, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useImperativeHandle(ref, () => ({
    confirm: (opts) => {
      openedAt.current = Date.now();
      busyRef.current = false;
      setBusy(false);
      setDialogError('');
      setDialog(opts);
    },
    sheet: (opts) => {
      openedAt.current = Date.now();
      setSheet(opts);
    },
    toast: showToast,
  }), [showToast]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const closeDialog = useCallback(() => { if (!busyRef.current) setDialog(null); }, []);
  const closeSheet = useCallback(() => setSheet(null), []);

  // Esc key closes popups (capture so it doesn't also exit full screen chat)
  useEffect(() => {
    if (!dialog && !sheet) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (dialog) closeDialog(); else closeSheet();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog, sheet, closeDialog, closeSheet]);

  // Long-press ke baad aane wale phantom tap ko ignore karne ke liye
  const guard = () => Date.now() - openedAt.current < 350;

  const runConfirm = async () => {
    if (!dialog || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setDialogError('');
    try {
      await dialog.onConfirm();
      setDialog(null);
      if (dialog.successMsg) showToast(dialog.successMsg, 'success');
    } catch (err) {
      console.error('Delete failed:', err);
      setDialogError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (typeof document === 'undefined') return null;
  const wide = typeof window !== 'undefined' && window.innerWidth > 600;

  return createPortal(
    <>
      <style>{UI_KEYFRAMES}</style>

      {/* ───── MESSAGE ACTION SHEET (long press) ───── */}
      {sheet && (
        <div onClick={() => { if (!guard()) closeSheet(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000000, background: 'rgba(5,5,10,0.65)', display: 'flex', alignItems: wide ? 'center' : 'flex-end', justifyContent: 'center', padding: wide ? 16 : 0, animation: 'uiFade 0.18s ease' }}>
          <div className="ui-motion" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: '#151426', border: '1px solid #2a2a40', borderRadius: wide ? 20 : '20px 20px 0 0', padding: '12px 14px calc(14px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -10px 40px rgba(0,0,0,0.5)', animation: wide ? 'uiPop 0.2s ease' : 'uiSlideUp 0.24s cubic-bezier(0.2, 0.8, 0.2, 1)' }}>
            {!wide && <div style={{ width: 38, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.18)', margin: '0 auto 12px' }} />}
            <div style={{ padding: '2px 4px 10px' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>{sheet.title}</div>
              {sheet.meta && <div style={{ color: '#6a6b8c', fontSize: 11, marginTop: 3 }}>{sheet.meta}</div>}
            </div>
            {sheet.preview && (
              <div style={{ background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '9px 12px', marginBottom: 10, color: '#aab0c8', fontSize: 12.5, fontStyle: 'italic', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' }}>
                {sheet.preview}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sheet.actions.map((a, i) => {
                const danger = a.tone === 'danger';
                return (
                  <button key={i} type="button"
                    onClick={() => { if (guard()) return; setSheet(null); if (a.onClick) a.onClick(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700, textAlign: 'left',
                      color: danger ? '#ff6b6d' : '#e6e6fa',
                      background: danger ? 'rgba(255,77,79,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${danger ? 'rgba(255,77,79,0.3)' : 'rgba(255,255,255,0.07)'}` }}>
                    <span style={{ display: 'flex' }}><Icon name={a.icon} size={18} /></span>
                    {a.label}
                  </button>
                );
              })}
              <button type="button" onClick={() => { if (!guard()) closeSheet(); }}
                style={{ width: '100%', padding: '12px', marginTop: 2, borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#8a8d9e', background: 'transparent', border: '1px solid transparent' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── CONFIRM POPUP (with loader) ───── */}
      {dialog && (
        <div onClick={() => { if (!guard()) closeDialog(); }}
          style={{ position: 'fixed', inset: 0, zIndex: 10000001, background: 'rgba(5,5,10,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'uiFade 0.18s ease' }}>
          <div className="ui-motion" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 400, background: '#151426', border: '1px solid #2a2a40', borderRadius: 18, padding: '24px 22px 20px', boxShadow: '0 24px 60px rgba(0,0,0,0.55)', animation: 'uiPop 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.1)' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4f', background: 'rgba(255,77,79,0.12)', border: '1px solid rgba(255,77,79,0.35)' }}>
              <Icon name="trash" size={24} />
            </div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 18, textAlign: 'center' }}>{dialog.title}</div>
            <div style={{ color: '#9a9cb5', fontSize: 13.5, lineHeight: 1.55, textAlign: 'center', marginTop: 8 }}>{dialog.message}</div>

            {dialog.details && dialog.details.length > 0 && (
              <div style={{ marginTop: 14, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dialog.details.map((line, i) => (
                  <div key={i} style={{ color: '#cdd6f4', fontSize: 12.5, wordBreak: 'break-word', lineHeight: 1.45 }}>{line}</div>
                ))}
              </div>
            )}

            {busy && (
              <div style={{ marginTop: 14 }}>
                <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                  <div className="ui-motion" style={{ width: '35%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #8c82f2, #00e5ff)', animation: 'uiBar 1s ease-in-out infinite' }} />
                </div>
                <div style={{ color: '#8a8d9e', fontSize: 11, textAlign: 'center', marginTop: 6 }}>Please wait, deleting…</div>
              </div>
            )}

            {dialogError && (
              <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(255,77,79,0.1)', border: '1px solid rgba(255,77,79,0.3)', borderRadius: 10, padding: '9px 12px', color: '#ff8a8c', fontSize: 12, lineHeight: 1.45, wordBreak: 'break-word' }}>
                <span style={{ display: 'flex', marginTop: 1, flexShrink: 0 }}><Icon name="alert" size={15} /></span>
                <span>{dialogError}</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" autoFocus disabled={busy} onClick={() => { if (!guard()) closeDialog(); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#cdd6f4', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
                Cancel
              </button>
              <button type="button" disabled={busy} onClick={() => { if (guard()) return; runConfirm(); }}
                style={{ flex: 1.2, padding: '12px', borderRadius: 12, fontSize: 14, fontWeight: 800, color: '#fff', background: busy ? '#a33a3c' : '#ff4d4f', border: 'none', cursor: busy ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {busy
                  ? (<><span className="ui-motion" style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'uiSpin 0.7s linear infinite' }} />Deleting…</>)
                  : (dialogError ? 'Retry' : (dialog.confirmText || 'Delete'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── TOAST ───── */}
      {toast && (
        <div key={toast.id} className="ui-motion"
          style={{ position: 'fixed', left: '50%', bottom: 'calc(26px + env(safe-area-inset-bottom, 0px))', transform: 'translateX(-50%)', zIndex: 10000002, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 30, fontSize: 13, fontWeight: 700, maxWidth: '90vw',
            color: toast.type === 'error' ? '#ff8a8c' : '#00ff80',
            background: toast.type === 'error' ? '#2a1618' : '#10261c',
            border: `1px solid ${toast.type === 'error' ? 'rgba(255,77,79,0.4)' : 'rgba(0,255,128,0.35)'}`,
            boxShadow: '0 10px 30px rgba(0,0,0,0.45)', animation: 'uiToast 0.22s ease' }}>
          <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={16} />
          <span>{toast.text}</span>
        </div>
      )}
    </>,
    document.body
  );
});

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: CHAT PAIR (one prompt + AI reply) — memoized, supports LONG PRESS / right-click menu
// Markup is the same as before; only the long-press handlers were added.
// ═══════════════════════════════════════════════════════════
const IS_TOUCH_DEVICE = typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

const extractText = (child) => {
  if (typeof child === 'string') return child;
  if (Array.isArray(child)) return child.map(extractText).join('');
  if (child && child.props && child.props.children) return extractText(child.props.children);
  return '';
};

function MarkdownPre({ node, children, ...props }) {
  const codeString = extractText(children);

  return (
    <div style={{ background: '#0b0a14', borderRadius: '10px', border: '1px solid #2a2a40', overflow: 'hidden', margin: '12px 0', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#151426', padding: '6px 12px', borderBottom: '1px solid #2a2a40' }}>
        <span style={{ fontSize: '10px', color: '#8a8d9e', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Terminal / Code</span>
        <button
          onClick={() => { navigator.clipboard.writeText(codeString); alert("Code Copied!"); }}
          style={{ background: 'transparent', border: 'none', color: '#8c82f2', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', padding: 0 }}
        >
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
      <pre {...props} style={{ margin: 0, padding: '12px', background: 'transparent', overflowX: 'auto', fontSize: '12px', color: '#cdd6f4' }}>
        {children}
      </pre>
    </div>
  );
}

const markdownComponents = { pre: MarkdownPre };

const ChatPair = memo(function ChatPair({ log, showSentAs, onImageClick, onOpenMenu, onMediaLoad }) {
  const timerRef = useRef(null);
  const startRef = useRef({ x: 0, y: 0 });
  const firedRef = useRef(false);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const cancel = () => { clearTimeout(timerRef.current); timerRef.current = null; };
  const begin = (x, y) => {
    cancel();
    firedRef.current = false;
    startRef.current = { x, y };
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      firedRef.current = true;
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* ignore */ }
      onOpenMenu(log);
    }, 520);
  };
  const moved = (x, y, limit) => Math.abs(x - startRef.current.x) > limit || Math.abs(y - startRef.current.y) > limit;

  const pressHandlers = {
    // Touch (mobile) — long press, scroll karne par cancel
    onTouchStart: (e) => { const t = e.touches[0]; if (t) begin(t.clientX, t.clientY); },
    onTouchMove: (e) => { const t = e.touches[0]; if (t && moved(t.clientX, t.clientY, 10)) cancel(); },
    onTouchEnd: (e) => { cancel(); if (firedRef.current && e.cancelable) e.preventDefault(); },
    onTouchCancel: cancel,
    // Mouse (desktop) — press & hold ya right-click
    onMouseDown: (e) => { if (e.button === 0 && !IS_TOUCH_DEVICE) begin(e.clientX, e.clientY); },
    onMouseMove: (e) => { if (timerRef.current && moved(e.clientX, e.clientY, 6)) cancel(); },
    onMouseUp: cancel,
    onMouseLeave: cancel,
    onContextMenu: (e) => {
      e.preventDefault();
      cancel();
      if (!firedRef.current) { firedRef.current = true; onOpenMenu(log); }
    },
    // Long press ke baad image/link ka accidental click na chale
    onClickCapture: (e) => {
      if (firedRef.current) { e.preventDefault(); e.stopPropagation(); firedRef.current = false; }
    },
  };

  const isLove = log.isLoveMsg || log.activeMode === 'lover_girl' || log.activeMode === 'lover_boy' || log.activeEgo === 'lover_girl' || log.activeEgo === 'lover_boy';
  const isRoast = log.isRoasterMode && !isLove;

  let loveLabel = null;
  if (isLove) {
    if (log.activeMode === 'lover_girl' || log.activeEgo === 'lover_girl') loveLabel = 'GF';
    else if (log.activeMode === 'lover_boy' || log.activeEgo === 'lover_boy') loveLabel = 'BF';
    else loveLabel = 'LOVE';
  }

  return (
    <div className={styles.chatPair} {...pressHandlers}
      style={IS_TOUCH_DEVICE ? { WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } : undefined}>
      {/* USER MESSAGE ROW */}
      <div className={`${styles.bubbleRow} ${styles.rowUser}`}>
        <div className={`${styles.chatBubble} ${styles.bubbleUser}`}>

          {/* 🔥 ADMIN: SHOW WHICH NAME WAS USED FOR THIS SPECIFIC MESSAGE 🔥 */}
          {showSentAs && (
            <div style={{ fontSize: '10px', color: '#f5b942', marginBottom: '6px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Icon name="edit" size={11} /> Sent as: {log.userName}
            </div>
          )}

          {/* 🔥 ADMIN IMAGE VIEWER: ZOOM ON CLICK 🔥 */}
          {log.attachedImage && (
            <div style={{ marginBottom: log.prompt ? '12px' : '0' }}>
              <img
                src={log.attachedImage}
                alt="User Uploaded"
                onClick={() => onImageClick(log.attachedImage)}
                onLoad={onMediaLoad}
                style={{
                  maxWidth: '100%',
                  maxHeight: '200px',
                  borderRadius: '8px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                  display: 'block',
                  cursor: 'zoom-in'
                }}
              />
            </div>
          )}

          <div style={{ whiteSpace: 'pre-wrap' }}>{log.prompt}</div>
          <span className={styles.bubbleTime}>
            {new Date(log.timestamp).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}
            {' '}
            {new Date(log.timestamp).toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12: true })}
          </span>
        </div>
      </div>

      {/* AI MESSAGE ROW */}
      <div className={`${styles.bubbleRow} ${styles.rowAi}`}>
        <div className={styles.chatAvatarWrapper}><img src="/logo.svg" alt="AI" className={styles.aiSmallAvatar}/></div>

        <div className={`${styles.chatBubble} ${styles.bubbleAi} ${isRoast ? styles.bubbleRoast : ''} ${isLove ? styles.bubbleLove : ''}`}>

          {loveLabel && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', fontWeight: '900', color: '#ff1493', background: 'rgba(255, 20, 147, 0.15)', padding: '2px 7px', borderRadius: '5px', marginBottom: '6px', border: '1px solid rgba(255, 20, 147, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <Icon name="heart" size={10} />{loveLabel}
            </div>
          )}

          <div className={styles.markdownBody}>
            <ReactMarkdown components={markdownComponents}>
              {log.response}
            </ReactMarkdown>
          </div>

          <div className={styles.bubbleFooter}>
            <span className={styles.bubbleModel}>{log.model}</span>
            <span className={styles.bubbleTime}>{((log.responseTimeMs||0)/1000).toFixed(1)}s • {log.totalTokens||0} tok • ${estimateCost(log).toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: LAZY LOADING — har section sirf utna hi data laata hai jitni zarurat ho
//   logs / chatlist / unsent = paged (pehle ek page, baaki scroll ya "Load more" par)
//   users = chhoti collection, ek baar poori
// Ek baar fetch hone ke baad data cache rehta hai (tab badalne par dobara fetch nahi hota).
// ═══════════════════════════════════════════════════════════
const PAGE_SIZE = { logs: 500, chatlist: 300, unsent: 50 };
const PAGED_COLLECTION = { logs: 'aivox_tracking', chatlist: 'aivox_tracking', unsent: 'aivox_unsent_prompts' };

const fetchPage = async (name, cursor) => {
  const size = PAGE_SIZE[name];
  const col = collection(db, PAGED_COLLECTION[name]);
  const q = cursor
    ? query(col, orderBy("timestamp", "desc"), startAfter(cursor), limit(size))
    : query(col, orderBy("timestamp", "desc"), limit(size));
  const snap = await getDocs(q);
  return {
    items: snap.docs.map(d => ({ id: d.id, ...d.data() })),
    lastDoc: snap.docs.length ? snap.docs[snap.docs.length - 1] : cursor,
    hasMore: snap.docs.length === size,
  };
};

const fetchUsers = async () => {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};

const tsOf = (l) => { const t = new Date(l.timestamp).getTime(); return isNaN(t) ? 0 : t; };
const appendUnique = (prev, items) => { const seen = new Set(prev.map(l => l.id)); return [...prev, ...items.filter(l => !seen.has(l.id))]; };
const mergeSorted = (prev, items) => {
  const map = new Map(prev.map(l => [l.id, l]));
  items.forEach(l => map.set(l.id, l));
  return Array.from(map.values()).sort((a, b) => tsOf(b) - tsOf(a));
};

// Kis tab ko kaun sa data chahiye (yahi se decide hota hai kya fetch hoga)
const TAB_DATA = {
  overview: ['logs'],
  chats: ['chatlist'],            // sirf user list ka pehla page; user ki poori chat click par alag se aati hai
  search: ['logs'],
  features: ['logs', 'unsent'],
  usermanagement: ['users'],      // + saare logs sirf tab, jab kisi user ki join/last-login date na ho (fallback)
  fingerprint: ['logs'],
  depth: ['logs'],
  heatmap: ['logs'],
  performance: ['logs'],
  quality: ['logs'],
  errors: ['logs'],
  prompts: ['logs', 'unsent'],
  wordcloud: ['logs'],
  devices: ['logs'],
  hardware: ['logs'],
  geography: ['logs'],
  network: ['logs'],
  roaster: ['logs'],
  economics: ['logs'],
  report: ['logs'],
  system: ['logs'],
};

const TAB_LABELS = {
  overview: 'Overview', chats: 'User Chats', search: 'Live Search', features: 'God-Mode Stats',
  usermanagement: 'User Accounts', fingerprint: 'Fingerprints', depth: 'Conversation Depth', heatmap: 'Hour Heatmap',
  performance: 'AI Performance', quality: 'Quality Meter', errors: 'Error Monitor', prompts: 'Prompt Intel', wordcloud: 'Word Cloud',
  devices: 'Devices', hardware: 'HW Leaderboard', geography: 'Geo & Locale', network: 'Network',
  roaster: 'Roaster', economics: 'Token Economics', report: 'Analytics Report', system: 'System Logs',
};

const datasetsForTab = (tab) => TAB_DATA[tab] || [];

// Section load / error state (shell + sidebar hamesha dikhta rehta hai, sirf content area mein ye aata hai)
function SectionState({ label, error, onRetry, padLeft }) {
  return (
    <div style={padLeft}>
      <style>{`
        @keyframes secSpin { to { transform: rotate(360deg); } }
        @keyframes secBar { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
        @media (prefers-reduced-motion: reduce) { .sec-motion { animation: none !important; } }
      `}</style>
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: '40px 20px' }}>
        {error ? (
          <>
            <div style={{ width: 54, height: 54, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff6b6d', background: 'rgba(255,77,79,0.12)', border: '1px solid rgba(255,77,79,0.35)' }}>
              <Icon name="alert" size={24} />
            </div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: 17 }}>{label} load nahi ho paya</div>
            <div style={{ color: '#8a8d9e', fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>Network ya permission ka issue ho sakta hai. Dobara try karo.</div>
            <button type="button" onClick={onRetry}
              style={{ marginTop: 6, padding: '11px 24px', borderRadius: 12, border: 'none', background: '#8c82f2', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Icon name="refresh" size={15} /> Retry
            </button>
          </>
        ) : (
          <>
            <div className="sec-motion" style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(140,130,242,0.2)', borderTopColor: '#8c82f2', borderRightColor: '#00e5ff', animation: 'secSpin 0.8s linear infinite' }} />
            <div style={{ color: '#e6e6fa', fontWeight: 700, fontSize: 15 }}>Loading {label}…</div>
            <div style={{ width: 180, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div className="sec-motion" style={{ width: '35%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #8c82f2, #00e5ff)', animation: 'secBar 1s ease-in-out infinite' }} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: CHAT GROUPS builder (same alias-merge logic, ab function ke roop mein)
// ═══════════════════════════════════════════════════════════
const buildChatGroups = (logsArr) => logsArr.reduce((groups, log) => {
  const fp = makeFingerprint(log);
  const uName = log.userName || "Anonymous";
  
  let matchedGroupId = null;

  for (const key in groups) {
    if (groups[key].id === fp) {
      const existingName = groups[key].userName.toLowerCase();
      const currentName = uName.toLowerCase();
      
      // Base first names match check (e.g. "meena" matches "meena kumari")
      const existingFirst = existingName.split(' ')[0];
      const currentFirst = currentName.split(' ')[0];

      // Merge ONLY if First Name is same OR it's an anonymous/guest fallback
      // This ensures "Nadeem" and "Prachi" stay separate on the same device!
      if (
        existingFirst === currentFirst ||
        existingName === "anonymous" || existingName === "user" || existingName.includes("guest") ||
        currentName === "anonymous" || currentName === "user" || currentName.includes("guest")
      ) {
        matchedGroupId = key;
        break;
      }
    }
  }

  const groupId = matchedGroupId || `${uName}_${fp}`;

  if (!groups[groupId]) {
    groups[groupId] = { 
      id: fp,
      gid: groupId, 
      userName: uName, 
      aliases: [uName], // Array to store name history!
      device: log.device||"Unknown", 
      os: log.os||"Unknown", 
      browser: log.browserVendor||"Unknown", 
      network: log.network||"WIFI", 
      messages: [] 
    };
  } else {
    // Add to aliases if this is a new name for this session
    if (!groups[groupId].aliases.includes(uName)) {
      groups[groupId].aliases.push(uName);
    }
    
    // Upgrade Main Name: Always prefer the longer/real name (e.g., 'meena' -> 'meena kumari')
    const currentGroupLen = groups[groupId].userName.length;
    if (uName !== "Anonymous" && uName !== "User" && !uName.toLowerCase().includes("guest") && uName.length > currentGroupLen) {
      groups[groupId].userName = uName;
    }
  }

  groups[groupId].messages.push(log);
  return groups;
}, {});;

// "Load more" button (chat list, vault, system logs)
function LoadMoreButton({ onClick, loading, children }) {
  return (
    <div style={{ textAlign: 'center', padding: '16px 0 4px' }}>
      <button type="button" onClick={onClick} disabled={loading}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, border: '1px solid rgba(140,130,242,0.45)', background: 'rgba(140,130,242,0.14)', color: '#e6e6fa', fontWeight: 700, fontSize: 13, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
        <Icon name={loading ? 'refresh' : 'chevronDown'} size={15} spin={loading} />
        {loading ? 'Loading…' : children}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// 🆕 NEW: CHAT MESSAGES PANE
//  - sabse nayi 30 messages pehle, upar scroll karne par purane messages thode-thode aate hain
//  - niche ek arrow button: ek click mein smoothly latest message tak
//  - scroll position purane messages load hone par apni jagah rehti hai
// ═══════════════════════════════════════════════════════════
const CHAT_WINDOW = 30;

function ChatMessagesPane({ user, className, style, onImageClick, onOpenMenu, loadingFull, loadError, onRetry }) {
  const scrollRef = useRef(null);
  const stickRef = useRef(true);          // user bottom ke paas hai? (naya message aaye toh bottom par hi rahe)
  const anchorRef = useRef(0);            // bottom se distance (purane messages prepend hone par position bachane ke liye)
  const firstIdRef = useRef(null);
  const pendingOlderRef = useRef(false);
  const [visible, setVisible] = useState(CHAT_WINDOW);
  const [showArrow, setShowArrow] = useState(false);

  const total = user.messages.length;
  const shown = Math.min(visible, total);
  const hasOlder = shown < total;
  // user.messages newest-first hai; screen par oldest -> newest dikhana hai
  const slice = useMemo(() => user.messages.slice(0, shown).reverse(), [user.messages, shown]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const firstId = slice.length ? slice[0].id : null;
    const prevFirstIdx = firstIdRef.current ? slice.findIndex(l => l.id === firstIdRef.current) : -1;
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (prevFirstIdx > 0) {
      // purane messages upar add hue — jahan padh rahe the wahin rakho
      el.scrollTop = el.scrollHeight - anchorRef.current;
    }
    firstIdRef.current = firstId;
    anchorRef.current = el.scrollHeight - el.scrollTop;
    pendingOlderRef.current = false;
  }, [slice]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = dist < 80;
    anchorRef.current = el.scrollHeight - el.scrollTop;
    const wantArrow = dist > 260;
    setShowArrow(prev => (prev === wantArrow ? prev : wantArrow));
    if (el.scrollTop < 80 && hasOlder && !pendingOlderRef.current) {
      pendingOlderRef.current = true;
      setVisible(v => v + CHAT_WINDOW);
    }
  };

  const loadOlder = () => {
    const el = scrollRef.current;
    if (el) anchorRef.current = el.scrollHeight - el.scrollTop;
    stickRef.current = false;
    pendingOlderRef.current = true;
    setVisible(v => v + CHAT_WINDOW);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    // images load hone se height badh sakti hai — ek baar aur check
    setTimeout(() => {
      const e = scrollRef.current;
      if (e && e.scrollHeight - e.scrollTop - e.clientHeight > 4) e.scrollTo({ top: e.scrollHeight, behavior: 'smooth' });
    }, 420);
  };

  const handleMediaLoad = useCallback(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  const chipStyle = { pointerEvents: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 14px', borderRadius: 30, fontSize: 12, fontWeight: 700, background: '#151426', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' };

  return (
    <div ref={scrollRef} className={className} style={style} onScroll={handleScroll}>
      {(loadingFull || loadError) && (
        <div style={{ position: 'sticky', top: 8, height: 0, zIndex: 6, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          {loadError ? (
            <div style={{ ...chipStyle, color: '#ff8a8c', border: '1px solid rgba(255,77,79,0.4)' }}>
              <Icon name="alert" size={14} />
              <span>Poori chat load nahi hui</span>
              <button type="button" onClick={onRetry}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,77,79,0.18)', border: 'none', borderRadius: 20, color: '#ffb3b5', fontWeight: 800, fontSize: 11, padding: '4px 10px', cursor: 'pointer' }}>
                <Icon name="refresh" size={12} /> Retry
              </button>
            </div>
          ) : (
            <div style={{ ...chipStyle, color: '#cdd6f4', border: '1px solid rgba(140,130,242,0.45)' }}>
              <Icon name="refresh" size={14} spin />
              <span>Loading full chat…</span>
            </div>
          )}
        </div>
      )}

      {hasOlder && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <button type="button" onClick={loadOlder}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#aab0c8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            <Icon name="chevronUp" size={14} /> Older messages ({total - shown} more)
          </button>
        </div>
      )}

      {slice.map(log => (
        <ChatPair
          key={log.id}
          log={log}
          showSentAs={!!(user.aliases && user.aliases.length > 1 && log.userName !== user.userName)}
          onImageClick={onImageClick}
          onOpenMenu={onOpenMenu}
          onMediaLoad={handleMediaLoad}
        />
      ))}

      {showArrow && (
        <div style={{ position: 'sticky', bottom: 14, height: 0, zIndex: 6, pointerEvents: 'none' }}>
          <button type="button" onClick={scrollToBottom} title="Latest message par jao" aria-label="Scroll to latest message"
            className="ui-motion"
            style={{ position: 'absolute', right: 14, bottom: 0, width: 42, height: 42, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', pointerEvents: 'auto', color: '#fff', border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(135deg, #8c82f2, #7063f4)', boxShadow: '0 8px 22px rgba(112,99,244,0.5)', animation: 'uiPop 0.18s ease' }}>
            <Icon name="chevronsDown" size={20} />
          </button>
        </div>
      )}
    </div>
  );
}

// Analytics tabs: sirf latest events load hue hain — poora history ek click mein
function LogsWindowPill({ count, hasMore, busy, onLoadAll }) {
  if (!hasMore && !busy) return null;
  return (
    <div style={{ position: 'fixed', right: 16, bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))', zIndex: 60, display: 'flex', alignItems: 'center', gap: 10, padding: '7px 7px 7px 14px', borderRadius: 30, background: '#151426', border: '1px solid rgba(140,130,242,0.4)', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', fontSize: 12, color: '#aab0c8', maxWidth: 'calc(100vw - 32px)' }}>
      <span>Latest <strong style={{ color: '#fff' }}>{count.toLocaleString()}</strong> events</span>
      <button type="button" onClick={onLoadAll} disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 20, border: 'none', background: '#8c82f2', color: '#fff', fontWeight: 800, fontSize: 12, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.8 : 1 }}>
        <Icon name={busy ? 'refresh' : 'download'} size={13} spin={busy} />
        {busy ? 'Loading…' : 'Load all'}
      </button>
    </div>
  );
}

// ─── MAIN COMPONENT ───
function Admin() {
  const [logs, setLogs] = useState([]);               // analytics logs (paged)
  const [chatLogs, setChatLogs] = useState([]);       // chats tab: user list pages + khule hue users ki poori chat
  const [loading, setLoading] = useState(true); // ab sirf pehli baar ka boot loader (baad mein har section ka apna loader)
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const allowedEmails = ['nadeemxsalar@gmail.com', 'realheronadeem@gmail.com'];

  const [activeTab, setActiveTab] = useState('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);
  const [isDesktop, setIsDesktop] = useState(true);
  const [selectedGid, setSelectedGid] = useState(null);   // chats tab: kaun sa user khula hai
  const [isMobileChatView, setIsMobileChatView] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [unsentPrompts, setUnsentPrompts] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef(null);
  
  // 🔥 IMAGE FULL SCREEN STATE 🔥
  const [fullScreenImage, setFullScreenImage] = useState(null);

  // 🆕 CHAT FULL SCREEN + POPUP HOST (confirm / loader / toast / long-press menu)
  const [isChatFullscreen, setIsChatFullscreen] = useState(false);
  const uiRef = useRef(null);
  const ignorePopRef = useRef(false);

  // 🆕 LAZY LOADING STATE (har dataset ka status: idle / loading / loaded / error)
  const [dataStatus, setDataStatus] = useState({ logs: 'idle', chatlist: 'idle', users: 'idle', unsent: 'idle' });
  const [pager, setPager] = useState({
    logs: { hasMore: false, loadingMore: false },
    chatlist: { hasMore: false, loadingMore: false },
    unsent: { hasMore: false, loadingMore: false },
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [allLogsBusy, setAllLogsBusy] = useState(false);   // "Load all" chal raha hai
  const [openingFp, setOpeningFp] = useState(null);        // jis user ki poori chat abhi fetch ho rahi hai
  const [chatOpenError, setChatOpenError] = useState(null);
  const [systemVisible, setSystemVisible] = useState(50);  // System Logs tab: ek baar mein 50 rows
  const loadedRef = useRef({ logs: false, chatlist: false, users: false, unsent: false });
  const inflightRef = useRef({});
  const moreInflightRef = useRef({});
  const allLogsRef = useRef(null);
  const pagerRef = useRef({
    logs: { cursor: null, hasMore: false },
    chatlist: { cursor: null, hasMore: false },
    unsent: { cursor: null, hasMore: false },
  });
  const fetchedFpRef = useRef(new Set());                  // jin users ki poori chat fetch ho chuki hai
  const chatInflightRef = useRef({});
  const activeTabRef = useRef('overview');
  const selectedGidRef = useRef(null);
  const chatTabGroupsRef = useRef({});
  activeTabRef.current = activeTab;
  selectedGidRef.current = selectedGid;

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

  // 🆕 Dataset load (pehli baar ya refresh). logs / chatlist / unsent = sirf pehla page, users = poori (chhoti) collection.
  // Refresh ke time purana data screen par rehta hai, naya aate hi update ho jata hai (loader nahi aata)
  const loadDataset = useCallback((name, force = false) => {
    if (!isAdmin) return Promise.resolve();
    if (inflightRef.current[name]) return inflightRef.current[name];
    if (!force && loadedRef.current[name]) return Promise.resolve();

    const run = (async () => {
      const wasLoaded = loadedRef.current[name];
      if (!wasLoaded) setDataStatus(prev => ({ ...prev, [name]: 'loading' }));
      try {
        if (name === 'users') {
          setRegisteredUsers(await fetchUsers());
        } else {
          const page = await fetchPage(name, null);
          const setItems = name === 'logs' ? setLogs : name === 'chatlist' ? setChatLogs : setUnsentPrompts;
          if (!wasLoaded) {
            setItems(page.items);
            pagerRef.current[name] = { cursor: page.lastDoc, hasMore: page.hasMore };
            setPager(prev => ({ ...prev, [name]: { hasMore: page.hasMore, loadingMore: false } }));
          } else if (name === 'chatlist') {
            setItems(prev => mergeSorted(prev, page.items));
          } else {
            const ids = new Set(page.items.map(l => l.id));
            setItems(prev => [...page.items, ...prev.filter(l => !ids.has(l.id))]);
          }
        }
        loadedRef.current[name] = true;
        setDataStatus(prev => ({ ...prev, [name]: 'loaded' }));
      } catch (error) {
        console.error(`Error fetching ${name}:`, error);
        if (!loadedRef.current[name]) setDataStatus(prev => ({ ...prev, [name]: 'error' }));
        else uiRef.current?.toast('Refresh nahi ho paya, dobara try karo', 'error');
      } finally {
        setLoading(false);
      }
    })();
    inflightRef.current[name] = run.finally(() => { inflightRef.current[name] = null; });
    return inflightRef.current[name];
  }, [isAdmin]);

  // 🆕 Agla page (scroll / "Load more" par). Resolve hota hai: aur data bacha hai ya nahi
  const loadMore = useCallback((name) => {
    const pg = pagerRef.current[name];
    if (!isAdmin || !pg || !pg.hasMore) return Promise.resolve(false);
    if (moreInflightRef.current[name]) return moreInflightRef.current[name];

    setPager(prev => ({ ...prev, [name]: { ...prev[name], loadingMore: true } }));
    const run = (async () => {
      try {
        const page = await fetchPage(name, pg.cursor);
        pagerRef.current[name] = { cursor: page.lastDoc, hasMore: page.hasMore };
        const setItems = name === 'logs' ? setLogs : name === 'chatlist' ? setChatLogs : setUnsentPrompts;
        setItems(prev => (name === 'chatlist' ? mergeSorted(prev, page.items) : appendUnique(prev, page.items)));
        setPager(prev => ({ ...prev, [name]: { hasMore: page.hasMore, loadingMore: false } }));
        return page.hasMore;
      } catch (error) {
        console.error(`Error loading more ${name}:`, error);
        setPager(prev => ({ ...prev, [name]: { ...prev[name], loadingMore: false } }));
        uiRef.current?.toast('Aur data load nahi ho paya', 'error');
        return false;
      }
    })();
    moreInflightRef.current[name] = run.finally(() => { moreInflightRef.current[name] = null; });
    return moreInflightRef.current[name];
  }, [isAdmin]);

  // 🆕 Poora logs history (analytics tabs ka "Load all" button + User Accounts ka fallback)
  const loadAllLogs = useCallback(() => {
    if (!isAdmin) return Promise.resolve();
    if (allLogsRef.current) return allLogsRef.current;
    setAllLogsBusy(true);
    const run = (async () => {
      try {
        await loadDataset('logs');
        let more = pagerRef.current.logs.hasMore;
        while (more) { more = await loadMore('logs'); }
      } finally {
        setAllLogsBusy(false);
      }
    })();
    allLogsRef.current = run.finally(() => { allLogsRef.current = null; });
    return allLogsRef.current;
  }, [isAdmin, loadDataset, loadMore]);

  // 🆕 Kisi user par click karte hi sirf usi ki poori chat fetch hoti hai (device fingerprint ke fields se query)
  const ensureUserChat = useCallback((user, force = false) => {
    if (!isAdmin || !user) return Promise.resolve();
    const fp = user.id;
    if (chatInflightRef.current[fp]) return chatInflightRef.current[fp];
    if (!force && fetchedFpRef.current.has(fp)) return Promise.resolve();

    const sample = user.messages[0] || {};
    const conds = ['os', 'device', 'screenResolution', 'browserVendor']
      .filter(f => sample[f])
      .map(f => where(f, '==', sample[f]));
    if (conds.length === 0) { fetchedFpRef.current.add(fp); return Promise.resolve(); }

    setOpeningFp(fp);
    setChatOpenError(prev => (prev && prev.fp === fp ? null : prev));
    const run = (async () => {
      try {
        const snap = await getDocs(query(collection(db, "aivox_tracking"), ...conds));
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => makeFingerprint(l) === fp);
        setChatLogs(prev => mergeSorted(prev, docs));
        fetchedFpRef.current.add(fp);
      } catch (error) {
        console.error('Chat load failed:', error);
        setChatOpenError({ fp, message: error?.message || 'Chat load nahi hui' });
      } finally {
        setOpeningFp(prev => (prev === fp ? null : prev));
      }
    })();
    chatInflightRef.current[fp] = run.finally(() => { chatInflightRef.current[fp] = null; });
    return chatInflightRef.current[fp];
  }, [isAdmin]);

  // 🆕 Delete ke baad dono stores (analytics + chats) se logs hata do
  const removeLogIds = useCallback((idsSet) => {
    setLogs(prev => prev.filter(l => !idsSet.has(l.id)));
    setChatLogs(prev => prev.filter(l => !idsSet.has(l.id)));
  }, []);

  // 🆕 Refresh / Auto refresh: sirf us tab ka data dobara aata hai jo abhi khula hai
  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setIsRefreshing(true);
    try {
      const tab = activeTabRef.current;
      const jobs = datasetsForTab(tab).map(name => loadDataset(name, true));
      const sel = selectedGidRef.current ? chatTabGroupsRef.current[selectedGidRef.current] : null;
      if (tab === 'chats' && sel) jobs.push(ensureUserChat(sel, true));
      await Promise.all(jobs);
    } finally {
      setIsRefreshing(false);
    }
  }, [isAdmin, loadDataset, ensureUserChat]);

  // 🆕 Tab khulte hi uska data fetch (pehle se load ho chuka ho toh kuch nahi hota)
  useEffect(() => {
    if (!isAdmin) return;
    datasetsForTab(activeTab).forEach(name => loadDataset(name));
  }, [activeTab, isAdmin, loadDataset]);

  // 🆕 User Accounts: kisi ki join/last-login date missing ho toh hi chat history (fallback) laao
  useEffect(() => {
    if (activeTab !== 'usermanagement' || dataStatus.users !== 'loaded') return;
    if (registeredUsers.some(u => !getJoinedValue(u) || !getLastLoginValue(u))) loadAllLogs();
  }, [activeTab, dataStatus.users, registeredUsers, loadAllLogs]);

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

  // 🆕 Groups: analytics (logs) aur chats tab (chatLogs) ke alag-alag. Chats ke groups sirf chats tab par bante hain.
  const chatGroups = useMemo(() => buildChatGroups(logs), [logs]);
  const chatTabGroups = useMemo(() => (activeTab === 'chats' ? buildChatGroups(chatLogs) : {}), [chatLogs, activeTab]);
  chatTabGroupsRef.current = chatTabGroups;
  const chatTabUserList = useMemo(
    () => Object.values(chatTabGroups).sort((a, b) => new Date(b.messages[0].timestamp) - new Date(a.messages[0].timestamp)),
    [chatTabGroups]
  );
  const selectedUser = selectedGid ? (chatTabGroups[selectedGid] || null) : null;

  // 🆕 User select hote hi (ya desktop par auto-select) uski poori chat fetch
  useEffect(() => {
    if (activeTab !== 'chats' || !selectedGid) return;
    const u = chatTabGroupsRef.current[selectedGid];
    if (u) ensureUserChat(u);
  }, [activeTab, selectedGid, ensureUserChat]);

  // ═══════════════════════════════════════════
  // 🆕 CHAT FULL SCREEN — effects
  // ═══════════════════════════════════════════
  // User/chat delete ho jaye to full screen & mobile chat view band
  useEffect(() => {
    if (!selectedUser) { setIsChatFullscreen(false); setIsMobileChatView(false); }
  }, [selectedUser]);

  // Full screen mein: Esc + phone ka Back button sirf full screen band karega (page se bahar nahi jayega)
  useEffect(() => {
    if (!isChatFullscreen) return;
    try { window.history.pushState({ ...(window.history.state || {}), aivoxFs: true }, ''); } catch (e) { /* ignore */ }

    const onPop = () => {
      if (ignorePopRef.current) { ignorePopRef.current = false; return; }
      setIsChatFullscreen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setIsChatFullscreen(false); };

    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      if (window.history.state && window.history.state.aivoxFs) {
        ignorePopRef.current = true;
        window.history.back();
      }
    };
  }, [isChatFullscreen]);

  // Image viewer: Esc se pehle sirf image band ho
  useEffect(() => {
    if (!fullScreenImage) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setFullScreenImage(null); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullScreenImage]);

  // ═══════════════════════════════════════════
  // 🆕 DELETE ACTIONS (popup + loader via UiHost)
  // ═══════════════════════════════════════════
  const requestDeleteMessage = useCallback((log) => {
    uiRef.current?.confirm({
      title: 'Delete this message?',
      message: 'Ye prompt aur uska AI reply database se permanently delete ho jayega. Undo nahi hoga.',
      details: [(log.prompt || (log.attachedImage ? 'Image message' : 'Empty message')).slice(0, 140)],
      confirmText: 'Delete Message',
      successMsg: 'Message deleted',
      onConfirm: async () => {
        await deleteDoc(doc(db, "aivox_tracking", log.id));
        removeLogIds(new Set([log.id]));
      },
    });
  }, [removeLogIds]);

  const openMessageMenu = useCallback((log) => {
    const ui = uiRef.current;
    if (!ui) return;
    const actions = [];
    if (log.prompt) {
      actions.push({ label: 'Copy prompt', icon: 'copy', onClick: async () => {
        const ok = await copyText(log.prompt);
        ui.toast(ok ? 'Prompt copied' : 'Copy failed', ok ? 'success' : 'error');
      } });
    }
    if (log.response) {
      actions.push({ label: 'Copy response', icon: 'message', onClick: async () => {
        const ok = await copyText(log.response);
        ui.toast(ok ? 'Response copied' : 'Copy failed', ok ? 'success' : 'error');
      } });
    }
    actions.push({ label: 'Delete message', icon: 'trash', tone: 'danger', onClick: () => requestDeleteMessage(log) });
    ui.sheet({
      title: 'Message options',
      meta: `${log.userName || 'Anonymous'} • ${new Date(log.timestamp).toLocaleString()}`,
      preview: log.prompt || (log.attachedImage ? 'Image message' : 'Empty message'),
      actions,
    });
  }, [requestDeleteMessage]);

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
  // 🆕 Delete ab popup + loader ke saath (window.confirm / alert ki jagah)
  const handleDeleteUser = (userId, userName) => {
    uiRef.current?.confirm({
      title: 'Delete user account?',
      message: 'Ye account record users collection se permanently hat jayega. Undo nahi hoga.',
      details: [`Name: ${userName}`, `ID: ${userId}`],
      confirmText: 'Delete User',
      successMsg: `${userName} deleted`,
      onConfirm: async () => {
        await deleteDoc(doc(db, "users", userId));
        setRegisteredUsers(prev => prev.filter(u => u.id !== userId));
      },
    });
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

  // 🔥 SMART ALIAS MERGE LOGIC: ab buildChatGroups() mein hai (chatGroups upar useMemo se banta hai)

  const userList = Object.values(chatGroups).sort((a, b) => new Date(b.messages[0].timestamp) - new Date(a.messages[0].timestamp));
  const uniqueUsers = userList.length;

  const filteredChatUsers = chatTabUserList.filter(u =>
    u.userName.toLowerCase().includes(chatSearchQuery.toLowerCase()) ||
    (u.aliases && u.aliases.some(alias => alias.toLowerCase().includes(chatSearchQuery.toLowerCase()))) ||
    u.device.toLowerCase().includes(chatSearchQuery.toLowerCase())
  );
  const filteredRegisteredUsers = registeredUsers.filter(u =>
    (u.name||'').toLowerCase().includes(userSearchQuery.toLowerCase()) ||
    (u.email||'').toLowerCase().includes(userSearchQuery.toLowerCase())
  );

  // 🆕 DELETE ENTIRE CHAT (popup + loader) — opened chat ke saare messages Firestore se delete
  const requestDeleteChat = (user) => {
    if (!user) return;
    // Poori chat load ho chuki ho tabhi delete (warna kuch messages reh jate)
    const complete = fetchedFpRef.current.has(user.id) || !pager.chatlist.hasMore;
    if (!complete) {
      ensureUserChat(user, true);
      uiRef.current?.toast('Poori chat load ho rahi hai, thodi der baad dobara try karo', 'error');
      return;
    }
    const ids = user.messages.map(m => m.id);

    uiRef.current?.confirm({
      title: 'Delete entire chat?',
      message: 'Is user ki poori chat database se permanently delete ho jayegi (analytics se bhi hat jayegi). Undo nahi hoga.',
      details: [`Name: ${user.userName}`, `Device: ${user.device} • ${user.os}`, `Messages: ${ids.length}`],
      confirmText: 'Delete Chat',
      successMsg: `${user.userName}'s chat deleted`,
      onConfirm: async () => {
        for (let i = 0; i < ids.length; i += 400) {
          const chunk = ids.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach(id => batch.delete(doc(db, "aivox_tracking", id)));
          await batch.commit();
          removeLogIds(new Set(chunk));
        }
        setSelectedGid(null);
        setIsChatFullscreen(false);
        setIsMobileChatView(false);
      },
    });
  };

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

  // 🆕 User Accounts: chat activity (sirf us tab mein calculate hota hai — lag nahi)
  // Agar users doc mein signup/last-login date save nahi hai, to chat ke first/last message se fallback milta hai
  const userChatActivity = {};
  if (activeTab === 'usermanagement') {
    logs.forEach(l => {
      const k = (l.userName || '').trim().toLowerCase();
      if (!k) return;
      const t = new Date(l.timestamp).getTime();
      if (isNaN(t)) return;
      const e = userChatActivity[k];
      if (!e) userChatActivity[k] = { first: t, last: t };
      else { if (t < e.first) e.first = t; if (t > e.last) e.last = t; }
    });
  }

  useEffect(() => {
    if (activeTab === 'chats' && filteredChatUsers.length > 0 && !selectedUser && window.innerWidth > 900) setSelectedGid(filteredChatUsers[0].gid);
  }, [activeTab, filteredChatUsers, selectedUser]);

  const handleTabChange = (tab) => {
    setActiveTab(tab); setIsMobileMenuOpen(false); setIsMobileChatView(false);
    setSearchQuery(''); setChatSearchQuery(''); setUserSearchQuery('');
  };

  // ─── RENDER GUARDS ───
  if (authLoading) return <LoadingScreen message="Verifying Admin..." />;
  
  if (!isAdmin) return (
    <div className={styles.adminLoading} style={{ background:'#0b0a14', flexDirection:'column' }}>
      <div style={{ marginBottom:'14px', color:'#ff4d4f' }}><Icon name="ban" size={64} /></div>
      <h2 style={{ color:'#ff4d4f', margin:0 }}>Access Denied</h2>
      <p style={{ color:'#888', maxWidth:'350px', textAlign:'center', marginTop:'15px', lineHeight:'1.5', fontSize:'14px' }}>
        Only authorized admins can access the Control Center.
      </p>
      <button onClick={() => window.location.href = '/auth'}
        style={{ marginTop:'30px', padding:'14px 28px', background:'#8c82f2', border:'none', borderRadius:'12px', color:'#fff', cursor:'pointer', fontWeight:'bold', fontSize:'15px' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>Go to Login <Icon name="key" size={16} /></span>
      </button>
    </div>
  );

  if (loading) return <LoadingScreen message="Loading Admin..." />;

  // 🆕 Is tab ka data ready hai? (nahi hai toh content area mein loader / error + Retry aata hai)
  const tabNeeds = TAB_DATA[activeTab] || [];
  const tabPending = tabNeeds.some(n => dataStatus[n] !== 'loaded' && dataStatus[n] !== 'error');
  const tabFailed = !tabPending && tabNeeds.some(n => dataStatus[n] === 'error');
  const tabReady = !tabPending && !tabFailed;
  const retryTab = () => { tabNeeds.filter(n => dataStatus[n] === 'error').forEach(n => loadDataset(n, true)); };
  const logsReady = dataStatus.logs === 'loaded';

  // ─── NAV COMPONENTS ───
  const NavSection = ({ label, children }) => (
    <div>
      <div className={styles.navSection}><span className={styles.navSectionLabel}>{label}</span></div>
      <nav className={styles.navMenu}>{children}</nav>
    </div>
  );

  const NavBtn = ({ tab, icon, children }) => (
    <button className={`${styles.navItem} ${activeTab === tab ? styles.activeNav : ''}`}
      onClick={() => handleTabChange(tab)}>
      <span style={{ display:'inline-flex', alignItems:'center', gap:10 }}><Icon name={icon} size={17} />{children}</span>
    </button>
  );

  const padLeft = { paddingLeft: (isDesktop && !isSidebarVisible) ? '40px' : '0', transition: '0.3s' };

  // 🆕 Chat messages (normal view + full screen dono ke liye same pane) — scroll par thoda-thoda load hota hai
  const chatPane = (paneStyle) => (selectedUser ? (
    <ChatMessagesPane
      key={selectedUser.gid}
      user={selectedUser}
      className={styles.chatMessagesArea}
      style={paneStyle}
      onImageClick={setFullScreenImage}
      onOpenMenu={openMessageMenu}
      loadingFull={openingFp === selectedUser.id}
      loadError={chatOpenError && chatOpenError.fp === selectedUser.id ? chatOpenError.message : null}
      onRetry={() => ensureUserChat(selectedUser, true)}
    />
  ) : null);

  // 🆕 User list ke neeche tak scroll karte hi agle users (purane logs ka agla page) aate hain
  const handleUserListScroll = (e) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240 && pager.chatlist.hasMore && !pager.chatlist.loadingMore) loadMore('chatlist');
  };

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
        <h2><InlineIcon name="layers" size={20} color="#8c82f2" style={{ verticalAlign:'-3px' }} />Aivox Admin</h2>
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
          <h2><InlineIcon name="layers" size={20} color="#8c82f2" style={{ verticalAlign:'-3px' }} />Aivox Pro</h2>
          <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
            {isDesktop && (
              <button onClick={() => setIsSidebarVisible(false)}
                style={{ background:'rgba(255,255,255,0.05)', border:'none', borderRadius:'6px', cursor:'pointer', color:'#8a8d9e', padding:'6px', display:'flex', alignItems:'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/>
                </svg>
              </button>
            )}
            {!isDesktop && <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}><Icon name="close" size={18} /></button>}
          </div>
        </div>

        <div className={styles.autoRefreshBadge}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="refresh" size={14} spin={autoRefresh} />Auto Refresh {autoRefresh ? `(${countdown}s)` : 'OFF'}</span>
          <label className={styles.autoRefreshToggle}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            <span className={styles.toggleSlider}></span>
          </label>
        </div>

        {/* Today's quick stats in sidebar (logs load hone ke baad numbers aate hain) */}
        <div style={{ margin:'0 16px 16px', background:'rgba(140,130,242,0.08)', borderRadius:10, padding:'10px 14px', border:'1px solid rgba(140,130,242,0.2)' }}>
          <div style={{ fontSize:10, color:'#8c82f2', fontWeight:700, textTransform:'uppercase', letterSpacing:1, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}><Icon name="calendar" size={12} />Today</div>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#fff', fontWeight:800, fontSize:16 }}>{logsReady ? todayRequests : '—'}</div>
              <div style={{ color:'#6a6b8c' }}>Requests</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#f5b942', fontWeight:800, fontSize:16 }}>{logsReady ? `${(todayTokens/1000).toFixed(1)}K` : '—'}</div>
              <div style={{ color:'#6a6b8c' }}>Tokens</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#00ff80', fontWeight:800, fontSize:16 }}>{logsReady ? `$${todayCost.toFixed(3)}` : '—'}</div>
              <div style={{ color:'#6a6b8c' }}>Cost</div>
            </div>
          </div>
        </div>

        <NavSection label="Main">
          <NavBtn tab="overview" icon="overview">Overview</NavBtn>
          <NavBtn tab="chats" icon="message">User Chats</NavBtn>
          <NavBtn tab="search" icon="search">Live Search</NavBtn>
          <NavBtn tab="features" icon="sparkles">God-Mode Stats</NavBtn>
        </NavSection>

        <NavSection label="Access & Users">
          <NavBtn tab="usermanagement" icon="users">User Accounts</NavBtn>
          <NavBtn tab="fingerprint" icon="fingerprint">Fingerprints</NavBtn>
          <NavBtn tab="depth" icon="layers">Conv. Depth</NavBtn>
          <NavBtn tab="heatmap" icon="grid">Hour Heatmap</NavBtn>
        </NavSection>

        <NavSection label="AI & Quality">
          <NavBtn tab="performance" icon="zap">AI Performance</NavBtn>
          <NavBtn tab="quality" icon="trendingUp">Quality Meter</NavBtn>
          <NavBtn tab="errors" icon="alertTriangle">Error Monitor</NavBtn>
          <NavBtn tab="prompts" icon="terminal">Prompt Intel</NavBtn>
          <NavBtn tab="wordcloud" icon="cloud">Word Cloud</NavBtn>
        </NavSection>

        <NavSection label="Device & Geo">
          <NavBtn tab="devices" icon="smartphone">Devices</NavBtn>
          <NavBtn tab="hardware" icon="cpu">HW Leaderboard</NavBtn>
          <NavBtn tab="geography" icon="globe">Geo & Local</NavBtn>
          <NavBtn tab="network" icon="wifi">Network</NavBtn>
        </NavSection>

        <NavSection label="Finance & Report">
          <NavBtn tab="roaster" icon="flame">Roaster</NavBtn>
          <NavBtn tab="economics" icon="dollar">Token Economics</NavBtn>
          <NavBtn tab="report" icon="fileText">Analytics Report</NavBtn>
          <NavBtn tab="system" icon="settings">System Logs</NavBtn>
        </NavSection>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className={styles.mainContent} style={{ overflowY:'auto', overflowX:'hidden', transition:'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>

        {/* 🆕 LAZY LOAD: is section ka data aa raha hai ya fail hua — tab tak sirf ye dikhta hai */}
        {!tabReady && (
          <SectionState label={TAB_LABELS[activeTab] || 'Section'} error={tabFailed} onRetry={retryTab} padLeft={padLeft} />
        )}

        {tabReady && (<>

        {/* ══════════════════════════════════════════
            OVERVIEW
        ══════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}>
                <h1><TitleIcon name="overview" />Dashboard Overview</h1>
                <p>High-level metrics aur API usage — sab ek jagah.</p>
              </div>
              <div className={styles.pageHeaderRight}>
                <span className={styles.refreshCountdown} style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Icon name={autoRefresh ? 'refresh' : 'pause'} size={13} spin={autoRefresh} />{autoRefresh ? `${countdown}s` : 'Manual'}</span>
                <div className={styles.liveBadge}><span className={styles.pulse}></span> LIVE</div>
                <button onClick={fetchData} disabled={isRefreshing} className={styles.actionBtn}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="refresh" size={14} spin={isRefreshing} />{isRefreshing ? 'Refreshing…' : 'Refresh'}</span></button>
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
              <h3>Daily Token Usage (Last 14 Days)</h3>
              <DailyChart data={dailyData} valueKey="tokens" label="Tokens" color="#8c82f2" formatter={v => v > 1000 ? `${(v/1000).toFixed(1)}K` : v} />
            </div>

            {/* Daily Cost Chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>Daily Cost in USD (Last 14 Days)</h3>
              <DailyChart data={dailyData} valueKey="cost" label="Cost" color="#00ff80" formatter={v => `$${v.toFixed(3)}`} />
            </div>

            {/* Hourly Heatmap quick view */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>Today's Hourly Traffic</h3>
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
              <div style={padLeft}><h1><TitleIcon name="dollar" />Token Economics</h1><p>Daily spending, model costs aur full token breakdown.</p></div>
              <div className={styles.pageHeaderRight}>
                <button onClick={downloadCSV} className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="download" size={14} />CSV with Cost</span></button>
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
              <h3>Daily Cost Trend (USD) — Last 14 Days</h3>
              <DailyChart data={dailyData} valueKey="cost" color="#00ff80" formatter={v => `$${v.toFixed(3)}`} />
            </div>

            {/* Daily token chart */}
            <div className={styles.analyticsCard} style={{ marginBottom:24 }}>
              <h3>Daily Token Consumption — Last 14 Days</h3>
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
                <div style={{ fontSize:12, color:'#8a8d9e', marginBottom:4 }}><InlineIcon name="alertTriangle" size={13} color="#f5b942" />Note: Costs are estimates based on public Claude/OpenAI API rates. Actual billing depends on your provider.</div>
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
              <div style={padLeft}><h1><TitleIcon name="flame" />Roaster Analytics</h1><p>Roast mode vs Normal mode ka detailed breakdown.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Roast Requests" value={roasts} sub={`${totalRequests ? ((roasts/totalRequests)*100).toFixed(1) : 0}% of total`} color="#ff4d4f" />
              <StatCard title="Normal Requests" value={normalCount} sub={`${totalRequests ? ((normalCount/totalRequests)*100).toFixed(1) : 0}% of total`} color="#8c82f2" />
              <StatCard title="Roast Tokens" value={roastTokens.toLocaleString()} sub={`Cost: $${roastCost.toFixed(4)}`} color="#ff6b9d" />
              <StatCard title="Normal Tokens" value={normalTokens.toLocaleString()} sub={`Cost: $${normalCost.toFixed(4)}`} color="#00e5ff" />
            </div>

            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Roast vs Normal Comparison</h3>
                {[
                  { label:'Requests', roastV:roasts, normalV:normalCount },
                  { label:'Tokens', roastV:roastTokens, normalV:normalTokens },
                ].map(row => (
                  <div key={row.label} style={{ marginBottom:20 }}>
                    <div style={{ fontSize:13, color:'#8a8d9e', marginBottom:8, fontWeight:600 }}>{row.label}</div>
                    <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:12, overflow:'hidden' }}>
                      <span style={{ color:'#ff4d4f', minWidth:56, fontSize:11 }}><InlineIcon name="flame" size={12} style={{ marginRight:3 }} />{row.roastV.toLocaleString()}</span>
                      <div style={{ flex:1, minWidth:0, background:'rgba(0,0,0,0.3)', borderRadius:6, height:10, overflow:'hidden' }}>
                        <div style={{ width:`${(row.roastV/(row.roastV+row.normalV||1))*100}%`, height:'100%', background:'linear-gradient(90deg,#ff4d4f,#ff6b9d)', borderRadius:6 }} />
                      </div>
                      <span style={{ color:'#8c82f2', minWidth:56, textAlign:'right', fontSize:11 }}>{row.normalV.toLocaleString()}<InlineIcon name="checkCircle" size={12} color="#8c82f2" style={{ marginLeft:4, marginRight:0 }} /></span>
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
                        <span><InlineIcon name="flame" size={13} color="#ff4d4f" />{u.userName}</span>
                        <span style={{ color:'#ff4d4f', fontWeight:700 }}>{u.roastCount} roasts</span>
                      </div>
                      <MiniBar value={u.roastCount} max={Math.max(...Object.values(chatGroups).map(uu=>uu.messages.filter(m=>m.isRoasterMode).length),1)} color="#ff4d4f" />
                    </div>
                  ))}
                {Object.values(chatGroups).every(u=>u.messages.every(m=>!m.isRoasterMode)) && (
                  <p style={{ color:'#555', textAlign:'center', padding:'20px 0' }}>Koi roast nahi hua abhi</p>
                )}
              </div>
            </div>

            <div className={styles.analyticsCard} style={{ marginTop:24 }}>
              <h3>Recent Roasts</h3>
              <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                {logs.filter(l=>l.isRoasterMode).slice(0,10).map(log => (
                  <div key={log.id} style={{ background:'rgba(255,77,79,0.08)', border:'1px solid rgba(255,77,79,0.2)', borderRadius:12, padding:'14px 18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                      <span className={styles.sysTag} style={{ background:'#ff4d4f', color:'#fff' }}><InlineIcon name="flame" size={11} color="#fff" style={{ marginRight:4 }} />{log.userName || 'Anonymous'}</span>
                      <span style={{ fontSize:11, color:'#8a8d9e' }}>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    {/* 🔥 ADMIN: SHOW ATTACHED IMAGE IF ANY 🔥 */}
                    <div style={{ fontSize:13, color:'#ff9999', fontStyle:'italic', marginBottom:8 }}>
                      {log.attachedImage && <span title="Image Attached"><InlineIcon name="image" size={13} color="#00e5ff" /></span>}
                      "{log.prompt?.slice(0,120)}{(log.prompt?.length||0)>120?'…':''}"
                    </div>
                    <div style={{ fontSize:12, color:'#cdd6f4' }}>{log.response?.slice(0,200)}{(log.response?.length||0)>200?'…':''}</div>
                  </div>
                ))}
                {!logs.some(l=>l.isRoasterMode) && (
                  <p style={{ color:'#555', textAlign:'center', padding:'40px' }}>Koi roast data nahi mila</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            PROMPT INTEL
        ══════════════════════════════════════════ */}
        {activeTab === 'prompts' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1><TitleIcon name="terminal" />Prompt Intel</h1><p>User behavior analysis — typing speed, hesitation, prompt patterns.</p></div>
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
                <Icon name="eyeOff" size={22} />
                Hesitation Vault
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
                      <tr><td colSpan={3} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kisi ne kuch delete nahi kiya abhi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pager.unsent.hasMore && <LoadMoreButton onClick={() => loadMore('unsent')} loading={pager.unsent.loadingMore}>Load older entries</LoadMoreButton>}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            GEOGRAPHY & LOCALE
        ══════════════════════════════════════════ */}
        {activeTab === 'geography' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1><TitleIcon name="globe" />Geo & Locale</h1><p>Timezone, language aur region breakdown.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Unique Timezones" value={Object.keys(timezoneStats).length} sub={`Top: ${topTimezone?.[0]||'N/A'}`} color="#00e5ff" />
              <StatCard title="Unique Languages" value={Object.keys(langStats).length} sub={`Top: ${topLang?.[0]||'N/A'}`} color="#8c82f2" />
              <StatCard title="Total Users" value={uniqueUsers} sub="Across all regions" color="#00ff80" />
              <StatCard title="Top Region" value={topTimezone?.[0]?.split('/')[1]?.replace(/_/g,' ')||'N/A'} sub={`${topTimezone?.[1]||0} users`} color="#f5b942" />
            </div>

            <div className={styles.analyticsGrid} style={{ marginBottom:24 }}>
              <div className={styles.analyticsCard}>
                <h3>Timezone Distribution</h3>
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
                <h3>Language Distribution</h3>
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
              <h3>Activity by Day of Week</h3>
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
            AI PERFORMANCE
        ══════════════════════════════════════════ */}
        {activeTab === 'performance' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1><TitleIcon name="zap" />AI Performance</h1><p>Model speed, success rate aur response times.</p></div>
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
              <div style={padLeft}><h1><TitleIcon name="sparkles" />God-Mode Analytics</h1><p>Live tracking of Aivox Pro exclusive capabilities.</p></div>
            </header>

            <div className={styles.statsGrid}>
              <StatCard title="Alter-Egos Active" value={Object.values(activeEgosData).reduce((a,b)=>a+b,0)} sub={`Top: ${Object.entries(activeEgosData).sort((a,b)=>b[1]-a[1])[0]?.[0]||'smart'}`} color="#8c82f2" />
              <StatCard title="Memories Locked" value={totalLockedMemories} sub="Across all users" color="#00ff80" />
              <StatCard title="Avg. Vibe Sync" value={`${avgVibeSync}%`} sub="Energy match rate" color="#00e5ff" />
              <StatCard title="Hesitation Vault" value={`${unsentPrompts.length}${pager.unsent.hasMore ? '+' : ''}`} sub="Deleted prompts captured" color="#c542f5" />
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
              <h2 style={{ color:'#00e5ff', marginBottom:15 }}><InlineIcon name="users" size={20} style={{ verticalAlign:'-3px' }} />Live User Modes & Memories</h2>
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
                            {u.ego === 'smart' ? 'Normal' : u.ego}
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
                    {liveUserModes.length === 0 && <tr><td colSpan={4} style={{textAlign:'center',color:'#555',padding:'40px'}}>Koi data nahi</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hesitation Vault */}
            <div style={{ marginTop:40 }}>
              <h2 style={{ color:'#c542f5', marginBottom:15 }}>
                <InlineIcon name="eyeOff" size={20} style={{ verticalAlign:'-3px' }} />Hesitation Vault <span className={styles.sysTag} style={{background:'#ff4d4f',color:'#fff',fontSize:10}}>CONFIDENTIAL</span>
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
                      <tr><td colSpan={3} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kisi ne kuch delete nahi kiya abhi</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pager.unsent.hasMore && <LoadMoreButton onClick={() => loadMore('unsent')} loading={pager.unsent.loadingMore}>Load older entries</LoadMoreButton>}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            USER CHATS (🔥 NOW WITH ALIAS TRACKING & MARKDOWN 🔥)
            🆕 + FULL SCREEN BUTTON, DELETE CHAT, LONG-PRESS DELETE MESSAGE
        ══════════════════════════════════════════ */}
        {activeTab === 'chats' && (
          <div className={styles.sectionFadeIn} style={{ height:'100%', overflow:'hidden' }}>
            <header className={`${styles.pageHeader} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
              <div style={padLeft}><h1><TitleIcon name="message" />Live User Chats</h1><p>User naam se search karke messages dekho.</p></div>
            </header>
            <div className={styles.chatSplitView}>
              <div className={`${styles.userListSidebar} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
                <h3 className={styles.paneTitle}>Active Users ({filteredChatUsers.length})</h3>
                <div style={{ padding:'10px 15px', borderBottom:'1px solid #1f1e2e', background:'#121120' }}>
                  <input type="text" placeholder="Search by name..."
                    value={chatSearchQuery} onChange={e => setChatSearchQuery(e.target.value)}
                    style={{ width:'100%', padding:'8px 12px', borderRadius:'8px', border:'1px solid #3a3a5e', background:'#0b0a14', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                </div>
                <div className={styles.userListScroll} onScroll={handleUserListScroll}>
                  {filteredChatUsers.map(user => (
                    <div key={user.gid} onClick={() => { setSelectedGid(user.gid); setIsMobileChatView(true); }}
                      className={`${styles.userListItem} ${selectedGid === user.gid ? styles.activeUserItem : ''}`}>
                      <div className={styles.userAvatar}><OsIcon os={user.os} size={20} /></div>
                      <div className={styles.userInfo}>
                        <h4>{user.userName}</h4>
                        {/* 🔥 ADMIN: SHOW NAME ALIASES IN LIST 🔥 */}
                        {user.aliases && user.aliases.length > 1 && (
                          <div style={{fontSize:'10px', color:'#00ff80', marginBottom:'3px', fontWeight:'600'}}>
                            Aliases: {user.aliases.filter(n => n !== user.userName).join(', ')}
                          </div>
                        )}
                        <p>{user.device} • {user.os}</p>
                        <span style={{fontSize:'10px',color:'#555'}}>{user.messages.length}{(fetchedFpRef.current.has(user.id) || !pager.chatlist.hasMore) ? '' : '+'} msgs | {user.network} | ID: {user.id}</span>
                      </div>
                    </div>
                  ))}
                  {filteredChatUsers.length === 0 && <div style={{padding:'20px',textAlign:'center',color:'#888',fontSize:'13px'}}>No user found</div>}
                  {pager.chatlist.hasMore && (
                    <div style={{ padding:'4px 15px 18px' }}>
                      <LoadMoreButton onClick={() => loadMore('chatlist')} loading={pager.chatlist.loadingMore}>Load more users</LoadMoreButton>
                    </div>
                  )}
                </div>
              </div>

              <div className={`${styles.chatWindow} ${!isMobileChatView ? styles.hideOnMobile : ''}`}>
                {selectedUser ? (
                  <>
                    <div className={styles.chatWindowHeader}>
                      <button className={styles.mobileBackBtn} onClick={() => setIsMobileChatView(false)} title="Back to users" aria-label="Back to users"><Icon name="arrowLeft" size={20} /></button>
                      <div>
                        <h3 style={{margin:0}}>{selectedUser.userName}</h3>
                        {/* 🔥 ADMIN: SHOW NAME ALIASES IN HEADER 🔥 */}
                        {selectedUser.aliases && selectedUser.aliases.length > 1 && (
                          <p style={{margin:0,fontSize:'11px',color:'#00ff80',fontWeight:'600'}}>
                            Also known as: {selectedUser.aliases.filter(n => n !== selectedUser.userName).join(', ')}
                          </p>
                        )}
                        <p style={{margin:0,fontSize:'11px',color:'#888'}}>{selectedUser.device} | FP: {selectedUser.id}</p>
                      </div>

                      {/* 🆕 FULL SCREEN + DELETE CHAT BUTTONS */}
                      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        <IconButton title="Open chat in full screen" onClick={() => setIsChatFullscreen(true)}>
                          <Icon name="expand" size={17} />
                        </IconButton>
                        <IconButton title="Delete this chat" tone="danger" onClick={() => requestDeleteChat(selectedUser)}>
                          <Icon name="trash" size={17} />
                        </IconButton>
                      </div>
                    </div>
                    {/* Full screen mein pane wahan dikhta hai — yahan dobara render nahi hota (lag free) */}
                    {isChatFullscreen ? <div className={styles.chatMessagesArea}></div> : chatPane()}
                  </>
                ) : <div className={styles.noUserSelected}><h2>Select a user</h2></div>}
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
              <div style={padLeft}><h1><TitleIcon name="search" />Live Search</h1><p>Prompts, responses, devices — sab ek jagah dhundo.</p></div>
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
                      <td style={{maxWidth:'240px',fontSize:'13px',color:'#cdd6f4',fontStyle:'italic'}}>
                        {log.attachedImage && (
                          <div style={{ marginBottom: '6px' }}>
                            <span 
                              style={{ fontSize: '10px', background: 'rgba(0, 229, 255, 0.1)', color: '#00e5ff', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(0,229,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                              onClick={() => setFullScreenImage(log.attachedImage)}
                            >
                              <Icon name="image" size={11} /> Image Attached
                            </span>
                          </div>
                        )}
                        "{log.prompt?.slice(0,100)}{(log.prompt?.length||0)>100?'…':''}"
                      </td>
                      <td style={{maxWidth:'180px',fontSize:'12px',color:'#888'}}>{log.response?.slice(0,60)}{(log.response?.length||0)>60?'…':''}</td>
                      <td><span style={{color:'#8c82f2',fontSize:'11px',fontWeight:'700'}}>{log.model}</span></td>
                      <td><span className={styles.tokenTotal}>{log.totalTokens||0}</span></td>
                      <td><span style={{color:'#00ff80',fontSize:'11px',fontWeight:'700'}}>${estimateCost(log).toFixed(4)}</span></td>
                    </tr>
                  ))}
                  {searchLogs.length === 0 && <tr><td colSpan={7} style={{textAlign:'center',color:'#555',padding:'40px'}}>Kuch nahi mila "{searchQuery}"</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            USER MANAGEMENT
            🆕 + JOINED / LAST ACTIVE (DATE & TIME), POPUP DELETE
            🆕 LAZY: sirf users collection fetch hoti hai (chat logs sirf tab, jab kisi ki date missing ho)
        ══════════════════════════════════════════ */}
        {activeTab === 'usermanagement' && (
          <div className={styles.sectionFadeIn} style={{ display:'block', height:'auto', paddingBottom:'60px' }}>
            <header className={styles.pageHeader}>
              <div style={padLeft}><h1><TitleIcon name="users" />Registered Users</h1><p>All accounts manage karo — role assign karo, delete karo.</p></div>
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
              <table className={styles.adminTable} style={{ minWidth:1050 }}>
                <thead><tr><th>User</th><th>Email</th><th>UID</th><th>Role</th><th>Joined (Date & Time)</th><th>Last Active</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredRegisteredUsers.map(user => {
                    const isMaster = allowedEmails.includes((user.email||'').toLowerCase());
                    const nameKey = (user.name||user.displayName||'').trim().toLowerCase();
                    const act = userChatActivity[nameKey];
                    const joinedVal = getJoinedValue(user);
                    const lastVal = getLastLoginValue(user);
                    // Fallback dates ke liye chat logs abhi aa rahe hain?
                    const fallbackPending = allLogsBusy || (dataStatus.logs !== 'loaded' && dataStatus.logs !== 'error');
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
                          {(!joinedVal && !act && fallbackPending)
                            ? <span style={{ color:'#6a6b8c', fontSize:12 }}>Loading…</span>
                            : <DateTimeCell value={joinedVal || (act ? act.first : null)} note={!joinedVal && act ? 'first chat' : ''} />}
                        </td>
                        <td>
                          {(!lastVal && !act && fallbackPending)
                            ? <span style={{ color:'#6a6b8c', fontSize:12 }}>Loading…</span>
                            : <DateTimeCell value={lastVal || (act ? act.last : null)} note={!lastVal && act ? 'last chat' : ''} />}
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
                  {filteredRegisteredUsers.length === 0 && <tr><td colSpan={7} style={{textAlign:'center',padding:'40px',color:'#888'}}>Koi user nahi mila.</td></tr>}
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
              <div style={padLeft}><h1><TitleIcon name="grid" />Hourly Traffic Heatmap</h1><p>0 se 23 tak — konse ghante mein sabse zyada traffic.</p></div>
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
              <div style={padLeft}><h1><TitleIcon name="fingerprint" />User Fingerprints</h1><p>Har unique device ka stable fingerprint ID + engagement score + cost.</p></div>
              <div className={styles.pageHeaderRight}><span style={{fontSize:'13px',color:'#666'}}>{fingerprintData.length} unique users</span></div>
            </header>
            <div className={styles.fingerprintGrid}>
              {fingerprintData.map((user) => (
                <div key={user.id} className={styles.fingerprintCard}>
                  <div className={styles.fingerprintHeader}>
                    <div>
                      <div style={{fontSize:'18px',marginBottom:'4px',display:'flex',alignItems:'center',gap:8}}><OsIcon os={user.os} size={20} /> {user.userName}</div>
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
              <div style={padLeft}><h1><TitleIcon name="cloud" />Word Cloud</h1><p>Sabse zyada use hone wale words user prompts mein.</p></div>
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
                {wordFreq.length === 0 && <span style={{color:'#555'}}>Koi data nahi abhi</span>}
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
              <div style={padLeft}><h1><TitleIcon name="trendingUp" />Response Quality Meter</h1><p>Tokens per second — model ki efficiency.</p></div>
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
              <div style={padLeft}><h1><TitleIcon name="cpu" />Hardware Leaderboard</h1><p>Sabse powerful devices jo Aivox use kar rahe hain.</p></div>
            </header>
            <div className={styles.leaderboardList}>
              {hwLeaderboard.map((hw, i) => (
                <div key={hw.device+i} className={styles.leaderboardItem}>
                  <div className={`${styles.leaderboardRank} ${i===0?styles.rankGold:i===1?styles.rankSilver:i===2?styles.rankBronze:''}`}>
                    {i<3 ? <Icon name="award" size={20} /> : i+1}
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
              <div style={padLeft}><h1><TitleIcon name="alertTriangle" />Error Monitor</h1><p>Failed requests, slow responses aur model fallback tracking.</p></div>
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
                    <strong style={{display:'inline-flex',alignItems:'center',gap:6,color:model==='Failed'?'#ff4d4f':'#00ff80'}}>{d.count} reqs <Icon name={model==='Failed'?'xCircle':'checkCircle'} size={15} /></strong>
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
              <div style={padLeft}><h1><TitleIcon name="layers" />Conversation Depth</h1><p>Engagement ka asli measure — kitne messages bheje.</p></div>
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
              <div style={padLeft}><h1><TitleIcon name="smartphone" />Device Demographics</h1><p>OS aur browser breakdown.</p></div>
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
              <div style={padLeft}><h1><TitleIcon name="wifi" />Network & Environment</h1><p>Connection types aur browser settings.</p></div>
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
                <p className={styles.reportTitle}><TitleIcon name="fileText" size={20} />Aivox Analytics Report</p>
                <p className={styles.reportMeta}>Generated: {new Date().toLocaleString()} • {totalRequests} total events</p>
              </div>
              <button className={styles.printBtn} onClick={() => window.print()}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="printer" size={14} />Print / Save PDF</span></button>
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
              <div style={padLeft}><h1><TitleIcon name="settings" />System Logs</h1><p>Deep hardware, network aur battery data.</p></div>
              <div className={styles.pageHeaderRight}>
                <button onClick={fetchData} disabled={isRefreshing} className={styles.actionBtn}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="refresh" size={14} spin={isRefreshing} />{isRefreshing ? 'Refreshing…' : 'Refresh'}</span></button>
                <button onClick={downloadCSV} className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}><span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Icon name="download" size={14} />CSV</span></button>
              </div>
            </header>
            <div className={styles.tableContainer} style={{ overflowX:'auto' }}>
              <table className={styles.adminTable} style={{ minWidth:900 }}>
                <thead><tr><th>Time & Zone</th><th>User & Hardware</th><th>Network & Activity</th><th>Performance</th></tr></thead>
                <tbody>
                  {logs.slice(0, systemVisible).map(log => {
                    const isLove = log.isLoveMsg || log.activeMode === 'lover_girl' || log.activeMode === 'lover_boy' || log.activeEgo === 'lover_girl' || log.activeEgo === 'lover_boy';
                    const isRoast = log.isRoasterMode && !isLove;

                    return (
                      <tr key={log.id}>
                        <td className={styles.timeCol}>
                          {new Date(log.timestamp).toLocaleString()}
                          <div className={styles.subText}><InlineIcon name="globe" size={11} style={{ marginRight:5 }} />{log.timezone}</div>
                          <div style={{fontSize:'10px',color:'#444',marginTop:'2px',fontFamily:'monospace'}}>FP: {makeFingerprint(log)}</div>
                        </td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#8c82f2',color:'#fff'}}>{log.userName||'Anonymous'}</div>
                          <div className={styles.subText} style={{marginTop:'4px',lineHeight:'1.6'}}>
                            <strong>Device:</strong> {log.device||'Unknown'}<br/>
                            <strong>OS:</strong> {log.os}<br/>
                            <strong>RAM/CPU:</strong> {log.ramMemory||'N/A'}GB | {log.cpuCores||'N/A'} cores<br/>
                            <strong>Screen:</strong> {log.screenResolution}<br/>
                            <span style={{color:'#f5b942'}}><strong>Battery:</strong> {log.batteryLevel!=null ? <>{log.batteryLevel}% <InlineIcon name={log.batteryCharging?'zap':'battery'} size={12} style={{ marginRight:0 }} /></> : 'Blocked'}</span><br/>
                            <span style={{color:'#00e5ff'}}><strong>Media:</strong> <InlineIcon name="mic" size={12} style={{ marginRight:3 }} />{log.microphoneCount||0} | <InlineIcon name="camera" size={12} style={{ marginRight:3 }} />{log.cameraCount||0}</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.sysTag} style={{background:'#1a3a2a',color:'#00ff80'}}><InlineIcon name="wifi" size={12} color="#00ff80" style={{ marginRight:5 }} />{(log.network||'WIFI').toUpperCase()}</div>
                          <div className={styles.subText} style={{lineHeight:'1.6'}}>
                            <strong>Browser:</strong> {log.browserVendor}<br/>
                            <strong>Lang:</strong> {log.language}<br/>
                            <strong>Backspaces:</strong> <span style={{color:'#ff4d4f'}}>{log.backspaceCount||0}</span><br/>
                            <strong>Touch:</strong> {log.touchSupport?'Yes':'No'}
                          </div>
                        </td>
                        <td>
                          <div className={styles.tokenTotal}>Tokens: {log.totalTokens||0}</div>
                          <div style={{color:'#00ff80',fontSize:'11px',fontWeight:'700',marginTop:2}}>Cost: ${estimateCost(log).toFixed(5)}</div>
                          <div className={styles.speedColor}><InlineIcon name="zap" size={12} style={{ marginRight:4 }} />{log.responseTimeMs?(log.responseTimeMs/1000).toFixed(2)+'s':'N/A'}</div>
                          
                          <div className={styles.subText}>
                            <InlineIcon name="cpu" size={12} style={{ marginRight:5 }} />{log.model} {log.attachedImage && <InlineIcon name="image" size={12} color="#00e5ff" style={{ marginRight:0 }} />}
                          </div>
                          
                          {isRoast && <div style={{fontSize:'10px',color:'#ff4d4f',marginTop:'2px'}}><InlineIcon name="flame" size={11} style={{ marginRight:4 }} />Roaster</div>}
                          {isLove && <div style={{fontSize:'10px',color:'#ff1493',marginTop:'2px'}}><InlineIcon name="heart" size={11} style={{ marginRight:4 }} />Love Mode</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {(systemVisible < logs.length || pager.logs.hasMore) && (
              <LoadMoreButton
                loading={systemVisible >= logs.length && pager.logs.loadingMore}
                onClick={() => { if (systemVisible >= logs.length) loadMore('logs'); setSystemVisible(v => v + 50); }}>
                {systemVisible < logs.length ? `Show more (${Math.min(systemVisible, logs.length)} of ${logs.length}${pager.logs.hasMore ? '+' : ''})` : 'Load older events'}
              </LoadMoreButton>
            )}
          </div>
        )}

        </>)}

        {/* 🆕 Analytics tabs: sirf latest events load hue hain — poora history ek click mein */}
        {tabReady && tabNeeds.includes('logs') && (
          <LogsWindowPill count={logs.length} hasMore={pager.logs.hasMore} busy={allLogsBusy || pager.logs.loadingMore} onLoadAll={loadAllLogs} />
        )}
      </main>
      {isMobileMenuOpen && <div className={styles.menuOverlay} onClick={() => setIsMobileMenuOpen(false)}></div>}

      {/* ══════════════════════════════════════════
          🆕 FULL SCREEN CHAT — sirf chat + Exit button (nav/sidebar/header kuch nahi)
          Portal: kisi bhi parent ke scroll/transform se bahar, poori screen par stable
      ══════════════════════════════════════════ */}
      {isChatFullscreen && selectedUser && createPortal(
        <div className="ui-motion"
          style={{ position:'fixed', inset:0, zIndex:99990, background:'#0b0a14', display:'flex', flexDirection:'column', animation:'fsChatIn 0.18s ease' }}>
          <style>{UI_KEYFRAMES}</style>

          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', paddingTop:'calc(12px + env(safe-area-inset-top, 0px))', background:'#121120', borderBottom:'1px solid #1f1e2e', flexShrink:0 }}>
            <div style={{ flexShrink:0, color:'#8c82f2', display:'flex' }}>
              <OsIcon os={selectedUser.os} size={24} />
            </div>
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ color:'#fff', fontWeight:800, fontSize:16, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{selectedUser.userName}</div>
              <div style={{ color:'#8a8d9e', fontSize:11, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {selectedUser.device} • {selectedUser.messages.length} msgs
              </div>
            </div>
            <button type="button" onClick={() => setIsChatFullscreen(false)} aria-label="Exit full screen" title="Exit full screen"
              style={{ display:'flex', alignItems:'center', gap:8, padding: isDesktop ? '9px 14px' : '9px 11px', borderRadius:10, cursor:'pointer', color:'#e6e6fa', fontSize:13, fontWeight:700, flexShrink:0,
                background:'rgba(140,130,242,0.16)', border:'1px solid rgba(140,130,242,0.45)' }}>
              <Icon name="collapse" size={17} />
              {isDesktop && <span>Exit Full Screen</span>}
            </button>
          </div>

          {chatPane({ flex:1, minHeight:0, height:'auto', maxHeight:'none', overflowY:'auto', overscrollBehavior:'contain', WebkitOverflowScrolling:'touch', paddingBottom:'calc(16px + env(safe-area-inset-bottom, 0px))' })}
        </div>,
        document.body
      )}

      {/* 🔥 FULL SCREEN IMAGE VIEWER MODAL 🔥 (portal => hamesha chat full screen ke upar) */}
      {fullScreenImage && createPortal(
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 999999,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            backdropFilter: 'blur(5px)', cursor: 'zoom-out'
          }}
          onClick={() => setFullScreenImage(null)}
        >
          <img 
            src={fullScreenImage} 
            alt="Full Screen" 
            style={{
              maxWidth: '95vw', maxHeight: '95vh',
              objectFit: 'contain', borderRadius: '12px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              cursor: 'default'
            }}
            onClick={(e) => e.stopPropagation()} 
          />
          <button 
            onClick={() => setFullScreenImage(null)}
            style={{
              position: 'absolute', top: '20px', right: '20px',
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', 
              borderRadius: '50%', width: '44px', height: '44px', color: '#fff', 
              fontSize: '20px', cursor: 'pointer', display: 'flex', 
              justifyContent: 'center', alignItems: 'center', transition: '0.2s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,77,79,0.8)'}
            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          >
            <Icon name="close" size={20} />
          </button>
        </div>,
        document.body
      )}

      {/* 🆕 POPUPS: delete confirm + loader, long-press menu, toast */}
      <UiHost ref={uiRef} />
    </div>
  );
}

export default Admin;