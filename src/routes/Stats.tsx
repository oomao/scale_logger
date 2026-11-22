import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import MemberPicker from '../components/MemberPicker';
import { derive } from '../lib/derive';
import { recsOf, useDb } from '../lib/store';
import type { Composition } from '../lib/bia';

type Key = 'kg' | 'fatPct' | 'muscleKg' | 'bmi' | 'visceral' | 'waterPct';
const METRICS: { key: Key; label: string; unit: string }[] = [
  { key: 'kg', label: '體重', unit: 'kg' },
  { key: 'fatPct', label: '體脂率', unit: '%' },
  { key: 'muscleKg', label: '肌肉量', unit: 'kg' },
  { key: 'bmi', label: 'BMI', unit: '' },
  { key: 'visceral', label: '內臟脂肪', unit: '' },
  { key: 'waterPct', label: '體水分', unit: '%' },
];
const RANGES = [
  { label: '1 個月', days: 31 },
  { label: '3 個月', days: 92 },
  { label: '1 年', days: 366 },
  { label: '全部', days: Infinity },
];
const DAY = 86400000;

export default function Stats() {
  const db = useDb();
  const [key, setKey] = useState<Key>('kg');
  const [range, setRange] = useState(1);
  const me = db.members.find((m) => m.id === db.current);
  const since = Date.now() - RANGES[range].days * DAY;
  const metric = METRICS.find((x) => x.key === key)!;

  // 同一天量好幾次只取最後一次，線比較乾淨
  const byDay = new Map<string, { time: number; v: number }>();
  for (const r of recsOf(db, db.current)) {
    if (r.time < since) continue;
    const c = derive(r, me).c;
    const v = key === 'kg' ? r.kg : (c?.[key as keyof Composition] as number | undefined);
    if (v == null) continue;
    byDay.set(new Date(r.time).toDateString(), { time: r.time, v });
  }
  const data = [...byDay.values()];
  const first = data[0], last = data[data.length - 1];
  const change = first && last && data.length > 1 ? Math.round((last.v - first.v) * 100) / 100 : null;
  const vals = data.map((d) => d.v);
  const ideal = key === 'kg' && me?.height ? Math.round(22 * (me.height / 100) ** 2 * 10) / 10 : null;
  const fmt = (t: number) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()}`; };

  return (
    <div className="space-y-3">
      <MemberPicker />
      <div className="flex flex-wrap gap-2">
        {METRICS.map((x) => <button key={x.key} className={x.key === key ? 'chip-on' : 'chip'} onClick={() => setKey(x.key)}>{x.label}</button>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {RANGES.map((x, i) => <button key={x.label} className={i === range ? 'chip-on btn-sm' : 'chip btn-sm'} onClick={() => setRange(i)}>{x.label}</button>)}
      </div>

      <section className="card">
        {data.length < 2 ? (
          <p className="muted py-10 text-center">
            {data.length ? '再量一次就能畫出趨勢。' : key === 'kg' ? '這段期間沒有紀錄。' : `這段期間沒有${metric.label}資料（要填好家人資料，並用體重計赤腳量）。`}
          </p>
        ) : (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 text-sm">
              <span>變化 <b className={change! > 0 ? 'text-orange-600' : 'text-emerald-600'}>{change! > 0 ? '+' : ''}{key === 'kg' ? change!.toFixed(2) : change}{metric.unit}</b></span>
              <span className="muted">最低 {Math.min(...vals)}・最高 {Math.max(...vals)}</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#8884" />
                  <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmt} fontSize={11} />
                  <YAxis domain={['auto', 'auto']} fontSize={11} tickFormatter={key === 'kg' ? (v: number) => v.toFixed(1) : undefined} />
                  <Tooltip labelFormatter={(t) => new Date(t as number).toLocaleDateString('zh-TW')} formatter={(v) => [(key === 'kg' ? Number(v).toFixed(2) : v) + ' ' + metric.unit, metric.label]} />
                  {ideal && <ReferenceLine y={ideal} stroke="#10b981" strokeDasharray="4 4" label={{ value: '理想', fontSize: 11, fill: '#10b981', position: 'insideTopRight' }} />}
                  <Line type="monotone" dataKey="v" stroke="#0e7490" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
