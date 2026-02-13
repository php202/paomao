# 最近的泡泡貓 — 已整合至 PaoMao_Core

**此專案已於 2026-02 整合至 PaoMao_Core，不再單獨部署。**

## 整合說明

- **原功能**：提供門市列表 JSON API（`doGet` 回傳 `[{ name, address, lineUrl, lat, lng }, ...]`）
- **整合後**：改由 PaoMao_Core 的 `action=storeList` 提供
- **新 API 網址**：`https://script.google.com/macros/s/AKfycby5ibTcUxvPD-Xj1-lOHOJ5oI27CbyyaHv2K3cvNd1PwMiPvwGCpjlzi6UbW4fwip2UaA/exec?action=storeList`

## 呼叫端更新

- `gas/PaoMao_Core/near-redirect-snippet.html` 已改為使用 Core API 的 `?action=storeList`
- 若其他頁面有直接呼叫原 最近的泡泡貓 URL，請改為上述 Core API 網址

## 後續

- 此專案可保留作為參考，或從 `npm run ship` 等流程中排除
- 不再需要對「最近的泡泡貓」執行 deploy
