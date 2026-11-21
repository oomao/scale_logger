# 家庭體重紀錄（scale_logger）

免費、沒有廣告的體脂秤紀錄 PWA，用來取代 OKOK 國際版 App。  
網址：https://oomao.github.io/scale_logger/

- 用 Web Bluetooth 讀 OKOK / 芯海（Chipsea）體脂秤
  - **廣播型**（大部分 OKOK 秤，C0 / V20 / V11 / VF0）：用 `requestLEScan` 收廣播，
    Android Chrome 要先打開 `chrome://flags/#enable-experimental-web-platform-features`
  - **可連線型**（Chipsea-BLE，FFF0）與標準體重服務（0x181D）：直接連線，不用開 flag
- 體脂、肌肉、水分、內臟脂肪、骨量、BMR、身體年齡：用體重＋阻抗依 openScale 整理的 OKOK 公式（OkOkV2Lib）即時計算；紀錄只存體重與阻抗
- 家人分開記錄、大字模式、JSON 備份／匯入、CSV 匯出、趨勢圖
- 資料只存在手機的 IndexedDB，沒有後端

協定與公式參考：[openScale](https://github.com/oliexdev/openScale)、[okokscale.py](https://github.com/rrooggiieerr/okokscale.py)。

```
npm install
npm run dev
npm test     # 封包解碼測試
```
