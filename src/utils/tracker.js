// ============================================================
//  tracker.js  —  Aivox Ultra Tracking System v4.0 (God-Mode Enabled)
//  Har chhoti se chhoti chiz track hoti hai yahan
// ============================================================

import { db } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

// ─── SESSION STATE (module-level, persists while page open) ───
const sessionStart = Date.now();
let totalIdleMs = 0;
let idleStart = null;
let lastActivityTime = Date.now();
let tabHiddenCount = 0;
let tabHiddenTotalMs = 0;
let tabHiddenStart = null;
let totalScrollDepth = 0;
let copyCount = 0;
let pasteCount = 0;
let totalKeystrokes = 0;
let backspaceCount = 0;
let promptStartTime = null;
let promptFirstKeyTime = null;
let promptLastKeyTime = null;
let sessionMessageCount = 0;

// ─── IDLE DETECTION (3 min = idle) ───
const IDLE_THRESHOLD = 3 * 60 * 1000;
function resetActivity() {
  if (idleStart !== null) {
    totalIdleMs += Date.now() - idleStart;
    idleStart = null;
  }
  lastActivityTime = Date.now();
}
function checkIdle() {
  if (Date.now() - lastActivityTime > IDLE_THRESHOLD && idleStart === null) {
    idleStart = Date.now();
  }
}
const idleInterval = setInterval(checkIdle, 30000);
['mousemove','keydown','click','scroll','touchstart'].forEach(ev =>
  window.addEventListener(ev, resetActivity, { passive: true })
);

// ─── TAB VISIBILITY ───
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    tabHiddenStart = Date.now();
    tabHiddenCount++;
  } else {
    if (tabHiddenStart) {
      tabHiddenTotalMs += Date.now() - tabHiddenStart;
      tabHiddenStart = null;
    }
  }
});

// ─── SCROLL DEPTH ───
window.addEventListener('scroll', () => {
  const scrolled = window.scrollY + window.innerHeight;
  const total = document.documentElement.scrollHeight;
  const pct = Math.round((scrolled / total) * 100);
  if (pct > totalScrollDepth) totalScrollDepth = pct;
}, { passive: true });

// ─── COPY / PASTE DETECTION ───
document.addEventListener('copy', () => copyCount++);
document.addEventListener('cut', () => copyCount++);
document.addEventListener('paste', () => pasteCount++);

// ─── KEYSTROKE TRACKING ───
document.addEventListener('keydown', (e) => {
  totalKeystrokes++;
  if (e.key === 'Backspace' || e.key === 'Delete') backspaceCount++;
});

// ─── BATTERY API ───
async function getBattery() {
  try {
    if (!navigator.getBattery) return { level: null, charging: null, chargingTime: null };
    const bat = await navigator.getBattery();
    return {
      level: Math.round(bat.level * 100),
      charging: bat.charging,
      chargingTime: bat.chargingTime === Infinity ? null : Math.round(bat.chargingTime / 60),
    };
  } catch { return { level: null, charging: null, chargingTime: null }; }
}

// ─── CONNECTION QUALITY ───
function getConnectionInfo() {
  const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!conn) return { type: 'unknown', effectiveType: 'unknown', downlink: null, rtt: null, saveData: false };
  return {
    type: conn.type || 'unknown',
    effectiveType: conn.effectiveType || 'unknown',
    downlink: conn.downlink || null,
    rtt: conn.rtt || null,
    saveData: conn.saveData || false,
  };
}

// ─── FONT & ACCESSIBILITY ───
function getFontInfo() {
  try {
    const testFonts = ['Arial','Helvetica','Times New Roman','Courier New','Verdana','Georgia','Comic Sans MS','Impact','Tahoma','Trebuchet MS'];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const availableFonts = testFonts.filter(font => {
      ctx.font = `12px "${font}", monospace`;
      const w1 = ctx.measureText('mmmmmmmmmml').width;
      ctx.font = '12px monospace';
      const w2 = ctx.measureText('mmmmmmmmmml').width;
      return w1 !== w2;
    });
    const zoomLevel = Math.round((window.devicePixelRatio / ((window.screen.width / window.innerWidth) || 1)) * 100);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)').matches;
    return { availableFonts: availableFonts.join(','), zoomLevel, prefersReducedMotion, prefersDark, prefersHighContrast };
  } catch { return {}; }
}

// ─── CANVAS FINGERPRINT ───
function getCanvasFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = "14px 'Arial'";
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Aivox🔥', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('Aivox🔥', 4, 17);
    return canvas.toDataURL().slice(-50);
  } catch { return 'blocked'; }
}

