// 由體重＋阻抗算身體組成。主體是 openScale 從 OKOK App 反組譯整理出來的公式（OkOkV2Lib），
// 2026-11 拿使用者 OKOK 國際版的實際畫面對過：體脂、肌肉、骨骼肌、骨量、內臟脂肪、肥胖度完全一致；
// 新版 OKOK 的水分、基礎代謝跟舊公式不同，改成用那筆資料校正過的版本（見下方註解）。
// 紀錄只存體重和阻抗，畫面上的組成數值都是即時算的，以後換公式舊紀錄也會跟著更新。

export type Sex = 'M' | 'F';
export interface Profile { sex: Sex; height: number; age: number }

export interface Composition {
  bmi: number;
  fatPct?: number;
  fatKg?: number;
  leanKg?: number;      // 去脂體重
  muscleKg?: number;    // 肌肉量（含水分）
  musclePct?: number;
  skeletalKg?: number;  // 骨骼肌重
  skeletalPct?: number; // 骨骼肌率
  waterPct?: number;
  waterKg?: number;
  boneKg?: number;
  visceral?: number;
  proteinPct?: number;
  bmr: number;
  bodyAge?: number;
  idealKg: number;
  /** 肥胖度 %：(體重 − 標準體重) ÷ 標準體重，標準體重男 (身高−80)×0.7、女 (身高−70)×0.6（跟 OKOK 一樣） */
  obesity: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function compose(p: Profile, W: number, Z: number | null | undefined): Composition {
  const { height: H, age: A } = p;
  const male = p.sex === 'M';
  const bmi = W / (H / 100) ** 2;
  // 台灣衛福部：理想體重 = 22 × 身高(m)²
  const idealKg = 22 * (H / 100) ** 2;
  // 基礎代謝：新版 OKOK 不是舊的 Harris-Benedict（算出來差 130 大卡），
  // Mifflin-St Jeor 跟它只差 2 大卡（OKOK 用生日算到小數點的年齡，這裡只有出生年）
  const bmr = 10 * W + 6.25 * H - 5 * A + (male ? 5 : -161);
  const stdKg = male ? (H - 80) * 0.7 : (H - 70) * 0.6;
  const base: Composition = { bmi: r1(bmi), bmr: Math.round(bmr), idealKg: r1(idealKg), obesity: r1(((W - stdKg) / stdKg) * 100) };
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

  // 體水分：舊公式比新版 OKOK 低 2 個百分點；新版的數字剛好是去脂體重的 79.24%
  // （OKOK 畫面：水份 46.6%、水含量 31.9 kg、蛋白質 8.1%，三個一起對得上）
  const waterPct = clamp(((W - fatKg) * 0.7924 / W) * 100, 20, 85);
  const waterKg = (W * waterPct) / 100;

  const boneKg = clamp(W - fatKg - muscleKg, 1, 4);
  const visceral = clamp(
    male ? -0.2675 * H + 0.42 * W + 0.1462 * A + 0.0123 * Z + 13.9871 : -0.1651 * H + 0.2628 * W + 0.0649 * A + 0.0024 * Z + 12.3445,
    1, 60,
  );
  const proteinPct = ((muscleKg - waterKg) / W) * 100;
  const bodyAge = clamp(
    Math.trunc(male ? -0.7471 * H + 0.9161 * W + 0.4184 * A + 0.0517 * Z + 54.2267 : -1.1165 * H + 1.5784 * W + 0.4615 * A + 0.0415 * Z + 83.2548),
    18, 80,
  );

  return {
    ...base,
    fatPct: r1(fatPct),
    fatKg: r1(fatKg),
    leanKg: r2(W - fatKg),
    muscleKg: r1(muscleKg),
    musclePct: r1((muscleKg / W) * 100),
    skeletalKg: r1(skeletalKg),
    skeletalPct: r1((skeletalKg / W) * 100),
    waterPct: r1(waterPct),
    waterKg: r1(waterKg),
    boneKg: r2(boneKg),
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
    // 體水分率：男 55–65%、女 50–60%（OKOK 把女性 46.6% 判為偏低）
    waterPct: male ? { lo: 55, hi: 65, unit: '%', src: '一般參考值' } : { lo: 50, hi: 60, unit: '%', src: '一般參考值' },
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

// ---------- 其他項目的評語（OKOK 清單上每一項旁邊的「偏低 / 標準 / 優」） ----------
export type Tone = 'low' | 'ok' | 'good' | 'high' | 'veryHigh';
export type Rating = [label: string, tone: Tone];
const lowOkGood = (v: number, lo: number, hi: number): Rating => (v < lo ? ['偏低', 'low'] : v <= hi ? ['標準', 'ok'] : ['優', 'good']);

export function ratings(p: Profile, c: Composition, W: number): Partial<Record<keyof Composition, Rating>> {
  const male = p.sex === 'M';
  const H = p.height;
  const out: Partial<Record<keyof Composition, Rating>> = {};
  const b = bands(p);
  if (c.fatPct != null) {
    const lv = level(c.fatPct, b.fatPct);
    out.fatKg = [{ low: '偏低', ok: '標準', high: '偏高', veryHigh: '過高' }[lv], lv];
  }
  if (c.skeletalPct != null) {
    // 骨骼肌率參考：男 33.3–39.3%、女 24.3–30.3%（Omron 分級），高於標準是好事
    out.skeletalPct = male ? lowOkGood(c.skeletalPct, 33.3, 39.3) : lowOkGood(c.skeletalPct, 24.3, 30.3);
    out.skeletalKg = out.skeletalPct;
  }
  if (c.muscleKg != null) {
    // 肌肉量依身高的標準範圍（體脂計常用表）
    const [lo, hi] = male
      ? H < 160 ? [38.5, 46.5] : H <= 170 ? [44, 52.4] : [49.4, 59.4]
      : H < 150 ? [29.1, 34.7] : H <= 160 ? [32.9, 37.5] : [36.5, 42.5];
    out.muscleKg = lowOkGood(c.muscleKg, lo, hi);
    out.musclePct = out.muscleKg;
  }
  if (c.waterPct != null) {
    const lv = level(c.waterPct, b.waterPct);
    out.waterKg = [lv === 'low' ? '偏低' : lv === 'ok' ? '標準' : '偏高', lv === 'ok' ? 'ok' : lv === 'low' ? 'low' : 'high'];
  }
  if (c.boneKg != null) {
    // 骨量標準值依體重（體脂計常用表），±0.1 kg 內算標準
    const std = male ? (W < 60 ? 2.5 : W <= 75 ? 2.9 : 3.2) : (W < 45 ? 1.8 : W <= 60 ? 2.2 : 2.5);
    out.boneKg = lowOkGood(c.boneKg, std - 0.1, std + 0.1);
  }
  if (c.proteinPct != null) out.proteinPct = lowOkGood(c.proteinPct, 16, 20);
  // 肥胖度：±10% 標準，10–20% 過重，20–30% 輕度、30–50% 中度、50% 以上重度肥胖
  const o = c.obesity;
  out.obesity = o < -10 ? ['偏瘦', 'low'] : o <= 10 ? ['標準', 'ok'] : o <= 20 ? ['過重', 'high'] : o <= 30 ? ['輕度肥胖', 'high'] : o <= 50 ? ['中度肥胖', 'veryHigh'] : ['重度肥胖', 'veryHigh'];
  if (c.bodyAge != null) out.bodyAge = c.bodyAge <= p.age ? ['比實際年輕', 'good'] : ['比實際老', 'high'];
  return out;
}
