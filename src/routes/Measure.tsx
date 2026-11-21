import { useState } from 'react';
import { Link } from 'react-router-dom';
import BackupReminder from '../components/BackupReminder';
import { connectGatt, FLAG_URL, resetResult, startScan, stop, support, useScale } from '../lib/scale';
import { addRec, deleteRec, profileOf, recsOf, selectMember, updateRec, useDb } from '../lib/store';
import { derive, fmtKg } from '../lib/derive';
import { fmtDate } from '../lib/format';

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
      <p className="muted mt-1">體重計讀不到時用。手動輸入只有體重，沒有體脂。</p>
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
        <section className="card text-center">
          {last && (
            <p className="muted">
              上次 {fmtDate(last.time)}：<b className="text-gray-900 dark:text-gray-100">{fmtKg(last.kg)} kg</b>
              {derive(last, me).c?.fatPct != null && `・體脂 ${derive(last, me).c!.fatPct}%`}
            </p>
          )}
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
