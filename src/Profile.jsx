import { useState, useEffect, useRef, useCallback } from 'react';
import { auth } from './firebase';
import {
  onAuthStateChanged,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import styles from './Profile.module.css';

/* ═══════════════════════════════════════════════
   Constants & helpers
   ═══════════════════════════════════════════════ */

const LS = {
  guest: 'aivox_guest_name',
  chats: 'aivox_chat_history',
  days: 'aivox_active_days', // days the user was active (streak + activity map)
  accent: 'aivox_accent', // chosen accent colour
  avatar: 'aivox_avatar', // chosen avatar style
  theme: 'aivox_theme', // 'dark' | 'light' | 'auto'
  prefs: 'aivox_prefs', // preference toggles
  xpBank: 'aivox_xp_bank', // chats counted before history was cleared
  lastLevel: 'aivox_last_level', // last level the user was congratulated for
};

// a = main colour, b = second gradient colour, d = deeper shade (used on light theme + buttons)
const ACCENTS = [
  { id: 'violet', name: 'Violet', a: '#8c82f2', b: '#00e5ff', d: '#5a4fd8', rgb: '140, 130, 242' },
  { id: 'ocean', name: 'Ocean', a: '#4d8dff', b: '#2ad4ff', d: '#1f5fd6', rgb: '77, 141, 255' },
  { id: 'emerald', name: 'Emerald', a: '#12b886', b: '#5eead4', d: '#0b7d5c', rgb: '18, 184, 134' },
  { id: 'rose', name: 'Rose', a: '#ff5c8a', b: '#ffb36b', d: '#d42a62', rgb: '255, 92, 138' },
  { id: 'sunset', name: 'Sunset', a: '#ff8a4c', b: '#ff5c8a', d: '#d4560f', rgb: '255, 138, 76' },
  { id: 'aurora', name: 'Aurora', a: '#b46bff', b: '#ff6bd6', d: '#7c2fe0', rgb: '180, 107, 255' },
];

// "auto" follows the accent theme. "gold" is for Premium members only.
const AVATAR_STYLES = [
  { id: 'auto', name: 'Match theme' },
  { id: 'gold', name: 'Gold', c1: '#ffe08a', c2: '#f5b942', fg: '#2a1a00', premium: true },
  { id: 'midnight', name: 'Midnight', c1: '#5b6bff', c2: '#1b1f5e', fg: '#ffffff' },
  { id: 'sunset', name: 'Sunset', c1: '#ff8a4c', c2: '#ff3d77', fg: '#ffffff' },
  { id: 'mint', name: 'Mint', c1: '#2de2a6', c2: '#0f8f80', fg: '#04211b' },
  { id: 'rose', name: 'Rose', c1: '#ff7eb3', c2: '#a63fd0', fg: '#ffffff' },
];

const THEMES = [
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'auto', label: 'Auto', icon: 'monitor' },
];

const RANKS = [
  { name: 'Rookie', min: 1, blurb: 'Just getting started' },
  { name: 'Explorer', min: 2, blurb: 'Finding your feet' },
  { name: 'Pro', min: 4, blurb: 'A confident chatter' },
  { name: 'Elite', min: 7, blurb: 'Chat royalty' },
  { name: 'Legend', min: 10, blurb: 'The very top' },
];

const DEFAULT_PREFS = {
  reduceMotion: false,
  compact: false,
  notifications: true,
  autoSave: true,
};

const PERKS = [
  { title: 'Unlimited chats', desc: 'Talk as much as you like' },
  { title: 'Ad-free experience', desc: 'No ads, no distractions' },
  { title: 'God Mode Roaster', desc: 'Exclusive personality unlocked' },
  { title: 'Chats on every device', desc: 'Pick up where you left off' },
  { title: 'Faster responses', desc: 'Skip the queue' },
  { title: 'Early access', desc: 'Try new features first' },
  { title: 'Gold avatar and badge', desc: 'Show you are a founder' },
  { title: 'Profile card and backups', desc: 'Share it, export it, restore it' },
];

const COMPARE = [
  { label: 'AI chat', free: true, premium: true },
  { label: 'Unlimited chats', free: false, premium: true },
  { label: 'Chats on every device', free: false, premium: true },
  { label: 'God Mode Roaster', free: false, premium: true },
  { label: 'Ad-free experience', free: false, premium: true },
  { label: 'Gold avatar and badge', free: false, premium: true },
  { label: 'Price', free: '$0', premium: '$0 forever' },
];

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'activity', label: 'Activity', icon: 'chart' },
  { id: 'plan', label: 'Subscription', icon: 'crown' },
  { id: 'badges', label: 'Achievements', icon: 'award' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
];

const PROVIDERS = {
  'google.com': 'Google',
  password: 'Email & password',
  'github.com': 'GitHub',
  'facebook.com': 'Facebook',
  'twitter.com': 'X (Twitter)',
  'microsoft.com': 'Microsoft',
  'apple.com': 'Apple',
  phone: 'Phone number',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HEAT_WEEKS = 18;
const RING_R = 34;
const RING_C = 2 * Math.PI * RING_R;
const CONFETTI_COLORS = ['var(--accent)', 'var(--accent2)', '#f5b942', '#ff5c8a', '#12b886'];

/* ── Safe localStorage wrappers (never crash in private mode) ── */
const readRaw = (key, fallback = '') => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
};
const writeRaw = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false; // storage unavailable or full
  }
};
const readJSON = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJSON = (key, value) => writeRaw(key, JSON.stringify(value));

/* ── Date / streak helpers ── */
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parseKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const calcStreak = (set) => {
  let count = 0;
  const d = new Date();
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(dayKey(d))) {
    count += 1;
    d.setDate(d.getDate() - 1);
  }
  return count;
};

const calcBestStreak = (sortedKeys) => {
  let best = 0;
  let cur = 0;
  let prev = null;
  sortedKeys.forEach((k) => {
    if (prev) {
      const next = parseKey(prev);
      next.setDate(next.getDate() + 1);
      cur = dayKey(next) === k ? cur + 1 : 1;
    } else {
      cur = 1;
    }
    best = Math.max(best, cur);
    prev = k;
  });
  return best;
};

// If your saved chats carry a timestamp, they also count towards the streak.
const chatDays = (chats) =>
  chats
    .map((c) => {
      const raw = c?.timestamp ?? c?.createdAt ?? c?.date ?? c?.time ?? c?.id;
      if (!raw) return null;
      const d = new Date(raw);
      return !isNaN(d) && d.getFullYear() > 2000 ? dayKey(d) : null;
    })
    .filter(Boolean);

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d)
    ? '—'
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatMonthYear = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 22) return 'Good evening';
  return 'Good night';
};

const getRank = (lvl) => {
  let current = RANKS[0];
  RANKS.forEach((r) => {
    if (lvl >= r.min) current = r;
  });
  return current.name;
};

