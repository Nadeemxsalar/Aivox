import { useState, useEffect, useRef } from 'react';
import styles from './Features.module.css';
import CodingLab from './CodingLab'; // NEW: Coding Lab (HTML / CSS / JS editor)

const cx = (...a) => a.filter(Boolean).join(' ');
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

const P = {
  heart: 'M19.5 12.6 12 20l-7.5-7.4a5 5 0 0 1 7.5-6.6 5 5 0 0 1 7.5 6.6z',
  sparkles: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  flame: 'M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 2 3 3 3-1-3-1-5 0-8z',
  briefcase: 'M3 8h18v12H3zM9 8V5h6v3M3 13h18',
  skull: 'M12 3a8 8 0 0 0-8 8c0 3 1.5 5 3 6v3h10v-3c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM9 12h.01M15 12h.01M10 17v3M14 17v3',
  flower: 'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM12 9.5C10.5 8 10.5 4 12 3c1.5 1 1.5 5 0 6.5zM12 14.5c-1.5 1.5-1.5 5.5 0 6.5 1.5-1 1.5-5 0-6.5zM9.5 12C8 10.5 4 10.5 3 12c1 1.5 5 1.5 6.5 0zM14.5 12c1.5-1.5 5.5-1.5 6.5 0-1 1.5-5 1.5-6.5 0z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  mirror: 'M12 3a6 8 0 1 0 0 16 6 8 0 0 0 0-16zM12 19v3M9 22h6M9 8.5c.7-1.3 2-2 3.5-1.8',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  pulse: 'M22 12h-4l-3 9L9 3l-3 9H2',
  timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M9 2h6',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01',
  ball: 'M12 3a8 8 0 0 0-8 8c0 3 2 5 4 6h8c2-1 4-3 4-6a8 8 0 0 0-8-8zM8 21h8M8.5 7.5c.8-1 1.8-1.5 3-1.6',
  leaf: 'M20 4C10 4 4 10 4 18c8 0 16-5 16-14zM4 20c3-5 6-8 11-11',
  venn: 'M9 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM15 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
  cardI: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 7.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z',
  checkc: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  pin: 'M12 17v5M8 3h8l-1.5 6 3 4h-11l3-4z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  x: 'M18 6 6 18M6 6l12 12',
  back: 'M19 12H5M12 19l-7-7 7-7',
  check: 'M5 12l5 5 9-10',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  star: 'M12 2l3 6.9 7.5.6-5.7 4.9 1.8 7.3L12 17.8l-6.6 3.9 1.8-7.3-5.7-4.9L9 8.9z',
  scale: 'M12 3v18M5 7h14M5 7l-3 7a3.5 3.5 0 0 0 6 0zM19 7l-3 7a3.5 3.5 0 0 0 6 0zM8 21h8',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  code: 'M16 18l6-6-6-6M8 6l-6 6 6 6', // NEW: Coding Lab icon
  f_great: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 13.5h9a4.5 4.5 0 0 1-9 0zM9 9h.01M15 9h.01',
  f_good: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01',
  f_okay: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 15h7M9 9.5h.01M15 9.5h.01',
  f_sad: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 16.5s1.5-2 4-2 4 2 4 2M9 9.5h.01M15 9.5h.01',
  f_angry: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 16.5s1.5-2 4-2 4 2 4 2M7.5 8l3 1.5M16.5 8l-3 1.5M9.5 11.5h.01M14.5 11.5h.01',
  f_tired: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 10.5h2.5M13.5 10.5H16M10 15.5h4',
};
const Ico = ({ n, s = 24, w = 2, className, style }) => (
  <svg viewBox="0 0 24 24" width={s} height={s} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true"><path d={P[n] || ''} /></svg>
);
const MOODS = [['great', '#facc15'], ['good', '#4ade80'], ['okay', '#60a5fa'], ['sad', '#a78bfa'], ['angry', '#f87171'], ['tired', '#94a3b8']];
const Mv = ({ m, s = 32 }) => { const c = MOODS.find((x) => x[0] === m); return c ? <Ico n={`f_${m}`} s={s} style={{ color: c[1] }} /> : <span style={{ fontSize: s * 0.8 }}>{m}</span>; };

