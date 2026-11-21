// OKOK / 芯海（Chipsea）體脂秤的藍牙封包解碼。純函式、不碰瀏覽器 API，方便在 Node 測試。
//
// 參考（照著協定自己重寫，沒有複製程式碼）：
//  - openScale OkOkHandler / ChipseaBleLib（github.com/oliexdev/openScale）
//  - okokscale.py（github.com/rrooggiieerr/okokscale.py）
//
// 慣例：廣播的 manufacturer data 前 2 byte 是 company ID（little-endian），
// Web Bluetooth 的 manufacturerData Map 用它當 key，value 是「後面」的資料；
// 下面的 offset 都是從那份資料算起，多 byte 數值是 big-endian。

export type Variant = 'C0' | 'V20' | 'V11' | 'VF0' | 'Chipsea' | 'WSS';

export interface Reading {
  variant: Variant;
  kg: number;
  /** 秤自己說穩定了（沒有穩定旗標的型號是 null，交給上層判斷） */
  stable: boolean | null;
  /** 阻抗（歐姆）；只量體重的型號或還沒量好時是 null */
  impedance: number | null;
  /** C0 的 company ID 高位元組：每量一次就加一，用來分辨「同一次」 */
  seq?: number;
  /** C0 封包裡帶的秤自己的 MAC，可以跟 OKOK App 顯示的對照 */
  mac?: string;
  /** 可連線型（Chipsea-BLE）秤自己算好的身體組成 */
  scale?: ScaleCalc;
}

export interface ScaleCalc {
  fat?: number;      // %
  water?: number;    // %
  muscle?: number;   // %
  bmr?: number;      // kcal
  visceral?: number;
  bone?: number;     // kg
}

const u16 = (d: Uint8Array, i: number) => (d[i] << 8) | d[i + 1];
const LB = 0.45359237;

export const hex = (d: Uint8Array | ArrayBuffer | DataView) => {
  const b = d instanceof Uint8Array ? d : d instanceof DataView ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
};

/** C0 / V11 的屬性位元組：bit1-2 小數位、bit3-4 單位 */
function weightFrom(hi: number, lo: number, attrib: number): number | null {
  const divider = [10, 1, 100, 10][(attrib >> 1) & 3];
  const raw = (hi << 8) | lo;
  switch ((attrib >> 3) & 3) {
    case 0: return raw / divider;           // 公斤
    case 1: return raw / divider / 2;       // 台斤（市斤）
    case 2: return (raw / divider) * LB;    // 磅
    case 3: return hi * 6.35029318 + (lo / divider) * LB; // 英石:磅
  }
  return null;
}

/** 合理的人體阻抗範圍，超出就當作沒量到（例如穿襪子、腳沒踩到電極） */
export const validImpedance = (z: number) => (z >= 150 && z <= 1500 ? z : null);