// ─── WEBGL FINGERPRINT ───
function getWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { vendor: 'N/A', renderer: 'N/A' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    };
  } catch { return { vendor: 'blocked', renderer: 'blocked' }; }
}

// ─── AUDIO CONTEXT FINGERPRINT ───
function getAudioFingerprint() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return 'unsupported';
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const analyser = ctx.createAnalyser();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscillator.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(0);
    const data = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(data);
    oscillator.stop();
    ctx.close();
    return data.slice(0, 5).join(',');
  } catch { return 'blocked'; }
}

// ─── MEDIA DEVICES COUNT ───
async function getMediaDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      microphones: devices.filter(d => d.kind === 'audioinput').length,
      speakers: devices.filter(d => d.kind === 'audiooutput').length,
      cameras: devices.filter(d => d.kind === 'videoinput').length,
    };
  } catch { return { microphones: null, speakers: null, cameras: null }; }
}

// ─── PERFORMANCE TIMING ───
function getPagePerformance() {
  try {
    const nav = performance.getEntriesByType('navigation')[0] || performance.timing;
    const paint = performance.getEntriesByType('paint');
    const fcp = paint.find(p => p.name === 'first-contentful-paint');
    return {
      pageLoadMs: Math.round(nav.loadEventEnd - nav.startTime) || null,
      domReadyMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime) || null,
      firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null,
      dnsMs: Math.round((nav.domainLookupEnd || 0) - (nav.domainLookupStart || 0)) || null,
      ttfbMs: Math.round((nav.responseStart || 0) - (nav.requestStart || 0)) || null,
    };
  } catch { return {}; }
}

// ─── INSTALLED PLUGINS ───
function getPlugins() {
  try {
    const plugins = Array.from(navigator.plugins || []).map(p => p.name).slice(0, 10);
    return plugins.join('|') || 'none';
  } catch { return 'blocked'; }
}

// ─── TOUCH SUPPORT ───
function getTouchInfo() {
  return {
    maxTouchPoints: navigator.maxTouchPoints || 0,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    pointerType: window.PointerEvent ? 'pointer' : window.TouchEvent ? 'touch' : 'mouse',
  };
}

// ─── DEVICE MEMORY DETAILS ───
function getHardwareDetails() {
  return {
    deviceMemory: navigator.deviceMemory || null,
    hardwareConcurrency: navigator.hardwareConcurrency || null,
    platform: navigator.platform || 'unknown',
    vendor: navigator.vendor || 'unknown',
    product: navigator.product || 'unknown',
    appVersion: navigator.appVersion?.slice(0, 80) || 'unknown',
    onLine: navigator.onLine,
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || 'unset',
    pdfViewerEnabled: navigator.pdfViewerEnabled || false,
  };
}

// ─── SCREEN DETAILS ───
function getScreenDetails() {
  return {
    screenWidth: screen.width,
    screenHeight: screen.height,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    orientation: screen.orientation?.type || 'unknown',
    devicePixelRatio: window.devicePixelRatio || 1,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
  };
}

// ─── TYPING BEHAVIOR ───
export function onPromptStart() {
  promptStartTime = Date.now();
  promptFirstKeyTime = null;
  promptLastKeyTime = null;
}

export function onPromptKey() {
  if (!promptFirstKeyTime) promptFirstKeyTime = Date.now();
  promptLastKeyTime = Date.now();
}

// 🔥 HESITATION VAULT: TRACKS DELETED/UNSENT PROMPTS (NAYA FEATURE) 🔥
export async function trackUnsentPrompt({ unsentText, userName }) {
  if (!unsentText || unsentText.trim().length < 5) return; // Don't track very short typos
  try {
    const payload = {
      userName: userName || "Anonymous",
      unsentText: unsentText,
      timestamp: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
      device: getDeviceType(),
      os: getOS(),
    };
    await addDoc(collection(db, "aivox_unsent_prompts"), payload);
    console.log(`🕵️ Vault Captured: User hesitated and deleted prompt.`);
  } catch (error) {
    console.error('❌ Vault error:', error);
  }
}