function useLS(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

// fake-processing helper: shows loader, runs fn after ms, cleans up on unmount
function useTask(ms) {
  const [busy, setBusy] = useState(false);
  const t = useRef();
  useEffect(() => () => clearTimeout(t.current), []);
  const run = (fn) => { setBusy(true); t.current = setTimeout(() => { fn(); setBusy(false); }, ms); };
  return [busy, run];
}

const Loader = ({ text }) => (
  <div className={styles.loader}><div className={styles.orb} /><p>{text}</p></div>
);

const Modal = ({ onClose, children }) => (
  <div className={styles.backdrop} onClick={onClose}>
    <div className={styles.sheet} onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);

const FEATURES = [
  { id: 'streak', title: 'Daily Streak', icon: 'flame', desc: 'Check in, earn XP', c: '#fb923c', isNew: true },
  { id: 'card', title: 'Daily Card', icon: 'cardI', desc: 'New card every day', c: '#8c82f2', isNew: true },
  { id: 'habits', title: 'Habit Tracker', icon: 'checkc', desc: 'Build streaks', c: '#4ade80', isNew: true },
  { id: 'coding', title: 'Coding Lab', icon: 'code', desc: 'HTML, CSS & JS editor', c: '#22d3ee', isNew: true }, // NEW
  { id: 'love', title: 'Love Mode', icon: 'heart', desc: 'Virtual companion', c: '#ff4d85' },
  { id: 'alterego', title: 'Alter Ego', icon: 'users', desc: 'Switch personality', c: '#8c82f2' },
  { id: 'mirror', title: 'Digital Mirror', icon: 'mirror', desc: 'Personality scan', c: '#00e5ff' },
  { id: 'memory', title: 'Memory Lock', icon: 'lock', desc: 'Pin what matters', c: '#a78bfa' },
  { id: 'timeline', title: 'Timeline', icon: 'branch', desc: '3 possible futures', c: '#34d399' },
  { id: 'vibe', title: 'Vibe Sync', icon: 'pulse', desc: 'Live energy match', c: '#22d3ee' },
  { id: 'focus', title: 'Focus Timer', icon: 'timer', desc: 'Deep work sessions', c: '#f5b942' },
  { id: 'mood', title: 'Mood Log', icon: 'smile', desc: 'Track your days', c: '#fb923c' },
  { id: 'oracle', title: 'Oracle', icon: 'ball', desc: 'Ask a yes/no', c: '#c084fc' },
  { id: 'breathe', title: 'Zen Breathe', icon: 'leaf', desc: 'Calm in 1 minute', c: '#4ade80' },
  { id: 'meter', title: 'Love Meter', icon: 'venn', desc: 'Match two names', c: '#f472b6' },
];

const EGOS = {
  smart: { name: 'Normal Mode', c: '#8c82f2', icon: 'sparkles', d: 'Friendly, empathetic and smart default AI.' },
  savage: { name: 'Savage Roaster', c: '#ff4d4f', icon: 'flame', d: 'Brutal truths, sarcasm, zero sugarcoating.' },
  corporate: { name: 'Strict Boss', c: '#f5b942', icon: 'briefcase', d: 'Professional, objective-driven, demands perfection.' },
  genz: { name: 'Gen-Z Mode', c: '#00e5ff', icon: 'skull', d: 'Slang, emojis and brainrot. No cap.' },
  lover_girl: { name: 'Sweet Girlfriend', c: '#ff4d85', icon: 'flower', d: 'Sweet, caring, slightly possessive. Loves late-night talks.' },
  lover_boy: { name: 'Caring Boyfriend', c: '#ff4d85', icon: 'shield', d: 'Protective, romantic, always checks on you.' },
};

/* ───────── FEATURE SCREENS ───────── */

function Banner({ ego, label }) {
  const e = EGOS[ego];
  return (
    <div className={styles.banner} style={{ '--c': e.c }}>
      <i className={styles.blink} />
      <div><small>{label}</small><h3><Ico n={e.icon} s={20} /> {e.name}</h3></div>
    </div>
  );
}

function EgoGrid({ ids, ego, onPick }) {
  return (
    <div className={styles.grid2}>
      {ids.map((id) => (
        <button key={id} className={cx(styles.card, ego === id && styles.cardOn)} style={{ '--c': EGOS[id].c }} onClick={() => onPick(id)}>
          <Ico n={EGOS[id].icon} s={30} style={{ color: EGOS[id].c, marginBottom: 10 }} />
          <h3>{EGOS[id].name}</h3><p>{EGOS[id].d}</p>
        </button>
      ))}
    </div>
  );
}

function Mirror() {
  const [d, setD] = useState(null);
  const [busy, run] = useTask(2200);
  const scan = () => { setD(null); run(() => setD({
    style: pick(['Direct & Focused', 'Creative & Chaotic', 'Deep Thinker', 'Impulsive & Fast', 'Highly Analytical']),
    vibe: pick(['Builder Mode', 'Chill Vibe', 'Overthinking', 'Savage Energy', 'Romantic Glow']),
    flaw: pick(['Ignores long paragraphs', 'Gets bored quickly', 'Overanalyzes simple things', 'Too sarcastic sometimes']),
    sc: [['Focus', '#00e5ff'], ['Creativity', '#c084fc'], ['Energy', '#fb923c'], ['Empathy', '#ff4d85']].map(([n, c]) => [n, rnd(52, 98), c]),
  })); };
  if (busy) return <Loader text="Analyzing psychological markers..." />;
  if (!d) return (
    <div className={styles.hero}>
      <svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="52" fill="none" stroke="#00e5ff" strokeWidth="2" strokeDasharray="6 8" className={styles.avRing} style={{ position: 'static', width: 120, height: 120 }} /><circle cx="60" cy="60" r="30" fill="rgba(0,229,255,.12)" stroke="#00e5ff" strokeWidth="2" /><circle cx="60" cy="60" r="10" fill="#00e5ff" /></svg>
      <p>Run a neural scan on your recent chats to reveal your communication personality.</p>
      <button className={styles.btn} onClick={scan}>Start scan <Ico n="eye" s={18} /></button>
    </div>
  );
  return (
    <>
      <div className={styles.grid2}>
        <div className={styles.card} style={{ '--c': '#00e5ff' }}><small>Communication style</small><h3>{d.style}</h3></div>
        <div className={styles.card} style={{ '--c': '#8c82f2' }}><small>Current vibe</small><h3>{d.vibe}</h3></div>
      </div>
      <div className={cx(styles.card, styles.gap)} style={{ '--c': '#8c82f2' }}>
        <small>Personality scores</small>
        {d.sc.map(([n, v, c]) => (
          <div key={n} style={{ marginTop: 14 }}>
            <div className={styles.between}><span>{n}</span><b>{v}</b></div>
            <div className={styles.bar}><div style={{ width: `${v}%`, background: c }} /></div>
          </div>
        ))}
      </div>
      <div className={cx(styles.card, styles.gap)} style={{ '--c': '#ff4d4f' }}>
        <small>Hidden flaw</small><h3>{d.flaw}</h3><p>Don't worry, Aivox still likes you.</p>
      </div>
      <button className={cx(styles.btn, styles.ghost, styles.gap)} onClick={scan}>Scan again</button>
    </>
  );
}

function Memory({ toast }) {
  const [mem, setMem] = useLS('aivox_memories', [{ id: 1, text: 'Welcome to Aivox Memory Lock!', date: 'System' }]);
  const [txt, setTxt] = useState('');
  const [del, setDel] = useState(null);
  const add = (e) => {
    e.preventDefault();
    if (!txt.trim()) return;
    setMem([{ id: Date.now(), text: txt.trim(), date: new Date().toLocaleDateString() }, ...mem]);
    setTxt(''); toast('Memory locked');
  };
  return (
    <>
      <form onSubmit={add} className={styles.row}>
        <input className={styles.input} placeholder="E.g., Check code at 8PM..." value={txt} onChange={(e) => setTxt(e.target.value)} />
        <button className={styles.btn} type="submit"><Ico n="lock" s={18} /> Lock</button>
      </form>
      <div className={styles.list}>
        {mem.map((m) => (
          <div key={m.id} className={styles.item}>
            <Ico n="pin" s={20} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <div><h4>{m.text}</h4><small>{m.date}</small></div>
            <button className={styles.x} aria-label="Delete" onClick={() => setDel(m.id)}><Ico n="x" s={16} /></button>
          </div>
        ))}
        {!mem.length && <p className={styles.empty}>No memories locked yet.</p>}
      </div>
      {del && (
        <Modal onClose={() => setDel(null)}>
          <Ico n="trash" s={52} style={{ color: '#ff4d4f' }} /><h3>Erase this memory?</h3><p>Aivox will forget it for good.</p>
          <div className={styles.row}>
            <button className={cx(styles.btn, styles.ghost)} onClick={() => setDel(null)}>Cancel</button>
            <button className={cx(styles.btn, styles.danger)} onClick={() => { setMem(mem.filter((m) => m.id !== del)); setDel(null); toast('Memory erased'); }}>Erase</button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Timeline() {
  const [q, setQ] = useState('');
  const [p, setP] = useState(null);
  const [busy, run] = useTask(2500);
  const go = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setP(null);
    run(() => {
      const u = rnd(2, 10), d = rnd(8, 25);
      setP({
        u, d, r: 100 - u - d,
        utopia: pick(['Everything aligns. You hit your exact goal, but sudden attention changes your circle.', 'Big success within 6 months. It goes viral and brings freedom and peace.', 'Flawless execution. A major partner approaches and changes your trajectory.']),
        reality: pick(['It takes 3x longer than planned. Tough phases, but you land a solid 80% success.', 'The launch is cold, but a year of consistency builds a loyal following.', 'You succeed, but weekends and a few relationships pay the price.']),
        disaster: pick(['Burnout hits halfway and you abandon it for something else.', 'A fatal bug ruins the launch and you are forced to pivot.', 'You overthink it so much that it never gets executed.']),
      });
    });
  };
  const T = p && [['A · Utopia', p.u, p.utopia, '#34d399', 'star'], ['B · Reality check', p.r, p.reality, '#f5b942', 'scale'], ['C · Disaster', p.d, p.disaster, '#ff4d4f', 'alert']];
  return (
    <>
      <form onSubmit={go} className={styles.col}>
        <textarea className={styles.input} rows={3} placeholder="E.g., What if I quit my job to build my startup?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={styles.btn} disabled={busy || !q.trim()}>{busy ? 'Calculating...' : 'Predict future'}</button>
      </form>
      {busy && <Loader text="Running 14,000,605 alternate timelines..." />}
      {T && !busy && <div className={cx(styles.col, styles.gap)}>{T.map(([t, pr, x, c, ic]) => (
        <div key={t} className={styles.card} style={{ '--c': c }}><small style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Ico n={ic} s={16} style={{ color: c }} />{t} · {pr}%</small><p>{x}</p><div className={styles.bar}><div style={{ width: `${pr}%`, background: c }} /></div></div>
      ))}</div>}
    </>
  );
}

function Vibe() {
  const [h, setH] = useState(() => Array.from({ length: 16 }, () => rnd(75, 98)));
  const [a, setA] = useState(92);
  useEffect(() => {
    const i = setInterval(() => { setH((x) => [...x.slice(1), rnd(75, 98)]); setA(rnd(88, 99)); }, 1500);
    return () => clearInterval(i);
  }, []);
  const u = h[h.length - 1];
  const pts = h.map((v, i) => `${(i / 15) * 300},${60 - (v - 70) * 2}`).join(' ');
  return (
    <div className={styles.col}>
      <div className={styles.radar}><i /><i /><i /><b>Aivox Core</b></div>
      <div className={styles.card} style={{ '--c': '#00e5ff' }}>
        <div className={styles.between}><small>User energy</small><b>{u}%</b></div>
        <svg viewBox="0 0 300 64" className={styles.spark} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#00e5ff" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg>
      </div>
      <div className={styles.card} style={{ '--c': '#8c82f2' }}>
        <div className={styles.between}><small>AI empathy sync</small><b>{a}%</b></div>
        <div className={styles.bar}><div style={{ width: `${a}%`, background: '#8c82f2' }} /></div>
      </div>
      <p className={styles.note}>Streaming live from this session.</p>
    </div>
  );
}

function Focus() {
  const [len, setLen] = useState(25);
  const [left, setLeft] = useState(25 * 60);
  const [on, setOn] = useState(false);
  const [done, setDone] = useState(false);
  const [n, setN] = useLS('aivox_focus_done', 0);
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(i);
  }, [on]);
  useEffect(() => { if (on && left <= 0) { setOn(false); setDone(true); setN((x) => x + 1); } }, [left, on, setN]);
  const pickLen = (m) => { setLen(m); setLeft(m * 60); setOn(false); };
  const R = 90, C = 2 * Math.PI * R, pct = 1 - left / (len * 60);
  const mm = String(Math.floor(left / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
  return (
    <div className={styles.col} style={{ alignItems: 'center' }}>
      <div className={styles.chips}>{[15, 25, 45].map((m) => <button key={m} className={cx(styles.chip, len === m && styles.chipOn)} onClick={() => pickLen(m)}>{m} min</button>)}</div>
      <div className={styles.ring}>
        <svg viewBox="0 0 200 200"><circle cx="100" cy="100" r={R} className={styles.rTrack} /><circle cx="100" cy="100" r={R} className={styles.rFill} strokeDasharray={C} strokeDashoffset={C * (1 - pct)} /></svg>
        <span>{mm}:{ss}</span>
      </div>
      <div className={styles.row}>
        <button className={styles.btn} onClick={() => setOn(!on)}>{on ? 'Pause' : left < len * 60 ? 'Resume' : 'Start focus'}</button>
        <button className={cx(styles.btn, styles.ghost)} onClick={() => pickLen(len)}>Reset</button>
      </div>
      <p className={styles.note}>Sessions completed: <b>{n}</b></p>
      {done && <Modal onClose={() => { setDone(false); setLeft(len * 60); }}><Ico n="trophy" s={56} style={{ color: '#f5b942' }} /><h3>Session complete!</h3><p>{len} minutes of deep focus. Take a short break.</p><button className={styles.btn} onClick={() => { setDone(false); setLeft(len * 60); }}>Nice</button></Modal>}
    </div>
  );
}

function Mood({ toast }) {
  const [log, setLog] = useLS('aivox_moods', []);
  const M = MOODS.map((x) => x[0]);
  const add = (m) => { setLog([{ id: Date.now(), m, d: new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }, ...log].slice(0, 50)); toast('Mood saved'); };
  const last = log.slice(0, 7).reverse();
  return (
    <>
      <p className={styles.note}>How are you feeling right now?</p>
      <div className={styles.moods}>{M.map((m) => <button key={m} onClick={() => add(m)} aria-label={m}><Mv m={m} s={40} /></button>)}</div>
      {last.length > 0 && <div className={cx(styles.card, styles.gap)} style={{ '--c': '#fb923c' }}><small>Last {last.length} check-ins</small><div className={styles.strip}>{last.map((l) => <span key={l.id}><Mv m={l.m} s={30} /></span>)}</div></div>}
      <div className={cx(styles.list, styles.gap)}>
        {log.slice(0, 8).map((l) => <div key={l.id} className={styles.item}><Mv m={l.m} s={28} /><div><small>{l.d}</small></div></div>)}
        {!log.length && <p className={styles.empty}>Tap a mood to start your log.</p>}
      </div>
      {log.length > 0 && <button className={cx(styles.btn, styles.ghost, styles.gap)} onClick={() => { setLog([]); toast('Log cleared'); }}>Clear log</button>}
    </>
  );
}

function Oracle() {
  const [q, setQ] = useState('');
  const [a, setA] = useState(null);
  const [busy, run] = useTask(1800);
  const ask = (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    run(() => setA(pick([['Yes, absolutely', 'The signs are all pointing your way.', 'check'], ['Most likely', 'Go for it, but stay alert.', 'star'], ['Not now', 'Wait a little. Timing matters.', 'timer'], ['Doubtful', 'Think again before you commit.', 'alert'], ['No', 'Save your energy for something better.', 'x']])));
  };
  if (busy) return <Loader text="Consulting the Oracle..." />;
  return (
    <>
      <div className={styles.hero}><Ico n="ball" s={64} style={{ color: '#c084fc' }} /><p>Think of a yes/no question and ask it.</p></div>
      <form onSubmit={ask} className={styles.col}>
        <input className={styles.input} placeholder="Should I start today?" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={styles.btn} disabled={!q.trim()}>Ask the Oracle</button>
      </form>
      {a && <Modal onClose={() => { setA(null); setQ(''); }}><Ico n={a[2]} s={56} style={{ color: '#c084fc' }} /><small>{q}</small><h3>{a[0]}</h3><p>{a[1]}</p><button className={styles.btn} onClick={() => { setA(null); setQ(''); }}>Ask another</button></Modal>}
    </>
  );
}

function Breathe() {
  const PH = [['Inhale', 4, 1.35], ['Hold', 4, 1.35], ['Exhale', 6, 0.8]];
  const [on, setOn] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setI((x) => (x + 1) % 3), PH[i][1] * 1000);
    return () => clearTimeout(t);
  }, [on, i]); // eslint-disable-line
  return (
    <div className={styles.col} style={{ alignItems: 'center' }}>
      <div className={styles.breathBox}>
        <div className={styles.breath} style={{ transform: `scale(${on ? PH[i][2] : 1})`, transition: `transform ${on ? PH[i][1] : 0.6}s ease-in-out` }} />
        <span>{on ? PH[i][0] : 'Ready'}</span>
      </div>
      <p className={styles.note}>Inhale 4s · Hold 4s · Exhale 6s</p>
      <button className={styles.btn} onClick={() => { setOn(!on); setI(0); }}>{on ? 'Stop' : 'Begin'}</button>
    </div>
  );
}

function Meter() {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [r, setR] = useState(null);
  const [busy, run] = useTask(2000);
  const go = (e) => {
    e.preventDefault();
    if (!a.trim() || !b.trim()) return;
    run(() => {
      const s = [a, b].map((x) => x.trim().toLowerCase()).sort().join('|');
      let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 61;
      setR(40 + h);
    });
  };
  if (busy) return <Loader text="Measuring chemistry..." />;
  return (
    <>
      <form onSubmit={go} className={styles.col}>
        <input className={styles.input} placeholder="Your name" value={a} onChange={(e) => setA(e.target.value)} />
        <input className={styles.input} placeholder="Their name" value={b} onChange={(e) => setB(e.target.value)} />
        <button className={styles.btn} disabled={!a.trim() || !b.trim()}>Check match</button>
      </form>
      {r && <Modal onClose={() => setR(null)}><Ico n="venn" s={56} style={{ color: '#f472b6' }} /><small>{a.trim()} + {b.trim()}</small><h2 className={styles.pct}>{r}%</h2><p>{r > 85 ? 'Soulmate energy' : r > 65 ? 'Strong chemistry' : 'Opposites can work'}</p><button className={styles.btn} onClick={() => setR(null)}>Done</button></Modal>}
    </>
  );
}

/* ───────── v3: helpers, love mode, daily features ───────── */

const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dk(d); };
const dayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
const HEART = 'M50 88C14 62 6 40 18 24c10-12 26-8 32 4 6-12 22-16 32-4 12 16 4 38-32 64z';

