import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import styles from './Profile.module.css';

function Profile() {
  const [authUser, setAuthUser] = useState(null);
  const [guestName, setGuestName] = useState(localStorage.getItem('aivox_guest_name') || '');
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false); 
  
  const [totalChats, setTotalChats] = useState(0);

  useEffect(() => {
    const savedChats = JSON.parse(localStorage.getItem('aivox_chat_history') || '[]');
    setTotalChats(savedChats.length);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogout = async () => {
    setIsLoggingOut(true); 
    try {
      await signOut(auth);
      localStorage.removeItem('aivox_guest_name');
      window.location.href = '/auth'; 
    } catch (error) {
      console.error("Logout failed", error);
      setIsLoggingOut(false);
    }
  };

  // 🔥 Loading / Logging Out View
  if (loading || isLoggingOut) {
    return (
      <div className={styles.loadingContainer}>
        <svg className={styles.spinnerCircle} width="60" height="60" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(140, 130, 242, 0.2)" strokeWidth="4" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="#8c82f2" strokeWidth="4" strokeDasharray="30 100" strokeLinecap="round" />
        </svg>
        <h2 style={{ fontSize: '18px', fontFamily: 'sans-serif', margin: 0, marginTop: '16px', color: '#e6e6fa' }}>
          {isLoggingOut ? 'Logging Out securely...' : 'Loading Profile...'}
        </h2>
      </div>
    );
  }

  const currentDisplayName = authUser ? authUser.displayName : (guestName || 'User');
  const isGuest = !authUser;

  // XP & Level Logic
  const userXP = totalChats * 15;
  const userLevel = Math.floor(userXP / 100) + 1;
  const progressPercent = userXP % 100;

  return (
    <div className={styles.profilePageWrapper}>
      {/* 🔥 Advanced Aurora Background Elements (For CSS Glassmorphism) */}
      <div className={`${styles.auroraGlow} ${styles.glow1}`}></div>
      <div className={`${styles.auroraGlow} ${styles.glow2}`}></div>

      {/* 🔥 Native Scroll Wrapper for Both Laptop & Mobile */}
      <div className={styles.profileScrollWrapper}>
        <div className={styles.appContainer}>
          
          {/* Floating Back Button */}
          <button className={styles.backToChatBtn} onClick={() => window.location.href = '/'}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Chat
          </button>

          <div className={styles.profileDashboard}>
            
            {/* ─── LEFT COLUMN ─── */}
            <div className={styles.profileLeft}>
              <div className={styles.profileAvatarGiant}>
                {currentDisplayName.charAt(0).toUpperCase()}
              </div>
              <h3 className={styles.userNameText}>{currentDisplayName}</h3>
              <p className={styles.userEmailText}>{isGuest ? 'Free Basic Account' : authUser.email}</p>
              
              <div className={`${styles.roleBadge} ${isGuest ? styles.badgeFree : styles.badgePremium}`}>
                {isGuest ? (
                  <><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"/></svg> STANDARD USER</>
                ) : (
                  <><svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> PREMIUM MEMBER</>
                )}
              </div>

              <div className={styles.sessionTracker}>
                <span className={styles.pulsingDot}></span> 1 Active Session (This Device)
              </div>

              <div className={styles.profileActions}>
                <button onClick={() => window.location.href = '/'} className={styles.btnBack}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Back
                </button>
                <button onClick={handleLogout} className={styles.btnLogout}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  {isGuest ? 'Leave Session' : 'Log Out'}
                </button>
              </div>
            </div>

            {/* ─── RIGHT COLUMN ─── */}
            <div className={styles.profileRight}>
              
              <div className={styles.statsGrid}>
                <div className={styles.statBox}>
                  <div className={styles.statHeader}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <h4>Messages Exchanged</h4>
                  </div>
                  <p className={styles.statNumber} style={{color: '#fff'}}>{totalChats}</p>
                </div>
                <div className={styles.statBox}>
                  <div className={styles.statHeader}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <h4>Account Status</h4>
                  </div>
                  <p className={styles.statNumber} style={{ color: isGuest ? '#8a8d9e' : '#00ff80'}}>
                    {isGuest ? 'Not Saved' : 'Secured'}
                  </p>
                </div>
              </div>

              {/* XP Progress Bar */}
              <div className={styles.xpBarContainer}>
                <div className={styles.xpHeader}>
                  <span className={styles.levelBadge}>
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg>
                    Level {userLevel}
                  </span>
                  <span className={styles.xpText}>{userXP} / {(userLevel * 100)} XP</span>
                </div>
                <div className={styles.xpBarTrack}>
                  <div className={styles.xpBarFill} style={{ width: `${progressPercent}%` }}></div>
                </div>
                <p className={styles.xpHint}>Chat more to earn XP and level up!</p>
              </div>

              {/* Premium / Normal Upgrade Card */}
              {!isGuest ? (
                <div className={styles.premiumCardLarge}>
                  <div className={styles.premiumHeaderLarge}>
                    <h2><svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" strokeWidth="2" fill="none" style={{marginRight: '6px'}}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Aivox Premium</h2>
                    <span className={styles.freeBadgeTag}>LIFETIME FREE</span>
                  </div>
                  <p className={styles.premiumDesc}>
                    Congratulations <strong>{currentDisplayName}</strong>! You are officially part of our <strong>First 100 Users</strong> club. 
                    Your account has been permanently upgraded.
                  </p>
                  <ul className={styles.perksList}>
                    <li><svg viewBox="0 0 24 24" width="16" height="16" stroke="#00ff80" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg> Unlimited API Calls (Gemini & Llama 3)</li>
                    <li><svg viewBox="0 0 24 24" width="16" height="16" stroke="#00ff80" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg> Zero Ads & No Tracking Delays</li>
                    <li><svg viewBox="0 0 24 24" width="16" height="16" stroke="#00ff80" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg> Access to God Mode Roaster Personality</li>
                    <li><svg viewBox="0 0 24 24" width="16" height="16" stroke="#00ff80" strokeWidth="2" fill="none"><polyline points="20 6 9 17 4 12"/></svg> Multi-Device Chat Sync Active</li>
                  </ul>
                </div>
              ) : (
                <div className={styles.normalCardLarge}>
                  <div className={styles.premiumHeaderLarge}>
                    <h2>Free Plan</h2>
                    <span className={styles.basicBadgeTag}>BASIC</span>
                  </div>
                  <p className={styles.premiumDesc}>
                    You are using a temporary guest session. Your chat history might be lost if you clear your browser.
                  </p>
                  
                  <hr className={styles.dividerLine} />
                  
                  <h4 className={styles.offerTitle}>🚀 First 100 Users Offer!</h4>
                  <p className={styles.offerDesc}>
                    Create an account today to secure your data and get <strong>Lifetime Premium for $0</strong>.
                  </p>
                  
                  <button onClick={() => window.location.href = '/auth'} className={styles.btnUpgrade}>
                    Claim Free Premium Now ✨
                  </button>
                </div>
              )}

            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;