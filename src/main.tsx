import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './styles/globals.css';
import { initStore } from './lib/store';

// 先讀完 IndexedDB 再畫面，避免一打開閃一下「沒有紀錄」
initStore().catch(() => {}).finally(() => {
  // GitHub Pages 用 HashRouter 比較不會遇到重新整理 404
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>
  );
});
