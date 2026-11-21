// 跟體重計溝通。兩種秤：
//  1. 廣播型（大部分 OKOK 秤）：不接受連線，量測值放在藍牙廣播裡。要用 requestLEScan 收廣播，
//     這個 API 目前在 Chrome 還是實驗功能，要先到 chrome://flags 打開。
//  2. 可連線型（名字叫 Chipsea-BLE）：跟飛輪一樣用 GATT 連線，不用開任何設定。
import { useSyncExternalStore } from 'react';
import { ALL_COMPANY_IDS, ChipseaParser, chipseaUserSync, decodeAdvert, decodeWeightMeasurement, hex, type Reading } from './decode';
import { addRec, ageAt, getDb, setScaleKey } from './store';

export type Phase = 'idle' | 'scanning' | 'connecting' | 'done';
export interface Nearby { id: string; name: string; rssi: number | null; data: string; known: boolean; at: number; count: number }

export interface ScaleSnap {
  phase: Phase;
  mode: 'scan' | 'gatt' | null;
  live: Reading | null;
  /** 這次存下來的紀錄 */
  savedId: string | null;
  status: string;
  error: boolean;
  /** 已經收到認得的秤的訊號 */
  heard: boolean;
  deviceName: string | null;
  raw: string[];
  nearby: Nearby[];
  services: string[];
}

// ---------- 瀏覽器支援度 ----------
type ScanApi = {
  requestLEScan?: (o: object) => Promise<{ active: boolean; stop: () => void }>;
};
const bt = () => (typeof navigator !== 'undefined' ? navigator.bluetooth : undefined);
export const support = () => ({
  bluetooth: !!bt(),
  /** 收廣播的實驗功能有沒有打開 */
  scan: typeof (bt() as unknown as ScanApi | undefined)?.requestLEScan === 'function',
  secure: typeof window !== 'undefined' && window.isSecureContext,
});

export const FLAG_URL = 'chrome://flags/#enable-experimental-web-platform-features';

// ---------- 狀態 ----------
let snap: ScaleSnap = {
  phase: 'idle', mode: null, live: null, savedId: null, status: '', error: false, heard: false,
  deviceName: null, raw: [], nearby: [], services: [],
};
const listeners = new Set<() => void>();
function set(patch: Partial<ScaleSnap>) {
  snap = { ...snap, ...patch };
  listeners.forEach((l) => l());
}
export function useScale(): ScaleSnap {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => snap);
}

const RAW_MAX = 80;
function log(line: string) {
  const t = new Date().toLocaleTimeString('zh-TW', { hour12: false });
  set({ raw: [t + ' ' + line, ...snap.raw].slice(0, RAW_MAX) });
}

// ---------- 判斷「量好了」 ----------
const HAS_IMPEDANCE = new Set(['C0', 'V20']);
const WAIT_IMPEDANCE_MS = 4000;   // 體重穩定後，等阻抗（體脂）最多幾秒
const SCAN_TIMEOUT_MS = 120000;   // 一直沒量好就自動停，省電

let best: { r: Reading; key: string } | null = null;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let history: { kg: number; at: number }[] = [];
let lockedKey: string | null = null; // 這次量測鎖定的秤

// 上一筆存檔的封包，避免秤還在廣播同一筆結果時重複存
const LAST_KEY = 'scaleLogger.lastFinal';
type LastFinal = { key: string; seq?: number; kg: number; at: number };
const lastFinal = (): LastFinal | null => {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch { return null; }
};
const isRepeat = (r: Reading, key: string) => {
  const l = lastFinal();
  if (!l || l.key !== key) return false;
  if (r.seq != null && l.seq != null) return r.seq === l.seq && Date.now() - l.at < 30 * 60000;
  return r.kg === l.kg && Date.now() - l.at < 90000;
};

function resetMeasure() {
  best = null;
  history = [];
  lockedKey = null;
  if (waitTimer) clearTimeout(waitTimer);
  waitTimer = null;
}

