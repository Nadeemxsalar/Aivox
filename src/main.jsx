import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'
import Auth from './Auth.jsx'
import Profile from './Profile.jsx'
import Features from './components/Features.jsx' /* 🔥 YE NAYA IMPORT ADD KIYA HAI 🔥 */
import './index.css'

function MainRouter() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => setCurrentPath(window.location.pathname);
    // Listen for back/forward browser buttons
    window.addEventListener('popstate', onLocationChange);
    return () => window.removeEventListener('popstate', onLocationChange);
  }, []);

  // 🔥 NAYA PROFESSIONAL ROUTING (Bina # ke)
  if (currentPath === '/admin') return <Admin />;
  if (currentPath === '/auth') return <Auth />;
  if (currentPath === '/profile') return <Profile />;
  if (currentPath === '/features') return <Features />; /* 🔥 YE NAYA ROUTE ADD KIYA HAI 🔥 */

  // Default Chat Page
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MainRouter />
  </React.StrictMode>
);