const SECTIONS: { title: string; items: string[] }[] = [
  { title: '開始', items: ['用 Android 手機的 Chrome 打開', 'Chrome 選單 →「安裝應用程式」放到主畫面', '「家人」頁新增名字，按「設定」填性別、出生年、身高'] },
  { title: '第一次：打開實驗功能', items: ['OKOK 體重計大多只廣播、不連線，Chrome 要開一個設定', '「量體重」頁照步驟複製網址、貼到 Chrome 網址列', 'Experimental Web Platform features 改成 Enabled，重新啟動 Chrome', '每支手機設定一次就好'] },
  { title: '量體重', items: ['按「開始量體重」，第一次會問能不能掃描藍牙，按允許', '赤腳站上去，腳踩在金屬片上', '數字停止閃爍後再多站幾秒，體脂才量得到', '存檔後如果是別人量的，點「這筆是誰的？」換人'] },
  { title: '報告與圖表', items: ['「報告」看最新一次的完整身體組成', '「紀錄」點任一筆看那天的報告', '「圖表」切換體重、體脂、肌肉的趨勢', '數值跟 OKOK App 可能差 1～3%，看趨勢最準'] },
  { title: '附近有別台秤？', items: ['第一次量到的那台會被記住，之後只收那台', '要換秤：「家人」頁 → 診斷資訊 →「忘記」'] },
  { title: '備份', items: ['紀錄只存在這支手機，不會上傳', '「家人」頁匯出備份檔，換手機時讀取', '可以匯出 CSV 用 Excel 打開'] },
];

export default function Help() {
  return (
    <div className="space-y-3">
      {SECTIONS.map((s) => (
        <section key={s.title} className="card">
          <h2 className="font-semibold">{s.title}</h2>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-gray-700 marker:text-brand dark:text-gray-300">
            {s.items.map((it) => <li key={it}>{it}</li>)}
          </ul>
        </section>
      ))}
      <p className="muted px-1 text-xs">v{__APP_VERSION__}・資料只存在你的手機・免費、沒有廣告・數值僅供參考，不能取代醫療診斷</p>
    </div>
  );
}