const resolveAvatar = (id, accent, isGuest) => {
  let s = AVATAR_STYLES.find((x) => x.id === id) || AVATAR_STYLES[0];
  if (s.premium && isGuest) s = AVATAR_STYLES[0]; // gold is Premium only
  if (s.id === 'auto') return { ...s, c1: accent.a, c2: accent.b, fg: '#ffffff' };
  return s;
};

const copyText = async (text) => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy copy */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Rounded-rectangle path (works in every browser, unlike ctx.roundRect)
const roundRectPath = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/* ═══════════════════════════════════════════════
   Small UI pieces
   ═══════════════════════════════════════════════ */

const ICONS = {
  back: (<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>),
  chat: (<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  star: (<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  check: (<polyline points="20 6 9 17 4 12" />),
  x: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  shield: (<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />),
  lock: (<><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  zap: (<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />),
  download: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  upload: (<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></>),
  trash: (<><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>),
  share: (<><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>),
  flame: (<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />),
  award: (<><circle cx="12" cy="8" r="7" /><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>),
  chart: (<><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>),
  crown: (<><path d="M2 19h20" /><path d="M3 8l4.5 4L12 4l4.5 8L21 8l-2 11H5L3 8z" /></>),
  sliders: (<><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>),
  mail: (<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>),
  key: (<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />),
  bell: (<><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></>),
  database: (<><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></>),
  layers: (<><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>),
  clock: (<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  user: (<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  alert: (<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  circle: (<circle cx="12" cy="12" r="10" />),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  flag: (<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></>),
  sun: (<><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>),
  moon: (<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />),
  monitor: (<><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></>),
};

function Icon({ name, size = 18, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
      onClick={onChange}
    >
      <span className={styles.knob} />
    </button>
  );
}

function SettingRow({ icon, title, desc, children }) {
  return (
    <div className={styles.settingRow}>
      <span className={styles.settingIcon}><Icon name={icon} size={17} /></span>
      <div className={styles.settingText}>
        <p className={styles.settingTitle}>{title}</p>
        {desc && <p className={styles.settingDesc}>{desc}</p>}
      </div>
      <div className={styles.settingControl}>{children}</div>
    </div>
  );
}

function CardHead({ icon, title, tag }) {
  return (
    <div className={styles.cardHead}>
      <span className={styles.cardHeadIcon}><Icon name={icon} size={16} /></span>
      <h3>{title}</h3>
      {tag && <span className={styles.mutedTag}>{tag}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   Profile page
   ═══════════════════════════════════════════════ */

function Profile() {
  const [authUser, setAuthUser] = useState(null);
  const [guestName] = useState(() => readRaw(LS.guest));
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [imgError, setImgError] = useState(false);

  const [totalChats, setTotalChats] = useState(0);
  const [xpBank, setXpBank] = useState(() => Number(readRaw(LS.xpBank, 0)) || 0);
  const [activeDays, setActiveDays] = useState([]);

  const [tab, setTab] = useState('overview');
  const [accentId, setAccentId] = useState(() => readRaw(LS.accent, 'violet'));
  const [avatarId, setAvatarId] = useState(() => readRaw(LS.avatar, ''));
  const [theme, setTheme] = useState(() => {
    const t = readRaw(LS.theme, 'dark');
    return ['dark', 'light', 'auto'].includes(t) ? t : 'dark';
  });
  const [systemDark, setSystemDark] = useState(() =>
    window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  );
  const [prefs, setPrefs] = useState(() => ({ ...DEFAULT_PREFS, ...readJSON(LS.prefs, {}) }));

  const [toast, setToast] = useState(null);
  const [showClear, setShowClear] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);

  const effectiveTheme = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;
  const isLight = effectiveTheme === 'light';

  /* ── Toast ── */
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* ── Follow the system theme when set to "Auto" ── */
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  /* ── Load chats, record today's activity, listen to auth ── */
  useEffect(() => {
    const saved = readJSON(LS.chats, []);
    const list = Array.isArray(saved) ? saved : [];
    setTotalChats(list.length);

    const stored = readJSON(LS.days, []);
    const merged = Array.from(
      new Set([...(Array.isArray(stored) ? stored : []), ...chatDays(list), dayKey(new Date())])
    )
      .sort()
      .slice(-400);
    writeJSON(LS.days, merged);
    setActiveDays(merged);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  /* ── Level-up celebration (only when the level is higher than last time) ── */
  useEffect(() => {
    if (loading) return;
    const lvl = Math.floor(((xpBank + totalChats) * 15) / 100) + 1;
    const seenRaw = readRaw(LS.lastLevel, '');
    const seen = Number(seenRaw) || 0;
    if (!seenRaw) {
      writeRaw(LS.lastLevel, lvl); // first visit: just remember, don't celebrate
      return;
    }
    if (lvl > seen) {
      setCelebrate({ level: lvl, rank: getRank(lvl) });
      writeRaw(LS.lastLevel, lvl);
    }
  }, [loading, xpBank, totalChats]);

  /* ── Close dialogs with Escape ── */
  useEffect(() => {
    if (!showClear && !celebrate) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowClear(false);
        setCelebrate(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showClear, celebrate]);

  /* ── Actions ── */
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await signOut(auth);
      localStorage.removeItem(LS.guest);
      window.location.href = '/auth';
    } catch (error) {
      console.error('Logout failed', error);
      setIsLoggingOut(false);
      showToast('Could not log out. Please try again.', 'error');
    }
  };

  const changeTheme = (id) => {
    setTheme(id);
    writeRaw(LS.theme, id);
    const label = THEMES.find((t) => t.id === id)?.label || 'New';
    showToast(`${label} theme on`);
  };

  const toggleTheme = () => changeTheme(isLight ? 'dark' : 'light');

  const changeAccent = (id) => {
    setAccentId(id);
    writeRaw(LS.accent, id);
    const picked = ACCENTS.find((a) => a.id === id);
    showToast(`${picked ? picked.name : 'New'} accent applied`);
  };

  const changeAvatar = (id) => {
    const picked = AVATAR_STYLES.find((a) => a.id === id);
    if (!picked) return;
    if (picked.premium && !authUser) {
      showToast('Gold avatar is for Premium members. Create an account to unlock it.', 'error');
      return;
    }
    setAvatarId(id);
    writeRaw(LS.avatar, id);
    showToast(`${picked.name} avatar applied`);
  };

  const togglePref = (key) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    writeJSON(LS.prefs, next);
  };

  const confirmClear = () => {
    try {
      localStorage.removeItem(LS.chats);
    } catch {
      /* ignore */
    }
    // Keep XP & level: bank the chats we are about to delete.
    const bank = xpBank + totalChats;
    setXpBank(bank);
    writeRaw(LS.xpBank, bank);
    setTotalChats(0);
    setShowClear(false);
    showToast('Chat history cleared');
  };

  /* ── Restore chats from an exported backup file ── */
  const handleRestore = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // lets the same file be chosen again later
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast('That file is too large (max 10 MB)', 'error');
      return;
    }
    try {
      const data = JSON.parse(await file.text());
      const incoming = Array.isArray(data) ? data : data?.chats;
      if (!Array.isArray(incoming)) throw new Error('No chats array in file');

      const current = readJSON(LS.chats, []);
      const list = Array.isArray(current) ? current : [];
      const seen = new Set(list.map((c) => JSON.stringify(c)));
      const fresh = incoming.filter((c) => {
        const k = JSON.stringify(c);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      if (!fresh.length) {
        showToast('No new chats found in this backup');
        return;
      }
      if (!writeJSON(LS.chats, [...list, ...fresh])) {
        showToast('Not enough browser storage to restore this backup', 'error');
        return;
      }
      setTotalChats(list.length + fresh.length);
      // These chats were already counted in XP when they were cleared, so don't count them twice.
      const bank = Math.max(0, xpBank - fresh.length);
      setXpBank(bank);
      writeRaw(LS.xpBank, bank);
      showToast(`Restored ${fresh.length} chat${fresh.length === 1 ? '' : 's'}`);
    } catch (err) {
      console.error('Restore failed', err);
      showToast('That file is not a valid Aivox backup', 'error');
    }
  };

  /* ── Page state ── */
  if (loading || isLoggingOut) {
    return (
      <div className={`${styles.loadingContainer} ${isLight ? styles.loadingLight : ''}`}>
        <svg className={styles.spinnerCircle} width="60" height="60" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="4" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="30 100" strokeLinecap="round" />
        </svg>
        <h2 className={styles.loadingText}>
          {isLoggingOut ? 'Logging out securely…' : 'Loading profile…'}
        </h2>
      </div>
    );
  }

  /* ── Derived data ── */
  const isGuest = !authUser;
  const accent = ACCENTS.find((a) => a.id === accentId) || ACCENTS[0];
  const rootStyle = {
    '--accent': accent.a,
    '--accent2': accent.b,
    '--accent-deep': accent.d,
    '--accent-ink': isLight ? accent.d : accent.b,
    '--accent-rgb': accent.rgb,
  };

  // The name is read-only: it comes from the account (or the guest session).
  const currentDisplayName = isGuest
    ? guestName || 'User'
    : authUser.displayName || authUser.email?.split('@')[0] || 'User';
  const initial = currentDisplayName.charAt(0).toUpperCase();
  const showPhoto = !isGuest && authUser.photoURL && !imgError;

  const avatarStyle = resolveAvatar(avatarId || (isGuest ? 'auto' : 'gold'), accent, isGuest);
  const avatarBg = `linear-gradient(135deg, ${avatarStyle.c1}, ${avatarStyle.c2})`;

  const lifetimeChats = xpBank + totalChats;
  const userXP = lifetimeChats * 15;
  const userLevel = Math.floor(userXP / 100) + 1;
  const xpInLevel = userXP % 100;
  const rank = getRank(userLevel);
  const nextRank = RANKS.find((r) => r.min > userLevel);

  /* ── Activity ── */
  const activeSet = new Set(activeDays);
  const streak = calcStreak(activeSet);
  const sortedDays = Array.from(activeSet).sort();
  const bestStreak = Math.max(calcBestStreak(sortedDays), streak);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      key: dayKey(d),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      isToday: i === 6,
    };
  });
  const activeThisWeek = weekDays.filter((d) => activeSet.has(d.key)).length;

  const todayKey = dayKey(new Date());
  const heatEnd = new Date();
  heatEnd.setDate(heatEnd.getDate() + (6 - heatEnd.getDay())); // end on this week's Saturday
  const heatDays = Array.from({ length: HEAT_WEEKS * 7 }, (_, i) => {
    const d = new Date(heatEnd);
    d.setDate(heatEnd.getDate() - (HEAT_WEEKS * 7 - 1 - i));
    const key = dayKey(d);
    return {
      key,
      label: d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }),
      on: activeSet.has(key),
      future: key > todayKey,
      today: key === todayKey,
    };
  });
  const activeInMap = heatDays.filter((d) => d.on).length;

  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  sortedDays.forEach((k) => {
    weekdayCounts[parseKey(k).getDay()] += 1;
  });
  const favDay = sortedDays.length
    ? WEEKDAYS[weekdayCounts.indexOf(Math.max(...weekdayCounts))]
    : '—';
  const perDay = sortedDays.length ? (lifetimeChats / sortedDays.length).toFixed(1) : '0';

  const insights = [
    { icon: 'flame', label: 'Best streak', value: `${bestStreak} day${bestStreak === 1 ? '' : 's'}` },
    { icon: 'calendar', label: 'Active days', value: sortedDays.length },
    { icon: 'star', label: 'Favourite day', value: favDay },
    { icon: 'chart', label: 'Chats per active day', value: perDay },
  ];

  /* ── Account ── */
  const providerIds = authUser ? authUser.providerData.map((p) => p.providerId) : [];
  const hasPassword = providerIds.includes('password');
  const providerLabel = providerIds.length
    ? providerIds.map((p) => PROVIDERS[p] || p).join(', ')
    : 'Email';
  const emailVerified = !!authUser?.emailVerified;
  const createdAt = authUser?.metadata?.creationTime;
  const lastSignIn = authUser?.metadata?.lastSignInTime;

  /* ── Achievements ── */
  const rawBadges = [
    { id: 'hello', icon: 'chat', title: 'First hello', desc: 'Send your first chat', cur: lifetimeChats, goal: 1 },
    { id: 'chatter', icon: 'chat', title: 'Chatterbox', desc: 'Reach 25 chats', cur: lifetimeChats, goal: 25 },
    { id: 'master', icon: 'award', title: 'Conversation master', desc: 'Reach 100 chats', cur: lifetimeChats, goal: 100 },
    { id: 'lvl5', icon: 'zap', title: 'Rising star', desc: 'Reach level 5', cur: userLevel, goal: 5 },
    { id: 'streak3', icon: 'flame', title: 'On fire', desc: '3-day activity streak', cur: bestStreak, goal: 3 },
    { id: 'streak7', icon: 'flame', title: 'Week warrior', desc: '7-day activity streak', cur: bestStreak, goal: 7 },
    { id: 'secured', icon: 'shield', title: 'Secured', desc: 'Create an account', cur: isGuest ? 0 : 1, goal: 1 },
    { id: 'verified', icon: 'check', title: 'Verified', desc: 'Verify your email', cur: emailVerified ? 1 : 0, goal: 1 },
    { id: 'founder', icon: 'crown', title: 'Founding member', desc: 'Join the first 100 users', cur: isGuest ? 0 : 1, goal: 1 },
    { id: 'stylist', icon: 'sliders', title: 'Stylist', desc: 'Change your theme or avatar', cur: accentId !== 'violet' || avatarId || theme !== 'dark' ? 1 : 0, goal: 1 },
  ];
  const badges = rawBadges.map((b) => ({
    ...b,
    done: b.cur >= b.goal,
    pct: Math.min(100, Math.round((b.cur / b.goal) * 100)),
  }));
  const unlockedCount = badges.filter((b) => b.done).length;
  const nextGoal = badges
    .filter((b) => !b.done)
    .sort((a, b) => b.pct - a.pct)[0];

  const stats = [
    { icon: 'chat', label: 'Messages exchanged', value: lifetimeChats },
    { icon: 'zap', label: `Level · ${rank}`, value: userLevel },
    { icon: 'flame', label: 'Day streak', value: streak },
    { icon: 'award', label: 'Achievements', value: `${unlockedCount}/${badges.length}` },
  ];

  /* ── Handlers that need derived data ── */
  const handleVerifyEmail = async () => {
    try {
      await sendEmailVerification(auth.currentUser);
      showToast(`Verification email sent to ${authUser.email}`);
    } catch (err) {
      console.error(err);
      showToast(
        err?.code === 'auth/too-many-requests'
          ? 'Too many requests. Please try again later.'
          : 'Could not send the verification email.',
        'error'
      );
    }
  };

  const handlePasswordReset = async () => {
    try {
      await sendPasswordResetEmail(auth, authUser.email);
      showToast(`Reset link sent to ${authUser.email}`);
    } catch (err) {
      console.error(err);
      showToast('Could not send the reset link. Try again later.', 'error');
    }
  };

  const handleExport = () => {
    const chats = readJSON(LS.chats, []);
    const payload = {
      app: 'Aivox',
      exportedAt: new Date().toISOString(),
      profile: {
        name: currentDisplayName,
        email: authUser?.email || null,
        plan: isGuest ? 'Free' : 'Premium (lifetime)',
        level: userLevel,
      },
      totalChats: Array.isArray(chats) ? chats.length : 0,
      chats,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `aivox-data-${dayKey(new Date())}.json`);
    showToast('Your data was exported');
  };

  const handleInvite = async () => {
    const link = `${window.location.origin}/auth`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Aivox',
          text: 'Join me on Aivox, the AI chat that talks back.',
          url: link,
        });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    const ok = await copyText(link);
    showToast(ok ? 'Invite link copied' : 'Could not copy the link', ok ? 'success' : 'error');
  };

  /* ── Shareable profile card (PNG) — follows the current theme ── */
  const handleShareCard = async () => {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;

      const W = 1200;
      const H = 630;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      const font = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
      const gold = '245, 185, 66';

      const P = isLight
        ? {
            bg1: '#f8f7ff', bg2: '#e7e5fa', name: '#15132e', soft: '#4a4d68', muted: '#6a6d88',
            panel: 'rgba(24,22,58,0.06)', divider: 'rgba(24,22,58,0.1)', frame: 'rgba(24,22,58,0.14)',
            pillBg: 'rgba(24,22,58,0.07)', pillBorder: 'rgba(24,22,58,0.16)', pillText: '#4a4d68',
            goldText: '#9a6200', glowA: 0.22,
          }
        : {
            bg1: '#12102a', bg2: '#08070d', name: '#ffffff', soft: '#b9bccf', muted: '#8a8d9e',
            panel: 'rgba(255,255,255,0.05)', divider: 'rgba(255,255,255,0.08)', frame: 'rgba(255,255,255,0.14)',
            pillBg: 'rgba(255,255,255,0.07)', pillBorder: 'rgba(255,255,255,0.18)', pillText: '#b9bccf',
            goldText: '#f7d36a', glowA: 0.3,
          };

      // Background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, P.bg1);
      bg.addColorStop(1, P.bg2);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const glow = (x, y, r, rgb, alpha) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      };
      glow(1050, 60, 520, isGuest ? accent.rgb : gold, P.glowA);
      glow(80, 620, 480, accent.rgb, P.glowA - 0.02);

      // Frame
      roundRectPath(ctx, 24, 24, W - 48, H - 48, 36);
      ctx.lineWidth = 2;
      ctx.strokeStyle = isGuest ? P.frame : `rgba(${gold}, 0.6)`;
      ctx.stroke();

      // Avatar
      const ax = 200;
      const ay = 230;
      ctx.beginPath();
      ctx.arc(ax, ay, 112, 0, Math.PI * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = isGuest ? accent.a : '#f5b942';
      ctx.stroke();
      const ag = ctx.createLinearGradient(ax - 100, ay - 100, ax + 100, ay + 100);
      ag.addColorStop(0, avatarStyle.c1);
      ag.addColorStop(1, avatarStyle.c2);
      ctx.beginPath();
      ctx.arc(ax, ay, 100, 0, Math.PI * 2);
      ctx.fillStyle = ag;
      ctx.fill();
      ctx.fillStyle = avatarStyle.fg;
      ctx.font = `800 100px ${font}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initial, ax, ay + 6);

      // Name + rank
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      let size = 64;
      ctx.font = `800 ${size}px ${font}`;
      while (ctx.measureText(currentDisplayName).width > 700 && size > 30) {
        size -= 2;
        ctx.font = `800 ${size}px ${font}`;
      }
      ctx.fillStyle = P.name;
      ctx.fillText(currentDisplayName, 350, 225);

      ctx.font = `600 28px ${font}`;
      ctx.fillStyle = P.soft;
      ctx.fillText(`${rank} · Level ${userLevel}`, 350, 272);

      // Plan pill
      const pillText = isGuest ? 'Standard user' : 'Premium member';
      ctx.font = `700 22px ${font}`;
      const pw = ctx.measureText(pillText).width + 44;
      roundRectPath(ctx, 350, 300, pw, 46, 23);
      ctx.fillStyle = isGuest ? P.pillBg : `rgba(${gold}, 0.18)`;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = isGuest ? P.pillBorder : `rgba(${gold}, 0.6)`;
      ctx.stroke();
      ctx.fillStyle = isGuest ? P.pillText : P.goldText;
      ctx.fillText(pillText, 372, 332);

      // Stats panel
      roundRectPath(ctx, 60, 410, W - 120, 130, 26);
      ctx.fillStyle = P.panel;
      ctx.fill();
      const cardStats = [
        [String(lifetimeChats), 'Messages'],
        [String(userLevel), 'Level'],
        [String(streak), 'Day streak'],
        [`${unlockedCount}/${badges.length}`, 'Achievements'],
      ];
      const colW = (W - 120) / cardStats.length;
      cardStats.forEach(([value, label], i) => {
        const cx = 60 + colW * i + colW / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = P.name;
        ctx.font = `800 52px ${font}`;
        ctx.fillText(value, cx, 482);
        ctx.fillStyle = P.muted;
        ctx.font = `500 22px ${font}`;
        ctx.fillText(label, cx, 518);
        if (i > 0) {
          ctx.fillStyle = P.divider;
          ctx.fillRect(60 + colW * i, 435, 2, 80);
        }
      });

      // Footer
      ctx.textAlign = 'left';
      ctx.fillStyle = P.name;
      ctx.font = `800 30px ${font}`;
      ctx.fillText('Aivox', 80, 586);
      ctx.textAlign = 'right';
      ctx.fillStyle = P.muted;
      ctx.font = `500 22px ${font}`;
      ctx.fillText(formatDate(new Date()), W - 80, 584);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create image');
      const fileName = `aivox-profile-${dayKey(new Date())}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'My Aivox profile' });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return;
        }
      }
      downloadBlob(blob, fileName);
      showToast('Profile card saved');
    } catch (err) {
      console.error('Profile card failed', err);
      showToast('Could not create the profile card.', 'error');
    }
  };

  const goHome = () => {
    window.location.href = '/';
  };
  const goAuth = () => {
    window.location.href = '/auth';
  };

  const pageClass = [
    styles.page,
    isLight ? styles.themeLight : styles.themeDark,
    prefs.reduceMotion ? styles.noMotion : '',
    prefs.compact ? styles.compact : '',
  ].join(' ');

  /* ═══════════════ Render ═══════════════ */
  return (
    <div className={pageClass} style={rootStyle}>
      <div className={`${styles.glow} ${styles.glow1}`} />
      <div className={`${styles.glow} ${styles.glow2}`} />

      <div className={styles.scroll}>
        {/* ─── Top bar ─── */}
        <header className={styles.topbar}>
          <button className={styles.backBtn} onClick={goHome}>
            <Icon name="back" size={17} /> <span>Back to chat</span>
          </button>
          <span className={styles.topTitle}>My profile</span>
          <div className={styles.topActions}>
            <button
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
              title={isLight ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              <Icon name={isLight ? 'moon' : 'sun'} size={17} />
            </button>
            <button className={styles.topLogout} onClick={handleLogout} aria-label={isGuest ? 'Leave session' : 'Log out'}>
              <Icon name="logout" size={17} />
              <span className={styles.hideSm}>{isGuest ? 'Leave session' : 'Log out'}</span>
            </button>
          </div>
        </header>

        <main className={styles.container}>
          {/* ─── Hero ─── */}
          <section className={`${styles.hero} ${!isGuest ? styles.heroGold : ''}`}>
            <div className={styles.banner} />
            <div className={styles.heroBody}>
              <div className={styles.avatarWrap}>
                <span className={styles.aura} />
                <div
                  className={styles.avatar}
                  style={showPhoto ? undefined : { background: avatarBg, color: avatarStyle.fg }}
                >
                  {showPhoto ? (
                    <img
                      src={authUser.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    initial
                  )}
                </div>
                {!isGuest && (
                  <span className={styles.crownPin} title="Premium member">
                    <Icon name="crown" size={16} />
                  </span>
                )}
              </div>

              <div className={styles.heroInfo}>
                <p className={styles.greeting}>{getGreeting()}</p>
                <h1 className={styles.name}>{currentDisplayName}</h1>
                <p className={styles.email}>
                  {isGuest ? 'Free basic account' : authUser.email || 'Signed in'}
                </p>

                <div className={styles.chips}>
                  {isGuest ? (
                    <span className={`${styles.chip} ${styles.chipFree}`}>
                      <Icon name="circle" size={13} /> Standard user
                    </span>
                  ) : (
                    <span className={`${styles.chip} ${styles.chipGold}`}>
                      <Icon name="crown" size={13} /> Premium member
                    </span>
                  )}
                  <span className={`${styles.chip} ${isGuest ? styles.chipMuted : styles.chipGreen}`}>
                    <Icon name={isGuest ? 'alert' : 'shield'} size={13} />
                    {isGuest ? 'Not saved' : 'Secured'}
                  </span>
                  {!isGuest && emailVerified && (
                    <span className={`${styles.chip} ${styles.chipAccent}`}>
                      <Icon name="check" size={13} /> Verified
                    </span>
                  )}
                </div>
              </div>

              <div className={styles.heroLevel} aria-label={`Level ${userLevel}, ${xpInLevel} of 100 XP`}>
                <div className={styles.ring}>
                  <svg viewBox="0 0 80 80" width="96" height="96">
                    <defs>
                      <linearGradient id="aivoxRingGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" style={{ stopColor: 'var(--accent)' }} />
                        <stop offset="100%" style={{ stopColor: 'var(--accent2)' }} />
                      </linearGradient>
                    </defs>
                    <circle cx="40" cy="40" r={RING_R} className={styles.ringTrack} />
                    <circle
                      cx="40"
                      cy="40"
                      r={RING_R}
                      className={styles.ringFill}
                      stroke="url(#aivoxRingGrad)"
                      strokeDasharray={RING_C}
                      strokeDashoffset={RING_C * (1 - xpInLevel / 100)}
                      transform="rotate(-90 40 40)"
                    />
                  </svg>
                  <div className={styles.ringText}>
                    <strong>{userLevel}</strong>
                    <span>Level</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ─── Stats ─── */}
          <section className={styles.stats} aria-label="Your stats">
            {stats.map((s) => (
              <div key={s.label} className={styles.stat}>
                <span className={styles.statIcon}><Icon name={s.icon} size={20} /></span>
                <div>
                  <div className={styles.statValue}>{s.value}</div>
                  <div className={styles.statLabel}>{s.label}</div>
                </div>
              </div>
            ))}
          </section>

          {/* ─── Tabs ─── */}
          <nav className={styles.tabs} role="tablist" aria-label="Profile sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon name={t.icon} size={16} />
                {t.label}
              </button>
            ))}
          </nav>

          <div key={tab} className={styles.panel} role="tabpanel">
            {/* ════════ OVERVIEW ════════ */}
            {tab === 'overview' && (
              <div className={styles.grid2}>
                <section className={`${styles.card} ${styles.span2}`}>
                  <CardHead icon="zap" title="Level progress" tag={rank} />
                  <div className={styles.xpTop}>
                    <span className={styles.levelBadge}>
                      <Icon name="check" size={14} /> Level {userLevel}
                    </span>
                    <span className={styles.xpText}>{xpInLevel} / 100 XP</span>
                  </div>
                  <div
                    className={styles.xpTrack}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={xpInLevel}
                  >
                    <div className={styles.xpFill} style={{ width: `${xpInLevel}%` }} />
                  </div>
                  <p className={styles.xpHint}>
                    {100 - xpInLevel} XP to level {userLevel + 1}. Every chat earns 15 XP.
                  </p>
                </section>

                <section className={styles.card}>
                  <CardHead icon="flame" title="This week" tag={`${activeThisWeek} of 7 days`} />
                  <div className={styles.week}>
                    {weekDays.map((d) => {
                      const on = activeSet.has(d.key);
                      return (
                        <div key={d.key} className={styles.dayCol}>
                          <div
                            className={`${styles.dayBar} ${on ? styles.dayOn : ''} ${d.isToday ? styles.dayToday : ''}`}
                            title={`${d.key}${on ? ' · active' : ''}`}
                          >
                            {on && <Icon name="check" size={14} />}
                          </div>
                          <span>{d.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className={styles.cardNote}>
                    <strong>{streak}</strong> day streak. Come back tomorrow to keep it going.
                  </p>
                </section>

                <section className={styles.card}>
                  <CardHead icon="award" title="Next goal" />
                  {nextGoal ? (
                    <div className={styles.goal}>
                      <span className={styles.goalIcon}><Icon name={nextGoal.icon} size={22} /></span>
                      <div className={styles.goalBody}>
                        <p className={styles.goalTitle}>{nextGoal.title}</p>
                        <p className={styles.goalDesc}>{nextGoal.desc}</p>
                        <div className={styles.miniTrack}>
                          <div className={styles.miniFill} style={{ width: `${nextGoal.pct}%` }} />
                        </div>
                        <p className={styles.goalMeta}>
                          {Math.min(nextGoal.cur, nextGoal.goal)} of {nextGoal.goal}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className={styles.cardNote}>You unlocked every achievement. Nicely done!</p>
                  )}
                </section>

                <section className={`${styles.card} ${styles.span2}`}>
                  <CardHead icon="zap" title="Quick actions" />
                  <div className={styles.actions}>
                    <button className={styles.actionTile} onClick={handleShareCard}>
                      <span className={styles.actionIcon}><Icon name="image" size={20} /></span>
                      <span className={styles.actionText}>
                        <strong>Profile card</strong>
                        <small>Save or share it as an image</small>
                      </span>
                    </button>
                    <button className={styles.actionTile} onClick={handleInvite}>
                      <span className={styles.actionIcon}><Icon name="share" size={20} /></span>
                      <span className={styles.actionText}>
                        <strong>Invite friends</strong>
                        <small>Share your invite link</small>
                      </span>
                    </button>
                    <button className={styles.actionTile} onClick={handleExport}>
                      <span className={styles.actionIcon}><Icon name="download" size={20} /></span>
                      <span className={styles.actionText}>
                        <strong>Export my data</strong>
                        <small>Download your chats</small>
                      </span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* ════════ ACTIVITY ════════ */}
            {tab === 'activity' && (
              <div className={styles.stack}>
                <div className={styles.insights}>
                  {insights.map((i) => (
                    <div key={i.label} className={styles.insight}>
                      <span className={styles.insightIcon}><Icon name={i.icon} size={18} /></span>
                      <div className={styles.insightValue}>{i.value}</div>
                      <div className={styles.insightLabel}>{i.label}</div>
                    </div>
                  ))}
                </div>

                <section className={styles.card}>
                  <CardHead icon="calendar" title="Activity map" tag={`Last ${HEAT_WEEKS} weeks`} />
                  <div className={styles.heatWrap}>
                    <div className={styles.heat} role="img" aria-label={`Active on ${activeInMap} days in the last ${HEAT_WEEKS} weeks`}>
                      {heatDays.map((d) => (
                        <span
                          key={d.key}
                          title={`${d.label}${d.on ? ' · active' : ''}`}
                          className={[
                            styles.cell,
                            d.on ? styles.cellOn : '',
                            d.today ? styles.cellToday : '',
                            d.future ? styles.cellFuture : '',
                          ].join(' ')}
                        />
                      ))}
                    </div>
                  </div>
                  <div className={styles.legend}>
                    <span><i className={styles.legendDot} /> Inactive</span>
                    <span><i className={`${styles.legendDot} ${styles.legendOn}`} /> Active</span>
                  </div>
                  <p className={styles.cardNote}>
                    You were active on <strong>{activeInMap}</strong> day{activeInMap === 1 ? '' : 's'} in
                    this period. Open Aivox daily to light up more squares.
                  </p>
                </section>
              </div>
            )}

            {/* ════════ SUBSCRIPTION (premium) ════════ */}
            {tab === 'plan' && !isGuest && (
              <div className={styles.stack}>
                <div className={styles.planTop}>
                  <div className={styles.memberCard} aria-label="Premium membership card">
                    <div className={styles.memberTop}>
                      <div className={styles.memberBrand}>
                        <strong>Aivox</strong>
                        <span>Premium</span>
                      </div>
                      <span className={styles.memberCrown}><Icon name="crown" size={22} /></span>
                    </div>
                    <span className={styles.memberChip} aria-hidden="true" />
                    <div className={styles.memberBottom}>
                      <div className={styles.memberWho}>
                        <span className={styles.memberLabel}>Member</span>
                        <span className={styles.memberName}>{currentDisplayName}</span>
                      </div>
                      <div className={styles.memberSince}>
                        <span className={styles.memberLabel}>Lifetime member since</span>
                        <span className={styles.memberDate}>{formatMonthYear(createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <section className={`${styles.card} ${styles.premiumInfo}`}>
                    <div className={styles.premiumHead}>
                      <div className={styles.premiumTitle}>
                        <div>
                          <h2>Aivox Premium</h2>
                          <p>First 100 users · Lifetime plan</p>
                        </div>
                      </div>
                      <div className={styles.premiumTags}>
                        <span className={styles.lifetimeTag}>Lifetime free</span>
                        <span className={styles.activeTag}><i className={styles.pulseDot} /> Active</span>
                      </div>
                    </div>

                    <p className={styles.premiumDesc}>
                      Congratulations <strong>{currentDisplayName}</strong>! You are part of the
                      first 100 users club. Your account is upgraded for life and you will never be
                      charged.
                    </p>

                    <div className={styles.facts}>
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Plan</span>
                        <span className={styles.factValue}>Premium · Lifetime</span>
                      </div>
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Status</span>
                        <span className={`${styles.factValue} ${styles.valGreen}`}>Active</span>
                      </div>
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Price</span>
                        <span className={styles.factValue}>$0.00 forever</span>
                      </div>
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Renewal</span>
                        <span className={styles.factValue}>Never expires</span>
                      </div>
                      <div className={styles.fact}>
                        <span className={styles.factLabel}>Member since</span>
                        <span className={styles.factValue}>{formatDate(createdAt)}</span>
                      </div>
                    </div>
                  </section>
                </div>

                <section className={styles.card}>
                  <CardHead icon="star" title="What you get" tag={`${PERKS.length} perks`} />
                  <ul className={styles.perks}>
                    {PERKS.map((p) => (
                      <li key={p.title}>
                        <span className={styles.perkCheck}><Icon name="check" size={14} /></span>
                        <span>
                          <strong>{p.title}</strong>
                          <small>{p.desc}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            )}

            {/* ════════ SUBSCRIPTION (guest) ════════ */}
            {tab === 'plan' && isGuest && (
              <div className={styles.stack}>
                <section className={`${styles.card} ${styles.freeCard}`}>
                  <div className={styles.premiumHead}>
                    <div className={styles.premiumTitle}>
                      <span className={styles.freeBubble}><Icon name="user" size={22} /></span>
                      <div>
                        <h2>Free plan</h2>
                        <p>Temporary guest session</p>
                      </div>
                    </div>
                    <span className={styles.basicTag}>Basic</span>
                  </div>
                  <p className={styles.premiumDesc}>
                    You are using a guest session. Your chat history can be lost if you clear your
                    browser data.
                  </p>

                  <div className={styles.compare} role="table" aria-label="Free versus premium">
                    <div className={`${styles.compareRow} ${styles.compareHead}`} role="row">
                      <span role="columnheader">Feature</span>
                      <span role="columnheader">Free</span>
                      <span role="columnheader" className={styles.colPremium}>Premium</span>
                    </div>
                    {COMPARE.map((r) => (
                      <div key={r.label} className={styles.compareRow} role="row">
                        <span role="cell">{r.label}</span>
                        {[r.free, r.premium].map((v, i) => (
                          <span key={i} role="cell" className={i === 1 ? styles.colPremium : ''}>
                            {v === true ? (
                              <Icon name="check" size={16} className={styles.yes} />
                            ) : v === false ? (
                              <Icon name="x" size={16} className={styles.no} />
                            ) : (
                              <em>{v}</em>
                            )}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>

                <section className={`${styles.card} ${styles.offerCard}`}>
                  <span className={styles.offerIcon}><Icon name="crown" size={24} /></span>
                  <div className={styles.offerBody}>
                    <h3>First 100 users offer</h3>
                    <p>
                      Create an account today to secure your data and get{' '}
                      <strong>lifetime Premium for $0</strong>.
                    </p>
                  </div>
                  <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={goAuth}>
                    Claim free Premium
                  </button>
                </section>
              </div>
            )}

            {/* ════════ ACHIEVEMENTS ════════ */}
            {tab === 'badges' && (
              <div className={styles.stack}>
                <section className={styles.card}>
                  <CardHead
                    icon="flag"
                    title="Rank roadmap"
                    tag={
                      nextRank
                        ? `${nextRank.min - userLevel} level${nextRank.min - userLevel === 1 ? '' : 's'} to ${nextRank.name}`
                        : 'Top rank reached'
                    }
                  />
                  <ol className={styles.roadmap}>
                    {RANKS.map((r, i) => {
                      const reached = userLevel >= r.min;
                      const linked = RANKS[i + 1] && userLevel >= RANKS[i + 1].min;
                      return (
                        <li
                          key={r.name}
                          className={[
                            styles.step,
                            reached ? styles.stepDone : '',
                            r.name === rank ? styles.stepNow : '',
                            linked ? styles.stepLinked : '',
                          ].join(' ')}
                        >
                          <span className={styles.stepDot}>
                            <Icon name={reached ? 'check' : 'lock'} size={14} />
                          </span>
                          <span className={styles.stepText}>
                            <strong>{r.name}</strong>
                            <small>Level {r.min}+ · {r.blurb}</small>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>

                <section className={styles.card}>
                  <CardHead icon="award" title="Achievements" tag={`${unlockedCount} of ${badges.length} unlocked`} />
                  <div className={styles.xpTrack}>
                    <div
                      className={styles.xpFill}
                      style={{ width: `${(unlockedCount / badges.length) * 100}%` }}
                    />
                  </div>
                </section>

                <div className={styles.badgeGrid}>
                  {badges.map((b) => (
                    <div key={b.id} className={`${styles.badge} ${b.done ? styles.badgeDone : ''}`}>
                      <span className={styles.badgeIcon}>
                        <Icon name={b.done ? b.icon : 'lock'} size={22} />
                      </span>
                      <p className={styles.badgeTitle}>{b.title}</p>
                      <p className={styles.badgeDesc}>{b.desc}</p>
                      {b.done ? (
                        <span className={styles.badgeUnlocked}>
                          <Icon name="check" size={13} /> Unlocked
                        </span>
                      ) : (
                        <>
                          <div className={styles.miniTrack}>
                            <div className={styles.miniFill} style={{ width: `${b.pct}%` }} />
                          </div>
                          <span className={styles.badgeProgress}>{Math.min(b.cur, b.goal)} / {b.goal}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ════════ SETTINGS ════════ */}
            {tab === 'settings' && (
              <div className={styles.grid2}>
                <section className={styles.card}>
                  <CardHead icon="sliders" title="Appearance" />

                  <p className={styles.groupLabel}>Theme</p>
                  <div className={styles.segment} role="radiogroup" aria-label="Theme">
                    {THEMES.map((t) => (
                      <button
                        key={t.id}
                        role="radio"
                        aria-checked={theme === t.id}
                        className={`${styles.segBtn} ${theme === t.id ? styles.segOn : ''}`}
                        onClick={() => changeTheme(t.id)}
                      >
                        <Icon name={t.icon} size={15} /> {t.label}
                      </button>
                    ))}
                  </div>

                  <p className={styles.groupLabel}>Accent colour</p>
                  <div className={styles.swatches}>
                    {ACCENTS.map((a) => (
                      <button
                        key={a.id}
                        className={`${styles.swatch} ${a.id === accent.id ? styles.swatchOn : ''}`}
                        style={{ background: `linear-gradient(135deg, ${a.a}, ${a.b})` }}
                        onClick={() => changeAccent(a.id)}
                        aria-label={`${a.name} accent`}
                        aria-pressed={a.id === accent.id}
                        title={a.name}
                      >
                        {a.id === accent.id && <Icon name="check" size={18} />}
                      </button>
                    ))}
                  </div>

                  <p className={styles.groupLabel}>Avatar style</p>
                  <p className={styles.groupHint}>
                    Used on your profile card, and as your avatar when you have no photo.
                  </p>
                  <div className={styles.swatches}>
                    {AVATAR_STYLES.map((s) => {
                      const c1 = s.id === 'auto' ? accent.a : s.c1;
                      const c2 = s.id === 'auto' ? accent.b : s.c2;
                      const fg = s.id === 'auto' ? '#ffffff' : s.fg;
                      const locked = s.premium && isGuest;
                      const selected = s.id === avatarStyle.id;
                      return (
                        <button
                          key={s.id}
                          className={`${styles.swatch} ${selected ? styles.swatchOn : ''} ${locked ? styles.swatchLocked : ''}`}
                          style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, color: fg }}
                          onClick={() => changeAvatar(s.id)}
                          aria-label={`${s.name} avatar${locked ? ' (Premium only)' : ''}`}
                          aria-pressed={selected}
                          title={locked ? `${s.name} (Premium only)` : s.name}
                        >
                          {locked ? (
                            <Icon name="lock" size={16} />
                          ) : (
                            <span className={styles.swatchText}>{initial}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className={styles.card}>
                  <CardHead icon="bell" title="Preferences" />
                  <SettingRow icon="zap" title="Reduce animations" desc="Turns off motion effects on this page">
                    <Toggle checked={prefs.reduceMotion} onChange={() => togglePref('reduceMotion')} label="Reduce animations" />
                  </SettingRow>
                  <SettingRow icon="layers" title="Compact layout" desc="Tighter spacing, more on screen">
                    <Toggle checked={prefs.compact} onChange={() => togglePref('compact')} label="Compact layout" />
                  </SettingRow>
                  <SettingRow icon="bell" title="Notifications" desc="Tips and product updates">
                    <Toggle checked={prefs.notifications} onChange={() => togglePref('notifications')} label="Notifications" />
                  </SettingRow>
                  <SettingRow icon="database" title="Auto-save chats" desc="Keep conversations on this device">
                    <Toggle checked={prefs.autoSave} onChange={() => togglePref('autoSave')} label="Auto-save chats" />
                  </SettingRow>
                </section>

                <section className={styles.card}>
                  <CardHead icon="shield" title="Security" />
                  {isGuest ? (
                    <SettingRow icon="alert" title="Guest session" desc="Your data lives only in this browser">
                      <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`} onClick={goAuth}>
                        Create account
                      </button>
                    </SettingRow>
                  ) : (
                    <>
                      <SettingRow icon="key" title="Sign-in method" desc={providerLabel} />
                      <SettingRow
                        icon="mail"
                        title="Email"
                        desc={authUser.email ? `${authUser.email} · ${emailVerified ? 'Verified' : 'Not verified'}` : 'No email linked'}
                      >
                        {!emailVerified && authUser.email && (
                          <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={handleVerifyEmail}>
                            Send link
                          </button>
                        )}
                      </SettingRow>
                      {hasPassword && authUser.email && (
                        <SettingRow icon="lock" title="Password" desc="Get a reset link by email">
                          <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={handlePasswordReset}>
                            Reset
                          </button>
                        </SettingRow>
                      )}
                      <SettingRow icon="clock" title="Last sign-in" desc={formatDate(lastSignIn)} />
                    </>
                  )}
                  <SettingRow icon="user" title="Active session" desc="This device">
                    <span className={styles.liveTag}><i className={styles.pulseDot} /> Live</span>
                  </SettingRow>
                </section>

                <section className={styles.card}>
                  <CardHead icon="database" title="Data and privacy" />
                  <SettingRow icon="download" title="Export my data" desc="Your profile and chats as a file">
                    <button className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`} onClick={handleExport}>
                      Export
                    </button>
                  </SettingRow>
                  <SettingRow icon="upload" title="Restore a backup" desc="Add chats back from an exported file">
                    <button
                      className={`${styles.btn} ${styles.btnGhost} ${styles.btnSm}`}
                      onClick={() => fileRef.current && fileRef.current.click()}
                    >
                      Restore
                    </button>
                  </SettingRow>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className={styles.fileInput}
                    onChange={handleRestore}
                    aria-label="Choose a backup file"
                  />
                  <SettingRow icon="trash" title="Clear chat history" desc={`${totalChats} saved on this device`}>
                    <button
                      className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`}
                      onClick={() => setShowClear(true)}
                      disabled={totalChats === 0}
                    >
                      Clear
                    </button>
                  </SettingRow>
                  <SettingRow icon="logout" title={isGuest ? 'Leave session' : 'Log out'} desc="End your session on this device">
                    <button className={`${styles.btn} ${styles.btnDanger} ${styles.btnSm}`} onClick={handleLogout}>
                      {isGuest ? 'Leave' : 'Log out'}
                    </button>
                  </SettingRow>
                </section>
              </div>
            )}
          </div>

          <footer className={styles.footer}>Aivox © {new Date().getFullYear()}</footer>
        </main>
      </div>

      {/* ─── Confirm dialog ─── */}
      {showClear && (
        <div className={styles.overlay} onClick={() => setShowClear(false)}>
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="clearTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <span className={styles.modalIcon}><Icon name="trash" size={22} /></span>
            <h3 id="clearTitle">Clear chat history?</h3>
            <p>
              This deletes the {totalChats} chat{totalChats === 1 ? '' : 's'} saved on this device.
              Your level and achievements stay safe. You can restore a backup later if you exported one.
            </p>
            <div className={styles.modalActions}>
              <button className={`${styles.btn} ${styles.btnGhost}`} onClick={() => setShowClear(false)}>
                Keep chats
              </button>
              <button className={`${styles.btn} ${styles.btnDangerSolid}`} onClick={confirmClear}>
                Clear history
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Level-up celebration ─── */}
      {celebrate && (
        <div className={styles.overlay} onClick={() => setCelebrate(null)}>
          <div
            className={`${styles.modal} ${styles.celebrate}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lvlTitle"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.confetti} aria-hidden="true">
              {Array.from({ length: 28 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    left: `${(i * 37) % 100}%`,
                    width: `${6 + (i % 4) * 2}px`,
                    height: `${10 + (i % 3) * 3}px`,
                    background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    '--delay': `${(i % 7) * 0.12}s`,
                    '--dur': `${2.2 + (i % 5) * 0.35}s`,
                    '--spin': `${(i % 2 ? 1 : -1) * (240 + i * 12)}deg`,
                  }}
                />
              ))}
            </div>
            <span className={styles.lvlBadge}>{celebrate.level}</span>
            <h3 id="lvlTitle">Level up!</h3>
            <p>
              You reached level {celebrate.level} and the <strong>{celebrate.rank}</strong> rank.
              Keep chatting to unlock more.
            </p>
            <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnWide}`} onClick={() => setCelebrate(null)}>
              Awesome
            </button>
          </div>
        </div>
      )}

      {/* ─── Toast ─── */}
      {toast && (
        <div
          key={toast.id}
          className={`${styles.toast} ${toast.type === 'error' ? styles.toastError : styles.toastSuccess}`}
          role="status"
          aria-live="polite"
        >
          <Icon name={toast.type === 'error' ? 'alert' : 'check'} size={17} className={styles.toastIcon} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}

export default Profile;