import { useEffect, useState } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import styles from './Admin.module.css';

function Admin() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); 
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null); 
  const [isMobileChatView, setIsMobileChatView] = useState(false);

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

  // 📥 EXPORT TO CSV FUNCTION
  const downloadCSV = () => {
    if (logs.length === 0) return alert("No data to download!");

    const headers = ["Time", "Timezone", "Device", "OS", "Browser", "Network", "CPU", "RAM", "Prompt", "Response", "Model", "Speed(s)", "Tokens", "Mode"];
    
    const rows = logs.map(log => [
      new Date(log.timestamp).toLocaleString().replace(/,/g, ''),
      log.timezone || 'N/A',
      log.device || 'N/A',
      log.os || 'N/A',
      log.browserVendor || 'N/A',
      log.network || 'N/A',
      log.cpuCores || 'N/A',
      log.ramMemory || 'N/A',
      `"${(log.prompt || '').replace(/"/g, '""')}"`,
      `"${(log.response || '').replace(/"/g, '""')}"`,
      log.model || 'N/A',
      log.responseTimeMs ? (log.responseTimeMs / 1000).toFixed(2) : '0',
      log.totalTokens || '0',
      log.isRoasterMode ? 'Roaster' : 'Normal'
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Aivox_Analytics_${new Date().toLocaleDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 📊 1. OVERVIEW ANALYTICS
  const totalRequests = logs.length;
  const totalTokens = logs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);
  const avgTimeSec = totalRequests ? (logs.reduce((sum, log) => sum + (log.responseTimeMs || 0), 0) / totalRequests / 1000).toFixed(2) : 0;
  const roasts = logs.filter(l => l.isRoasterMode).length;

  // 👥 2. GROUP CHATS
  const chatGroups = logs.reduce((groups, log) => {
    const userId = `${log.os || 'Unknown'}_${log.device || 'Unknown'}_${log.screenResolution || 'Unknown'}`;
    if (!groups[userId]) {
      groups[userId] = { id: userId, device: log.device || "Unknown Device", os: log.os || "Unknown OS", browser: log.browserVendor || "Unknown Browser", network: log.network || "WIFI", messages: [] };
    }
    groups[userId].messages.push(log);
    return groups;
  }, {});
  const userList = Object.values(chatGroups).sort((a, b) => new Date(b.messages[0].timestamp) - new Date(a.messages[0].timestamp));

  // 📈 3. DEVICE & BROWSER STATS
  const osStats = logs.reduce((acc, log) => { acc[log.os] = (acc[log.os] || 0) + 1; return acc; }, {});
  const browserStats = logs.reduce((acc, log) => { acc[log.browserVendor] = (acc[log.browserVendor] || 0) + 1; return acc; }, {});
  
  // ⚡ 4. PERFORMANCE STATS
  const modelStats = logs.reduce((acc, log) => {
    const m = log.model || "Unknown";
    if(!acc[m]) acc[m] = { count: 0, totalTokens: 0, totalTime: 0 };
    acc[m].count += 1;
    acc[m].totalTokens += log.totalTokens || 0;
    acc[m].totalTime += log.responseTimeMs || 0;
    return acc;
  }, {});

  // 🌍 6. GEO & LOCAL STATS (NEW)
  const timezoneStats = logs.reduce((acc, log) => { acc[log.timezone || 'Unknown'] = (acc[log.timezone || 'Unknown'] || 0) + 1; return acc; }, {});
  const langStats = logs.reduce((acc, log) => { acc[log.language || 'Unknown'] = (acc[log.language || 'Unknown'] || 0) + 1; return acc; }, {});

  // 🔥 7. ROASTER ANALYTICS (NEW)
  const normalCount = totalRequests - roasts;
  const roastTokens = logs.filter(l => l.isRoasterMode).reduce((sum, l) => sum + (l.totalTokens || 0), 0);
  const normalTokens = logs.filter(l => !l.isRoasterMode).reduce((sum, l) => sum + (l.totalTokens || 0), 0);

  // 📡 8. NETWORK & PRIVACY (NEW)
  const networkStats = logs.reduce((acc, log) => { acc[log.network || 'Unknown'] = (acc[log.network || 'Unknown'] || 0) + 1; return acc; }, {});
  const displayModeStats = logs.reduce((acc, log) => { acc[log.displayMode || 'Unknown'] = (acc[log.displayMode || 'Unknown'] || 0) + 1; return acc; }, {});
  const cookieStats = logs.reduce((acc, log) => { acc[log.cookies || 'Unknown'] = (acc[log.cookies || 'Unknown'] || 0) + 1; return acc; }, {});

  // 💰 9. TOKEN ECONOMICS (NEW)
  const totalInputTokens = logs.reduce((sum, l) => sum + (l.userTokens || 0), 0);
  const totalOutputTokens = logs.reduce((sum, l) => sum + (l.aiTokens || 0), 0);

  // 🧠 10. PROMPT INTELLIGENCE (NEW)
  const sortedByLength = [...logs].sort((a, b) => (b.prompt?.length || 0) - (a.prompt?.length || 0));
  const longestPrompts = sortedByLength.slice(0, 5);

  useEffect(() => {
    if (userList.length > 0 && !selectedUser && window.innerWidth > 900) setSelectedUser(userList[0]);
  }, [userList, selectedUser]);

  const handleTabChange = (tab) => { setActiveTab(tab); setIsMobileMenuOpen(false); setIsMobileChatView(false); };

  if (loading) return <div className={styles.adminLoading}><div className={styles.spinner}></div><h2>Loading Control Center... ⏳</h2></div>;

  return (
    <div className={styles.adminLayout}>
      
      {/* 📱 MOBILE HEADER */}
      <div className={styles.mobileHeader}>
        <h2>🚀 Aivox Admin</h2>
        <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
          <svg viewBox="0 0 24 24" width="28" height="28" stroke="#fff" strokeWidth="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
      </div>

      {/* 🖥️ SIDEBAR NAVIGATION (NOW WITH 10 TABS) */}
      <aside className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.sidebarHeader}>
          <h2>🚀 Aivox Pro</h2>
          <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}>✕</button>
        </div>
        
        <nav className={styles.navMenu}>
          <button className={`${styles.navItem} ${activeTab === 'overview' ? styles.activeNav : ''}`} onClick={() => handleTabChange('overview')}>📊 Overview</button>
          <button className={`${styles.navItem} ${activeTab === 'chats' ? styles.activeNav : ''}`} onClick={() => handleTabChange('chats')}>💬 User Chats</button>
          <button className={`${styles.navItem} ${activeTab === 'devices' ? styles.activeNav : ''}`} onClick={() => handleTabChange('devices')}>📱 Devices Info</button>
          <button className={`${styles.navItem} ${activeTab === 'performance' ? styles.activeNav : ''}`} onClick={() => handleTabChange('performance')}>⚡ AI Performance</button>
          <button className={`${styles.navItem} ${activeTab === 'geography' ? styles.activeNav : ''}`} onClick={() => handleTabChange('geography')}>🌍 Geo & Local</button>
          <button className={`${styles.navItem} ${activeTab === 'roaster' ? styles.activeNav : ''}`} onClick={() => handleTabChange('roaster')}>🔥 Roaster Analytics</button>
          <button className={`${styles.navItem} ${activeTab === 'network' ? styles.activeNav : ''}`} onClick={() => handleTabChange('network')}>📡 Network Data</button>
          <button className={`${styles.navItem} ${activeTab === 'economics' ? styles.activeNav : ''}`} onClick={() => handleTabChange('economics')}>💰 Token Economics</button>
          <button className={`${styles.navItem} ${activeTab === 'prompts' ? styles.activeNav : ''}`} onClick={() => handleTabChange('prompts')}>🧠 Prompt Intel</button>
          <button className={`${styles.navItem} ${activeTab === 'system' ? styles.activeNav : ''}`} onClick={() => handleTabChange('system')}>⚙️ System Logs</button>
        </nav>
      </aside>

      {/* ⬛ MAIN CONTENT */}
      <main className={styles.mainContent}>
        
        {/* SECTION 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>📊 Dashboard Overview</h1><p>High-level metrics and API usage.</p></div><div className={styles.liveBadge}><span className={styles.pulse}></span> LIVE</div></header>
            <div className={styles.statsGrid}>
              <div className={styles.statCard}><h3>Total API Calls</h3><p className={styles.statValue}>{totalRequests}</p></div>
              <div className={styles.statCard}><h3>Tokens Consumed</h3><p className={`${styles.statValue} ${styles.tokenColor}`}>{totalTokens.toLocaleString()}</p></div>
              <div className={styles.statCard}><h3>Avg. Speed</h3><p className={`${styles.statValue} ${styles.speedColor}`}>{avgTimeSec}s</p></div>
              <div className={styles.statCard}><h3>Roasts vs Normal</h3><p className={styles.statValue}><span className={styles.roastColor}>{roasts}</span> <span style={{fontSize:'20px', color:'#555', margin:'0 10px'}}>/</span> <span className={styles.normalColor}>{normalCount}</span></p></div>
            </div>
          </div>
        )}

        {/* SECTION 2: LIVE CHATS */}
        {activeTab === 'chats' && (
          <div className={styles.sectionFadeIn}>
            <header className={`${styles.pageHeader} ${isMobileChatView ? styles.hideOnMobile : ''}`}><div><h1>💬 Live User Chats</h1><p>View exact Mobile/Laptop models and their conversations.</p></div></header>
            <div className={styles.chatSplitView}>
              <div className={`${styles.userListSidebar} ${isMobileChatView ? styles.hideOnMobile : ''}`}>
                <h3 className={styles.paneTitle}>Active Devices ({userList.length})</h3>
                <div className={styles.userListScroll}>
                  {userList.map(user => (
                    <div key={user.id} onClick={() => { setSelectedUser(user); setIsMobileChatView(true); }} className={`${styles.userListItem} ${selectedUser?.id === user.id ? styles.activeUserItem : ''}`}>
                      <div className={styles.userAvatar}>{user.os.includes('Mac') || user.os.includes('iOS') ? '🍎' : user.os.includes('Android') ? '🤖' : '💻'}</div>
                      <div className={styles.userInfo}>
                        <h4 style={{color: '#00e5ff'}}>{user.device}</h4>
                        <p>{user.os} • {user.browser}</p>
                        <span style={{fontSize: '10px', color: '#555'}}>{user.messages.length} Msgs | {user.network}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`${styles.chatWindow} ${!isMobileChatView ? styles.hideOnMobile : ''}`}>
                {selectedUser ? (
                  <>
                    <div className={styles.chatWindowHeader}>
                      <button className={styles.mobileBackBtn} onClick={() => setIsMobileChatView(false)}>⬅️ Back</button>
                      <div><h3 style={{margin: 0}}>{selectedUser.device}</h3><p style={{margin: 0, fontSize: '11px', color: '#888'}}>OS: {selectedUser.os} | Res: {selectedUser.messages[0]?.screenResolution}</p></div>
                    </div>
                    <div className={styles.chatMessagesArea}>
                      {selectedUser.messages.slice().reverse().map(log => (
                        <div key={log.id} className={styles.chatPair}>
                          <div className={`${styles.bubbleRow} ${styles.rowUser}`}><div className={`${styles.chatBubble} ${styles.bubbleUser}`}>{log.prompt}<span className={styles.bubbleTime}>{new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div></div>
                          <div className={`${styles.bubbleRow} ${styles.rowAi}`}><div className={styles.chatAvatarWrapper}><img src="/logo.svg" alt="AI" className={styles.aiSmallAvatar} /></div><div className={`${styles.chatBubble} ${styles.bubbleAi} ${log.roasterMode ? styles.bubbleRoast : ''}`}>{log.response}<div className={styles.bubbleFooter}><span className={styles.bubbleModel}>{log.model}</span><span className={styles.bubbleTime}>{(log.responseTimeMs / 1000).toFixed(1)}s</span></div></div></div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (<div className={styles.noUserSelected}><h2>👈 Select a user device to view chat</h2></div>)}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: DEVICES */}
        {activeTab === 'devices' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>📱 Device & Browser Demographics</h1><p>See where your users are coming from.</p></div></header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Operating Systems</h3>
                {Object.entries(osStats).sort((a,b)=>b[1]-a[1]).map(([os, count]) => (
                  <div key={os} className={styles.progressRow}><div className={styles.progressLabel}><span>{os}</span><span>{count}</span></div><div className={styles.progressBar}><div className={styles.progressFill} style={{width: `${(count/totalRequests)*100}%`, background: '#8c82f2'}}></div></div></div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Browsers Used</h3>
                {Object.entries(browserStats).sort((a,b)=>b[1]-a[1]).map(([browser, count]) => (
                  <div key={browser} className={styles.progressRow}><div className={styles.progressLabel}><span>{browser}</span><span>{count}</span></div><div className={styles.progressBar}><div className={styles.progressFill} style={{width: `${(count/totalRequests)*100}%`, background: '#00e5ff'}}></div></div></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: AI PERFORMANCE */}
        {activeTab === 'performance' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>⚡ AI Model Performance</h1><p>Speed, Token usage, and Fallback analysis.</p></div></header>
            <div className={styles.analyticsGrid}>
              {Object.entries(modelStats).map(([model, data]) => (
                <div key={model} className={styles.analyticsCard}>
                  <h3 style={{color: '#f5b942'}}>{model}</h3>
                  <div className={styles.perfStat}><span>Requests Handled:</span> <strong>{data.count}</strong></div>
                  <div className={styles.perfStat}><span>Total Tokens:</span> <strong>{data.totalTokens.toLocaleString()}</strong></div>
                  <div className={styles.perfStat}><span>Avg. Response Time:</span> <strong>{((data.totalTime / data.count) / 1000).toFixed(2)}s</strong></div>
                  <div className={styles.perfStat}><span>Avg. Tokens/Req:</span> <strong>{Math.round(data.totalTokens / data.count)}</strong></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🌍 SECTION 6: GEO & LOCAL (NEW) */}
        {activeTab === 'geography' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>🌍 Geography & Localization</h1><p>User Timezones and Language Preferences.</p></div></header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Top Timezones</h3>
                {Object.entries(timezoneStats).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([tz, count]) => (
                  <div key={tz} className={styles.progressRow}><div className={styles.progressLabel}><span>{tz}</span><span>{count}</span></div><div className={styles.progressBar}><div className={styles.progressFill} style={{width: `${(count/totalRequests)*100}%`, background: '#00ff80'}}></div></div></div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>System Languages</h3>
                {Object.entries(langStats).sort((a,b)=>b[1]-a[1]).map(([lang, count]) => (
                  <div key={lang} className={styles.progressRow}><div className={styles.progressLabel}><span>{lang}</span><span>{count}</span></div><div className={styles.progressBar}><div className={styles.progressFill} style={{width: `${(count/totalRequests)*100}%`, background: '#f5b942'}}></div></div></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 🔥 SECTION 7: ROASTER ANALYTICS (NEW) */}
        {activeTab === 'roaster' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>🔥 Roaster vs Normal Mode</h1><p>Deep dive into personality usage.</p></div></header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3 style={{color: '#ff4d4f'}}>Roast Mode Usage</h3>
                <div className={styles.perfStat}><span>Total Roast Prompts:</span> <strong style={{color: '#ff4d4f'}}>{roasts}</strong></div>
                <div className={styles.perfStat}><span>Tokens Burned in Roast:</span> <strong>{roastTokens.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Avg Tokens/Roast:</span> <strong>{roasts ? Math.round(roastTokens/roasts) : 0}</strong></div>
              </div>
              <div className={styles.analyticsCard}>
                <h3 style={{color: '#8c82f2'}}>Normal Mode Usage</h3>
                <div className={styles.perfStat}><span>Total Normal Prompts:</span> <strong style={{color: '#8c82f2'}}>{normalCount}</strong></div>
                <div className={styles.perfStat}><span>Tokens Used Normally:</span> <strong>{normalTokens.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Avg Tokens/Normal:</span> <strong>{normalCount ? Math.round(normalTokens/normalCount) : 0}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* 📡 SECTION 8: NETWORK & PRIVACY (NEW) */}
        {activeTab === 'network' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>📡 Network & Environment</h1><p>Connection speeds and browser settings.</p></div></header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3>Connection Type</h3>
                {Object.entries(networkStats).map(([net, count]) => (
                  <div key={net} className={styles.perfStat}><span style={{textTransform:'uppercase'}}>{net}</span> <strong>{count} Users</strong></div>
                ))}
              </div>
              <div className={styles.analyticsCard}>
                <h3>Environment Settings</h3>
                {Object.entries(displayModeStats).map(([mode, count]) => (
                  <div key={mode} className={styles.perfStat}><span>Display: {mode}</span> <strong>{count}</strong></div>
                ))}
                {Object.entries(cookieStats).map(([cookie, count]) => (
                  <div key={cookie} className={styles.perfStat}><span>Cookies: {cookie}</span> <strong>{count}</strong></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 💰 SECTION 9: TOKEN ECONOMICS (NEW) */}
        {activeTab === 'economics' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>💰 Token Economics</h1><p>Analyze how your API limits are being spent.</p></div></header>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <h3 style={{color: '#00e5ff'}}>Input vs Output Ratio</h3>
                <div className={styles.perfStat}><span>Total Input (User) Tokens:</span> <strong>{totalInputTokens.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Total Output (AI) Tokens:</span> <strong>{totalOutputTokens.toLocaleString()}</strong></div>
                <div className={styles.perfStat}><span>Ratio (Input : Output):</span> <strong>1 : {totalInputTokens ? (totalOutputTokens/totalInputTokens).toFixed(2) : 0}</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* 🧠 SECTION 10: PROMPT INTELLIGENCE (NEW) */}
        {activeTab === 'prompts' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader}><div><h1>🧠 Prompt Intelligence</h1><p>Longest and most complex user queries.</p></div></header>
            <div className={styles.tableContainer}>
              <div className={styles.tableWrapper}>
                <table className={styles.adminTable}>
                  <thead><tr><th>Length (Chars)</th><th>User Prompt</th><th>AI Tokens Used</th></tr></thead>
                  <tbody>
                    {longestPrompts.map((log) => (
                      <tr key={log.id}>
                        <td><strong style={{color:'#f5b942'}}>{log.prompt?.length}</strong></td>
                        <td style={{maxWidth: '500px', whiteSpace: 'normal', fontStyle: 'italic', color: '#cdd6f4'}}>"{log.prompt}"</td>
                        <td>{log.totalTokens}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 5: DEEP SYSTEM LOGS */}
        {activeTab === 'system' && (
          <div className={styles.sectionFadeIn}>
            <header className={styles.pageHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><h1>⚙️ Deep Tracking Logs</h1><p>Advanced Hardware, Network, and Environment Data.</p></div>
              <button onClick={downloadCSV} style={{ background: '#8c82f2', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>📥 Export CSV</button>
            </header>
            <div className={styles.tableContainer}>
              <div className={styles.tableWrapper}>
                <table className={styles.adminTable}>
                  <thead><tr><th>Time & Zone</th><th>Device & Hardware</th><th>Network & Privacy</th><th>Performance</th></tr></thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className={styles.timeCol}>{new Date(log.timestamp).toLocaleString()}<div className={styles.subText}>🌍 {log.timezone}</div></td>
                        <td><div className={styles.sysTag}>{log.device || "Unknown"}</div><div className={styles.subText}><strong>OS:</strong> {log.os}<br/><strong>RAM:</strong> {log.ramMemory || 'N/A'} | <strong>CPU:</strong> {log.cpuCores || 'N/A'} Cores<br/><strong>Screen:</strong> {log.screenResolution} ({log.orientation})</div></td>
                        <td><div className={styles.sysTag} style={{background: '#1a3a2a', color: '#00ff80'}}>📶 {log.network?.toUpperCase() || 'WIFI'}</div><div className={styles.subText}><strong>Browser:</strong> {log.browserVendor} ({log.language})<br/><strong>Mode:</strong> {log.displayMode}<br/><strong>Ref:</strong> {log.referrer === "" ? "Direct Link" : log.referrer?.substring(0,20)}</div></td>
                        <td><div className={styles.tokenTotal}>Tokens: {log.totalTokens}</div><div className={styles.speedColor}>⚡ {log.responseTimeMs ? (log.responseTimeMs / 1000).toFixed(2) + "s" : "N/A"}</div><div className={styles.subText}>🤖 {log.model}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </main>
      {isMobileMenuOpen && <div className={styles.menuOverlay} onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
}

export default Admin;