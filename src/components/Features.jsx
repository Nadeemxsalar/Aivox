import { useState, useEffect } from 'react';
import styles from './Features.module.css';

function Features() {
  // 🔥 Toast Notification State
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const [activeTab, setActiveTab] = useState('alterego');
  
  // 🔥 REAL LOGIC: Load and Save to Local Storage
  const [activeEgo, setActiveEgo] = useState(() => {
    return localStorage.getItem('aivox_alter_ego') || 'smart';
  });

  const [memories, setMemories] = useState(() => {
    const saved = localStorage.getItem('aivox_memories');
    return saved ? JSON.parse(saved) : [{ id: 1, text: "Welcome to Aivox Memory Lock!", date: "System Info" }];
  });

  const [newMemory, setNewMemory] = useState('');
  
  // Timeline Predictor States
  const [timelinePrompt, setTimelinePrompt] = useState('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictions, setPredictions] = useState(null);

  const featuresList = [
    { id: 'mirror', title: 'Digital Mirror', icon: '🪞', desc: 'Psychology Analyzer' },
    { id: 'alterego', title: 'Alter-Ego Mode', icon: '🎭', desc: 'Switch Personalities' },
    { id: 'memory', title: 'Memory Lock', icon: '🧠', desc: 'Permanent PIN for secrets' },
    { id: 'timeline', title: 'Timeline Predictor', icon: '🌌', desc: 'Multiverse Simulation' },
    { id: 'vibe', title: 'Vibe Sync', icon: '🔮', desc: 'Real-time Energy Match' },
  ];

  const egoDetails = {
    smart: { name: "Normal Mode", color: "#8c82f2", bg: "rgba(140, 130, 242, 0.15)", icon: "✨" },
    savage: { name: "Savage Roaster", color: "#ff4d4f", bg: "rgba(255, 77, 79, 0.15)", icon: "🔥" },
    corporate: { name: "Strict Boss", color: "#f5b942", bg: "rgba(245, 185, 66, 0.15)", icon: "👔" },
    genz: { name: "Gen-Z Mode", color: "#00e5ff", bg: "rgba(0, 229, 255, 0.15)", icon: "💀" }
  };

  // 🔥 ADVANCED TOGGLE LOGIC 🔥
  const handleEgoSelect = (ego) => {
    // Agar same mode par dobara click kiya (aur wo 'smart' nahi hai), toh wapas Normal kar do
    if (activeEgo === ego && ego !== 'smart') {
      setActiveEgo('smart');
      localStorage.setItem('aivox_alter_ego', 'smart');
      showToast('Normal Mode Restored! ✨');
    } else {
      // Warna naya mode set kar do
      setActiveEgo(ego);
      localStorage.setItem('aivox_alter_ego', ego);
      showToast(`${egoDetails[ego].name} Activated! 🔥`);
    }
  };

  // 🔥 Save Memories whenever added or deleted
  useEffect(() => {
    localStorage.setItem('aivox_memories', JSON.stringify(memories));
  }, [memories]);

  const handleAddMemory = (e) => {
    e.preventDefault();
    if (!newMemory.trim()) return;
    const newMemObj = { id: Date.now(), text: newMemory, date: new Date().toLocaleDateString() };
    setMemories([newMemObj, ...memories]);
    setNewMemory('');
    showToast('Memory Locked! 🔒');
  };

  const handleDeleteMemory = (id) => {
    setMemories(memories.filter(m => m.id !== id));
    showToast('Memory Erased! 🗑️');
  };

  const handlePredictFuture = (e) => {
    e.preventDefault();
    if (!timelinePrompt.trim()) return;
    setIsPredicting(true);
    setPredictions(null);
    
    // Simulate Processing
    setTimeout(() => {
      setPredictions({
        utopia: "Everything aligns perfectly. You succeed beyond expectations and achieve massive growth.",
        reality: "It will be challenging with a few setbacks, but consistent effort will get you 80% of what you want.",
        disaster: "Miscommunication leads to failure. You might lose current progress if not careful."
      });
      setIsPredicting(false);
    }, 2000);
  };

  return (
    <div className={styles.featuresPageWrapper}>
      {toastMsg && <div className={styles.customToast}>{toastMsg}</div>}

      {/* Background Glows mapped to Active Ego */}
      <div className={`${styles.auroraGlow} ${styles.glow1}`} style={{ background: egoDetails[activeEgo].color }}></div>
      <div className={`${styles.auroraGlow} ${styles.glow2}`}></div>

      <div className={styles.featuresContainer}>
        
        {/* Header */}
        <header className={styles.featuresHeader}>
          <button className={styles.backBtn} onClick={() => window.location.href = '/'}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            Back to Chat
          </button>
          <div className={styles.headerTitleBox}>
            <h1>God-Mode Dashboard</h1>
            <p>Aivox Pro Exclusive Capabilities</p>
          </div>
        </header>

        <div className={styles.dashboardGrid}>
          
          {/* Left Sidebar: Feature Navigation */}
          <div className={styles.featuresNav}>
            {featuresList.map(feat => (
              <div 
                key={feat.id} 
                className={`${styles.navItem} ${activeTab === feat.id ? styles.activeNav : ''}`}
                onClick={() => setActiveTab(feat.id)}
              >
                <div className={styles.navIcon}>{feat.icon}</div>
                <div className={styles.navText}>
                  <h4>{feat.title}</h4>
                  <p>{feat.desc}</p>
                </div>
                {activeTab === feat.id && <div className={styles.activeIndicator}></div>}
              </div>
            ))}
          </div>

          {/* Right Area: Active Feature Content */}
          <div className={styles.featureContentArea}>
            
            {/* 2. ALTER-EGO MODE */}
            {activeTab === 'alterego' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🎭</span> Alter-Ego Mode</h2>
                  <p>Click to activate. Click the active mode again to revert to Normal.</p>
                </div>

                {/* DYNAMIC ACTIVE STATUS BANNER */}
                <div className={styles.activeStatusBanner} style={{ backgroundColor: egoDetails[activeEgo].bg, borderColor: egoDetails[activeEgo].color }}>
                  <div className={styles.statusBlink} style={{ backgroundColor: egoDetails[activeEgo].color, boxShadow: `0 0 10px ${egoDetails[activeEgo].color}` }}></div>
                  <div className={styles.statusText}>
                    <span>SYSTEM OVERRIDE ACTIVE</span>
                    <h3 style={{ color: egoDetails[activeEgo].color }}>
                      {egoDetails[activeEgo].icon} {egoDetails[activeEgo].name}
                    </h3>
                  </div>
                </div>
                
                <div className={styles.egoGrid}>
                  <div className={`${styles.egoCard} ${activeEgo === 'smart' ? styles.egoActiveSmart : ''}`} onClick={() => handleEgoSelect('smart')}>
                    <div className={styles.egoIcon}>✨</div>
                    <h3>Normal Mode</h3>
                    <p>Friendly, empathetic, and highly intelligent default AI.</p>
                  </div>
                  
                  <div className={`${styles.egoCard} ${activeEgo === 'savage' ? styles.egoActiveRoast : ''}`} onClick={() => handleEgoSelect('savage')}>
                    <div className={styles.egoIcon}>🔥</div>
                    <h3>Savage Roaster</h3>
                    <p>Brutal truths, sarcasm, and zero sugarcoating.</p>
                  </div>

                  <div className={`${styles.egoCard} ${activeEgo === 'corporate' ? styles.egoActiveCorp : ''}`} onClick={() => handleEgoSelect('corporate')}>
                    <div className={styles.egoIcon}>👔</div>
                    <h3>Strict Boss</h3>
                    <p>Highly professional, objective-driven, demands perfection.</p>
                  </div>

                  <div className={`${styles.egoCard} ${activeEgo === 'genz' ? styles.egoActiveZ : ''}`} onClick={() => handleEgoSelect('genz')}>
                    <div className={styles.egoIcon}>💀</div>
                    <h3>Gen-Z Mode</h3>
                    <p>Speaks entirely in brainrot, slang, and emojis. No cap.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. MEMORY LOCK */}
            {activeTab === 'memory' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🧠</span> Memory Lock</h2>
                  <p>Pin specific facts. Aivox will NEVER forget these across sessions.</p>
                </div>
                <form onSubmit={handleAddMemory} className={styles.memoryForm}>
                  <input 
                    type="text" 
                    placeholder="E.g., Remind me to check code at 8PM..." 
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    className={styles.memoryInput}
                  />
                  <button type="submit" className={styles.memoryBtn}>Lock Info 🔒</button>
                </form>
                <div className={styles.memoryList}>
                  {memories.map(mem => (
                    <div key={mem.id} className={styles.memoryItem}>
                      <div className={styles.memIcon}>📌</div>
                      <div className={styles.memData}>
                        <h4>{mem.text}</h4>
                        <span>{mem.date}</span>
                      </div>
                      <button className={styles.memDelete} onClick={() => handleDeleteMemory(mem.id)}>
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ))}
                  {memories.length === 0 && <p className={styles.emptyState}>No memories locked yet.</p>}
                </div>
              </div>
            )}

            {/* 1. DIGITAL MIRROR */}
            {activeTab === 'mirror' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🪞</span> Digital Mirror</h2>
                  <p>Your psychological chat profile based on recent interactions.</p>
                </div>
                <div className={styles.mirrorGrid}>
                  <div className={styles.mirrorCard}>
                    <h5>Communication Style</h5>
                    <h3 style={{color: '#00e5ff'}}>Direct & Focused</h3>
                    <p>You prefer straight answers without sugarcoating.</p>
                  </div>
                  <div className={styles.mirrorCard}>
                    <h5>Current Vibe</h5>
                    <h3 style={{color: '#8c82f2'}}>Builder Mode ⚡</h3>
                    <p>Your recent prompts show intense problem-solving energy.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. TIMELINE PREDICTOR */}
            {activeTab === 'timeline' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🌌</span> Timeline Predictor</h2>
                  <p>Type a major life decision to simulate parallel universes.</p>
                </div>
                <form onSubmit={handlePredictFuture} className={styles.timelineForm}>
                  <textarea 
                    placeholder="What if I launch this AI app to the public tomorrow?" 
                    value={timelinePrompt}
                    onChange={(e) => setTimelinePrompt(e.target.value)}
                    className={styles.timelineInput}
                    rows={3}
                  />
                  <button type="submit" className={styles.timelineBtn} disabled={isPredicting || !timelinePrompt.trim()}>
                    {isPredicting ? 'Simulating Multiverse...' : 'Predict Future 🔮'}
                  </button>
                </form>

                {isPredicting && (
                  <div className={styles.quantumLoader}>
                    <div className={styles.quantumOrb}></div>
                    <p>Analyzing probabilities...</p>
                  </div>
                )}

                {predictions && !isPredicting && (
                  <div className={styles.predictionResults}>
                    <div className={styles.predCard} style={{'--border-color': '#00ff80'}}>
                      <div className={styles.predHeader}>Timeline A: The Utopia 🌟</div>
                      <p>{predictions.utopia}</p>
                    </div>
                    <div className={styles.predCard} style={{'--border-color': '#f5b942'}}>
                      <div className={styles.predHeader}>Timeline B: Reality Check ⚖️</div>
                      <p>{predictions.reality}</p>
                    </div>
                    <div className={styles.predCard} style={{'--border-color': '#ff4d4f'}}>
                      <div className={styles.predHeader}>Timeline C: The Disaster ⚠️</div>
                      <p>{predictions.disaster}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. VIBE SYNC */}
            {activeTab === 'vibe' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🔮</span> Vibe Sync Technology</h2>
                  <p>Aivox is actively matching your energy and typing patterns.</p>
                </div>
                <div className={styles.vibeContainer}>
                  <div className={styles.vibeRadar}>
                    <div className={styles.ring1}></div>
                    <div className={styles.ring2}></div>
                    <div className={styles.ring3}></div>
                    <div className={styles.radarCore}>Aivox Core</div>
                  </div>
                  <div className={styles.vibeStats}>
                    <div className={styles.vStat}>
                      <span>User Energy Level</span>
                      <div className={styles.vBar}><div style={{width: '85%', background: '#00e5ff'}}></div></div>
                    </div>
                    <div className={styles.vStat}>
                      <span>AI Empathy Sync</span>
                      <div className={styles.vBar}><div style={{width: '92%', background: '#8c82f2'}}></div></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default Features;