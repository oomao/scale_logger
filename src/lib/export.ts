import { derive } from './derive';
import { getDb } from './store';

/** CSV（Excel 打得開，前面加 BOM 才不會亂碼） */
export function toCsv(memberId: string | null): string {
  const db = getDb();
  const head = ['日期時間', '家人', '體重kg', '阻抗Ω', 'BMI', '體脂率%', '脂肪kg', '肌肉kg', '骨骼肌率%', '體水分%', '骨量kg', '內臟脂肪', '基礎代謝kcal', '身體年齡', '來源'];
  const rows = db.recs
    .filter((r) => !memberId || r.memberId === memberId)
    .sort((a, b) => a.time - b.time)
    .map((r) => {
      const m = db.members.find((x) => x.id === r.memberId);
      const { c } = derive(r, m);
      const t = new Date(r.time);
      const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
      return [d, m?.name ?? '', r.kg, r.impedance ?? '', c?.bmi ?? '', c?.fatPct ?? '', c?.fatKg ?? '', c?.muscleKg ?? '', c?.skeletalPct ?? '', c?.waterPct ?? '', c?.boneKg ?? '', c?.visceral ?? '', c?.bmr ?? '', c?.bodyAge ?? '', r.source === 'manual' ? '手動' : '體重計'];
    });
  return '﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
