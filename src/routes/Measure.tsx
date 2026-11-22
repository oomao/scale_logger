import { useState } from 'react';
import { Link } from 'react-router-dom';
import BackupReminder from '../components/BackupReminder';
import { connectGatt, FLAG_URL, resetResult, startScan, stop, support, useScale } from '../lib/scale';
import { addRec, deleteRec, profileOf, recsOf, selectMember, updateRec, useDb } from '../lib/store';
import { derive, fmtKg } from '../lib/derive';
import { fmtDate } from '../lib/format';
import Spark from '../components/Spark';
import { TAPE_ITEMS, tapesOf, type Rec } from '../lib/store';

const DAY = 24 * 3600 * 1000;
const signed = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);

// 體重分級：國健署 BMI 18.5 / 24 / 27，四段等寬色條（跟 OKOK 首頁一樣的樣子）
const WEIGHT_BANDS: [string, string, string][] = [
  ['偏瘦', 'bg-sky-400', 'text-sky-600 dark:text-sky-400'],
  ['標準', 'bg-emerald-400', 'text-emerald-600 dark:text-emerald-400'],
  ['微胖', 'bg-amber-400', 'text-amber-600 dark:text-amber-400'],
  ['肥胖', 'bg-red-500', 'text-red-600 dark:text-red-400'],
];

