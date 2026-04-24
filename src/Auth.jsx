import { useState } from 'react';
import { auth } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import styles from './Auth.module.css';

function Auth() {
  const [authState, setAuthState] = useState('choose'); // Default 'choose' rakha hai original feature ke liye
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchState = (newState) => {
    setAuthState(newState);
    setError('');
  };

  const handleAuth = async (e, type) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (type === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(cred.user, { displayName: name });
        window.location.href = '/profile';
      } else if (type === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
        window.location.href = '/';
      } else {
        localStorage.setItem('aivox_guest_name', name.trim());
        window.location.href = '/';
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', ''));
    }
    setLoading(false);
  };

  return (
    <div className={styles.authWrapper}>
      <button className={styles.backToChatBtn} onClick={() => window.location.href = '/'}>
        ← Back to Chat
      </button>

      <div className={styles.nameModalContent}>
        {/* CHOOSE SCREEN */}
        {authState === 'choose' && (
          <>
            <h2 className={styles.title}>Welcome to Aivox 🚀</h2>
            <div className={styles.authBtnGroup}>
              <button onClick={() => switchState('signup')} className={styles.authBtnPrimary}>Sign Up</button>
              <button onClick={() => switchState('login')} className={styles.authBtnSecondary}>Log In</button>
              <button onClick={() => switchState('guest')} className={styles.authBtnGuest}>Continue as Guest</button>
            </div>
          </>
        )}

        {/* SIGN UP / LOGIN / GUEST FORMS */}
        {authState !== 'choose' && (
          <form onSubmit={(e) => handleAuth(e, authState)}>
            <h2 className={styles.title}>
              {authState === 'signup' ? 'Create Account ✨' : authState === 'login' ? 'Welcome Back 🔑' : 'Guest Access 🎭'}
            </h2>
            
            {/* Naam wala field sabmein rahega */}
            <input type="text" placeholder="Your Name" value={name} onChange={(e) => setName(e.target.value)} className={styles.nameInput} required />
            
            {authState !== 'guest' && (
              <>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.nameInput} required />
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={styles.nameInput} required />
              </>
            )}
            
            {error && <div className={styles.authError}>{error}</div>}
            
            <button type="submit" className={styles.authBtnPrimary} disabled={loading}>
              {loading ? 'Processing...' : (authState === 'guest' ? 'Start Chatting' : 'Submit')}
            </button>
            
            <button type="button" onClick={() => switchState('choose')} className={styles.authBackBtn}>⬅ Go Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
export default Auth;