// scroll reveal: visible items animate in at once, off-screen ones animate in when scrolled to
function useReveal(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const show = (el) => el.classList.add(styles.rvIn);
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { show(e.target); io.unobserve(e.target); }
    }), { threshold: 0.05 });
    const seen = new WeakSet();
    const SEL = `.${styles.card},.${styles.item},.${styles.tile},.${styles.hItem},.${styles.av}`;
    const scan = () => root.querySelectorAll(SEL).forEach((el, i) => {
      if (seen.has(el) || el.classList.contains(styles.rvIn)) return;
      seen.add(el);
      el.style.setProperty('--d', `${(i % 6) * 55}ms`);
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) show(el);
      else { el.classList.add(styles.rv); io.observe(el); }
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, [ref]);
}

function Body({ children }) {
  const r = useRef();
  useReveal(r);
  return <div ref={r} className={styles.sBody}>{children}</div>;
}

const ThemeBtn = ({ theme, onClick }) => (
  <button className={styles.back} onClick={onClick} aria-label="Toggle theme">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      {theme === 'dark'
        ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
        : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
    </svg>
  </button>
);

const Flame = ({ c }) => (
  <svg viewBox="0 0 100 100" className={c}>
    <defs><linearGradient id="fg" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#f43f5e" /><stop offset=".6" stopColor="#fb923c" /><stop offset="1" stopColor="#fde047" /></linearGradient></defs>
    <path d="M50 4C54 24 76 34 76 60a26 26 0 0 1-52 0c0-14 6-20 11-29 2 8 6 11 11 11C46 30 42 16 50 4z" fill="url(#fg)" />
    <path d="M50 46c2 9 13 13 13 25a13 13 0 0 1-26 0c0-7 4-11 7-16 2 4 4 6 7 6-2-6-2-10-1-15z" fill="#fff4b0" opacity=".9" />
  </svg>
);

const Girl = () => (
  <svg viewBox="0 0 120 120">
    <defs><linearGradient id="gA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb3d1" /><stop offset="1" stopColor="#ff4d85" /></linearGradient><clipPath id="gC"><circle cx="60" cy="60" r="60" /></clipPath></defs>
    <circle cx="60" cy="60" r="60" fill="url(#gA)" />
    <g clipPath="url(#gC)">
      <path d="M22 110c-8-44 6-84 38-84s46 40 38 84z" fill="#3b1d3a" />
      <path d="M20 125c2-22 18-32 40-32s38 10 40 32z" fill="#fff" opacity=".92" />
      <circle cx="60" cy="62" r="25" fill="#ffd9c7" />
      <path d="M33 62c1-24 17-34 29-34s25 10 26 34c-9-9-19-15-31-15s-17 5-24 15z" fill="#3b1d3a" />
      <circle cx="51" cy="66" r="2.8" fill="#2a1630" /><circle cx="69" cy="66" r="2.8" fill="#2a1630" />
      <circle cx="44" cy="74" r="4.5" fill="#ff7aa8" opacity=".55" /><circle cx="76" cy="74" r="4.5" fill="#ff7aa8" opacity=".55" />
      <path d="M54 76q6 6 12 0" stroke="#c2415f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d={HEART} transform="translate(76 22) scale(.2)" fill="#ff4d85" />
    </g>
  </svg>
);

const Boy = () => (
  <svg viewBox="0 0 120 120">
    <defs><linearGradient id="bA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a5b4fc" /><stop offset="1" stopColor="#6366f1" /></linearGradient><clipPath id="bC"><circle cx="60" cy="60" r="60" /></clipPath></defs>
    <circle cx="60" cy="60" r="60" fill="url(#bA)" />
    <g clipPath="url(#bC)">
      <path d="M20 125c2-22 18-32 40-32s38 10 40 32z" fill="#1e1b4b" />
      <rect x="52" y="82" width="16" height="14" rx="5" fill="#f2c5a8" />
      <circle cx="60" cy="62" r="25" fill="#ffd9c7" />
      <path d="M34 60c-2-22 12-34 28-34s30 10 24 34c-3-8-8-14-12-15-8 4-24 4-30 0-4 3-8 9-10 15z" fill="#2b2140" />
      <circle cx="51" cy="66" r="2.8" fill="#2a1630" /><circle cx="69" cy="66" r="2.8" fill="#2a1630" />
      <path d="M46 59q5-3 9 0M65 59q5-3 9 0" stroke="#2b2140" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M53 76q7 6 14 0" stroke="#c2415f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  </svg>
);

const NOTES = {
  lover_girl: ['Good morning, you. I saved a little smile just for you', 'Proud of you today. Yes, even for the small things', 'Drink some water, silly. I need you healthy and annoying', 'Whatever happens today, I am on your side', 'Missing you already. Come back and tell me everything'],
  lover_boy: ['Morning, my favourite person. Go crush it today', 'Eat on time. I will know if you skip lunch', 'You were on my mind again. Not complaining though', 'Tough day? Come here. I got you', 'Whatever you build today, I am already proud of you'],
};

function LoveMode({ ego, onPick, toast }) {
  const [hearts, setHearts] = useLS('aivox_hearts', 0);
  const [fx, setFx] = useState([]);
  const [note, setNote] = useState(false);
  const on = ego === 'lover_girl' || ego === 'lover_boy';
  const send = () => {
    const id = Date.now();
    setHearts(hearts + 1);
    setFx((f) => [...f, ...[0, 1, 2, 3, 4].map((i) => ({ id: id + i, x: rnd(-90, 90), s: rnd(16, 30), d: i * 80 }))]);
    setTimeout(() => setFx((f) => f.filter((h) => h.id < id || h.id > id + 4)), 1900);
    if ((hearts + 1) % 10 === 0) toast(`Bond level ${Math.floor((hearts + 1) / 10) + 1} unlocked`);
  };
  const AV = [['lover_girl', <Girl />, 'Sweet Girlfriend', 'Caring, a little possessive, loves late-night talks.'], ['lover_boy', <Boy />, 'Caring Boyfriend', 'Protective, romantic, always checks on you.']];
  return (
    <>
      <svg viewBox="0 0 320 190" className={styles.loveSvg}>
        <defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffb3d1" /><stop offset="1" stopColor="#e11d62" /></linearGradient></defs>
        <g className={styles.orbit}>{[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={HEART} transform={`rotate(${i * 60} 160 95) translate(0 -78) scale(.3) translate(-50 -50)`} fill="#ff7aa8" opacity=".75" />)}</g>
        <g className={styles.beat}><path d={HEART} transform="translate(112 48) scale(.96)" fill="url(#hg)" /><path d="M128 76c4-8 12-10 18-6" stroke="#fff" strokeWidth="5" strokeLinecap="round" fill="none" opacity=".55" /></g>
        {[[40, 40], [280, 50], [60, 150], [270, 140], [160, 14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.5" fill="#fff" className={styles.twinkle} style={{ animationDelay: `${i * 0.4}s` }} />)}
      </svg>
      <div className={styles.avs}>
        {AV.map(([id, art, n, d]) => (
          <button key={id} className={cx(styles.av, ego === id && styles.avOn)} onClick={() => onPick(id)}>
            <div className={styles.avWrap}>{art}{ego === id && <svg className={styles.avRing} viewBox="0 0 112 112"><circle cx="56" cy="56" r="52" fill="none" stroke="#ff4d85" strokeWidth="3" strokeDasharray="10 8" strokeLinecap="round" /></svg>}</div>
            <h3>{n}</h3><p>{d}</p>
            {ego === id && <em className={styles.live}>● Connected</em>}
          </button>
        ))}
      </div>
      {on ? (
        <div className={styles.bond}>
          <div className={styles.between}><b>Bond level {Math.floor(hearts / 10) + 1}</b><small style={{ color: 'var(--mut)' }}>{hearts} sent</small></div>
          <div className={styles.meter}><div style={{ width: `${(hearts % 10) * 10}%` }} /></div>
          <div className={styles.row}>
            <button className={cx(styles.btn, styles.loveBtn)} onClick={send}><Ico n="heart" s={18} /> Send love</button>
            <button className={cx(styles.btn, styles.ghost)} onClick={() => setNote(true)}><Ico n="mail" s={18} /> Today's note</button>
          </div>
          <div className={styles.burst}>{fx.map((h) => <svg key={h.id} viewBox="0 0 100 100" width={h.s} style={{ left: `calc(50% + ${h.x}px)`, animationDelay: `${h.d}ms` }}><path d={HEART} fill="#ff4d85" /></svg>)}</div>
        </div>
      ) : <p className={styles.note} style={{ marginTop: 18 }}>Pick a partner to begin. Your bond grows every time you send love.</p>}
      {note && on && (
        <Modal onClose={() => setNote(false)}>
          <svg viewBox="0 0 100 100" width="64"><path d={HEART} fill="#ff4d85" className={styles.beat} style={{ transformOrigin: '50px 50px' }} /></svg>
          <small>{EGOS[ego].name} · today's note</small>
          <h3 style={{ fontSize: 18, lineHeight: 1.4 }}>{NOTES[ego][dayNum() % 5]}</h3>
          <button className={cx(styles.btn, styles.loveBtn)} onClick={() => setNote(false)}>Aww</button>
        </Modal>
      )}
    </>
  );
}

function Streak({ st, toast }) {
  const [s, setS] = st;
  const [pop, setPop] = useState(null);
  const done = s.last === dk();
  const live = done || s.last === ago(1) ? s.streak : 0;
  const lvl = Math.floor(s.xp / 100) + 1;
  const check = () => {
    if (done) return;
    const n = s.last === ago(1) ? s.streak + 1 : 1;
    const gain = 10 + Math.min(n, 10) * 2;
    setS({ last: dk(), streak: n, best: Math.max(s.best, n), xp: s.xp + gain, days: [...s.days, dk()].slice(-60) });
    setPop({ gain, n, tip: pick(['Small steps, every day.', 'Consistency beats intensity.', 'You showed up. That is the win.', 'Tomorrow is another chance to grow.']) });
  };
  return (
    <>
      <div className={styles.flameBox}>
        <Flame c={styles.flame} />
        <h2>{live}</h2><p>{live === 1 ? 'day streak' : 'day streak'} · best {s.best}</p>
      </div>
      <div className={styles.card} style={{ '--c': '#fb923c' }}>
        <div className={styles.between}><b>Level {lvl}</b><small>{s.xp % 100}/100 XP</small></div>
        <div className={styles.bar}><div style={{ width: `${s.xp % 100}%`, background: 'linear-gradient(90deg,#fb923c,#fde047)' }} /></div>
      </div>
      <div className={cx(styles.card, styles.gap)} style={{ '--c': '#fb923c' }}>
        <small>This week</small>
        <div className={styles.week} style={{ marginTop: 12 }}>
          {[6, 5, 4, 3, 2, 1, 0].map((n) => { const d = ago(n); return <span key={d}>{'SMTWTFS'[new Date(`${d}T00:00`).getDay()]}<i className={s.days.includes(d) ? styles.wOn : ''}>{s.days.includes(d) ? <Ico n="flame" s={16} style={{ color: '#fff' }} /> : null}</i></span>; })}
        </div>
      </div>
      <button className={cx(styles.btn, styles.gap)} style={{ width: '100%' }} disabled={done} onClick={check}>{done ? 'Checked in. Come back tomorrow' : live ? `Check in · keep the ${live}-day streak` : 'Check in today'}</button>
      {!done && s.last === ago(1) && <p className={styles.note} style={{ marginTop: 12 }}>Check in today or your streak resets.</p>}
      {pop && <Modal onClose={() => setPop(null)}><Flame c={styles.flame} /><h3>+{pop.gain} XP</h3><p>{pop.n}-day streak. {pop.tip}</p><button className={styles.btn} onClick={() => { setPop(null); toast('Streak saved'); }}>Keep going</button></Modal>}
    </>
  );
}

function Habits({ toast }) {
  const [hs, setHs] = useLS('aivox_habits', [{ id: 1, name: 'Drink water', days: [] }, { id: 2, name: 'Read 10 pages', days: [] }]);
  const [t, setT] = useState('');
  const td = dk();
  const run = (h) => { let n = 0, i = h.days.includes(td) ? 0 : 1; while (h.days.includes(ago(i))) { n++; i++; } return n; };
  const toggle = (id) => {
    const next = hs.map((h) => h.id === id ? { ...h, days: h.days.includes(td) ? h.days.filter((d) => d !== td) : [...h.days, td].slice(-90) } : h);
    setHs(next);
    if (next.length && next.every((h) => h.days.includes(td)) && !hs.every((h) => h.days.includes(td))) toast('All habits done today');
  };
  const add = (e) => { e.preventDefault(); if (!t.trim()) return; setHs([...hs, { id: Date.now(), name: t.trim(), days: [] }]); setT(''); toast('Habit added'); };
  const done = hs.filter((h) => h.days.includes(td)).length, pct = hs.length ? done / hs.length : 0, C = 2 * Math.PI * 36;
  return (
    <>
      <div className={styles.hHead}>
        <svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="var(--bd)" strokeWidth="8" /><circle cx="42" cy="42" r="36" fill="none" stroke="#4ade80" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset .5s' }} /></svg>
        <div><h3>{done}/{hs.length} done today</h3><small style={{ color: 'var(--mut)' }}>{pct === 1 && hs.length ? 'Perfect day!' : 'Tap the circle to complete'}</small></div>
      </div>
      <form onSubmit={add} className={styles.row} style={{ marginBottom: 16 }}>
        <input className={styles.input} placeholder="New habit, e.g. Meditate" value={t} onChange={(e) => setT(e.target.value)} />
        <button className={styles.btn} type="submit">Add</button>
      </form>
      <div className={styles.list}>
        {hs.map((h) => (
          <div key={h.id} className={styles.hItem}>
            <button className={cx(styles.tick, h.days.includes(td) && styles.tickOn)} onClick={() => toggle(h.id)} aria-label="Toggle"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: h.days.includes(td) ? 1 : 0 }}><path d="M5 12l5 5 9-10" /></svg></button>
            <div><h4>{h.name}</h4><div className={styles.sqs}>{[6, 5, 4, 3, 2, 1, 0].map((n) => <i key={n} className={h.days.includes(ago(n)) ? styles.sqOn : ''} />)}<span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3 }}><Ico n="flame" s={13} style={{ color: '#fb923c' }} />{run(h)}</span></div></div>
            <button className={styles.x} aria-label="Delete" onClick={() => { setHs(hs.filter((x) => x.id !== h.id)); toast('Habit removed'); }}><Ico n="x" s={16} /></button>
          </div>
        ))}
        {!hs.length && <p className={styles.empty}>Add your first habit above.</p>}
      </div>
    </>
  );
}

