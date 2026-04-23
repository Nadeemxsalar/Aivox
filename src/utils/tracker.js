import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase'; 

// 🔥 Advance Device & Model Detector
const getDeviceDetails = () => {
  const ua = navigator.userAgent;
  let deviceName = "Desktop/Laptop";
  let osName = "Unknown OS";

  // OS Detection
  if (/windows phone/i.test(ua)) osName = "Windows Phone";
  else if (/android/i.test(ua)) osName = "Android";
  else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) osName = "iOS";
  else if (/Macintosh/i.test(ua)) osName = "Mac OS";
  else if (/Windows NT/i.test(ua)) osName = "Windows";
  else if (/Linux/i.test(ua)) osName = "Linux";

  // Phone Model Extraction (Jahan tak browser allow kare)
  if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/.test(ua)) {
    if (/Android/i.test(ua)) {
      // Android ka model nikalne ki koshish (e.g., SM-G998B)
      const match = ua.match(/Android[\s\S]+; ([\s\S]+?)\sBuild/i);
      deviceName = (match && match[1]) ? match[1] : "Android Mobile";
    } else if (/iPhone/i.test(ua)) {
      deviceName = "Apple iPhone";
    } else if (/iPad/i.test(ua)) {
      deviceName = "Apple iPad";
    } else {
      deviceName = "Mobile Device";
    }
  }

  // Browser Name Extract
  let browserVendor = "Unknown";
  if(ua.indexOf("Firefox") > -1) browserVendor = "Firefox";
  else if(ua.indexOf("SamsungBrowser") > -1) browserVendor = "Samsung Internet";
  else if(ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browserVendor = "Opera";
  else if(ua.indexOf("Trident") > -1) browserVendor = "IE";
  else if(ua.indexOf("Edge") > -1 || ua.indexOf("Edg") > -1) browserVendor = "Edge";
  else if(ua.indexOf("Chrome") > -1) browserVendor = "Chrome";
  else if(ua.indexOf("Safari") > -1) browserVendor = "Safari";

  return { deviceName, osName, browserVendor };
};

export const trackUserActivity = async ({ prompt, response, model, timeTakenMs, isRoasterMode }) => {
  try {
    const { deviceName, osName, browserVendor } = getDeviceDetails();

    // 🔥 10 NEW TRACKING FEATURES
    const language = navigator.language || "Unknown";
    const network = navigator.connection ? navigator.connection.effectiveType : "WIFI/LAN";
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const orientation = window.screen?.orientation?.type || "Unknown";
    const referrer = document.referrer || "Direct Link";
    const cpuCores = navigator.hardwareConcurrency || "N/A";
    const ramMemory = navigator.deviceMemory ? `${navigator.deviceMemory}GB+` : "N/A";
    const displayMode = window.matchMedia('(display-mode: standalone)').matches ? 'PWA App' : 'Browser Tab';
    const cookies = navigator.cookieEnabled ? "Enabled" : "Disabled";

    const logData = {
      prompt,
      response,
      model,
      timeTakenMs,
      isRoasterMode,
      timestamp: new Date().toISOString(),
      
      // Hardware & System
      device: deviceName,
      os: osName,
      browserVendor,
      cpuCores,
      ramMemory,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      orientation,
      
      // Network & Environment
      language,
      network,
      timezone,
      referrer,
      displayMode,
      cookies,

      // Token estimation
      userTokens: Math.ceil(prompt.length / 4),
      aiTokens: Math.ceil(response.length / 4),
      totalTokens: Math.ceil(prompt.length / 4) + Math.ceil(response.length / 4),
    };

    await addDoc(collection(db, "aivox_tracking"), logData);
  } catch (error) {
    console.error("Tracking Error:", error);
  }
};