import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase'; // ../ kyu? Kyunki hum utils folder ke andar hain

export const trackUserActivity = async ({ prompt, response, model, timeTakenMs, isRoasterMode }) => {
  
  // 1. Token Calculation
  const userTokens = Math.ceil(prompt.length / 4);
  const aiTokens = Math.ceil(response.length / 4);
  const totalTokens = userTokens + aiTokens;

  // 2. Device & System Details
  const deviceType = window.innerWidth <= 768 ? "Mobile" : "Desktop";
  const osPlatform = navigator?.userAgentData?.platform || navigator?.platform || "Unknown";

  // 3. The 10 Advanced Tracking Metrics
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
  const net = navigator.connection ? navigator.connection.effectiveType : "Unknown";
  const cores = navigator.hardwareConcurrency || "N/A";
  const ram = navigator.deviceMemory ? navigator.deviceMemory + "GB" : "N/A";
  const referrer = document.referrer || "Direct Link";
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches ? "PWA App" : "Browser Tab";
  const isCookie = navigator.cookieEnabled ? "Yes" : "No";
  const langFull = navigator.languages ? navigator.languages.join(', ') : navigator.language;
  const orient = window.screen.orientation ? window.screen.orientation.type : "Unknown";
  const vendor = navigator.vendor || "Unknown";

  try {
    // Save to Firebase
    await addDoc(collection(db, "aivox_tracking"), {
      prompt,
      response,
      model,
      userTokens,
      aiTokens,
      totalTokens,
      roasterMode: isRoasterMode,
      device: deviceType,
      os: osPlatform,
      browser: navigator.userAgent,
      language: navigator.language,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      responseTimeMs: timeTakenMs,
      timestamp: new Date().toISOString(),
      
      // 10 NEW METRICS
      timezone: tz,
      network: net,
      cpuCores: cores,
      ramMemory: ram,
      referrer: referrer,
      displayMode: isStandalone,
      cookies: isCookie,
      languages: langFull,
      orientation: orient,
      browserVendor: vendor
    });
  } catch (e) {
    console.error("Master Tracker Error: ", e);
  }
};