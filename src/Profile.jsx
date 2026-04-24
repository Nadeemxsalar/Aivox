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
        <svg className={styles.spinnerCircle} width="50" height="50" viewBox="0 0 50 50">
          <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(140, 130, 242, 0.2)" strokeWidth="4" />
          <circle cx="25" cy="25" r="20" fill="none" stroke="#8c82f2" strokeWidth="4" strokeDasharray="30 100" strokeLinecap="round" />
        </svg>
        <h2 style={{ fontSize: '18px', fontFamily: 'sans-serif', margin: 0 }}>
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
    <div className={styles.appContainer}>
      
      <button className={styles.backToChatBtn} onClick={() => window.location.href = '/'}>
        ⬅ Back to Chat
      </button>

      <div className={styles.profileDashboard}>
        
        {/* ─── LEFT COLUMN ─── */}
        <div className={styles.profileLeft}>
          <div className={styles.profileAvatarGiant}>
            {currentDisplayName.charAt(0).toUpperCase()}
          </div>
          <h3 style={{margin: '10px 0'}}>{currentDisplayName}</h3>
          <p style={{color: '#888', margin: '0 0 10px 0'}}>{isGuest ? 'Free Basic Account' : authUser.email}</p>
          
          <div className={`${styles.roleBadge} ${isGuest ? styles.badgeFree : styles.badgePremium}`}>
            {isGuest ? '⚪ STANDARD USER' : '👑 PREMIUM MEMBER'}
          </div>

          <div className={styles.sessionTracker}>
            <span style={{ color: '#00ff80', marginRight: '5px' }}>●</span> 1 Active Session (This Device)
          </div>

          <div className={styles.profileActions}>
            <button onClick={() => window.location.href = '/'} className={styles.btnBack}>⬅ Back</button>
            <button onClick={handleLogout} className={styles.btnLogout}>{isGuest ? 'Leave Session' : 'Log Out'}</button>
          </div>
        </div>

        {/* ─── RIGHT COLUMN ─── */}
        <div className={styles.profileRight}>
          
          <div className={styles.statsGrid}>
            <div className={styles.statBox}>
              <h4 style={{margin: 0, color: '#aaa'}}>Messages Exchanged</h4>
              <p className={styles.statNumber} style={{color: '#fff'}}>{totalChats}</p>
            </div>
            <div className={styles.statBox}>
              <h4 style={{margin: 0, color: '#aaa'}}>Account Status</h4>
              <p className={styles.statNumber} style={{ color: isGuest ? '#888' : '#00ff80'}}>
                {isGuest ? 'Not Saved' : 'Secured'}
              </p>
            </div>
          </div>

          {/* XP Progress Bar */}
          <div className={styles.xpBarContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px', color: '#fff', fontWeight: 'bold' }}>⭐ Level {userLevel}</span>
              <span style={{ fontSize: '12px', color: '#888' }}>{userXP} / {(userLevel * 100)} XP</span>
            </div>
            <div className={styles.xpBarTrack}>
              <div className={styles.xpBarFill} style={{ width: `${progressPercent}%` }}></div>
            </div>
            <p style={{ fontSize: '11px', color: '#666', marginTop: '6px', marginBottom: 0 }}>Chat more to earn XP and level up!</p>
          </div>

          {/* Premium / Normal Upgrade Card */}
          {!isGuest ? (
            <div className={styles.premiumCardLarge}>
              <div className={styles.premiumHeaderLarge}>
                <h2 style={{color: '#f5b942'}}>👑 Aivox Premium</h2>
                <span className={styles.freeBadgeTag}>LIFETIME FREE</span>
              </div>
              <p className={styles.premiumDesc}>
                Congratulations <strong>{currentDisplayName}</strong>! You are officially part of our <strong>First 100 Users</strong> club. 
                Your account has been permanently upgraded.
              </p>
              <ul className={styles.perksList}>
                <li>✅ Unlimited API Calls (Gemini & Llama 3)</li>
                <li>✅ Zero Ads & No Tracking Delays</li>
                <li>✅ Access to God Mode Roaster Personality</li>
                <li>✅ Multi-Device Chat Sync Active</li>
              </ul>
            </div>
          ) : (
            <div className={styles.normalCardLarge}>
              <div className={styles.premiumHeaderLarge}>
                <h2 style={{color: '#fff'}}>Free Plan</h2>
                <span className={styles.freeBadgeTag}>BASIC</span>
              </div>
              <p className={styles.premiumDesc}>
                You are using a temporary guest session. Your chat history might be lost if you clear your browser.
              </p>
              
              <hr style={{borderColor: '#1f1e2e', margin: '20px 0'}} />
              
              <h4 style={{color: '#f5b942', margin: '0 0 5px 0', fontSize: '18px'}}>🚀 First 100 Users Offer!</h4>
              <p style={{color: '#e6e6fa', fontSize: '13px', margin: '0 0 10px 0'}}>
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
  );
}

export default Profile;