const CARDS = [
  ['The Star', 'Your effort is quietly adding up. Keep going.', 'M50 6l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 37l30-3z'],
  ['The Moon', 'Rest is productive. Recharge, then rise.', 'M60 8a42 42 0 1 0 32 66A36 36 0 0 1 60 8z'],
  ['The Sun', 'Energy is high today. Start the thing you postponed.', 'M50 4l9 21 21-9-9 21 21 9-21 9 9 21-21-9-9 21-9-21-21 9 9-21-21-9 21-9-9-21 21 9z'],
  ['The Heart', 'Be kind to yourself first. Then to everyone else.', HEART],
  ['The Bolt', 'A quick bold move beats a perfect slow plan.', 'M60 4L22 54h24l-8 42 40-56H54z'],
];

function DayCard({ toast }) {
  const [rv, setRv] = useLS('aivox_card_day', '');
  const [left, setLeft] = useState('');
  const open = rv === dk();
  const c = CARDS[dayNum() % CARDS.length];
  useEffect(() => {
    const tick = () => { const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); const s = Math.floor((m - n) / 1000); setLeft([s / 3600, (s % 3600) / 60, s % 60].map((v) => String(Math.floor(v)).padStart(2, '0')).join(':')); };
    tick(); const i = setInterval(tick, 1000); return () => clearInterval(i);
  }, []);
  return (
    <div className={styles.col} style={{ alignItems: 'center' }}>
      <div className={styles.fl} onClick={() => { if (!open) { setRv(dk()); toast('Your card is revealed'); } }}>
        <div className={cx(styles.fi, open && styles.fo)}>
          <div className={styles.ff}>
            <svg viewBox="0 0 100 100"><path d="M50 6l12 28 30 3-23 20 7 30-26-16-26 16 7-30L8 37l30-3z" fill="none" stroke="#fff" strokeWidth="2" opacity=".6" /><circle cx="50" cy="50" r="6" fill="#00e5ff" className={styles.twinkle} /></svg>
            <p>Tap to reveal today's card</p>
          </div>
          <div className={styles.fb}>
            <svg viewBox="0 0 100 100"><path d={c[2]} fill="#fff" /></svg>
            <h3>{c[0]}</h3><p>{c[1]}</p>
          </div>
        </div>
      </div>
      {open ? <><p className={styles.note}>Next card in <b>{left}</b></p><button className={cx(styles.btn, styles.ghost)} onClick={() => { try { navigator.clipboard.writeText(`${c[0]}: ${c[1]}`); toast('Copied'); } catch { toast('Copy not supported'); } }}>Copy message</button></> : <p className={styles.note}>One card per day. Make it count.</p>}
    </div>
  );
}