const round = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/** 解一筆廣播的 manufacturer data；不是認得的格式就回 null */
export function decodeAdvert(companyId: number, data: Uint8Array): Reading | null {
  // V20：0x20CA，19 byte，有 XOR 檢查碼
  if (companyId === 0x20ca) {
    if (data.length !== 19) return null;
    let x = 0x20;
    for (let i = 0; i < 12; i++) x ^= data[i];
    const xAlt = x ^ data[11]; // 有些韌體只 XOR 到 [10]
    if (data[12] !== x && data[12] !== xAlt) return null;
    const flag = data[6];
    const kg = u16(data, 8) / (flag & 4 ? 100 : 10);
    const z = u16(data, 10) / 10;
    return { variant: 'V20', kg: round(kg), stable: !!(flag & 1), impedance: z ? validImpedance(z) : null };
  }

  // V11：0x11CA，23 byte，只有體重
  if (companyId === 0x11ca) {
    if (data.length !== 23) return null;
    let x = 0xca ^ 0x11;
    for (let i = 0; i < 16; i++) x ^= data[i];
    if (data[16] !== x) return null;
    const kg = weightFrom(data[3], data[4], data[9]);
    if (kg == null) return null;
    return { variant: 'V11', kg: round(kg), stable: !!(data[1] & 1), impedance: null };
  }

  // VF0：0xF0FF，只有體重，沒有穩定旗標
  if (companyId === 0xf0ff) {
    if (data.length < 4) return null;
    return { variant: 'VF0', kg: round(((data[3] << 8) | data[2]) / 10), stable: null, impedance: null };
  }

  // C0：company ID 低位元組是 0xC0（高位元組是流水號），13 byte，最後 6 byte 是 MAC
  if ((companyId & 0xff) === 0xc0) {
    if (data.length < 13) return null;
    const attrib = data[6];
    const kg = weightFrom(data[0], data[1], attrib);
    if (kg == null) return null;
    // [2] 最高位元是 1 表示阻抗加密過，讀不出來
    const z = data[2] & 0x80 ? 0 : u16(data, 2) / 10;
    const mac = Array.from(data.slice(7, 13), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
    return { variant: 'C0', kg: round(kg), stable: !!(attrib & 1), impedance: z ? validImpedance(z) : null, seq: companyId >> 8, mac };
  }

  return null;
}

/** watchAdvertisements 只會給「事先列出」的 company ID，C0 的流水號會變，所以 256 個全列 */
export const ALL_COMPANY_IDS = [
  ...Array.from({ length: 256 }, (_, i) => (i << 8) | 0xc0),
  0x20ca, 0x11ca, 0xf0ff,
];

// ---------- 可連線型：Chipsea-BLE（服務 FFF0，通知 FFF1，寫入 FFF2） ----------

/** Chipsea 屬性位元組：bit0 鎖定、bit1-2 小數位（01→0、10→2、其他 1）、bit3-4 單位 */
function chipseaKg(hi: number, lo: number, p: number): number {
  const unit = (p >> 3) & 3;
  if (unit === 3) return (hi * 14 + lo / 10) * LB;
  const digits = [1, 0, 2, 1][(p >> 1) & 3];
  const v = ((hi << 8) | lo) / 10 ** digits;
  return unit === 1 ? v / 2 : unit === 2 ? v * LB : v;
}

function calcFrom(d: Uint8Array, at: number): ScaleCalc {
  return {
    fat: u16(d, at) / 10,
    water: u16(d, at + 2) / 10,
    muscle: u16(d, at + 4) / 10,
    bmr: u16(d, at + 6),
    visceral: u16(d, at + 8) / 10,
    bone: d[at + 10] / 10,
  };
}

/** 一個連線用一個；多封包的量測要拼起來 */
export class ChipseaParser {
  private chunks = new Map<number, Uint8Array>();

  feed(f: Uint8Array): Reading | null {
    if (f.length < 4 || f[0] !== 0xca) return null;
    if (f[1] === 0x10) {
      if (f.length < 7) return null;
      const p = f[4];
      const locked = !!(p & 1);
      const r: Reading = { variant: 'Chipsea', kg: round(chipseaKg(f[5], f[6], p)), stable: locked, impedance: null };
      if (locked && f.length >= 18) r.scale = calcFrom(f, 7);
      return r;
    }
    if (f[1] !== 0x11) return null;
    const sub = f[3];
    if (sub === 0 || sub === 1) {
      if (f.length < 12) return null;
      return { variant: 'Chipsea', kg: round(chipseaKg(f[5], f[6], f[11])), stable: sub === 1, impedance: null };
    }
    if (sub === 18) { // 即時量測，多封包（19 是歷史紀錄，先不處理）
      const len = f[2] - 2;
      if (len < 0 || f.length < 5 + len) return null;
      const idx = f[4] >> 4, total = f[4] & 15;
      if (!total || !idx || idx > total) return null;
      if (idx === 1) this.chunks.clear();
      this.chunks.set(idx, f.slice(5, 5 + len));
      if (idx !== total) return null;
      const parts: Uint8Array[] = [];
      for (let i = 1; i <= total; i++) {
        const c = this.chunks.get(i);
        if (!c) { this.chunks.clear(); return null; }
        parts.push(c);
      }
      this.chunks.clear();
      const a = new Uint8Array(parts.reduce((n, c) => n + c.length, 0));
      let o = 0;
      for (const c of parts) { a.set(c, o); o += c.length; }
      if (a.length < 23) return null;
      const locked = !!(a[4] & 1);
      const r: Reading = { variant: 'Chipsea', kg: round(chipseaKg(a[10], a[11], a[4])), stable: locked, impedance: null };
      if (locked) r.scale = calcFrom(a, 12);
      return r;
    }
    return null;
  }
}

/** 連上之後要先告訴秤現在時間和使用者資料，秤才會算身體組成 */
export function chipseaUserSync(userId: number, male: boolean, age: number, heightCm: number, now = new Date()): Uint8Array {
  const f = new Uint8Array(20);
  f.set([0xca, 0x10, 14, 1, now.getFullYear() % 100, now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes(), now.getSeconds()]);
  f[10] = (userId >>> 24) & 255; f[11] = (userId >>> 16) & 255; f[12] = (userId >>> 8) & 255; f[13] = userId & 255;
  f[14] = male ? 1 : 0;
  f[15] = age & 255;
  f[16] = heightCm & 255;
  let x = 0;
  for (let i = 1; i <= 16; i++) x ^= f[i];
  f[17] = x;
  return f;
}

// ---------- 標準藍牙體重服務 0x181D / 特徵 0x2A9D（少數秤有） ----------
export function decodeWeightMeasurement(d: Uint8Array): Reading | null {
  if (d.length < 3) return null;
  const imperial = d[0] & 1;
  const raw = d[1] | (d[2] << 8);
  if (raw === 0xffff) return null; // 量測失敗
  const kg = imperial ? raw * 0.01 * LB : raw * 0.005;
  return { variant: 'WSS', kg: round(kg), stable: true, impedance: null };
}

export const VARIANT_LABEL: Record<Variant, string> = {
  C0: 'OKOK 廣播型（C0，含阻抗）',
  V20: 'OKOK 廣播型（V20，含阻抗）',
  V11: 'OKOK 廣播型（V11，只有體重）',
  VF0: 'OKOK 廣播型（VF0，只有體重）',
  Chipsea: 'Chipsea-BLE 連線型',
  WSS: '標準藍牙體重秤',
};