/** 沒有穩定旗標的型號：連續 3 筆一樣、跨 1.5 秒以上就算穩定 */
function heuristicStable(kg: number) {
  const now = Date.now();
  history = [...history.filter((h) => now - h.at < 5000), { kg, at: now }];
  const same = history.filter((h) => Math.abs(h.kg - kg) < 0.05);
  return same.length >= 3 && now - same[0].at >= 1500;
}

function onReading(r: Reading, key: string, name: string) {
  if (snap.phase !== 'scanning' && snap.phase !== 'connecting') return;
  const remembered = getDb().scaleKey;
  // 附近有別人家的秤時只收自己這台；第一次用就收第一台認得的
  if (remembered && key !== remembered && snap.mode === 'scan') return;
  if (lockedKey && key !== lockedKey) return;
  if (r.kg < 3) return; // 還沒站上去或剛下秤
  const stable = r.stable ?? heuristicStable(r.kg);
  if (stable && isRepeat(r, key)) return; // 上一次的結果還在廣播
  lockedKey = key;
  if (!snap.heard) set({ heard: true, deviceName: name, status: '收到體重計的訊號了，請站穩不要動…' });
  set({ live: r });
  if (!stable || diagAll) return; // 診斷模式只看不存

  const wantsMore = (HAS_IMPEDANCE.has(r.variant) && r.impedance == null) || (r.variant === 'Chipsea' && !r.scale);
  if (!best || (best.r.impedance == null && r.impedance != null) || (!best.r.scale && r.scale)) best = { r, key };
  else best = { r: { ...r, impedance: r.impedance ?? best.r.impedance, scale: r.scale ?? best.r.scale }, key };

  if (!wantsMore) return finish();
  if (!waitTimer) {
    set({ status: '體重量好了，正在量體脂（請赤腳、腳踩在金屬片上）…' });
    waitTimer = setTimeout(finish, WAIT_IMPEDANCE_MS);
  }
}

function finish() {
  if (!best) return;
  const { r, key } = best;
  const db = getDb();
  const memberId = db.current;
  if (!memberId) return;
  const id = addRec({ memberId, time: Date.now(), kg: r.kg, impedance: r.impedance, source: 'scale', variant: r.variant, scale: r.scale });
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ key, seq: r.seq, kg: r.kg, at: Date.now() } satisfies LastFinal)); } catch { /* 無痕模式 */ }
  if (!db.scaleKey && snap.mode === 'scan') setScaleKey(key);
  log('存檔：' + r.kg + ' kg' + (r.impedance ? '，阻抗 ' + r.impedance + ' Ω' : '（沒有阻抗）'));
  stopAll();
  resetMeasure();
  set({
    phase: 'done', live: r, savedId: id, error: false,
    status: r.impedance || r.scale ? '量好了，已存檔。' : HAS_IMPEDANCE.has(r.variant)
      ? '體重已存檔。這次沒量到體脂（要赤腳、雙腳踩在金屬片上）。'
      : '體重已存檔。',
  });
}

// ---------- 方法一：收廣播（requestLEScan） ----------
let scan: { active: boolean; stop: () => void } | null = null;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let diagAll = false; // 診斷模式：附近所有廣播都列出來
let lastPaint = 0;
const nearby = new Map<string, Nearby>();

function onAdvert(e: Event) {
  const ev = e as BluetoothAdvertisingEvent;
  const name = ev.device?.name || ev.name || '';
  let known = false;
  const parts: string[] = [];
  ev.manufacturerData?.forEach((dv, cid) => {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength);
    parts.push('0x' + cid.toString(16).padStart(4, '0') + ': ' + hex(bytes));
    const r = decodeAdvert(cid, bytes);
    if (!r) return;
    known = true;
    if (snap.raw[0]?.slice(9) !== parts[parts.length - 1]) log(parts[parts.length - 1]);
    onReading(r, r.mac ?? ev.device.id, name || '（沒有名字）');
  });

  if (!diagAll && !known) return;
  const id = ev.device.id;
  const prev = nearby.get(id);
  nearby.set(id, {
    id, name: name || '（沒有名字）', rssi: ev.rssi ?? null, known: known || !!prev?.known,
    data: parts.join('\n') || (ev.uuids?.length ? '服務：' + ev.uuids.join(', ') : '（沒有 manufacturer data）'),
    at: Date.now(), count: (prev?.count ?? 0) + 1,
  });
  const now = Date.now();
  if (now - lastPaint > 300) {
    lastPaint = now;
    set({ nearby: [...nearby.values()].sort((a, b) => Number(b.known) - Number(a.known) || (b.rssi ?? -999) - (a.rssi ?? -999)).slice(0, 40) });
  }
}

