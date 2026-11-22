// 一筆紀錄 → 畫面上要顯示的數值（組成是即時算的，不存在紀錄裡）
import { compose, type Composition, type Profile } from './bia';
import { profileOf, type Member, type Rec } from './store';

export interface Derived { p: Profile | null; c: Composition | null; fromScale: boolean; assumedZ: boolean }

/** OKOK 秤送的固定阻抗。沒有阻抗的紀錄（手動輸入）也用這個值估，跟 OKOK 的做法一樣 */
export const DEFAULT_Z = 500;

export function derive(r: Rec, m: Member | undefined): Derived {
  const p = profileOf(m, r.time);
  if (!p) return { p, c: null, fromScale: false, assumedZ: false };
  const assumedZ = !r.impedance;
  const c = compose(p, r.kg, r.impedance || DEFAULT_Z);
  // 可連線型秤自己算好的數值優先（那是秤廠的演算法）
  const s = r.scale;
  if (s?.fat) {
    c.fatPct = s.fat;
    c.fatKg = Math.round(r.kg * s.fat) / 100;
    c.leanKg = Math.round((r.kg - c.fatKg) * 10) / 10;
    if (s.water) { c.waterPct = s.water; c.waterKg = Math.round(r.kg * s.water / 10) / 10; }
    if (s.muscle) { c.muscleKg = Math.round(r.kg * s.muscle) / 100; c.musclePct = s.muscle; }
    if (s.bmr) c.bmr = s.bmr;
    if (s.visceral) c.visceral = s.visceral;
    if (s.bone) c.boneKg = s.bone;
    return { p, c, fromScale: true, assumedZ: false };
  }
  return { p, c, fromScale: false, assumedZ };
}

/** 秤一直送同一個阻抗（OKOK 秤是固定 500 Ω）：體脂等數字其實只是用身高體重年齡估的 */
export function fakeImpedance(recs: Rec[]): boolean {
  const z = recs.filter((r) => r.impedance).slice(-5).map((r) => r.impedance);
  const kg = recs.filter((r) => r.impedance).slice(-5).map((r) => r.kg);
  return z.length >= 3 && z.every((v) => v === z[0]) && Math.max(...kg) - Math.min(...kg) >= 0.5;
}

// 0.05 kg 精度的秤顯示兩位小數，其他一位
export const fmtKg = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v * 10 - Math.round(v * 10)) > 1e-6 ? v.toFixed(2) : v.toFixed(1));
