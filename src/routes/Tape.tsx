// 體圍紀錄：皮尺量的胸圍、腰圍、臀圍等，手動輸入。OKOK 這頁大部分項目要付費，這裡全部免費。
import { useState } from 'react';
import { Link } from 'react-router-dom';
import MemberPicker from '../components/MemberPicker';
import Spark from '../components/Spark';
import { fmtDate } from '../lib/format';
import { addTape, deleteTape, TAPE_ITEMS, tapesOf, useDb, type TapeKey } from '../lib/store';

const LABEL = Object.fromEntries(TAPE_ITEMS) as Record<TapeKey, string>;

function Entry({ memberId, last, onDone }: { memberId: string; last: Partial<Record<TapeKey, number>>; onDone: () => void }) {
  const [vals, setVals] = useState<Partial<Record<TapeKey, string>>>({});
  const save = () => {
    const cm: Partial<Record<TapeKey, number>> = {};
    for (const [k, n] of TAPE_ITEMS) {
      const raw = vals[k]?.trim();
      if (!raw) continue;
      const v = Number(raw);
      if (!(v >= 10 && v <= 250)) return alert(`${n}請填 10～250 公分`);
      cm[k] = Math.round(v * 10) / 10;
    }
    if (!Object.keys(cm).length) return alert('至少填一項');
    addTape({ memberId, time: Date.now(), cm });
    onDone();
  };
  return (
    <section className="card">
      <h2 className="font-semibold">記錄體圍（公分）</h2>
      <p className="muted mt-1">有量的填就好，沒量的空著。灰字是上次的數字。</p>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {TAPE_ITEMS.map(([k, n]) => (
          <label key={k} className="text-sm text-gray-600 dark:text-gray-300">
            {n}
            <input
              className="input mt-1 w-full"
              inputMode="decimal"
              placeholder={last[k] != null ? String(last[k]) : '例如 80'}
              value={vals[k] ?? ''}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button className="btn" onClick={onDone}>取消</button>
        <button className="btn-primary" onClick={save}>儲存</button>
      </div>
    </section>
  );
}

export default function Tape() {
  const db = useDb();
  const me = db.members.find((m) => m.id === db.current);
  const [editing, setEditing] = useState(false);
  const [sel, setSel] = useState<TapeKey>('waist');

  if (!me) {
    return (
      <section className="card text-center">
        <p>先到「家人」頁新增家人。</p>
        <Link to="/family" className="btn-primary mt-3">到「家人」頁</Link>
      </section>
    );
  }

  const ts = tapesOf(db, me.id);
  // 每一項最新的值和上一次的值（不同天可能量不同項目，所以每項各自找）
  const latest = (k: TapeKey) => {
    const has = ts.filter((t) => t.cm[k] != null);
    return { now: has[has.length - 1]?.cm[k], prev: has[has.length - 2]?.cm[k], time: has[has.length - 1]?.time };
  };
  const lastAll = Object.fromEntries(TAPE_ITEMS.map(([k]) => [k, latest(k).now])) as Partial<Record<TapeKey, number>>;
  const pts = ts.filter((t) => t.cm[sel] != null).map((t) => [t.time, t.cm[sel]!] as [number, number]);
  const w = lastAll.waist, hip = lastAll.hip;
  const whr = w && hip ? Math.round((w / hip) * 100) / 100 : null;
  const whrHigh = whr != null && (me.sex === 'F' ? whr >= 0.85 : me.sex === 'M' ? whr >= 0.9 : false);
  const waistHigh = w != null && (me.sex === 'F' ? w >= 80 : me.sex === 'M' ? w >= 90 : false);

  return (
    <div className="space-y-3">
      <MemberPicker />

      {editing ? (
        <Entry memberId={me.id} last={lastAll} onDone={() => setEditing(false)} />
      ) : (
        <button className="btn-primary min-h-[56px] w-full text-lg" onClick={() => setEditing(true)}>📏 記錄體圍</button>
      )}

      <section className="grid grid-cols-2 gap-2">
        {TAPE_ITEMS.map(([k, n]) => {
          const { now, prev } = latest(k);
          const d = now != null && prev != null ? Math.round((now - prev) * 10) / 10 : null;
          return (
            <button key={k} onClick={() => setSel(k)} className={`card text-left ${sel === k ? 'ring-2 ring-brand dark:ring-brand-light' : ''}`}>
              <div className="text-sm text-gray-500 dark:text-gray-400">{n}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {now ?? '--'}<span className="ml-0.5 text-xs font-normal text-gray-500">{now != null ? '公分' : ''}</span>
              </div>
              {d != null && d !== 0 && <div className={`text-xs ${d > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{d > 0 ? '+' : ''}{d} 比上次</div>}
            </button>
          );
        })}
      </section>

      {(w != null || whr != null) && (
        <section className="card text-sm">
          {w != null && (
            <p>腰圍 <b>{w}</b> 公分{me.sex && <span className={waistHigh ? 'font-semibold text-orange-600' : 'text-emerald-600'}>（{waistHigh ? '超過' : '在'}國健署標準{me.sex === 'F' ? ' 80' : ' 90'} 公分{waistHigh ? '' : '以內'}）</span>}</p>
          )}
          {whr != null && (
            <p className="mt-1">腰臀比 <b>{whr}</b>{me.sex && <span className={whrHigh ? 'font-semibold text-orange-600' : 'text-emerald-600'}>（{whrHigh ? '偏高' : '標準'}，{me.sex === 'F' ? '女性 0.85' : '男性 0.9'} 以上偏高）</span>}</p>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">{LABEL[sel]}的變化</h2>
        {pts.length >= 2 ? (
          <div className="mt-2">
            <Spark points={pts} height={90} />
            <div className="flex justify-between text-[11px] text-gray-500"><span>{fmtDate(pts[0][0])}</span><span>{fmtDate(pts[pts.length - 1][0])}</span></div>
          </div>
        ) : (
          <p className="muted mt-1">{pts.length ? '再量一次就會畫出變化。' : '還沒有紀錄。'}點上面的格子可以切換項目。</p>
        )}
      </section>

      {ts.length > 0 && (
        <section className="card">
          <h2 className="mb-1 font-semibold">全部紀錄</h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {[...ts].reverse().map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="text-gray-500">{fmtDate(t.time)}</div>
                  <div>{TAPE_ITEMS.filter(([k]) => t.cm[k] != null).map(([k, n]) => `${n} ${t.cm[k]}`).join('・')}</div>
                </div>
                <button className="px-2 text-gray-400" aria-label="刪除" onClick={() => confirm('刪除這筆體圍紀錄？') && deleteTape(t.id)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="muted px-1 text-xs">皮尺貼著皮膚、不要勒緊，每次在同一個位置、同一個時間量（例如早上空腹）。腰圍量肚臍上方最細處，吐氣後量。</p>
    </div>
  );
}
