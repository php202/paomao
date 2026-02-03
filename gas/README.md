# GAS 專案目錄說明

## 架構：只靠 Core 程式庫，不再複製到各專案

- **PaoMao_Core** 是共用程式碼來源（Config、Utils、LineBot、Odoo、SDapi、SayDou 等）。
- 其他專案的 `appsscript.json` 已掛 **Core 程式庫**（libraryId 指向 PaoMao_Core），直接呼叫 `Core.getCoreConfig()`、`Core.jsonResponse()`、`Core.getStoresInfo()` 等即可。
- **不再**把 Core 的檔案複製到各專案；維護共用程式碼請在 **PaoMao_Core** 內修改，並在 Apps Script 將 Core 專案「部署為程式庫」後，各專案即可使用新版本（若使用 `developmentMode: true` 則可即時更新）。

---

## Push 行為：只更新現有程式，不建立新版本

- **日常更新**：在對應專案資料夾內執行 `clasp push` 即可，只會更新該專案的程式碼，**不會**建立新的 Apps Script 版本。
- **不要**在例行 push 時執行 `clasp version` 或 `clasp deploy`，以免產生多餘版本。
- 若需要部署（deploy）到正式環境，請用現有版本號部署，例如：
  ```bash
  clasp deploy --versionNumber 1 --description "現有版本"
  ```
  或先 `clasp versions` 查出版本號，再用該版本 deploy。

---

## 各專案目錄對應

| 資料夾 | 說明 |
|--------|------|
| PaoMao_Core | 共用程式碼來源，需部署為程式庫供其他專案使用 |
| 日報表 產出 | 日報表 |
| 各店訊息一覽表 | 各店訊息 |
| 每週三：顧客退費 | 顧客退費 |
| 泡泡貓 門市 預約表單 PAOPAO | 門市預約表單 |
| 泡泡貓 員工打卡 Line@ | 員工打卡 |
| 泡泡貓拉廣告資料 | 拉廣告資料 |
| 最近的泡泡貓 | 最近的泡泡貓 |
| 請款表單內容 | 請款表單 |

每個專案目錄內：`clasp pull` 拉遠端、`clasp push` 推本地（不創新版本）。  
**資料夾名稱** = Apps Script 專案名稱（對照表與 scriptId 見 `GAS_PROJECTS.md`）。

---

## Debug / Test：每個專案都有 runDebugTest

- 每個專案目錄內都有一個 **DebugTest.js**，內含函式 **runDebugTest()**。
- 用途：快速檢查該專案是否可呼叫 Core（getCoreConfig 等）以及主要函式是否存在，方便除錯。
- 執行方式（擇一）：
  1. **指令列**（在該專案目錄下）：
     ```bash
     cd /Users/yutsunghan/node_express/gas/PaoMao_Core
     clasp run runDebugTest
     ```
  2. **Apps Script 編輯器**：開啟該專案 → 選函式 **runDebugTest** → 執行。
- 輸出會寫入 Logger（可在編輯器「檢視 → 紀錄」或 `clasp logs` 查看），並回傳一個結果物件（project 名稱、各項檢查 ok/error）。
- 可在各專案的 DebugTest.js 裡自行新增專案專用的測試邏輯。
- **不測試**：LINE reply（reply、sendLineReply）、SayDou 預約（createBooking、handleLineWebhook）等會實際影響客戶的函式，僅可做「存在檢查」、不要在此執行，以免發送訊息或建立預約。
- SayDou 其他 API（例如查詢時段、會員紀錄）可測試。

---

## 本機驗證與 Sheet 結構（validate.js、samples/）

- **本機跑驗證**：
  - **在專案根目錄 node_express 下**執行：`node gas/validate.js`
  - 若目前目錄**已在 gas**，請執行：`node validate.js`（勿在 gas 下執行 `node gas/validate.js`，會變成找 gas/gas/validate.js 而報錯）
  - 會檢查「各店訊息一覽表」內 `CustomerProfile.js` 的 `INTEGRATED_HEADERS`、`SayDouFullProfile.js` 的 `HEADERS` 以及 CONFIG 必要鍵是否符合預期；通過會顯示「全部通過」，未通過會列出差異。
- **預期結構說明**：`gas/samples/` 內有 `expected_客人消費狀態.md`、`expected_SayDou會員全貌.md`，說明兩張產出工作表的欄位。
- **看產出 Sheet 長什麼樣子**：在 Apps Script 編輯器（各店訊息一覽表專案）選函式 **debug_GetSheetSnapshots** 執行，到「檢視 → 紀錄」複製 JSON，可貼到本機 `gas/samples/actual_snapshots.json` 方便查看或讓我對照。詳見 `gas/samples/README.md`。
