import { useState } from 'react';
import { auth } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updateProfile, 
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import styles from './Auth.module.css';

function Auth() {
  const [authState, setAuthState] = useState('login'); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  // Errors & Messages
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [generalMsg, setGeneralMsg] = useState('');
  const [msgType, setMsgType] = useState(''); 

  // UI States
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false); 

  const switchState = (newState) => {
    setAuthState(newState);
    setEmailError('');
    setPasswordError('');
    setGeneralMsg('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
  };

  const getPasswordStrength = (pass) => {
    if (pass.length === 0) return { label: '', color: 'transparent', width: '0%' };
    if (pass.length < 6) return { label: 'Weak', color: '#ff5555', width: '33%' };
    if (pass.length < 10) return { label: 'Good', color: '#feca57', width: '66%' };
    return { label: 'Strong', color: '#4ade80', width: '100%' };
  };
  const strength = getPasswordStrength(password);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setGeneralMsg('');
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      window.location.href = '/'; 
    } catch (err) {
      setMsgType('error');
      if (err.code === 'auth/popup-closed-by-user') {
        setGeneralMsg('Google sign-in was cancelled.');
      } else {
        setGeneralMsg(err.message.replace('Firebase: ', ''));
      }
    }
    setLoading(false);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true); 
    setEmailError('');
    setPasswordError('');
    setGeneralMsg('');
    setMsgType('error'); 
    
    try {
      if (authState === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        window.location.href = '/profile';
      } else if (authState === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = '/';
      } else if (authState === 'reset') {
        if (!email) {
          setEmailError('Please enter your email to reset password.');
          setLoading(false);
          return;
        }
        await sendPasswordResetEmail(auth, email);
        setGeneralMsg('Password reset link sent! Check your email inbox.');
        setMsgType('success'); 
      } else if (authState === 'guest') {
        // 🔥 GUEST LOGIC WITH NAME
        if (!name.trim()) {
          setGeneralMsg('Please enter a nickname to continue.');
          setLoading(false);
          return;
        }
        localStorage.setItem('aivox_guest_name', name.trim());
        window.location.href = '/';
      }
    } catch (err) {
      const code = err.code;
      if (code === 'auth/invalid-email') {
        setEmailError('Invalid email format.');
      } else if (code === 'auth/email-already-in-use') {
        setEmailError('Email already registered. Please log in.');
      } else if (code === 'auth/user-not-found') {
        setEmailError('Account not found. Please register first.');
      } else if (code === 'auth/wrong-password') {
        setPasswordError('Incorrect password.');
      } else if (code === 'auth/weak-password') {
        setPasswordError('Password must be at least 6 characters.');
      } else if (code === 'auth/invalid-credential') {
        setGeneralMsg('Invalid email or password. Please check your details.');
      } else {
        setGeneralMsg(err.message.replace('Firebase: ', ''));
      }
    }
    setLoading(false);
  };

  return (
    <div className={styles.authWrapper}>
      <button className={styles.backToChatBtn} onClick={() => window.location.href = '/'}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        Home
      </button>

      {/* Floating Background Elements (Inki styling CSS mein aayegi) */}
      <div className={styles.bgOrb1}></div>
      <div className={styles.bgOrb2}></div>

      <div className={styles.authContainer}>
        {/* LEFT SIDE: Clean Branding */}
        <div className={styles.authDecoration}>
          <div className={styles.glowCircle}></div>
          <h2 className={styles.brandTitle}>Aivox</h2>
          <p className={styles.brandSubtitle}>Your Intelligent AI Companion.</p>
        </div>

        {/* RIGHT SIDE: Unified Form */}
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <h2 className={styles.title}>
              {authState === 'signup' ? 'Create an account' : 
               authState === 'login' ? 'Welcome back' : 
               authState === 'guest' ? 'Welcome, Guest 🎭' : 'Reset Password'}
            </h2>
            <p className={styles.subtitle}>
              {authState === 'signup' ? 'Enter your details below to create your account' : 
               authState === 'login' ? 'Enter your email below to login to your account' : 
               authState === 'guest' ? 'Enter a nickname to start chatting instantly' :
               'Enter your email to receive a password reset link'}
            </p>
          </div>

          {/* GOOGLE BUTTON (Hide for Guest and Reset modes) */}
          {authState !== 'reset' && authState !== 'guest' && (
            <>
              <button type="button" className={styles.googleBtn} onClick={handleGoogleLogin} disabled={loading}>
                <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                Continue with Google
              </button>

              <div className={styles.divider}>
                <span>OR CONTINUE WITH EMAIL</span>
              </div>
            </>
          )}

          <form onSubmit={handleAuth} className={styles.formElement}>
            {/* NAME FIELD (For Signup and Guest) */}
            {(authState === 'signup' || authState === 'guest') && (
              <div className={styles.inputGroup}>
                <div className={styles.inputWrapper}>
                  <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  <input type="text" placeholder={authState === 'guest' ? "Enter your Nickname" : "Your Full Name"} value={name} onChange={(e) => setName(e.target.value)} className={styles.authInput} required />
                </div>
              </div>
            )}
            
            {/* EMAIL FIELD (Hidden for Guest) */}
            {authState !== 'guest' && (
              <div className={styles.inputGroup}>
                <div className={`${styles.inputWrapper} ${emailError ? styles.errorBorder : ''}`}>
                  <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                  <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.authInput} required />
                </div>
                {emailError && <span className={styles.errorText}>{emailError}</span>}
              </div>
            )}

            {/* PASSWORD FIELD (Hidden for Guest and Reset) */}
            {authState !== 'reset' && authState !== 'guest' && (
              <div className={styles.inputGroup}>
                <div className={`${styles.inputWrapper} ${passwordError ? styles.errorBorder : ''}`}>
                  <svg className={styles.inputIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    placeholder="Password" 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    className={styles.authInput} 
                    required 
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    )}
                  </button>
                </div>
                
                {authState === 'signup' && password.length > 0 && (
                  <div className={styles.strengthWrapper}>
                    <div className={styles.strengthBar}><div className={styles.strengthFill} style={{ width: strength.width, backgroundColor: strength.color }}></div></div>
                    <span style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}
                {passwordError && <span className={styles.errorText}>{passwordError}</span>}
              </div>
            )}
            
            {/* FORGOT PASSWORD LINK */}
            {authState === 'login' && (
              <div className={styles.forgotPassword}>
                <span onClick={() => switchState('reset')}>Forgot your password?</span>
              </div>
            )}
            
            {generalMsg && (
              <div className={msgType === 'success' ? styles.successBox : styles.errorBox}>
                {generalMsg}
              </div>
            )}
            
            {/* BUTTONS GROUP */}
            <div className={styles.actionButtons}>
              <button type="submit" className={styles.authBtnPrimary} disabled={loading}>
                {loading ? <span className={styles.spinner}></span> : 
                 authState === 'signup' ? 'Create Account' : 
                 authState === 'guest' ? 'Start Chatting 🚀' : 
                 authState === 'reset' ? 'Send Reset Link' : 'Log In'}
              </button>

              {/* SWITCH TO GUEST BUTTON */}
              {authState !== 'reset' && authState !== 'guest' && (
                <button type="button" onClick={() => switchState('guest')} className={styles.authBtnGuest}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                  Explore as Guest
                </button>
              )}
            </div>
          </form>

          {/* FOOTER LINKS */}
          <div className={styles.footerLinks}>
            {authState === 'login' ? (
              <p>Don't have an account? <span onClick={() => switchState('signup')} className={styles.toggleLink}>Sign up</span></p>
            ) : authState === 'signup' ? (
              <p>Already have an account? <span onClick={() => switchState('login')} className={styles.toggleLink}>Log in</span></p>
            ) : authState === 'guest' ? (
              <p>Want to save your chats? <span onClick={() => switchState('signup')} className={styles.toggleLink}>Sign up here</span></p>
            ) : (
              <p>Remembered your password? <span onClick={() => switchState('login')} className={styles.toggleLink}>Log in</span></p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

export default Auth;