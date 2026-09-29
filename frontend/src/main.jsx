import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { OrgConfigProvider } from './orgConfig.jsx'

const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  config = config || {};
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.token) {
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${user.token}`
        };
      }
    } catch (e) {}
  }
  const res = await originalFetch(resource, config);
  
  if (res.status === 401 && resource !== '/api/login') {
    localStorage.removeItem('user');
    window.location.href = '/';
  }
  
  return res;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <OrgConfigProvider>
      <App />
    </OrgConfigProvider>
  </StrictMode>,
)
