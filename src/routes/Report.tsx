import { Link, useParams } from 'react-router-dom';
import MemberPicker from '../components/MemberPicker';
import { bands, bodyType, level, type Band, type Level } from '../lib/bia';
import { derive, fakeImpedance, fmtKg } from '../lib/derive';
import { fmtDate } from '../lib/format';
import { ageAt, recsOf, useDb } from '../lib/store';

const LEVEL: Record<Level, [string, string]> = {
  low: ['偏低', 'text-sky-600 dark:text-sky-400'],
  ok: ['標準', 'text-emerald-600 dark:text-emerald-400'],
  high: ['偏高', 'text-orange-600 dark:text-orange-400'],
  veryHigh: ['過高', 'text-red-600 dark:text-red-400'],
};

/** 有標準範圍的項目：一條「偏低｜標準｜偏高」的橫條，標出現在的位置 */
function BandRow({ label, value, unit, band }: { label: string; value: number; unit: string; band: Band }) {
  const lv = level(value, band);
  const top = band.hi2 ? band.hi2 + (band.hi2 - band.lo) * 0.4 : band.hi + (band.hi - band.lo) * 0.8;
  const bottom = Math.max(0, band.lo - (band.hi - band.lo) * 0.8);
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - bottom) / (top - bottom)) * 100));
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between">
        <span>{label}</span>
        <span>
          <b className="text-xl">{value}</b>
          <span className="text-sm text-gray-500">{unit}</span>
          <span className={`ml-2 text-sm font-semibold ${LEVEL[lv][1]}`}>{LEVEL[lv][0]}</span>
        </span>
      </div>
      <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-sky-200 dark:bg-sky-900">
        <div className="absolute inset-y-0 bg-emerald-300 dark:bg-emerald-800" style={{ left: pct(band.lo) + '%', width: pct(band.hi) - pct(band.lo) + '%' }} />
        <div className="absolute inset-y-0 right-0 bg-orange-300 dark:bg-orange-900" style={{ left: pct(band.hi) + '%' }} />
        {band.hi2 && <div className="absolute inset-y-0 right-0 bg-red-300 dark:bg-red-900" style={{ left: pct(band.hi2) + '%' }} />}
        <div className="absolute -top-0.5 h-4 w-1.5 -translate-x-1/2 rounded bg-gray-900 dark:bg-white" style={{ left: pct(value) + '%' }} />
      </div>
      <div className="mt-0.5 text-right text-[11px] text-gray-500 dark:text-gray-400">
        標準 {band.label ?? `${band.lo}～${band.hi}`}{band.unit}（{band.src}）
      </div>
    </div>
  );
}

