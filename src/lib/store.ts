// 家人與量測紀錄，存在這支手機的 IndexedDB。沒有後端，換手機靠備份檔搬家。
import { useSyncExternalStore } from 'react';
import type { Profile, Sex } from './bia';
import type { ScaleCalc, Variant } from './decode';

export interface Member {
  id: string;
  name: string;
  sex?: Sex;
  birthYear?: number;
  height?: number;   // 公分
  bigText?: boolean; // 大字模式；沒設定時 65 歲以上自動開
}

export interface Rec {
  id: string;
  memberId: string;
  time: number;
  kg: number;
  impedance?: number | null; // 歐姆；只有體重時是 null
  source: 'scale' | 'manual';
  variant?: Variant;
  scale?: ScaleCalc; // 可連線型秤自己算好的數值
  note?: string;
}

// 體圍（皮尺量的，手動輸入，單位公分）
export type TapeKey = 'chest' | 'upperAbdomen' | 'waist' | 'lowerAbdomen' | 'hip' | 'thighR' | 'calfR' | 'armR';
export const TAPE_ITEMS: [TapeKey, string][] = [
  ['chest', '胸圍'], ['upperAbdomen', '上腹圍'], ['waist', '腰圍'], ['lowerAbdomen', '下腹圍'],
  ['hip', '臀圍'], ['thighR', '大腿（右）'], ['calfR', '小腿（右）'], ['armR', '上臂圍（右）'],
];
export interface Tape {
  id: string;
  memberId: string;
  time: number;
  cm: Partial<Record<TapeKey, number>>;
}

export interface Db {
  members: Member[];
  current: string | null;
  recs: Rec[];
  tapes: Tape[];
  lastBackup?: number | null;
  /** 認得的那台秤（C0 用封包裡的 MAC，其他用 Web Bluetooth 的裝置 id），附近有別台秤時只收這台 */
  scaleKey?: string | null;
}

const IDB_NAME = 'scale-logger';
const IDB_STORE = 'kv';
const IDB_KEY = 'db';
const LS_KEY = 'scaleLogger.v1';

const empty = (): Db => ({ members: [], current: null, recs: [], tapes: [], lastBackup: null, scaleKey: null });
const valid = (d: unknown): d is Db => !!d && Array.isArray((d as Db).members) && Array.isArray((d as Db).recs);

let db: Db = empty();
let useLocalStorage = false;
const listeners = new Set<() => void>();

let idbPromise: Promise<IDBDatabase> | null = null;
function openIdb(): Promise<IDBDatabase> {
  idbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    idbPromise = null;
    throw e;
  });
  return idbPromise;
}

async function idbGet(): Promise<unknown> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: Db): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function initStore() {
  try {
    const saved = await idbGet();
    db = valid(saved) ? { ...empty(), ...saved } : empty();
  } catch {
    useLocalStorage = true;
    try {
      const d = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      db = valid(d) ? { ...empty(), ...d } : empty();
    } catch {
      db = empty();
    }
  }
  navigator.storage?.persist?.().catch(() => {});
}

function commit(next: Db) {
  db = next;
  listeners.forEach((l) => l());
  const fail = (e: unknown) => alert('儲存失敗（' + (e as Error).message + '），請先到「家人」頁匯出備份。');
  if (useLocalStorage) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch (e) { fail(e); }
  } else {
    idbPut(db).catch(fail);
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const getDb = () => db;
export const memberName = (id: string | null) => db.members.find((m) => m.id === id)?.name ?? '（已刪除）';

export function useDb(): Db {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => db,
  );
}

export const ageAt = (m: Member | undefined, time = Date.now()) =>
  m?.birthYear ? new Date(time).getFullYear() - m.birthYear : null;

/** 算身體組成要的資料；缺性別、身高、出生年任何一個就回 null */
export function profileOf(m: Member | undefined, time = Date.now()): Profile | null {
  const age = ageAt(m, time);
  if (!m?.sex || !m.height || age == null) return null;
  return { sex: m.sex, height: m.height, age };
}

export const bigTextOn = (m: Member | undefined) => m?.bigText ?? (ageAt(m) ?? 0) >= 65;

export function addMember(name: string): string | null {
  name = name.trim().slice(0, 20);
  if (!name || db.members.some((m) => m.name === name)) return null;
  const m = { id: uid(), name };
  commit({ ...db, members: [...db.members, m], current: m.id });
  return m.id;
}

export const selectMember = (id: string) => commit({ ...db, current: id });

