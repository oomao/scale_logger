import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { addMember, bigTextOn, deleteMember, importData, selectMember, unbackedRecs, updateMember, useDb, type Member } from '../lib/store';
import { download, fmtDate } from '../lib/format';
import { toCsv } from '../lib/export';
import { backupFileName, canShareFiles, saveBackup } from '../lib/backup';
import { forgetScale, startScan, stop, support, useScale } from '../lib/scale';
import type { Sex } from '../lib/bia';

function BodyEditor({ m, onDone, onDelete }: { m: Member; onDone: () => void; onDelete: () => void }) {
  const [sex, setSex] = useState<Sex | undefined>(m.sex);
  const [year, setYear] = useState(m.birthYear ? String(m.birthYear) : '');
  const [cm, setCm] = useState(m.height ? String(m.height) : '');
  const save = () => {
    const thisYear = new Date().getFullYear();
    let y = year.trim() ? Number(year) : null;
    if (y != null && y < 200) y += 1911; // 填民國年也可以
    const h = cm.trim() ? Number(cm) : null;
    if (y != null && !(Number.isInteger(y) && y >= thisYear - 110 && y <= thisYear - 3)) return alert('出生年請填西元或民國年，例如 1960 或 49');
    if (h != null && !(h >= 80 && h <= 230)) return alert('身高請填 80～230 公分');
    updateMember(m.id, { sex, birthYear: y ?? undefined, height: h == null ? undefined : Math.round(h) });
    onDone();
  };
  return (
    <div className="w-full rounded-xl bg-stone-100 p-3 dark:bg-gray-800">
      <div className="flex gap-2">
        {(['M', 'F'] as Sex[]).map((s) => (
          <button key={s} className={`flex-1 ${sex === s ? 'chip-on' : 'chip'}`} onClick={() => setSex(s)}>{s === 'M' ? '男' : '女'}</button>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <label className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          出生年
          <input className="input mt-1 w-full" inputMode="numeric" placeholder="例如 1960" value={year} onChange={(e) => setYear(e.target.value)} />
        </label>
        <label className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          身高（公分）
          <input className="input mt-1 w-full" inputMode="decimal" placeholder="例如 165" value={cm} onChange={(e) => setCm(e.target.value)} />
        </label>
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">性別、出生年、身高三個都填，才算得出體脂、肌肉、基礎代謝。只存在這支手機。</p>
      <div className="mt-2 flex gap-2">
        <button className="btn btn-sm flex-1" onClick={onDone}>取消</button>
        <button className="btn-primary btn-sm flex-1" onClick={save}>儲存</button>
      </div>

      <label className="mt-3 flex items-center gap-2 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
        <input type="checkbox" className="h-5 w-5 accent-brand" checked={bigTextOn(m)} onChange={(e) => updateMember(m.id, { bigText: e.target.checked })} />
        <span className="flex-1">大字模式<span className="block text-xs text-gray-500 dark:text-gray-400">選到{m.name}時整個 App 字放大；65 歲以上預設開啟</span></span>
      </label>

      <button className="btn-danger btn-sm mt-3 w-full" onClick={onDelete}>刪除{m.name}和他的紀錄</button>
    </div>
  );
}

export default function Family() {
  const db = useDb();
  const scale = useScale();
  const sup = support();
  const [name, setName] = useState('');
  const loc = useLocation();
  const [editing, setEditing] = useState<string | null>((loc.state as { edit?: string } | null)?.edit ?? null);
  const [who, setWho] = useState<string>(db.current ?? '__all');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => {});
  }, []);
  const target = who === '__all' || !db.members.some((m) => m.id === who) ? null : who;
  const share = canShareFiles();

  const add = () => {
    if (!name.trim()) return;
    const id = addMember(name);
    if (!id) return alert('已經有「' + name.trim() + '」了');
    setName('');
    setEditing(id);
  };

  const remove = (id: string, n: string) => {
    const count = db.recs.filter((r) => r.memberId === id).length;
    if (confirm('刪除「' + n + '」和他的 ' + count + ' 筆紀錄？建議先匯出備份。')) deleteMember(id);
  };

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      alert(importData(await file.text()));
    } catch (err) {
      alert('匯入失敗：' + (err as Error).message);
    }
    e.target.value = '';
  };

  const describe = (m: Member) =>
    [m.sex && (m.sex === 'M' ? '男' : '女'), m.birthYear && m.birthYear + ' 年生', m.height && m.height + ' cm'].filter(Boolean).join('・');

  return (
    <div className="space-y-3">
      <section className="card">
        <h2 className="mb-2 font-semibold">家人</h2>
        <ul className="divide-y divide-gray-200 dark:divide-gray-800">
          {db.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <button className={m.id === db.current ? 'chip-on' : 'chip'} onClick={() => selectMember(m.id)}>{m.name}</button>
              <span className="muted ml-auto text-right">
                {db.recs.filter((r) => r.memberId === m.id).length} 筆
                <span className="block text-xs">{describe(m) || <span className="text-amber-600">還沒填身體資料</span>}</span>
              </span>
              <button className="btn btn-sm" onClick={() => setEditing(editing === m.id ? null : m.id)}>{editing === m.id ? '收起' : '設定'}</button>
              {editing === m.id && <BodyEditor m={m} onDone={() => setEditing(null)} onDelete={() => remove(m.id, m.name)} />}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input className="input" value={name} maxLength={20} placeholder="新增家人名字" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn-primary" onClick={add}>新增</button>
        </div>
        <p className="muted mt-2">每個家人用自己的手機時，各自在自己的手機上新增自己的名字就好。全家共用一支手機也可以，量之前先選是誰。</p>
      </section>

      <section className="card">
        <h2 className="font-semibold">備份與匯入</h2>
        <p className="muted mt-1">
          {db.lastBackup ? '上次備份：' + fmtDate(db.lastBackup) : '還沒備份過'}
          {unbackedRecs(db) > 0 && `・${unbackedRecs(db)} 筆新紀錄未備份`}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">匯出誰</span>
          <select value={target ?? '__all'} onChange={(e) => setWho(e.target.value)} className="flex-1 rounded-xl border border-gray-200 bg-stone-50 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-950">
            {db.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            <option value="__all">這支手機上的全部家人</option>
          </select>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">檔名：{backupFileName(target)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {share && <button className="btn-primary" onClick={() => saveBackup(target, 'share')}>分享到雲端硬碟 / LINE</button>}
          <button className={share ? 'btn' : 'btn-primary'} onClick={() => saveBackup(target, 'download')}>下載備份檔</button>
          <button className="btn" onClick={() => download(backupFileName(target, 'csv'), toCsv(target), 'text/csv')}>匯出 CSV（Excel）</button>
        </div>
        <label className="btn mt-3 w-full cursor-pointer">
          📂 讀取備份檔（合併進來）
          <input type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
        </label>
        <p className="muted mt-2 text-xs">
          同名的家人會自動合併，重複的紀錄會略過。
          {persisted === true && ' 這支手機已允許長期保存資料。'}
          {persisted === false && ' 瀏覽器還沒允許長期保存，把 App「安裝到主畫面」後通常就會允許。'}
        </p>
      </section>

      <section className="card">
        <details>
          <summary className="cursor-pointer font-semibold">診斷資訊</summary>
          <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500">網頁藍牙</dt><dd>{sup.bluetooth ? '支援' : '不支援（請用 Android Chrome）'}</dd>
            <dt className="text-gray-500">收廣播（實驗功能）</dt><dd>{sup.scan ? '已打開 ✓' : '沒打開'}</dd>
            <dt className="text-gray-500">認得的體重計</dt>
            <dd className="break-all">
              {db.scaleKey ?? '還沒有（第一次量到的那台會記住）'}
              {db.scaleKey && <button className="btn btn-sm ml-2" onClick={() => confirm('忘記這台體重計？下次會收第一台量到的。') && forgetScale()}>忘記</button>}
            </dd>
            {scale.deviceName && <><dt className="text-gray-500">裝置名稱</dt><dd>{scale.deviceName}</dd></>}
            {scale.services.length > 0 && <><dt className="text-gray-500">藍牙服務</dt><dd className="break-all">{scale.services.join(', ')}</dd></>}
          </dl>
          <p className="muted mt-2 text-xs">廣播型體重計封包裡的 MAC 會顯示在上面，可以跟 OKOK App 裡的 MAC 對照。</p>

          {sup.scan && (
            scale.phase === 'scanning'
              ? <button className="btn mt-3" onClick={stop}>停止列出</button>
              : <button className="btn mt-3" onClick={() => startScan(true)}>列出附近所有藍牙廣播（60 秒）</button>
          )}
          {scale.nearby.length > 0 && (
            <ul className="mt-3 space-y-2 text-xs">
              {scale.nearby.map((n) => (
                <li key={n.id} className={`rounded-xl p-2 ${n.known ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-stone-100 dark:bg-gray-800'}`}>
                  <b>{n.name}</b>{n.known && ' ✓ 認得的體重計'} <span className="text-gray-500">RSSI {n.rssi ?? '?'}・{n.count} 次</span>
                  <pre className="mt-1 whitespace-pre-wrap break-all">{n.data}</pre>
                </li>
              ))}
            </ul>
          )}
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-stone-100 p-3 text-[11px] dark:bg-gray-800">
            {scale.raw.join('\n') || '（量測時這裡會顯示收到的原始封包）'}
          </pre>
        </details>
      </section>
    </div>
  );
}
