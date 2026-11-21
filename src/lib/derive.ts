// 一筆紀錄 → 畫面上要顯示的數值（組成是即時算的，不存在紀錄裡）
import { compose, type Composition, type Profile } from './bia';
import { profileOf, type Member, type Rec } from './store';

export interface Derived { p: Profile | null; c: Composition | null; fromScale: boolean }

export function derive(r: Rec, m: Member | undefined): Derived {
  const p = profileOf(m, r.time);
  if (!p) return { p, c: null, fromScale: false };
  const c = compose(p, r.kg, r.impedance);
  // 可連線型秤自己算好的數值優先（那是秤廠的演算法）
  const s = r.scale;
  if (s?.fat) {
    c.fatPct = s.fat;
    c.fatKg = Math.round(r.kg * s.fat) / 100;
    c.leanKg = Math.round((r.kg - c.fatKg) * 10) / 10;
    if (s.water) c.waterPct = s.water;
    if (s.muscle) c.muscleKg = Math.round(r.kg * s.muscle) / 100;
    if (s.bmr) c.bmr = s.bmr;
    if (s.visceral) c.visceral = s.visceral;
    if (s.bone) c.boneKg = s.bone;
    return { p, c, fromScale: true };
  }
  return { p, c, fromScale: false };
}

/** 很多便宜的秤會一直送同一個假阻抗（例如 500 Ω），這種體脂沒有參考價值 */
export function fakeImpedance(recs: Rec[]): boolean {
  const z = recs.filter((r) => r.impedance).slice(-5).map((r) => r.impedance);
  const kg = recs.filter((r) => r.impedance).slice(-5).map((r) => r.kg);
  return z.length >= 3 && z.every((v) => v === z[0]) && Math.max(...kg) - Math.min(...kg) >= 0.5;
}

// 0.05 kg 精度的秤顯示兩位小數，其他一位
export const fmtKg = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v * 10 - Math.round(v * 10)) > 1e-6 ? v.toFixed(2) : v.toFixed(1));