export default function Report() {
  const db = useDb();
  const { id } = useParams();
  const rec = id ? db.recs.find((r) => r.id === id) : recsOf(db, db.current).pop();

  if (!rec) {
    return (
      <div className="space-y-3">
        {!id && <MemberPicker />}
        <section className="card text-center">
          <p>{id ? '找不到這筆紀錄。' : '還沒有量測紀錄。'}</p>
          <Link to="/" className="btn-primary mt-3">去量體重</Link>
        </section>
      </div>
    );
  }

  const m = db.members.find((x) => x.id === rec.memberId);
  const { p, c, fromScale } = derive(rec, m);
  const mine = recsOf(db, rec.memberId);
  const prev = mine.filter((r) => r.time < rec.time).pop();
  const prevD = prev ? derive(prev, m).c : null;
  const delta = (a?: number, b?: number) => (a == null || b == null ? null : Math.round((a - b) * 10) / 10);
  const dKg = prev ? delta(rec.kg, prev.kg) : null;

  return (
    <div className="space-y-3">
      {!id && <MemberPicker />}

      <section className="card">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{m?.name ?? '（已刪除）'}的身體報告</h2>
          <span className="muted">{fmtDate(rec.time)}</span>
        </div>
        <p className="mt-2 text-5xl font-bold tabular-nums">
          {fmtKg(rec.kg)}<span className="ml-1 text-xl font-normal text-gray-500">kg</span>
          {dKg != null && dKg !== 0 && (
            <span className={`ml-3 text-lg font-semibold ${dKg > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{dKg > 0 ? '▲' : '▼'} {Math.abs(dKg)}</span>
          )}
        </p>
        {c && (
          <p className="muted mt-1">
            理想體重 {c.idealKg} kg（BMI 22）・
            {Math.abs(rec.kg - c.idealKg) < 0.5 ? '剛好' : rec.kg > c.idealKg ? `多 ${(rec.kg - c.idealKg).toFixed(1)} kg` : `少 ${(c.idealKg - rec.kg).toFixed(1)} kg`}
          </p>
        )}
        {c && p && bodyType(p, c) && (
          <p className="mt-2 inline-block rounded-full bg-brand/10 px-3 py-1 font-semibold text-brand dark:bg-brand-light/10 dark:text-brand-light">身體類型：{bodyType(p, c)}</p>
        )}
      </section>

      {!p && (
        <Link to="/family" state={{ edit: rec.memberId }} className="block rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
          ✏️ 填好{m?.name}的性別、身高、出生年，就能看 BMI、體脂、肌肉等完整報告 ›
        </Link>
      )}

      {c && p && (
        <section className="card divide-y divide-gray-100 dark:divide-gray-800">
          <BandRow label="BMI" value={c.bmi} unit="" band={bands(p).bmi} />
          {c.fatPct != null && <BandRow label="體脂率" value={c.fatPct} unit="%" band={bands(p).fatPct} />}
          {c.visceral != null && <BandRow label="內臟脂肪等級" value={c.visceral} unit="" band={bands(p).visceral} />}
          {c.waterPct != null && <BandRow label="體水分" value={c.waterPct} unit="%" band={bands(p).waterPct} />}
        </section>
      )}

      {c && (
        <section className="card">
          <h3 className="mb-2 font-semibold">身體組成</h3>
          <div className="grid grid-cols-2 gap-2">
            {([
              ['脂肪重', c.fatKg, 'kg', prevD?.fatKg],
              ['去脂體重', c.leanKg, 'kg', prevD?.leanKg],
              ['肌肉量', c.muscleKg, 'kg', prevD?.muscleKg],
              ['骨骼肌率', c.skeletalPct, '%', prevD?.skeletalPct],
              ['蛋白質', c.proteinPct, '%', prevD?.proteinPct],
              ['骨量', c.boneKg, 'kg', prevD?.boneKg],
              ['基礎代謝', c.bmr, '大卡', prevD?.bmr],
              ['身體年齡', c.bodyAge, '歲', undefined],
            ] as [string, number | undefined, string, number | undefined][]).filter(([, v]) => v != null).map(([k, v, u, pv]) => {
              const d = delta(v, pv);
              return (
                <div key={k} className="rounded-xl bg-stone-100 px-3 py-2 dark:bg-gray-800">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{k}</div>
                  <div className="text-xl font-semibold">
                    {v}<span className="ml-0.5 text-xs font-normal text-gray-500">{u}</span>
                    {d != null && d !== 0 && <span className="ml-2 text-xs font-normal text-gray-500">{d > 0 ? '+' : ''}{d}</span>}
                  </div>
                  {k === '身體年齡' && ageAt(m, rec.time) != null && (
                    <div className="text-[11px] text-gray-500">實際 {ageAt(m, rec.time)} 歲</div>
                  )}
                </div>
              );
            })}
          </div>
          {c.fatPct == null && <p className="muted mt-2">這筆沒有阻抗（手動輸入、只量體重的秤，或沒赤腳），只算得出 BMI 和基礎代謝。</p>}
        </section>
      )}

      {fakeImpedance(mine) && (
        <p className="rounded-2xl border border-orange-300 bg-orange-50 p-3 text-sm dark:border-orange-700 dark:bg-orange-950/40">
          ⚠️ 最近幾次的阻抗值都一模一樣（{rec.impedance} Ω），體重變了它卻沒變。有些便宜的體重計會送固定的假阻抗，這種情況體脂、肌肉只是用身高體重估的，參考就好。
        </p>
      )}

      <p className="muted px-1 text-xs">
        {fromScale ? '體脂等數值是體重計自己算的。' : '體脂等數值是用體重＋阻抗，照 OKOK App 的公式（開源專案 openScale 整理）算的，跟 OKOK 顯示的可能差 1～3%。'}
        看長期趨勢比單次數字準；同一個時間（例如早上起床上完廁所）赤腳量最穩定。不能取代醫療診斷。
        {rec.impedance ? ` 阻抗 ${rec.impedance} Ω。` : ''}
      </p>
    </div>
  );
}