/** 開始量（廣播型）。all=true 是診斷用：列出附近所有藍牙廣播 */
export async function startScan(all = false) {
  const api = bt() as unknown as ScanApi | undefined;
  if (!api?.requestLEScan) {
    set({ status: '這個瀏覽器還不能收體重計的廣播，請照下面的步驟打開 Chrome 的實驗功能。', error: true });
    return;
  }
  if (!all && !getDb().current) {
    set({ status: '請先到「家人」頁新增自己的名字。', error: true });
    return;
  }
  stopAll();
  resetMeasure();
  diagAll = all;
  nearby.clear();
  set({ phase: 'scanning', mode: 'scan', live: null, savedId: null, heard: false, error: false, nearby: [], deviceName: null,
    status: all ? '正在列出附近的藍牙廣播…' : '請站上體重計（赤腳才量得到體脂）' });
  try {
    bt()!.addEventListener('advertisementreceived', onAdvert);
    scan = await api.requestLEScan({ acceptAllAdvertisements: true, keepRepeatedDevices: true });
  } catch (e) {
    bt()?.removeEventListener('advertisementreceived', onAdvert);
    const msg = (e as Error).message || String(e);
    set({ phase: 'idle', mode: null, error: true,
      status: /denied|permission|NotAllowed/i.test(msg) ? '沒有允許掃描藍牙。請再按一次，跳出詢問時按「允許」。' : '沒辦法開始掃描：' + msg + '。請確認藍牙和定位都有打開。' });
    return;
  }
  scanTimer = setTimeout(() => {
    if (snap.phase !== 'scanning') return;
    stopAll();
    set({ phase: 'idle', mode: null, error: !snap.heard && !all,
      status: all ? '已停止列出。' : snap.heard ? '體重一直沒有穩定，已停止。請再試一次。'
        : '兩分鐘內沒收到體重計的訊號。請確認藍牙、定位都有開，站上去讓螢幕亮起來再試。' });
  }, all ? 60000 : SCAN_TIMEOUT_MS);
}

// ---------- 方法二：連線（Chipsea-BLE / 標準體重服務） ----------
let device: BluetoothDevice | null = null;
const SVC_CHIPSEA = 0xfff0;
const SVC_WEIGHT = 0x181d;
const uuid16 = (u: string) => (/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(u)?.[1] ?? u).toUpperCase();

function onDisconnected() {
  if (snap.phase === 'connecting') {
    resetMeasure();
    set({ phase: 'idle', mode: null, error: true, status: '體重計斷線了（螢幕熄了就會斷）。站上去讓它亮起來，再按一次「連線」。' });
  }
}

/** 32 位元的使用者編號，給秤分辨是誰（從家人 id 算出來，每次都一樣） */
const userNo = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };

