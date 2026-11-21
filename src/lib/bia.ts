// 由體重＋阻抗算身體組成。公式是 openScale 從 OKOK App 反組譯整理出來的（OkOkV2Lib），
// 數值會跟 OKOK App 很接近，但不保證一模一樣（體脂可能差 1～3 個百分點）。
// 紀錄只存體重和阻抗，畫面上的組成數值都是即時算的，以後換公式舊紀錄也會跟著更新。

export type Sex = 'M' | 'F';
export interface Profile { sex: Sex; height: number; age: number }

export interface Composition {
  bmi: number;
  fatPct?: number;
  fatKg?: number;
  leanKg?: number;      // 去脂體重
  muscleKg?: number;    // 肌肉量（含水分）
  skeletalPct?: number; // 骨骼肌率
  waterPct?: number;
  boneKg?: number;
  visceral?: number;
  proteinPct?: number;
  bmr: number;
  bodyAge?: number;
  idealKg: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

export function compose(p: Profile, W: number, Z: number | null | undefined): Composition {
  const { height: H, age: A } = p;
  const male = p.sex === 'M';
  const bmi = W / (H / 100) ** 2;
  // 台灣衛福部：理想體重 = 22 × 身高(m)²
  const idealKg = 22 * (H / 100) ** 2;
  const bmr = male ? 66 + 13.7 * W + 5 * H - 6.8 * A : 655 + 9.6 * W + 1.8 * H - 4.7 * A;
  const base: Composition = { bmi: r1(bmi), bmr: Math.round(bmr), idealKg: r1(idealKg) };
  if (!Z || A < 10) return base;

  const fatMass = male
    ? -0.3315 * H + 0.6216 * W + 0.0183 * A + 0.0085 * Z + 22.554
    : -0.3332 * H + 0.7509 * W + 0.0196 * A + 0.0072 * Z + 22.7193;
  const fatPct = clamp((fatMass / W) * 100, 5, 45);
  const fatKg = (W * fatPct) / 100;

  let muscleKg: number;
  if (fatPct >= 45) muscleKg = W * 0.95 - 4;
  else if (fatPct <= 5) muscleKg = W * 0.95 - 1;
  else
    muscleKg = clamp(
      male ? 0.2867 * H + 0.3894 * W - 0.0408 * A - 0.01235 * Z - 15.7665 : 0.3186 * H + 0.1934 * W - 0.0206 * A - 0.0132 * Z - 16.4556,
      20, 70,
    );

  const skeletalKg = clamp(0.2573 * H + 0.1745 * W - 0.0161 * A + (male ? 2.4269 : 0) - 0.017 * Z - 20.2165, 20, 70);

  const waterKg = male
    ? 0.0939 * H + 0.3758 * W - 0.0032 * A - 0.006925 * Z + 0.097
    : 0.0877 * H + 0.2973 * W - 0.0128 * A - 0.00603 * Z + 0.5175;
  const waterPct = clamp((waterKg / W) * 100, 20, 85);

  const boneKg = clamp(W - fatKg - muscleKg, 1, 4);
  const visceral = clamp(
    male ? -0.2675 * H + 0.42 * W + 0.1462 * A + 0.0123 * Z + 13.9871 : -0.1651 * H + 0.2628 * W + 0.0649 * A + 0.0024 * Z + 12.3445,
    1, 60,
  );
  const proteinPct = ((muscleKg - (waterPct / 100) * W) / W) * 100;
  const bodyAge = clamp(
    Math.trunc(male ? -0.7471 * H + 0.9161 * W + 0.4184 * A + 0.0517 * Z + 54.2267 : -1.1165 * H + 1.5784 * W + 0.4615 * A + 0.0415 * Z + 83.2548),
    18, 80,
  );

  return {
    ...base,
    fatPct: r1(fatPct),
    fatKg: r1(fatKg),
    leanKg: r1(W - fatKg),
    muscleKg: r1(muscleKg),
    skeletalPct: r1((skeletalKg / W) * 100),
    waterPct: r1(waterPct),
    boneKg: r1(boneKg),
    visceral: Math.round(visceral),
    proteinPct: r1(proteinPct),
    bodyAge,
  };
}

// ---------- 標準範圍（給報告頁的「偏低 / 標準 / 偏高」） ----------
export type Level = 'low' | 'ok' | 'high' | 'veryHigh';
export interface Band { lo: number; hi: number; hi2?: number; unit: string; src: string; label?: string }

export function bands(p: Profile): Record<'bmi' | 'fatPct' | 'visceral' | 'waterPct', Band> {
  const male = p.sex === 'M';
  const young = p.age < 30;
  return {
    // 衛福部國健署：18.5 ≤ BMI < 24 正常，24～27 過重，≥ 27 肥胖
    bmi: { lo: 18.5, hi: 24, hi2: 27, unit: '', src: '國健署' },
    // 國健署體脂肪率參考：男 30 歲以下 14–20%、以上 17–23%；女 30 歲以下 17–24%、以上 20–27%
    fatPct: male ? (young ? { lo: 14, hi: 20, hi2: 25, unit: '%', src: '國健署' } : { lo: 17, hi: 23, hi2: 25, unit: '%', src: '國健署' })
      : (young ? { lo: 17, hi: 24, hi2: 30, unit: '%', src: '國健署' } : { lo: 20, hi: 27, hi2: 30, unit: '%', src: '國健署' }),
    // 內臟脂肪等級：1–9 標準、10–14 偏高、15 以上過高（體脂計常用分級）
    visceral: { lo: 1, hi: 10, hi2: 15, unit: '', src: '體脂計常用分級', label: '1～9' },
    // 體水分率：男 55–65%、女 45–60%（一般參考值）
    waterPct: male ? { lo: 55, hi: 65, unit: '%', src: '一般參考值' } : { lo: 45, hi: 60, unit: '%', src: '一般參考值' },
  };
}

export function level(v: number, b: Band): Level {
  if (v < b.lo) return 'low';
  if (v < b.hi) return 'ok';
  if (b.hi2 != null && v >= b.hi2) return 'veryHigh';
  return 'high';
}

/** 身體類型：用 BMI 和體脂率的九宮格（InBody 類報告常見） */
export function bodyType(p: Profile, c: Composition): string | null {
  if (c.fatPct == null) return null;
  const b = bands(p);
  const f = c.fatPct < b.fatPct.lo ? 0 : c.fatPct < b.fatPct.hi ? 1 : 2;
  const m = c.bmi < 18.5 ? 0 : c.bmi < 24 ? 1 : 2;
  return [
    ['偏瘦', '纖瘦標準', '精實肌肉型'],
    ['偏瘦', '標準', '健壯肌肉型'],
    ['隱性肥胖（泡芙人）', '隱性肥胖（泡芙人）', '肥胖'],
  ][f][m];
}