function WeightCard({ recs, height }: { recs: Rec[]; height?: number }) {
  const last = recs[recs.length - 1];
  const prev = recs[recs.length - 2];
  const month = recs.filter((r) => r.time >= last.time - 30 * DAY);
  const best = month.length >= 2 ? Math.min(...month.map((r) => r.kg)) : null;
  const h2 = height ? (height / 100) ** 2 : null;
  const cuts = h2 ? [14, 18.5, 24, 27, 32].map((b) => b * h2) : null;
  let band = -1, pos = 0;
  if (cuts) {
    band = last.kg < cuts[1] ? 0 : last.kg < cuts[2] ? 1 : last.kg < cuts[3] ? 2 : 3;
    const f = Math.min(1, Math.max(0, (last.kg - cuts[band]) / (cuts[band + 1] - cuts[band])));
    pos = (band + f) * 25;
  }
  const d = prev ? Math.round((last.kg - prev.kg) * 100) / 100 : null;
  return (
    <div>
      <p className="muted">{fmtDate(last.time)}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-6xl font-bold tabular-nums leading-none">{fmtKg(last.kg)}<span className="ml-1 text-xl font-normal text-gray-500">公斤</span></p>
        {band >= 0 && <span className={`rounded-full px-3 py-1 text-base font-bold text-white ${WEIGHT_BANDS[band][1]}`}>{WEIGHT_BANDS[band][0]}</span>}
      </div>
      {cuts && (
        <div className="mt-4">
          <div className="relative flex h-2.5 gap-1">
            {WEIGHT_BANDS.map(([n, bg]) => <div key={n} className={`flex-1 rounded-full ${bg} ${n === WEIGHT_BANDS[band][0] ? '' : 'opacity-60'}`} />)}
            <div className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-4 border-white bg-gray-900 shadow dark:border-gray-900 dark:bg-white" style={{ left: pos + '%' }} />
          </div>
          <div className="relative mt-1 h-4 text-[11px] text-gray-500">
            {[1, 2, 3].map((i) => <span key={i} className="absolute -translate-x-1/2 tabular-nums" style={{ left: i * 25 + '%' }}>{cuts[i].toFixed(1)}</span>)}
          </div>
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <p className={`text-2xl font-bold tabular-nums ${d == null || d === 0 ? '' : d > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{d == null ? '--' : signed(d)}</p>
          <p className="muted">比上次</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{best == null ? '--' : fmtKg(best)}</p>
          <p className="muted">30 天內最輕</p>
        </div>
      </div>
    </div>
  );
}

/** 體重趨勢：最近 30 天（每天取最後一筆） */
function TrendCard({ recs }: { recs: Rec[] }) {
  const last = recs[recs.length - 1];
  const byDay = new Map<string, Rec>();
  for (const r of recs.filter((r) => r.time >= last.time - 30 * DAY)) byDay.set(new Date(r.time).toDateString(), r);
  const pts = [...byDay.values()].map((r) => [r.time, r.kg] as [number, number]);
  const md = (t: number) => `${new Date(t).getMonth() + 1}/${new Date(t).getDate()}`;
  return (
    <Link to="/stats" className="card block">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">📈 體重趨勢</h2>
        <span className="text-gray-400">›</span>
      </div>
      {pts.length >= 2 ? (
        <div className="mt-2 grid grid-cols-[auto_1fr] items-end gap-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">{signed(pts[pts.length - 1][1] - pts[0][1])}<span className="ml-1 text-sm font-normal text-gray-500">公斤</span></p>
            <p className="muted">近 30 天變化</p>
          </div>
          <div>
            <Spark points={pts} />
            <div className="flex justify-between text-[11px] text-gray-500"><span>{md(pts[0][0])}</span><span>{md(pts[pts.length - 1][0])}</span></div>
          </div>
        </div>
      ) : (
        <p className="muted mt-1">不同天量兩次以上，這裡就會出現趨勢。</p>
      )}
    </Link>
  );
}

function TapeCard({ memberId }: { memberId: string }) {
  const db = useDb();
  const ts = tapesOf(db, memberId);
  const last = ts[ts.length - 1];
  const shown = last ? TAPE_ITEMS.filter(([k]) => last.cm[k] != null).slice(0, 3) : [];
  return (
    <Link to="/tape" className="card block">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">📏 體圍紀錄</h2>
        <span className="text-gray-400">›</span>
      </div>
      {last ? (
        <p className="mt-1 text-sm">
          {fmtDate(last.time)}：{shown.map(([k, n]) => `${n} ${last.cm[k]}`).join('・')} 公分
        </p>
      ) : (
        <p className="muted mt-1">用皮尺量腰圍、臀圍等，記下來看變化。</p>
      )}
    </Link>
  );
}

function FlagGuide() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(FLAG_URL);
      setCopied(true);
    } catch {
      prompt('請長按複製這串網址', FLAG_URL);
    }
  };
  return (
    <section className="card border-amber-300 dark:border-amber-700">
      <h2 className="font-semibold">第一次使用：打開 Chrome 的實驗功能</h2>
      <p className="muted mt-1">OKOK 體重計大多是「只廣播、不連線」的，Chrome 要打開一個設定才收得到。每支手機只要設定一次。</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
        <li>
          按下面按鈕複製網址
          <button className="btn-primary btn-sm ml-2" onClick={copy}>{copied ? '已複製 ✓' : '複製網址'}</button>
          <code className="mt-1 block break-all rounded-lg bg-stone-100 px-2 py-1 text-xs dark:bg-gray-800">{FLAG_URL}</code>
        </li>
        <li>打開 <b>Chrome</b>，在最上面的網址列<b>貼上</b>，按前往</li>
        <li>找到黃色標示的 <b>Experimental Web Platform features</b>，右邊改成 <b>Enabled</b></li>
        <li>按右下角 <b>Relaunch（重新啟動）</b>，再回到這個 App</li>
      </ol>
      <p className="muted mt-3 text-xs">這是 Chrome 內建的開發者設定，不用裝任何東西。Chrome 更新後如果失效，再照這個步驟打開一次。</p>
    </section>
  );
}

function ManualEntry({ memberId }: { memberId: string }) {
  const [kg, setKg] = useState('');
  const save = () => {
    const v = Number(kg);
    if (!(v >= 3 && v <= 250)) return alert('體重請填 3～250 公斤');
    addRec({ memberId, time: Date.now(), kg: Math.round(v * 10) / 10, impedance: null, source: 'manual' });
    setKg('');
    alert('已記下 ' + v.toFixed(1) + ' 公斤');
  };
  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">手動輸入體重</summary>
      <p className="muted mt-1">體重計讀不到時用。體脂等數字會跟體重計一樣用 500 Ω 估算。</p>
      <div className="mt-2 flex gap-2">
        <input className="input" inputMode="decimal" placeholder="例如 62.5" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
        <button className="btn-primary" onClick={save}>記下</button>
      </div>
    </details>
  );
}

export default function Measure() {
  const db = useDb();
  const scale = useScale();
  const sup = support();
  const me = db.members.find((m) => m.id === db.current);
  const busy = scale.phase === 'scanning' || scale.phase === 'connecting';

  if (!me) {
    return (
      <section className="card text-center">
        <p className="text-lg">👋 歡迎！先新增使用這支手機的家人。</p>
        <Link to="/family" className="btn-primary mt-3">到「家人」頁新增</Link>
      </section>
    );
  }

  const saved = scale.savedId ? db.recs.find((r) => r.id === scale.savedId) : null;
  const savedMember = saved && db.members.find((m) => m.id === saved.memberId);
  const mine = recsOf(db, me.id);
  const last = mine[mine.length - 1];
  const prev = saved ? recsOf(db, saved.memberId).filter((r) => r.id !== saved.id).pop() : null;

  return (
    <div className="space-y-3">
      <BackupReminder />

      {/* 要量的是誰 */}
      {db.members.length > 1 && !busy && !saved && (
        <section className="card">
          <p className="muted mb-2">現在要量的是：</p>
          <div className="flex flex-wrap gap-2">
            {db.members.map((m) => (
              <button key={m.id} className={m.id === db.current ? 'chip-on text-base' : 'chip text-base'} onClick={() => selectMember(m.id)}>{m.name}</button>
            ))}
          </div>
        </section>
      )}

      {!profileOf(me) && !saved && (
        <Link to="/family" state={{ edit: me.id }} className="block rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          ✏️ 先填<b>{me.name}</b>的性別、身高、出生年，才算得出體脂、肌肉這些數值 ›
        </Link>
      )}

      {/* 量好了 */}
      {saved && savedMember ? (
        <Result recId={saved.id} />
      ) : busy ? (
        <section className="card text-center">
          <p className="muted">{scale.mode === 'gatt' ? '連線模式' : '正在接收體重計訊號'}・{me.name}</p>
          <p className="mt-4 text-7xl font-bold tabular-nums">
            {scale.live ? fmtKg(scale.live.kg) : '--.-'}
            <span className="ml-1 text-2xl font-normal text-gray-500">kg</span>
          </p>
          <p className="mt-4 text-lg">{scale.status}</p>
          {!scale.heard && <p className="muted mt-2">站上去讓體重計螢幕亮起來；手機放在旁邊就好。</p>}
          <button className="btn mt-4 w-full" onClick={stop}>停止</button>
        </section>
      ) : (
        <section className="card">
          {last ? <WeightCard recs={mine} height={me.height} /> : <p className="muted text-center">{me.name}還沒有紀錄，站上體重計量第一次吧。</p>}
          {!sup.bluetooth ? (
            <p className="mt-3 text-amber-700 dark:text-amber-400">這個瀏覽器不支援藍牙。請用 <b>Android 手機的 Chrome</b> 打開這個網址。</p>
          ) : sup.scan ? (
            <button className="btn-primary mt-3 min-h-[72px] w-full text-xl" onClick={() => startScan()}>⚖️ 開始量體重</button>
          ) : (
            <p className="mt-3 text-sm">要先打開 Chrome 的實驗功能才能量（步驟在下面）。</p>
          )}
          {scale.status && <p className={`mt-3 text-sm ${scale.error ? 'text-red-600 dark:text-red-400' : ''}`}>{scale.status}</p>}
        </section>
      )}

      {!busy && !saved && mine.length > 0 && <TrendCard recs={mine} />}
      {!busy && !saved && <TapeCard memberId={me.id} />}

      {saved && prev && (
        <p className="muted text-center">
          跟上次（{fmtDate(prev.time)}）比：
          <b className={saved.kg - prev.kg > 0 ? 'text-orange-600' : 'text-emerald-600'}>
            {saved.kg - prev.kg > 0 ? '+' : ''}{(saved.kg - prev.kg).toFixed(1)} kg
          </b>
        </p>
      )}

      {sup.bluetooth && !sup.scan && !busy && !saved && <FlagGuide />}

      {sup.bluetooth && !busy && !saved && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">我的體重計可以「連線」</summary>
          <p className="muted mt-1">少數體重計（藍牙名稱是 <b>Chipsea-BLE</b>）可以直接連線，不用開實驗功能。不確定的話按按看，連不上就是只廣播的型號。</p>
          <button className="btn mt-2 w-full" onClick={connectGatt}>選擇體重計並連線</button>
        </details>
      )}

      {!busy && !saved && <ManualEntry memberId={me.id} />}
    </div>
  );
}

function Result({ recId }: { recId: string }) {
  const db = useDb();
  const r = db.recs.find((x) => x.id === recId)!;
  const m = db.members.find((x) => x.id === r.memberId);
  const { c } = derive(r, m);
  const items: [string, string][] = c
    ? [
        ['BMI', String(c.bmi)],
        ...(c.fatPct != null ? ([['體脂率', c.fatPct + '%'], ['肌肉量', c.muscleKg + ' kg'], ['內臟脂肪', String(c.visceral)]] as [string, string][]) : []),
        ['基礎代謝', c.bmr + ' 大卡'],
      ]
    : [];
  return (
    <section className="card text-center">
      <p className="text-lg">✅ {m?.name}，量好了</p>
      <p className="mt-2 text-7xl font-bold tabular-nums">{fmtKg(r.kg)}<span className="ml-1 text-2xl font-normal text-gray-500">kg</span></p>
      {items.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-left">
          {items.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-gray-800">
              <div className="text-xs text-gray-500 dark:text-gray-400">{k}</div>
              <div className="text-xl font-semibold">{v}</div>
            </div>
          ))}
        </div>
      )}
      {c && c.fatPct == null && <p className="muted mt-3">這次沒量到體脂：要赤腳、雙腳踩在金屬片上，站到數字閃完為止。</p>}

      {db.members.length > 1 && (
        <div className="mt-4">
          <p className="muted mb-1">這筆是誰的？</p>
          <div className="flex flex-wrap justify-center gap-2">
            {db.members.map((x) => (
              <button key={x.id} className={x.id === r.memberId ? 'chip-on' : 'chip'} onClick={() => updateRec(r.id, { memberId: x.id })}>{x.name}</button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Link to={'/report/' + r.id} className="btn-primary" onClick={resetResult}>看完整報告</Link>
        <button className="btn" onClick={resetResult}>完成</button>
      </div>
      <button className="btn-danger btn-sm mt-3" onClick={() => { if (confirm('刪除這筆紀錄？')) { deleteRec(r.id); resetResult(); } }}>這筆量錯了，刪除</button>
    </section>
  );
}
