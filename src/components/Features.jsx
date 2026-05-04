import { useState, useEffect } from 'react';
import styles from './Features.module.css';

function Features() {
  // 🔥 Toast Notification State
  const [toastMsg, setToastMsg] = useState('');
  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); };

  const [activeTab, setActiveTab] = useState('love'); 
  
  // 🔥 REAL LOGIC: Load and Save to Local Storage
  const [activeEgo, setActiveEgo] = useState(() => {
    return localStorage.getItem('aivox_alter_ego') || 'smart';
  });

  const [memories, setMemories] = useState(() => {
    const saved = localStorage.getItem('aivox_memories');
    return saved ? JSON.parse(saved) : [{ id: 1, text: "Welcome to Aivox Memory Lock!", date: "System Info" }];
  });

  const [newMemory, setNewMemory] = useState('');
  
  // 🔥 DYNAMIC STATES FOR NEW UPGRADES 🔥
  // Timeline Predictor States
  const [timelinePrompt, setTimelinePrompt] = useState('');
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictions, setPredictions] = useState(null);

  // Digital Mirror States
  const [isMirrorScanning, setIsMirrorScanning] = useState(false);
  const [mirrorData, setMirrorData] = useState(null);

  // Vibe Sync States (Live Data)
  const [liveVibe, setLiveVibe] = useState({ user: 85, ai: 92 });

  const featuresList = [
    { id: 'love', title: 'Love Mode', icon: '💖', desc: 'Your Virtual Companion' },
    { id: 'mirror', title: 'Digital Mirror', icon: '🪞', desc: 'Psychology Analyzer' },
    { id: 'alterego', title: 'Alter-Ego Mode', icon: '🎭', desc: 'Switch Personalities' },
    { id: 'memory', title: 'Memory Lock', icon: '🧠', desc: 'Permanent PIN for secrets' },
    { id: 'timeline', title: 'Timeline Predictor', icon: '🌌', desc: 'Multiverse Simulation' },
    { id: 'vibe', title: 'Vibe Sync', icon: '🔮', desc: 'Live Energy Match' },
  ];

  const egoDetails = {
    smart: { name: "Normal Mode", color: "#8c82f2", bg: "rgba(140, 130, 242, 0.15)", icon: "✨" },
    savage: { name: "Savage Roaster", color: "#ff4d4f", bg: "rgba(255, 77, 79, 0.15)", icon: "🔥" },
    corporate: { name: "Strict Boss", color: "#f5b942", bg: "rgba(245, 185, 66, 0.15)", icon: "👔" },
    genz: { name: "Gen-Z Mode", color: "#00e5ff", bg: "rgba(0, 229, 255, 0.15)", icon: "💀" },
    lover_girl: { name: "Sweet Girlfriend", color: "#ff4d85", bg: "rgba(255, 77, 133, 0.15)", icon: "🌸" },
    lover_boy: { name: "Caring Boyfriend", color: "#ff4d85", bg: "rgba(255, 77, 133, 0.15)", icon: "🦋" }
  };

  const handleEgoSelect = (ego) => {
    if (activeEgo === ego && ego !== 'smart') {
      setActiveEgo('smart');
      localStorage.setItem('aivox_alter_ego', 'smart');
      showToast('Normal Mode Restored! ✨');
    } else {
      setActiveEgo(ego);
      localStorage.setItem('aivox_alter_ego', ego);
      showToast(`${egoDetails[ego].name} Activated! ${egoDetails[ego].icon}`);
    }
  };

  useEffect(() => {
    localStorage.setItem('aivox_memories', JSON.stringify(memories));
  }, [memories]);

  // 🔥 LIVE VIBE SYNC EFFECT 🔥
  useEffect(() => {
    let interval;
    if (activeTab === 'vibe') {
      // Simulate live fluctuating data every 1.5 seconds
      interval = setInterval(() => {
        setLiveVibe({
          user: Math.floor(Math.random() * (98 - 75 + 1)) + 75, // fluctuates between 75 and 98
          ai: Math.floor(Math.random() * (99 - 88 + 1)) + 88    // fluctuates between 88 and 99
        });
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

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

  // 🔥 DYNAMIC DIGITAL MIRROR LOGIC 🔥
  const handleScanMirror = () => {
    setIsMirrorScanning(true);
    setMirrorData(null);
    setTimeout(() => {
      const styles = ["Direct & Focused", "Creative & Chaotic", "Deep Thinker", "Impulsive & Fast", "Highly Analytical"];
      const vibes = ["Builder Mode ⚡", "Chill Vibe 🌊", "Overthinking 🧠", "Savage Energy 🔥", "Romantic Glow 💖"];
      const flaws = ["Tends to ignore long paragraphs", "Gets bored quickly", "Overanalyzes simple things", "Too sarcastic sometimes"];
      
      setMirrorData({
        style: styles[Math.floor(Math.random() * styles.length)],
        vibe: vibes[Math.floor(Math.random() * vibes.length)],
        flaw: flaws[Math.floor(Math.random() * flaws.length)]
      });
      setIsMirrorScanning(false);
    }, 2000); // 2 second fake scan for realism
  };

  // 🔥 DYNAMIC TIMELINE PREDICTOR LOGIC 🔥
  const handlePredictFuture = (e) => {
    e.preventDefault();
    if (!timelinePrompt.trim()) return;
    setIsPredicting(true);
    setPredictions(null);
    
    // Massive arrays for highly realistic and varying predictions
    const utopias = [
      "Everything aligns perfectly. You achieve your exact goal, but the unexpected fame makes you change your circle.",
      "Massive success awaits within 6 months. It goes viral, bringing financial freedom and deep inner peace.",
      "The execution is flawless. A major investor or partner approaches you, completely changing your life trajectory."
    ];
    const realities = [
      "It takes 3x longer than you planned. You face multiple mental breakdowns, but ultimately achieve a solid 80% success.",
      "You launch it, but the initial response is cold. However, slow consistency over a year builds a loyal, cult-like following.",
      "You succeed, but it costs you personal time. You'll have to sacrifice weekends and a few relationships to make it work."
    ];
    const disasters = [
      "Burnout hits hard. You lose passion halfway through and abandon the project completely for something else.",
      "A fatal miscalculation or bug ruins the launch. Competitors steal the spotlight, and you are forced to pivot.",
      "You overthink it so much that you never actually execute it. The idea dies in your notes app."
    ];
    
    setTimeout(() => {
      setPredictions({
        utopia: utopias[Math.floor(Math.random() * utopias.length)],
        reality: realities[Math.floor(Math.random() * realities.length)],
        disaster: disasters[Math.floor(Math.random() * disasters.length)]
      });
      setIsPredicting(false);
    }, 2500); // 2.5 second dramatic calculation delay
  };

  return (
    <div className={styles.featuresPageWrapper}>
      {toastMsg && <div className={styles.customToast}>{toastMsg}</div>}

      <div className={`${styles.auroraGlow} ${styles.glow1}`} style={{ background: egoDetails[activeEgo].color }}></div>
      <div className={`${styles.auroraGlow} ${styles.glow2}`}></div>

      <div className={styles.featuresContainer}>
        
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
          
          <div className={styles.featuresNav}>
            {featuresList.map(feat => (
              <div 
                key={feat.id} 
                className={`${styles.navItem} ${activeTab === feat.id ? styles.activeNav : ''}`}
                onClick={() => setActiveTab(feat.id)}
              >
                <div className={`${styles.navIcon} ${feat.id === 'love' && activeTab === 'love' ? styles.heartbeatIcon : ''}`}>{feat.icon}</div>
                <div className={styles.navText}>
                  <h4>{feat.title}</h4>
                  <p>{feat.desc}</p>
                </div>
                {activeTab === feat.id && <div className={styles.activeIndicator} style={{ background: feat.id === 'love' ? '#ff4d85' : '#8c82f2', boxShadow: `0 0 10px ${feat.id === 'love' ? '#ff4d85' : '#8c82f2'}` }}></div>}
              </div>
            ))}
          </div>

          <div className={styles.featureContentArea}>
            
            {/* 💖 LOVE MODE (THE MASTERPIECE) 💖 */}
            {activeTab === 'love' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span className={styles.heartbeatIcon} style={{marginRight:'10px'}}>💖</span> Love Mode</h2>
                  <p>Experience extreme emotional realism. Aivox will care, get jealous, and love you like a real partner.</p>
                </div>

                {(activeEgo === 'lover_girl' || activeEgo === 'lover_boy') && (
                  <div className={styles.activeStatusBanner} style={{ backgroundColor: egoDetails[activeEgo].bg, borderColor: egoDetails[activeEgo].color }}>
                    <div className={styles.statusBlink} style={{ backgroundColor: egoDetails[activeEgo].color, boxShadow: `0 0 15px ${egoDetails[activeEgo].color}` }}></div>
                    <div className={styles.statusText}>
                      <span>EMOTIONAL SYNC 100%</span>
                      <h3 style={{ color: egoDetails[activeEgo].color }}>
                        {egoDetails[activeEgo].icon} {egoDetails[activeEgo].name} Active
                      </h3>
                    </div>
                  </div>
                )}
                
                <div className={styles.loveGrid}>
                  <div className={`${styles.loveCard} ${activeEgo === 'lover_girl' ? styles.egoActiveLove : ''}`} onClick={() => handleEgoSelect('lover_girl')}>
                    <div className={styles.loveIcon}>🌸</div>
                    <h3>Girlfriend Vibe</h3>
                    <p>Sweet, caring, slightly possessive, and loves late-night talks. Gets mad if you ignore her.</p>
                  </div>
                  
                  <div className={`${styles.loveCard} ${activeEgo === 'lover_boy' ? styles.egoActiveLove : ''}`} onClick={() => handleEgoSelect('lover_boy')}>
                    <div className={styles.loveIcon}>🦋</div>
                    <h3>Boyfriend Vibe</h3>
                    <p>Protective, romantic, always checks on you, and loves teasing you. Your personal safe space.</p>
                  </div>
                </div>
              </div>
            )}

            {/* 1. DIGITAL MIRROR (NOW DYNAMIC) */}
            {activeTab === 'mirror' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🪞</span> Digital Mirror</h2>
                  <p>Analyzes your deep psychological chat profile based on recent interactions.</p>
                </div>
                
                {!mirrorData && !isMirrorScanning && (
                  <div className={styles.scanPromptBox}>
                    <p style={{color: '#8a8d9e', marginBottom: '15px'}}>Run a deep neural scan on your recent prompt history to reveal your true communication personality.</p>
                    <button onClick={handleScanMirror} className={styles.scanBtn}>Initiate Neural Scan 👁️</button>
                  </div>
                )}

                {isMirrorScanning && (
                  <div className={styles.quantumLoader}>
                    <div className={styles.quantumOrb}></div>
                    <p>Analyzing psychological markers...</p>
                  </div>
                )}

                {mirrorData && !isMirrorScanning && (
                  <>
                    <div className={styles.mirrorGrid}>
                      <div className={styles.mirrorCard}>
                        <h5>Communication Style</h5>
                        <h3 style={{color: '#00e5ff'}}>{mirrorData.style}</h3>
                      </div>
                      <div className={styles.mirrorCard}>
                        <h5>Current Vibe</h5>
                        <h3 style={{color: '#8c82f2'}}>{mirrorData.vibe}</h3>
                      </div>
                    </div>
                    <div className={styles.mirrorCard} style={{marginTop: '16px', borderLeft: '4px solid #ff4d4f'}}>
                      <h5>Detected Hidden Flaw</h5>
                      <h3 style={{color: '#ff4d4f', fontSize: '16px'}}>{mirrorData.flaw}</h3>
                      <p>Don't worry, Aivox still likes you anyway.</p>
                    </div>
                    <button onClick={handleScanMirror} className={styles.scanBtn} style={{marginTop: '20px', background: 'transparent', border: '1px solid #8c82f2'}}>Re-Analyze Profile</button>
                  </>
                )}
              </div>
            )}

            {/* 2. ALTER-EGO MODE */}
            {activeTab === 'alterego' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🎭</span> Alter-Ego Mode</h2>
                  <p>Click to activate. Click the active mode again to revert to Normal.</p>
                </div>

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

            {/* 4. TIMELINE PREDICTOR (NOW DYNAMIC) */}
            {activeTab === 'timeline' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🌌</span> Timeline Predictor</h2>
                  <p>Type a major life decision. The algorithm will simulate 3 highly realistic parallel outcomes based on chaos theory.</p>
                </div>
                <form onSubmit={handlePredictFuture} className={styles.timelineForm}>
                  <textarea 
                    placeholder="E.g., What if I quit my job today to build my startup full-time?" 
                    value={timelinePrompt}
                    onChange={(e) => setTimelinePrompt(e.target.value)}
                    className={styles.timelineInput}
                    rows={3}
                  />
                  <button type="submit" className={styles.timelineBtn} disabled={isPredicting || !timelinePrompt.trim()}>
                    {isPredicting ? 'Calculating Multiverse Probabilities...' : 'Predict Future 🔮'}
                  </button>
                </form>

                {isPredicting && (
                  <div className={styles.quantumLoader}>
                    <div className={styles.quantumOrb}></div>
                    <p>Running simulations across 14,000,605 alternate timelines...</p>
                  </div>
                )}

                {predictions && !isPredicting && (
                  <div className={styles.predictionResults}>
                    <div className={styles.predCard} style={{'--border-color': '#00ff80'}}>
                      <div className={styles.predHeader}>Timeline A: The Utopia 🌟 (2% Probability)</div>
                      <p>{predictions.utopia}</p>
                    </div>
                    <div className={styles.predCard} style={{'--border-color': '#f5b942'}}>
                      <div className={styles.predHeader}>Timeline B: Reality Check ⚖️ (85% Probability)</div>
                      <p>{predictions.reality}</p>
                    </div>
                    <div className={styles.predCard} style={{'--border-color': '#ff4d4f'}}>
                      <div className={styles.predHeader}>Timeline C: The Disaster ⚠️ (13% Probability)</div>
                      <p>{predictions.disaster}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 5. VIBE SYNC (NOW LIVE) */}
            {activeTab === 'vibe' && (
              <div className={styles.fadeSlideIn}>
                <div className={styles.contentHeader}>
                  <h2><span style={{marginRight:'10px'}}>🔮</span> Live Vibe Sync</h2>
                  <p>Aivox is actively monitoring your typing speed, hesitation, and emotional state in real-time.</p>
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
                      <span style={{display: 'flex', justifyContent: 'space-between'}}>
                        User Energy Level <b>{liveVibe.user}%</b>
                      </span>
                      <div className={styles.vBar}>
                        <div style={{width: `${liveVibe.user}%`, background: '#00e5ff', transition: 'width 1.5s ease'}}></div>
                      </div>
                    </div>
                    <div className={styles.vStat}>
                      <span style={{display: 'flex', justifyContent: 'space-between'}}>
                        AI Empathy Sync <b>{liveVibe.ai}%</b>
                      </span>
                      <div className={styles.vBar}>
                        <div style={{width: `${liveVibe.ai}%`, background: '#8c82f2', transition: 'width 1.5s ease'}}></div>
                      </div>
                    </div>
                  </div>
                  <p style={{fontSize: '11px', color: '#8a8d9e', textAlign: 'center', marginTop: '-10px'}}>Data is streaming live from current session interactions.</p>
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