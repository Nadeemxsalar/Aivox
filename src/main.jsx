import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import Admin from './Admin.jsx'
import './index.css'

function MainRouter() {
  const [currentHash, setCurrentHash] = useState(window.location.hash);

  useEffect(() => {
    // Ye function check karega ki URL kab change hua
    const onHashChange = () => setCurrentHash(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Agar URL mein #admin hai, toh Admin dikhao, warna App dikhao
  if (currentHash === '#admin') {
    return <Admin />;
  }
  
  return <App />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MainRouter />
  </React.StrictMode>
);