export async function connectGatt() {
  if (!bt()) return;
  const db = getDb();
  if (!db.current) return set({ status: '請先到「家人」頁新增自己的名字。', error: true });
  stopAll();
  resetMeasure();
  set({ phase: 'connecting', mode: 'gatt', live: null, savedId: null, heard: false, error: false, services: [], status: '請在跳出的清單選你的體重計…' });
  try {
    device = await bt()!.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SVC_CHIPSEA, SVC_WEIGHT, 0x181b, 'battery_service', 'device_information'],
      optionalManufacturerData: ALL_COMPANY_IDS,
    } as RequestDeviceOptions);
  } catch {
    return set({ phase: 'idle', mode: null, status: '' }); // 使用者按取消
  }
  device.addEventListener('gattserverdisconnected', onDisconnected);
  set({ deviceName: device.name || '（沒有名字）', status: '連線中…' });
  try {
    const server = await Promise.race([
      device.gatt!.connect(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
    ]);
    const svcs = await server.getPrimaryServices();
    set({ services: svcs.map((s) => uuid16(s.uuid)) });
    log('服務：' + svcs.map((s) => uuid16(s.uuid)).join(', '));
    const chipsea = svcs.find((s) => uuid16(s.uuid) === 'FFF0');
    const wss = svcs.find((s) => uuid16(s.uuid) === '181D');
    if (chipsea) {
      const parser = new ChipseaParser();
      const rx = await chipsea.getCharacteristic(0xfff1);
      rx.addEventListener('characteristicvaluechanged', () => {
        const b = new Uint8Array(rx.value!.buffer.slice(rx.value!.byteOffset, rx.value!.byteOffset + rx.value!.byteLength));
        log(hex(b));
        const r = parser.feed(b);
        if (r) onReading(r, device!.id, device!.name || 'Chipsea-BLE');
      });
      await rx.startNotifications();
      const m = getDb().members.find((x) => x.id === getDb().current);
      const sync = chipseaUserSync(userNo(m!.id), (m?.sex ?? 'M') === 'M', ageAt(m) ?? 30, m?.height ?? 165);
      const tx = await chipsea.getCharacteristic(0xfff2);
      await (tx.properties.writeWithoutResponse ? tx.writeValueWithoutResponse(sync.buffer as ArrayBuffer) : tx.writeValue(sync.buffer as ArrayBuffer));
      log('→ ' + hex(sync));
    } else if (wss) {
      const c = await wss.getCharacteristic(0x2a9d);
      c.addEventListener('characteristicvaluechanged', () => {
        const b = new Uint8Array(c.value!.buffer.slice(c.value!.byteOffset, c.value!.byteOffset + c.value!.byteLength));
        log(hex(b));
        const r = decodeWeightMeasurement(b);
        if (r) onReading(r, device!.id, device!.name || '體重計');
      });
      await c.startNotifications();
    } else {
      device.gatt?.disconnect();
      return set({ phase: 'idle', mode: null, error: true, status: '連上了「' + (device.name || '這台裝置') + '」，但它不是認得的體重計格式。服務清單在「家人」頁的診斷資訊，可以截圖給開發的人。' });
    }
    set({ status: '已連線，請站上體重計' });
  } catch (e) {
    device.gatt?.disconnect();
    const msg = (e as Error).message;
    set({ phase: 'idle', mode: null, error: true,
      status: msg === 'timeout' || /connect|GATT|Connection/i.test(msg)
        ? '連不上這台體重計。大部分 OKOK 體重計是「只廣播」型，不能連線，請改用上面的「開始量體重」（要先打開 Chrome 實驗功能）。'
        : '連線失敗：' + msg });
  }
}

// ---------- 停止 ----------
function stopAll() {
  if (scan?.active) scan.stop();
  scan = null;
  bt()?.removeEventListener('advertisementreceived', onAdvert);
  if (scanTimer) clearTimeout(scanTimer);
  scanTimer = null;
  if (device?.gatt?.connected) {
    device.removeEventListener('gattserverdisconnected', onDisconnected);
    device.gatt.disconnect();
  }
}

export function stop() {
  stopAll();
  resetMeasure();
  set({ phase: 'idle', mode: null, status: '', error: false });
}

/** 量好的畫面按「再量一次」或離開時回到初始狀態 */
export const resetResult = () => set({ phase: 'idle', savedId: null, live: null, status: '', error: false });

export const forgetScale = () => setScaleKey(null);

// 切到背景掃描會被瀏覽器停掉，乾脆停下來，回來再按一次
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && snap.phase === 'scanning') {
      stopAll();
      resetMeasure();
      set({ phase: 'idle', mode: null, status: '離開畫面所以停止了，回來再按一次「開始量體重」。', error: false });
    }
  });
}
