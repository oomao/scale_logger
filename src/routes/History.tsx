import { Link } from 'react-router-dom';
import MemberPicker from '../components/MemberPicker';
import { derive, fmtKg } from '../lib/derive';
import { fmtDate } from '../lib/format';
import { deleteRec, recsOf, useDb } from '../lib/store';

export default function History() {
  const db = useDb();
  const me = db.members.find((m) => m.id === db.current);
  const list = recsOf(db, db.current);
  const rows = list.map((r, i) => ({ r, c: derive(r, me).c, d: i ? Math.round((r.kg - list[i - 1].kg) * 100) / 100 : null })).reverse();

  // 依月份分組
  const groups: [string, typeof rows][] = [];
  for (const x of rows) {
    const t = new Date(x.r.time);
    const k = `${t.getFullYear()} 年 ${t.getMonth() + 1} 月`;
    if (groups[groups.length - 1]?.[0] !== k) groups.push([k, []]);
    groups[groups.length - 1][1].push(x);
  }

  return (
    <div className="space-y-3">
      <MemberPicker />
      {!rows.length && (
        <section className="card text-center">
          <p>{me ? me.name + '還沒有紀錄。' : '還沒有家人。'}</p>
          <Link to="/" className="btn-primary mt-3">去量體重</Link>
        </section>
      )}
      {groups.map(([k, xs]) => (
        <section key={k} className="card">
          <h2 className="mb-1 font-semibold">{k}<span className="muted ml-2">{xs.length} 筆</span></h2>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {xs.map(({ r, c, d }) => (
              <li key={r.id} className="flex items-center gap-2 py-2">
                <Link to={'/report/' + r.id} className="flex flex-1 items-center gap-3">
                  <span className="w-28 text-sm text-gray-500 dark:text-gray-400">{fmtDate(r.time)}</span>
                  <span className="text-lg font-semibold tabular-nums">{fmtKg(r.kg)}<span className="text-xs font-normal text-gray-500"> kg</span></span>
                  {d != null && d !== 0 && <span className={`text-xs ${d > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{d > 0 ? '+' : ''}{d.toFixed(2)}</span>}
                  <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
                    {c?.fatPct != null ? `體脂 ${c.fatPct}%` : r.source === 'manual' ? '手動' : ''}
                  </span>
                </Link>
                <button className="px-2 text-gray-400" aria-label="刪除" onClick={() => confirm(`刪除 ${fmtDate(r.time)} ${fmtKg(r.kg)} kg 這筆？`) && deleteRec(r.id)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
