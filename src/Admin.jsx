import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import styles from './Admin.module.css';

function Admin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); // Naya State chat window ke liye

  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(collection(db, "aivox_tracking"), orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLogs(data);
      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // 📊 ANALYTICS
  const totalRequests = logs.length;
  const totalTokens = logs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);
  const avgTimeSec = totalRequests ? (logs.reduce((sum, log) => sum + (log.responseTimeMs || 0), 0) / totalRequests / 1000).toFixed(2) : 0;
  const roasts = logs.filter(l => l.roasterMode).length;

  // 👥 GROUP CHATS BY UNIQUE USERS (Device + OS)
  const chatGroups = logs.reduce((groups, log) => {
    // Unique user pehchanne ka tareeka
    const userId = `${log.os || 'Unknown OS'} - ${log.device || 'Device'} (${log.screenResolution || 'Res'})`;
    if (!groups[userId]) groups[userId] = [];
    groups[userId].push(log);
    return groups;
  }, {});
  
  const userList = Object.keys(chatGroups);

  // Default pehle user ko select karna
  useEffect(() => {
    if (userList.length > 0 && !selectedUser) {
      setSelectedUser(userList[0]);
    }
  }, [userList, selectedUser]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className={styles.adminLoading}>
        <div className={styles.spinner}></div>
        <h2>Loading Control Center... ⏳</h2>
      </div>
    );
  }

  return (
    <div className={styles.adminLayout}>
      
      {/* 📱 MOBILE HEADER (HAMBURGER) */}
      <div className={styles.mobileHeader}>
        <h2>🚀 Aivox Admin</h2>
        <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="#fff" strokeWidth="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>

      {/* 🖥️ SIDEBAR NAVIGATION */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>🚀 Aivox Pro</h2>
          <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}>
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="#888" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        
        <nav className={styles.navMenu}>
          <button className={`${styles.navItem} ${activeTab === 'overview' ? styles.activeNav : ''}`} onClick={() => handleTabChange('overview')}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Overview
          </button>
          
          <button className={`${styles.navItem} ${activeTab === 'chats' ? styles.activeNav : ''}`} onClick={() => handleTabChange('chats')}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            User Chats
          </button>
          
          <button className={`${styles.navItem} ${activeTab === 'system' ? styles.activeNav : ''}`} onClick={() => handleTabChange('system')}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
            System Logs
          </button>
        </nav>
      </aside>

      {/* ⬛ MAIN CONTENT AREA */}
      <main className={styles.mainContent}>
        
        {/* SECTION 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}>
              <div>
                <h1>📊 Dashboard Overview</h1>
                <p>High-level metrics and API usage.</p>
              </div>
              <div className={styles.liveBadge}><span className={styles.pulse}></span> LIVE</div>
            </header>

            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <h3>Total API Calls</h3>
                <p className={styles.statValue}>{totalRequests}</p>
              </div>
              <div className={styles.statCard}>
                <h3>Tokens Consumed</h3>
                <p className={`${styles.statValue} ${styles.tokenColor}`}>{totalTokens.toLocaleString()}</p>
              </div>
              <div className={styles.statCard}>
                <h3>Avg. Speed</h3>
                <p className={`${styles.statValue} ${styles.speedColor}`}>{avgTimeSec}s</p>
              </div>
              <div className={styles.statCard}>
                <h3>Roasts vs Normal</h3>
                <p className={styles.statValue}>
                  <span className={styles.roastColor}>{roasts}</span> 
                  <span style={{fontSize:'20px', color:'#555', margin:'0 10px'}}>/</span> 
                  <span className={styles.normalColor}>{totalRequests - roasts}</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 2: WHATSAPP / AIVOX STYLE CHAT WINDOW */}
        {activeTab === 'chats' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}>
              <div>
                <h1>💬 Live User Chats</h1>
                <p>Select a user device to see their exact conversation with Aivox.</p>
              </div>
            </header>

            <div className={styles.chatSplitView}>
              
              {/* LEFT PANE: USER LIST */}
              <div className={styles.userListSidebar}>
                <h3 className={styles.paneTitle}>Active Devices ({userList.length})</h3>
                <div className={styles.userListScroll}>
                  {userList.map(user => (
                    <div 
                      key={user} 
                      onClick={() => setSelectedUser(user)} 
                      className={`${styles.userListItem} ${selectedUser === user ? styles.activeUserItem : ''}`}
                    >
                      <div className={styles.userAvatar}>📱</div>
                      <div className={styles.userInfo}>
                        <h4>{user.split('(')[0]}</h4>
                        <p>{chatGroups[user].length} Interactions</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RIGHT PANE: REAL CHAT UI */}
              <div className={styles.chatWindow}>
                {selectedUser ? (
                  <>
                    <div className={styles.chatWindowHeader}>
                      <h3>Chatting on: {selectedUser}</h3>
                    </div>
                    <div className={styles.chatMessagesArea}>
                      {/* Firebase returns newest first, so we reverse to show oldest at top like real chat */}
                      {chatGroups[selectedUser].slice().reverse().map(log => (
                        <div key={log.id} className={styles.chatPair}>
                          
                          {/* USER BUBBLE (Right) */}
                          <div className={`${styles.bubbleRow} ${styles.rowUser}`}>
                            <div className={`${styles.chatBubble} ${styles.bubbleUser}`}>
                              {log.prompt}
                              <span className={styles.bubbleTime}>{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                          </div>

                          {/* AI BUBBLE (Left) */}
                          <div className={`${styles.bubbleRow} ${styles.rowAi}`}>
                            <div className={styles.chatAvatarWrapper}>
                              <img src="/logo.svg" alt="AI" className={styles.aiSmallAvatar} />
                            </div>
                            <div className={`${styles.chatBubble} ${styles.bubbleAi} ${log.roasterMode ? styles.bubbleRoast : ''}`}>
                              {log.response}
                              <div className={styles.bubbleFooter}>
                                <span className={styles.bubbleModel}>{log.model}</span>
                                <span className={styles.bubbleTime}>{(log.responseTimeMs / 1000).toFixed(1)}s</span>
                              </div>
                            </div>
                          </div>

                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className={styles.noUserSelected}>
                    <h2>👈 Select a user to view chat</h2>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: SYSTEM LOGS */}
        {activeTab === 'system' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}>
              <div>
                <h1>⚙️ System Logs</h1>
                <p>Technical details, devices, and token metrics.</p>
              </div>
            </header>

            <div className={styles.tableContainer}>
              <div className={styles.tableWrapper}>
                <table className={styles.adminTable}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Device & OS</th>
                      <th>Browser & Screen</th>
                      <th>Tokens (In/Out)</th>
                      <th>Speed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className={styles.timeCol}>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <div className={styles.sysTag}>{log.device || "Unknown"}</div>
                          <div style={{fontSize: '11px', color: '#888', marginTop: '4px'}}>{log.os}</div>
                        </td>
                        <td>
                          <div style={{fontSize: '11px', color: '#ccc', maxWidth: '150px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}} title={log.browser}>
                            {log.browser}
                          </div>
                          <div style={{fontSize: '11px', color: '#888', marginTop: '4px'}}>Res: {log.screenResolution}</div>
                        </td>
                        <td>
                          <div className={styles.tokenData}>In: {log.userTokens}</div>
                          <div className={styles.tokenData}>Out: {log.aiTokens}</div>
                          <div className={styles.tokenTotal}>Total: {log.totalTokens}</div>
                        </td>
                        <td className={styles.speedColor}>
                          {log.responseTimeMs ? (log.responseTimeMs / 1000).toFixed(2) + "s" : "N/A"}
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

      {/* OVERLAY FOR MOBILE MENU */}
      {isMobileMenuOpen && <div className={styles.menuOverlay} onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default Admin;