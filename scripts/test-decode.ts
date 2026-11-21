// 解碼器的小測試：npm test（Node 22.6+ 直接跑 TypeScript）
import { ChipseaParser, chipseaUserSync, decodeAdvert, decodeWeightMeasurement } from '../src/lib/decode.ts';
import { compose } from '../src/lib/bia.ts';

let fail = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`));
};
const bytes = (s: string) => Uint8Array.from(s.trim().split(/\s+/), (x) => parseInt(x, 16));

// openScale issue #1452 的真實 C0 封包：67.85 kg、500.0 Ω、穩定
const c0 = decodeAdvert(0x37c0, bytes('1a 81 13 88 00 00 25 50 fb 19 12 34 56'))!;
eq('C0 kg', c0.kg, 67.85);
eq('C0 impedance', c0.impedance, 500);
eq('C0 stable', c0.stable, true);
eq('C0 seq', c0.seq, 0x37);
eq('C0 mac', c0.mac, '50:FB:19:12:34:56');
eq('C0 measuring (0x24)', decodeAdvert(0x37c0, bytes('1a 81 00 00 00 00 24 50 fb 19 12 34 56'))!.stable, false);
eq('C0 /10 kg', decodeAdvert(0x01c0, bytes('02 a5 00 00 00 00 01 00 00 00 00 00 00'))!.kg, 67.7);
eq('C0 encrypted impedance', decodeAdvert(0x01c0, bytes('1a 81 93 88 00 00 25 00 00 00 00 00 00'))!.impedance, null);
eq('C0 too short', decodeAdvert(0x01c0, bytes('1a 81 13 88')), null);

// V20：自己組一個合法封包
const v20 = bytes('00 00 00 00 00 00 05 00 1a 81 13 88 00 00 00 00 00 00 00');
let x = 0x20; for (let i = 0; i < 12; i++) x ^= v20[i]; v20[12] = x;
const r20 = decodeAdvert(0x20ca, v20)!;
eq('V20', [r20.kg, r20.impedance, r20.stable], [67.85, 500, true]);
v20[12] ^= 1;
eq('V20 bad checksum', decodeAdvert(0x20ca, v20), null);

eq('VF0', decodeAdvert(0xf0ff, bytes('00 00 a5 02'))!.kg, 67.7);
eq('unknown company', decodeAdvert(0x004c, bytes('02 15 00 00')), null);

// Chipsea-BLE 單封包：鎖定、一位小數、體脂 22.5%
const p = new ChipseaParser();
const f = p.feed(bytes('ca 10 0e 01 01 02 a5 00 e1 02 3a 01 f4 05 dc 00 5a 1e 00 00'))!;
eq('Chipsea kg', f.kg, 67.7);
eq('Chipsea calc', f.scale, { fat: 22.5, water: 57, muscle: 50, bmr: 1500, visceral: 9, bone: 3 });
eq('Chipsea v1.1 simple unlocked', p.feed(bytes('ca 11 0a 00 00 02 a5 00 00 00 00 00'))!.stable, false);

const sync = chipseaUserSync(1, true, 40, 170, new Date(2026, 10, 21, 9, 5, 0));
eq('sync header', Array.from(sync.slice(0, 10)), [0xca, 0x10, 14, 1, 26, 11, 21, 9, 5, 0]);
let sx = 0; for (let i = 1; i <= 16; i++) sx ^= sync[i];
eq('sync checksum', sync[17], sx);

eq('WSS 2A9D', decodeWeightMeasurement(bytes('00 e4 34'))!.kg, 67.7);

// 身體組成：男 40 歲 170 cm、67.85 kg、500 Ω
const c = compose({ sex: 'M', height: 170, age: 40 }, 67.85, 500);
console.log('compose', c);
eq('BMI', c.bmi, 23.5);
eq('fat% in range', c.fatPct! > 10 && c.fatPct! < 30, true);
eq('no impedance → no fat', compose({ sex: 'F', height: 160, age: 60 }, 55, null).fatPct, undefined);

console.log(fail ? `\n${fail} 項失敗` : '\n全部通過');
process.exit(fail ? 1 : 0);
