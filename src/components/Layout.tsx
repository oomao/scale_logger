import { Link, NavLink } from 'react-router-dom';
import { useEffect, type ReactNode } from 'react';
import { useScale } from '../lib/scale';
import { bigTextOn, useDb } from '../lib/store';

const NAV = [
  { to: '/', label: '量體重', icon: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm2 7a5 5 0 0 1 10 0M12 11l2-3' },
  { to: '/report', label: '報告', icon: 'M9 4h6l1 2h3v15H5V6h3l1-2Zm-1 8h8m-8 4h5' },
  { to: '/history', label: '紀錄', icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' },
  { to: '/stats', label: '圖表', icon: 'M4 19V9m5 10V5m5 14v-7m5 7V8' },
  { to: '/family', label: '家人', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M17 14a5 5 0 0 1 4 6' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const scale = useScale();
  const db = useDb();
  const tab = 'flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
  const busy = scale.phase === 'scanning' || scale.phase === 'connecting';

  // 大字模式：調整根字級，整個 App（rem）一起放大
  const big = bigTextOn(db.members.find((m) => m.id === db.current));
  useEffect(() => {
    document.documentElement.style.fontSize = big ? '118.75%' : '';
  }, [big]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/90">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand dark:text-brand-light">⚖️ 家庭體重紀錄</Link>
          {busy && (
            <Link to="/" className="ml-auto rounded-full border border-emerald-500 px-3 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
              {scale.heard ? '量測中' : '等待體重計'}
            </Link>
          )}
          <Link to="/help" aria-label="使用說明" className={`${busy ? '' : 'ml-auto '}flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-sm font-bold text-gray-500 dark:border-gray-700`}>
            ?
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-gray-800 dark:bg-gray-900">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) => `${tab} ${isActive ? 'text-brand dark:text-brand-light' : 'text-gray-500 dark:text-gray-400'}`}
          >
            <Icon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
