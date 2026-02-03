# runDebugTest 檢查報告

## 0. Core 程式庫驗證（放在 DebugTest 最前面）

專案 **日報表 產出、各店訊息一覽表、每週三：顧客退費…** 等（非 PaoMao_Core）的 `runDebugTest()` 開頭已加上 **Core 程式庫檢查**：一次列出多個 `Core.xxx` 函式是否為 `function`，跑一次就能驗證「有沒有拉到 Core」。

- 檢查項目（依專案略有增減）：`Core.getCoreConfig`、`Core.getLineSayDouInfoMap`、`Core.getStoresInfo`、`Core.jsonResponse`、`Core.getBankInfoMap`、`Core.getBearerTokenFromSheet`、`Core.sendLineReply`、`Core.sendLineReplyObj` 等。
- 若 **Core 未載入** 或某個函式不存在，該項會標示 `ok: false`，方便快速排查。
- 執行後在「檢視 → 紀錄」看 JSON 輸出，先看 `Core.xxx` 那幾項是否都 `ok: true`，即可確認 Core 有拉到。

---

## 1. 實際執行結果（clasp push / clasp run）

- **Apps Script API 已啟用**：已在 https://script.google.com/home/usersettings 開啟 API，**clasp push** 可正常使用（例如 PaoMao_Core 已驗證 push 成功）。
- **clasp run** 若要從指令列遠端執行 `runDebugTest`，需**額外**完成「部署為 API 可執行」：
  - 在 [Apps Script 編輯器](https://script.google.com) 開啟該專案 → **發佈** → **部署為 API 可執行**（並依畫面建立部署）。
  - 未做此部署時，執行 `clasp run runDebugTest` 會出現：`Script function not found. Please make sure script is deployed as API executable.`

**本機 vs 網站：**

| 方式 | 本機用 `clasp run runDebugTest` | 在網站上執行 |
|------|-------------------------------|--------------|
| 要不要多做事 | 要。需在編輯器對該專案做「發佈 → 部署為 API 可執行」一次 | 不用。直接開專案選 runDebugTest 執行即可 |
| 目前狀況 | 會出現：`Script function not found. Please make sure script is deployed as API executable.` | 可用，建議用這個 |

**建議操作（最快）：**

1. **在網站上跑**（不用額外設定）  
   - 開 [script.google.com](https://script.google.com) → 選要測的專案（例如 PaoMao_Core 或 各店訊息一覽表）  
   - 上方函式選 **runDebugTest** → 按 **執行**（▶）  
   - 下方「檢視 → 紀錄」看 JSON，確認 `Core.xxx` 等項是否 `ok: true`

2. **想在本機用 `clasp run` 再設**  
   - 在編輯器對該專案：**發佈** → **部署為 API 可執行** → 依畫面建立部署  
   - 之後在該專案目錄執行：`clasp run runDebugTest` 即可從本機跑

---

## 2. 靜態檢查：各專案 DebugTest 檢查的函式是否存在

已對照各專案程式碼，**DebugTest 裡檢查的函式在該專案中都有定義**，沒有「檢查了不存在的函式」或名稱打錯的問題。

| 專案 | 檢查的函式 | 狀態 |
|------|------------|------|
| PaoMao_Core | getCoreConfig, getBankInfoMap, getLineSayDouInfoMap, getStoresInfo, clearMyCache | ✅ 皆存在 |
| 日報表 產出 | getCoreConfig, outputJSON, doPost, handleCheckInAPI, handleBindSession | ✅ 皆存在 |
| 各店訊息一覽表 | getCoreConfig, getLineSayDouInfoMap, todayReservation, appointmentLists, onOpen | ✅ 皆存在 |
| 每週三：顧客退費 | getCoreConfig, runReservationReport, storeData, dailyCheckAndPush, onOpen, doPost, compareSalesData, gogoshopStocksReport | ✅ 皆存在 |
| 泡泡貓 門市 預約表單 PAOPAO | getCoreConfig, onOpen, main, payToReceipt, payToEmployee, achP01, exportToExcelWithFilter, cleanupTempSheets | ✅ 皆存在 |
| 泡泡貓 員工打卡 Line@ | getCoreConfig, onOpen, runAccNeed | ✅ 皆存在 |
| 泡泡貓拉廣告資料 | getCoreConfig, onOpen, getPhonesFromSheet, cleanupTempSheets, exportToExcelWithFilter, refund | ✅ 皆存在 |
| 最近的泡泡貓 | getCoreConfig, doGet, getStoreData, errorData | ✅ 皆存在（皆在 程式碼.js） |
| 請款表單內容 | getCoreConfig, doPost, doGet, getSlots, totalMoney, getList, checkMember, handleDelete, getStoreConfig, findStoreConfig | ✅ 皆存在 |

**結論：** 依目前程式碼，不需要為了「通過 runDebugTest」而改 DebugTest.js 或補函式；只要 push 成功並能執行 runDebugTest，預期檢查都會通過。

---

## 3. 若之後執行 runDebugTest 有錯誤

- **Core 未載入 / getCoreConfig 等找不到**：確認該專案 `appsscript.json` 已掛 **Core 程式庫**（libraryId 指向 PaoMao_Core），且 PaoMao_Core 已部署為程式庫。
- **請款表單內容 的 doGet**：使用 `Core.jsonResponse`，需依賴 Core 程式庫。

---

## 4. 路徑有空格或特殊字元時

在終端機對 **最近的泡泡貓**、**泡泡貓 員工打卡 Line@** 等資料夾下指令時，路徑請用引號，例如：

```bash
cd "/Users/yutsunghan/node_express/gas/最近的泡泡貓"
clasp push
clasp run runDebugTest
```

路徑若少引號會出現 `unmatched "` 或指令錯誤。