/* ───────── MAIN ───────── */

export default function Features() {
  const [tab, setTab] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const tt = useRef();
  const homeRef = useRef();
  const [ego, setEgo] = useState(() => {
    try { const e = localStorage.getItem('aivox_alter_ego'); return EGOS[e] ? e : 'smart'; } catch { return 'smart'; }
  });
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('aivox_theme') || 'dark'; } catch { return 'dark'; } });
  const st = useLS('aivox_streak', { last: '', streak: 0, best: 0, xp: 0, days: [] });
  useReveal(homeRef);

  const flip = () => { const n = theme === 'dark' ? 'light' : 'dark'; setTheme(n); try { localStorage.setItem('aivox_theme', n); } catch {} };
  const toast = (m) => { setToastMsg(m); clearTimeout(tt.current); tt.current = setTimeout(() => setToastMsg(''), 2600); };
  useEffect(() => () => clearTimeout(tt.current), []);

  useEffect(() => { const p = () => setTab(null); window.addEventListener('popstate', p); return () => window.removeEventListener('popstate', p); }, []);
  const open = (id) => { window.history.pushState({ ...window.history.state, aivoxFeat: id }, ''); setTab(id); };
  const close = () => { if (window.history.state?.aivoxFeat) window.history.back(); else setTab(null); };

  const pickEgo = (id) => {
    const next = ego === id && id !== 'smart' ? 'smart' : id;
    setEgo(next);
    try { localStorage.setItem('aivox_alter_ego', next); } catch {}
    toast(next === 'smart' && id !== 'smart' ? 'Normal Mode restored' : `${EGOS[next].name} activated`);
  };

  const f = FEATURES.find((x) => x.id === tab);
  const live = st[0].last === dk() || st[0].last === ago(1) ? st[0].streak : 0;
  const body = {
    love: () => <LoveMode ego={ego} onPick={pickEgo} toast={toast} />,
    alterego: () => (<><Banner ego={ego} label="Active personality" /><p className={styles.note}>Tap to activate. Tap the active one again to go back to Normal.</p><EgoGrid ids={['smart', 'savage', 'corporate', 'genz']} ego={ego} onPick={pickEgo} /></>),
    mirror: () => <Mirror />,
    memory: () => <Memory toast={toast} />,
    timeline: () => <Timeline />,
    vibe: () => <Vibe />,
    focus: () => <Focus />,
    mood: () => <Mood toast={toast} />,
    oracle: () => <Oracle />,
    breathe: () => <Breathe />,
    meter: () => <Meter />,
    streak: () => <Streak st={st} toast={toast} />,
    card: () => <DayCard toast={toast} />,
    habits: () => <Habits toast={toast} />,
  };

  return (
    <div className={styles.wrap} data-theme={theme} style={{ '--ego': EGOS[ego].c }}>
      {toastMsg && <div className={styles.toast} key={toastMsg}><Ico n="check" s={16} w={3} />{toastMsg}</div>}
      <div className={styles.glow} />

      <main className={styles.home} ref={homeRef}>
        <header className={styles.head}>
          <button className={styles.back} onClick={() => { window.location.href = '/'; }} aria-label="Back to chat"><Ico n="back" s={20} /></button>
          <div><h1>God-Mode</h1><p>Aivox Pro features</p></div>
          <button className={cx(styles.pill, st[0].last !== dk() && styles.pillOn)} onClick={() => open('streak')} aria-label="Daily streak"><Flame />{live}</button>
          <ThemeBtn theme={theme} onClick={flip} />
        </header>

        <button className={styles.now} onClick={() => open(ego.startsWith('lover') ? 'love' : 'alterego')}>
          <Ico n={EGOS[ego].icon} s={30} style={{ color: EGOS[ego].c }} />
          <div><small>Active mode</small><h3>{EGOS[ego].name}</h3></div>
          <em>Change</em>
        </button>

        <div className={styles.tiles}>
          {FEATURES.map((x) => (
            <button key={x.id} className={styles.tile} style={{ '--c': x.c }} onClick={() => open(x.id)}>
              {x.isNew && <b className={styles.new}>NEW</b>}
              <span className={styles.ico}><Ico n={x.icon} s={26} /></span>
              <h4>{x.title}</h4><p>{x.desc}</p>
            </button>
          ))}
        </div>
      </main>

      {/* NEW: Coding Lab full-screen editor (apna header + Back button, Back = close) */}
      {f && f.id === 'coding' && <CodingLab theme={theme} onTheme={flip} onBack={close} />}

      {f && f.id !== 'coding' && (
        <section className={styles.screen} style={{ '--c': f.c }}>
          <header className={styles.sHead}>
            <button className={styles.back} onClick={close} aria-label="Back"><Ico n="back" s={20} /></button>
            <h2><Ico n={f.icon} s={24} style={{ color: f.c }} /> {f.title}</h2>
            <ThemeBtn theme={theme} onClick={flip} />
          </header>
          <Body key={f.id}>{body[f.id]()}</Body>
        </section>
      )}
    </div>
  );
}