// ─── MAIN TRACKING FUNCTION ───
// 🔥 roastLevel aur sentiment added here 🔥
export async function trackUserActivity({ prompt, response, model, timeTakenMs, isRoasterMode, userName, roastLevel = 100 }) {
  sessionMessageCount++;

  try {
    const [battery, mediaDevices] = await Promise.all([
      getBattery(),
      getMediaDevices(),
    ]);

    const conn = getConnectionInfo();
    const fontInfo = getFontInfo();
    const webgl = getWebGL();
    const perf = getPagePerformance();
    const touch = getTouchInfo();
    const hw = getHardwareDetails();
    const screenDetails = getScreenDetails();
    const audioFP = getAudioFingerprint();
    const canvasFP = getCanvasFingerprint();
    const plugins = getPlugins();

    const typingDurationMs = (promptFirstKeyTime && promptLastKeyTime)
      ? promptLastKeyTime - promptFirstKeyTime : null;
    const promptLength = prompt?.length || 0;
    const typingSpeedCPM = (typingDurationMs && promptLength)
      ? Math.round((promptLength / typingDurationMs) * 60000) : null;
    const thinkTimeMs = (promptStartTime && promptFirstKeyTime)
      ? promptFirstKeyTime - promptStartTime : null;

    const sessionDurationMs = Date.now() - sessionStart;
    const activeTimeMs = sessionDurationMs - totalIdleMs - tabHiddenTotalMs;

    const estimateTokens = (text) => Math.ceil((text || '').split(/\s+/).length * 1.33);
    const userTokens = estimateTokens(prompt);
    const aiTokens = estimateTokens(response);

    const payload = {
      // 🔥 Saving userName to Database 🔥
      userName: userName || "Anonymous",

      // ── Core prompt data ──
      prompt: prompt || '',
      response: response || '',
      model: model || 'Unknown',
      responseTimeMs: timeTakenMs || 0,
      isRoasterMode: !!isRoasterMode,
      roastLevel: isRoasterMode ? roastLevel : 0, // NEW: For Roast-o-meter
      totalTokens: userTokens + aiTokens,
      userTokens,
      aiTokens,
      promptLength,

      // ── Timestamp ──
      timestamp: new Date().toISOString(),
      serverTimestamp: serverTimestamp(),
      localTime: new Date().toLocaleTimeString(),
      localDate: new Date().toLocaleDateString(),
      dayOfWeek: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()],
      hourOfDay: new Date().getHours(),

      // ── Device identification ──
      device: getDeviceType(),
      os: getOS(),
      browserVendor: getBrowser(),
      browserVersion: navigator.userAgent.match(/(Chrome|Firefox|Safari|Edge|OPR|Brave)\/[\d.]+/)?.[0] || 'Unknown',
      userAgent: navigator.userAgent.slice(0, 150),

      // ── Screen ──
      screenResolution: `${screen.width}x${screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
      colorDepth: screenDetails.colorDepth,
      devicePixelRatio: screenDetails.devicePixelRatio,
      orientation: screenDetails.orientation,
      availableScreenSize: `${screenDetails.availWidth}x${screenDetails.availHeight}`,
      outerWindowSize: `${screenDetails.outerWidth}x${screenDetails.outerHeight}`,

      // ── Hardware ──
      cpuCores: hw.hardwareConcurrency,
      ramMemory: hw.deviceMemory,
      platform: hw.platform,
      vendor: hw.vendor,
      onLine: hw.onLine,
      cookieEnabled: hw.cookieEnabled,
      doNotTrack: hw.doNotTrack,
      pdfViewerEnabled: hw.pdfViewerEnabled,
      plugins: plugins,

      // ── Touch & Pointer ──
      maxTouchPoints: touch.maxTouchPoints,
      touchSupport: touch.touchSupport,
      pointerType: touch.pointerType,

      // ── Network ──
      network: conn.effectiveType || conn.type,
      connectionType: conn.type,
      effectiveType: conn.effectiveType,
      downlink: conn.downlink,
      rtt: conn.rtt,
      saveData: conn.saveData,

      // ── Locale & Language ──
      language: navigator.language,
      languages: (navigator.languages || []).join(',').slice(0, 50),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale,

      // ── Page & Source ──
      referrer: document.referrer || 'Direct',
      referrerDomain: document.referrer ? new URL(document.referrer).hostname : 'Direct',
      currentURL: window.location.href.slice(0, 100),
      displayMode: window.matchMedia('(display-mode: standalone)').matches ? 'PWA' : 'Browser',
      documentTitle: document.title.slice(0, 60),

      // ── Session Behavior ──
      sessionDurationMs,
      activeTimeMs: Math.max(0, activeTimeMs),
      totalIdleMs,
      sessionMessageCount,
      tabHiddenCount,
      tabHiddenTotalMs,
      scrollDepthPct: totalScrollDepth,

      // ── Interaction Behavior ──
      copyCount,
      pasteCount,
      totalKeystrokes,
      backspaceCount,
      backspaceRatio: totalKeystrokes ? ((backspaceCount / totalKeystrokes) * 100).toFixed(1) : 0,

      // ── Typing Behavior ──
      typingDurationMs,
      typingSpeedCPM,
      thinkTimeBeforeTypingMs: thinkTimeMs,
      promptToResponseMs: timeTakenMs,

      // ── Battery ──
      batteryLevel: battery.level,
      batteryCharging: battery.charging,
      batteryChargingTimeMin: battery.chargingTime,

      // ── Media Devices ──
      microphoneCount: mediaDevices.microphones,
      speakerCount: mediaDevices.speakers,
      cameraCount: mediaDevices.cameras,

      // ── Performance Timing ──
      pageLoadMs: perf.pageLoadMs,
      domReadyMs: perf.domReadyMs,
      firstContentfulPaintMs: perf.firstContentfulPaintMs,
      dnsMs: perf.dnsMs,
      ttfbMs: perf.ttfbMs,

      // ── Fingerprinting ──
      canvasFingerprint: canvasFP,
      audioFingerprint: audioFP,
      webglVendor: webgl.vendor,
      webglRenderer: webgl.renderer,

      // ── Accessibility & Preferences ──
      availableFonts: fontInfo.availableFonts,
      zoomLevel: fontInfo.zoomLevel,
      prefersReducedMotion: fontInfo.prefersReducedMotion,
      prefersDarkMode: fontInfo.prefersDark,
      prefersHighContrast: fontInfo.prefersHighContrast,

      // ── Permissions (async, best-effort) ──
      cookies: navigator.cookieEnabled ? 'enabled' : 'disabled',
      localStorage: (() => { try { return localStorage ? 'enabled' : 'disabled'; } catch { return 'blocked'; } })(),
      sessionStorage: (() => { try { return sessionStorage ? 'enabled' : 'disabled'; } catch { return 'blocked'; } })(),
      indexedDB: !!window.indexedDB ? 'supported' : 'unsupported',
      serviceWorker: 'serviceWorker' in navigator ? 'supported' : 'unsupported',
      webAssembly: typeof WebAssembly === 'object' ? 'supported' : 'unsupported',
      webRTC: !!window.RTCPeerConnection ? 'supported' : 'unsupported',
      webGL: !!window.WebGLRenderingContext ? 'supported' : 'unsupported',
    };

    await addDoc(collection(db, "aivox_tracking"), payload);
    console.log(`✅ Tracked: ${model} | ${timeTakenMs}ms | ${payload.totalTokens} tokens`);

  } catch (error) {
    console.error('❌ Tracking error:', error);
  }
}

// ─── HELPER: Device Type ───
function getDeviceType() {
  const ua = navigator.userAgent;
  
  // Custom Regex for Android Models (e.g., SM-M315F)
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android[\s\S]+; ([\s\S]+?)\sBuild/i);
    if (match && match[1]) return match[1]; // Returns exact model name
    if (/Mobile/i.test(ua)) return 'Android Phone';
    return 'Android Tablet';
  }

  if (/iPad/i.test(ua)) return 'Apple iPad';
  if (/iPhone/i.test(ua)) return 'Apple iPhone';
  if (/Mac/i.test(ua) && navigator.maxTouchPoints > 1) return 'iPad (Desktop Mode)';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/Linux/i.test(ua)) return 'Linux PC';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  return 'Unknown Device';
}

// ─── HELPER: OS ───
function getOS() {
  const ua = navigator.userAgent;
  const platform = navigator.platform || '';
  if (/iPhone OS ([\d_]+)/i.test(ua)) return `iOS ${ua.match(/iPhone OS ([\d_]+)/i)[1].replace(/_/g,'.')}`;
  if (/iPad.*OS ([\d_]+)/i.test(ua)) return `iPadOS ${ua.match(/iPad.*OS ([\d_]+)/i)[1].replace(/_/g,'.')}`;
  if (/Android ([\d.]+)/i.test(ua)) return `Android ${ua.match(/Android ([\d.]+)/i)[1]}`;
  if (/Windows NT ([\d.]+)/i.test(ua)) {
    const v = ua.match(/Windows NT ([\d.]+)/i)[1];
    const map = {'10.0':'10/11','6.3':'8.1','6.2':'8','6.1':'7','6.0':'Vista'};
    return `Windows ${map[v]||v}`;
  }
  if (/Mac OS X ([\d_]+)/i.test(ua)) return `macOS ${ua.match(/Mac OS X ([\d_]+)/i)[1].replace(/_/g,'.')}`;
  if (/CrOS/i.test(ua)) return 'Chrome OS';
  if (/Linux/i.test(ua)) return 'Linux';
  return platform || 'Unknown OS';
}

// ─── HELPER: Browser ───
function getBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'Opera';
  if (/Brave/i.test(ua) || navigator.brave) return 'Brave';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Browser';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return navigator.vendor || 'Unknown Browser';
}