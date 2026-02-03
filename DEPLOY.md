# GAS 部署策略（Clasp）

## 原則（CRITICAL）

1. **不要建立新部署**（會改變 Web App URL），除非明確要求。
2. **一律更新既有部署**，以維持 URL 不變。
3. 指令格式必須為：
   ```bash
   clasp deploy -i <DEPLOYMENT_ID> -d <DESCRIPTION>
   ```

## 各專案 package.json

每個有 `.clasp.json` 的專案目錄都有 **package.json**，內含：

| 指令 | 說明 |
|------|------|
| `npm run push` | `clasp push --force`，只更新程式碼，不建立新版本 |
| `npm run deploy` | `clasp deploy -i YOUR_DEPLOYMENT_ID -d 'Updated'`，更新既有 Web App 部署 |
| `npm run ship` | `npm run push && npm run deploy`，先 push 再 deploy |

## 設定 Deployment ID

1. 在該專案的 **Apps Script 編輯器**：**部署** → **管理部署**。
2. 找到現有的 **網路應用程式** 部署，複製其 **部署 ID**（一串英數字）。
3. 在該專案的 **package.json** 裡，把 `deploy` 腳本中的 **YOUR_DEPLOYMENT_ID** 替換成這串 ID。

範例（替換後）：

```json
"deploy": "clasp deploy -i AKfycbx...你的實際ID... -d 'Updated'"
```

## PaoMao_Core（Core API）特別注意

- **Core API 的網址不能做變動**。各店訊息一覽表、泡泡貓 員工打卡 Line@ 等專案都依賴此 URL（如 `PAO_CAT_CORE_API_URL`），一旦改變會全部失效。
- **絕對不要**對 PaoMao_Core 執行 `clasp deploy`（無 `-i`），那會產生新部署、新 URL。
- **一律**使用 `clasp deploy -i <既有部署ID> -d '...'` 更新既有「網路應用程式」部署。
- deploymentId 必須是「**網路應用程式**」部署的 ID，不是「程式庫」部署的 ID。若填成程式庫部署 ID，對外呼叫的 Web App URL 會不正確。

## 根目錄 gas 的 ship

在 **gas** 根目錄執行 `npm run ship` 會對**所有**子專案依序執行該專案的 `npm run ship`，即 **push + 以既有部署 ID deploy**（不建立新部署、不變更網址）。  
各專案 **package.json** 的 `deploy` 腳本必須已將 `YOUR_DEPLOYMENT_ID` 改為該專案在「管理部署」中的**既有 Web App 部署 ID**，否則 deploy 會失敗。  
若要只對單一專案 push + deploy，請進入該專案目錄執行 `npm run ship`。