export function deleteMember(id: string) {
  const members = db.members.filter((m) => m.id !== id);
  commit({
    ...db,
    members,
    recs: db.recs.filter((r) => r.memberId !== id),
    tapes: db.tapes.filter((t) => t.memberId !== id),
    current: db.current === id ? members[0]?.id ?? null : db.current,
  });
}

export function updateMember(id: string, patch: Partial<Member>) {
  commit({ ...db, members: db.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
}

export function addRec(r: Omit<Rec, 'id'>): string {
  const id = uid();
  commit({ ...db, recs: [...db.recs, { ...r, id }] });
  return id;
}

export const updateRec = (id: string, patch: Partial<Rec>) =>
  commit({ ...db, recs: db.recs.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

export const deleteRec = (id: string) => commit({ ...db, recs: db.recs.filter((r) => r.id !== id) });

export const setScaleKey = (k: string | null) => commit({ ...db, scaleKey: k });

export const markBackedUp = () => commit({ ...db, lastBackup: Date.now() });

export const unbackedRecs = (d: Db = db) =>
  d.recs.filter((r) => r.time > (d.lastBackup ?? 0)).length + d.tapes.filter((t) => t.time > (d.lastBackup ?? 0)).length;

export function addTape(t: Omit<Tape, 'id'>): string {
  const id = uid();
  commit({ ...db, tapes: [...db.tapes, { ...t, id }] });
  return id;
}

export const deleteTape = (id: string) => commit({ ...db, tapes: db.tapes.filter((t) => t.id !== id) });

/** 某人的體圍紀錄，舊到新 */
export const tapesOf = (d: Db, memberId: string | null) =>
  d.tapes.filter((t) => t.memberId === memberId).sort((a, b) => a.time - b.time);

/** 某人的紀錄，舊到新 */
export const recsOf = (d: Db, memberId: string | null) =>
  d.recs.filter((r) => r.memberId === memberId).sort((a, b) => a.time - b.time);

// ---------- 匯出 / 匯入 ----------
export interface ExportFile { app: 'scale-logger'; version: 1; exportedAt: number; members: Member[]; recs: Rec[]; tapes: Tape[] }

export function exportData(memberId: string | null): ExportFile {
  return {
    app: 'scale-logger',
    version: 1,
    exportedAt: Date.now(),
    members: memberId ? db.members.filter((m) => m.id === memberId) : db.members,
    recs: memberId ? db.recs.filter((r) => r.memberId === memberId) : db.recs,
    tapes: memberId ? db.tapes.filter((t) => t.memberId === memberId) : db.tapes,
  };
}

export function importData(text: string): string {
  const d = JSON.parse(text);
  if (!valid(d)) throw new Error('這不是體重紀錄的備份檔');
  const members = [...db.members];
  const recs = [...db.recs];
  const tapes = [...db.tapes];
  const idMap = new Map<string, string>();
  let addM = 0, addR = 0, skipR = 0;
  for (const m of d.members) {
    if (!m?.id) continue;
    const same = members.find((x) => x.id === m.id) ?? members.find((x) => x.name === m.name);
    const body: Partial<Member> = {
      sex: m.sex === 'M' || m.sex === 'F' ? m.sex : undefined,
      birthYear: Number.isInteger(m.birthYear) ? m.birthYear : undefined,
      height: typeof m.height === 'number' ? m.height : undefined,
    };
    if (same) {
      idMap.set(m.id, same.id); // 同名視為同一人，紀錄合併
      const i = members.indexOf(same);
      members[i] = { ...same, sex: same.sex ?? body.sex, birthYear: same.birthYear ?? body.birthYear, height: same.height ?? body.height };
    } else {
      members.push({ id: m.id, name: String(m.name).slice(0, 20), ...body });
      idMap.set(m.id, m.id);
      addM++;
    }
  }
  for (const r of d.recs) {
    if (!r?.id || typeof r.kg !== 'number') continue;
    if (recs.some((x) => x.id === r.id)) { skipR++; continue; }
    recs.push({ ...r, memberId: idMap.get(r.memberId) ?? r.memberId });
    addR++;
  }
  let addT = 0;
  for (const t of Array.isArray(d.tapes) ? d.tapes : []) {
    if (!t?.id || typeof t.cm !== 'object' || tapes.some((x) => x.id === t.id)) continue;
    tapes.push({ id: t.id, time: Number(t.time), memberId: idMap.get(t.memberId) ?? t.memberId, cm: t.cm });
    addT++;
  }
  commit({ ...db, members, recs, tapes, current: db.current ?? members[0]?.id ?? null });
  return `匯入完成：新增 ${addM} 位家人、${addR} 筆紀錄` + (addT ? `、${addT} 筆體圍` : '') + (skipR ? `（${skipR} 筆已經有了，略過）` : '') + '。';
}
