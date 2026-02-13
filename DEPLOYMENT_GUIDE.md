# GAS 部署對照與 ship 調整建議

## 一、請先確認您的表格資料

您提供的表格有欄位：**名稱**、**id**、**部署id**、**網址**。請將表格內容（或截圖可讀版）對照下方，確認各專案的 **部署 ID** 是否與 package.json 一致。

---

## 二、本機 package.json 現有 deploy 設定（已依表格調整）

| 專案 | deploy -i | 用途 |
|------|-----------|------|
| PaoMao_Core | `AKfycby5ibTcUxvPD-Xj1-lOHOJ5oI27CbyyaHv2K3cvNd1PwMiPvwGCpjlzi6UbW4fwip2UaA` | Core API（**不可變**） |
| 泡泡貓 員工打卡 Line@ | `AKfycby4JvdNSueVmq1_gG-mrRL0IfR4kPm1nX2itxMDg1c7MWIvEgP2xd7rmSfoxmM3Lung2w` | LINE Webhook（**不可變**） |
| 各店訊息一覽表 | `AKfycbzY1xtm_Y6JKDTgf_qDXHJHDCs5ucrLk0qqX0J4Do2_y8A4JO7VJ_aBiL_HbzLk_ZkN` | Web App（linebot、odoo 等呼叫） |
| 泡泡貓 門市 預約表單 PAOPAO | `AKfycbylWApG-4rne8crGM8CxfN_BIjNvZt4U9KU6RNigzj7ploTEm84p2JmZwLTMFlLMQBp` | LINE Webhook + 選單 |
| 最近的泡泡貓 | `AKfycbwULtVX2PN_vmf_OwhrZnB37jSDhplDniPFSJvoBxZ3UMNyckDeMkT2pC-Fl3Qh1eZ1` | 門市列表 API（near-redirect-snippet） |
| **日報表 產出** | 無（僅 push） | 部署id: x |
| **每週三：顧客退費** | 無（僅 push） | 部署id: x |
| **泡泡貓拉廣告資料** | 無（僅 push） | 部署id: x |
| **請款表單內容** | 無（僅 push） | 無 doGet/doPost，僅試算表選單 |

---

## 三、npm run ship 調整建議

### 3.1 若表格的「部署id」與 package.json 不同

**請以 Apps Script「管理部署」為準**，將正確的部署 ID 填入對應的 package.json：

```bash
# 修改方式：編輯 gas/<專案名>/package.json 的 deploy 腳本
"deploy": "clasp deploy -i <您的正確部署ID> -d 'Updated'"
```

### 3.2 重要：near-redirect-snippet.html 與「最近的泡泡貓」不一致

`PaoMao_Core/near-redirect-snippet.html` 第 131 行寫死：

```
API_URL = .../AKfycbwULtVX2PN_vmf_OwhrZnB37jSDhplDniPFSJvoBxZ3UMNyckDeMkT2pC-Fl3Qh1eZ1/exec
```

但「最近的泡泡貓」package.json 的 deploy -i 是：

```
AKfycbzq3BnJrZlf0TUrhmSv2W4tfSQK0tSR_ENZApPKUxsCLdtw1pPfSabdd8xzpPRkXGg
```

**兩者不同**。請擇一修正：

- **方案 A**：若「尋找最近門市」功能正常，表示網頁實際用的是 `AKfycbwULtVX2PN_...`，請將「最近的泡泡貓」的 package.json deploy 改為該 ID。
- **方案 B**：若要以 package.json 為準，請將 near-redirect-snippet.html 的 API_URL 改為 `.../AKfycbzq3BnJrZlf0TUrhmSv2W4tfSQK0tSR_ENZApPKUxsCLdtw1pPfSabdd8xzpPRkXGg/exec`。

---

## 四、不需要 Web 部署、可改為「僅 push」的專案

以下專案**沒有**被外部 URL 或 Webhook 呼叫，僅在試算表內透過選單或排程執行：

| 專案 | 說明 | 建議 |
|------|------|------|
| **請款表單內容** | 選單：產出 TXT、開發票、勞報單、刪除暫存 | 可改為 **push only**（不做 deploy） |
| **每週三：顧客退費** | 選單：匯出 Excel、退費、刪除暫存 | 可改為 **push only** |
| **日報表 產出** | 選單／排程產出日報 | 若有外部呼叫需保留 deploy；否則可 push only |
| **泡泡貓拉廣告資料** | 排程／選單：今日預約、預約清單 | 同上 |

**實作方式**：將 deploy 改為只做 push，或從 ship 流程中排除：

```json
// package.json 改為
"deploy": "echo '此專案不需 Web 部署，僅 push'",
"ship": "npm run push"
```

或修改 `scripts/ship.js`，加入排除名單（見下方）。

---

## 五、必須保留 Web 部署的專案（URL 不可變）

| 專案 | 原因 |
|------|------|
| **PaoMao_Core** | Core API，多專案依賴 `PAO_CAT_CORE_API_URL` |
| **泡泡貓 員工打卡 Line@** | LINE Webhook 指向此 URL |
| **各店訊息一覽表** | linebot 擴充、odoo 等呼叫 |
| **泡泡貓 門市 預約表單 PAOPAO** | LINE Webhook 接收預約相關訊息 |
| **最近的泡泡貓** | near-redirect-snippet.html 門市列表 API |

---

## 六、ship.js 排除「僅 push」專案（可選）

若希望 `npm run ship` 時，部分專案只 push、不 deploy，可修改 `scripts/ship.js`：

```javascript
// 僅 push、不 deploy 的專案（無外部 Web URL 依賴）
const PUSH_ONLY_PROJECTS = ['請款表單內容', '每週三：顧客退費'];

// 在迴圈內：
const isPushOnly = PUSH_ONLY_PROJECTS.includes(dir);
const cmd = isPushOnly ? 'npm run push' : 'npm run ship';
execSync(cmd, { cwd, stdio: 'inherit' });
```

---

## 七、可封存（不再 ship）的專案

目前**沒有**專案建議直接封存刪除，因為：

- **最近的泡泡貓**：near-redirect-snippet 門市查詢仍在使用
- 其餘專案：皆有試算表或排程在使用

若未來某專案確定停用，可：

1. 從 `scripts/ship.js` 的專案列表中排除
2. 或將該專案資料夾移出 gas/（例如放到 `gas/_archived/`）

---

## 八、建議操作順序

1. 開啟 [script.google.com](https://script.google.com) 各專案 → **部署** → **管理部署**
2. 將表格的「部署id」與 package.json 對照，不一致則更新 package.json
3. 確認 near-redirect-snippet.html 的 API_URL 與「最近的泡泡貓」部署 ID 一致
4. 將「請款表單內容」「每週三：顧客退費」改為 push only（若確認無外部呼叫）
5. 執行 `npm run ship` 或 `npm run ship -- "專案名"` 驗證
