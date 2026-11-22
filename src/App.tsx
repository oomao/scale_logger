import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import Layout from './components/Layout';
import { useScale } from './lib/scale';
import Measure from './routes/Measure';
import Report from './routes/Report';
import History from './routes/History';
import Family from './routes/Family';
import Help from './routes/Help';
import Tape from './routes/Tape';

// 圖表頁用到 recharts，拆出去讓量體重頁打開更快
const Stats = lazy(() => import('./routes/Stats'));

export default function App() {
  const scale = useScale();
  const busy = scale.phase === 'scanning' || scale.phase === 'connecting';
  // PWA 更新：偵測到新版跳 banner、每小時檢查一次、切回 App 時也檢查
  const reg = useRef<ServiceWorkerRegistration | null>(null);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (r) reg.current = r;
    },
  });
  useEffect(() => {
    const id = setInterval(() => reg.current?.update().catch(() => {}), 60 * 60 * 1000);
    const onVis = () => { if (!document.hidden) reg.current?.update().catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (
    <Layout>
      <Suspense fallback={<p className="muted p-4">載入中…</p>}>
        <Routes>
          <Route path="/" element={<Measure />} />
          <Route path="/report" element={<Report />} />
          <Route path="/report/:id" element={<Report />} />
          <Route path="/history" element={<History />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/family" element={<Family />} />
          <Route path="/help" element={<Help />} />
          <Route path="/tape" element={<Tape />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* 量測中不跳，避免按了重新載入打斷 */}
      {needRefresh && !busy && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-4 pb-3" role="status" aria-live="polite">
          <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-sm text-gray-100 shadow-lg">
            <span className="flex-1">新版本已就緒</span>
            <button type="button" onClick={() => setNeedRefresh(false)} className="px-2 py-1 text-xs text-gray-400">稍後</button>
            <button type="button" onClick={() => updateServiceWorker(true)} className="rounded-lg bg-brand-light px-3 py-1.5 text-xs font-semibold text-gray-950">重新載入</button>
          </div>
        </div>
      )}
    </Layout>
  );
}
