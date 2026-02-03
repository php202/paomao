/**
 * [優化] 取得公司流程連結 (含快取)
 * @param {string} keyword 關鍵字
 * @return {string|null} 連結網址 或 null
 */
function getWorkflowLink(keyword) {
  if (!keyword) return null;

  // 1. 嘗試從快取讀取整個 Map
  const cache = CacheService.getScriptCache();
  const cacheKey = "WORKFLOW_MAP";
  let mapData = cache.get(cacheKey);
  let workflowMap;

  if (mapData) {
    // 如果有快取，直接轉回物件
    workflowMap = JSON.parse(mapData);
  } else {
    // 2. 沒快取，讀取 Google Sheet
    // console.log("[Core] Reading Workflow Sheet..."); // Debug用
    try {
      const ss = SpreadsheetApp.openById('1GH2XbihFIY0AX8SMF9Tk6igrVKPpA_vMJVlkDkJjpe4'); // 或指定 ID
      const sheet = ss.getSheetByName("公司流程");
      if (!sheet) return null;

      // 讀取所有資料 (假設 A欄=關鍵字, B欄=連結)
      const data = sheet.getDataRange().getValues(); 
      
      workflowMap = {};
      // 從第 0 列開始 (如果有標題請改 i=1)
      for (let i = 0; i < data.length; i++) {
        const key = String(data[i][0]).trim();
        const link = data[i][1];
        if (key) workflowMap[key] = link;
        console.log(key, link)
      }

      // 3. 寫入快取 (存 6 小時)
      cache.put(cacheKey, JSON.stringify(workflowMap), 21600);
      
    } catch (e) {
      console.error("[Core] Workflow Sheet Error:", e);
      return null;
    }
  }
  // 4. 比對關鍵字 (回傳連結或 undefined)
  return workflowMap[keyword] || null;
}
// 檢查是否為重複事件 (簡單版)
function isDuplicatedEvent(eventId) {
  const cache = CacheService.getScriptCache();
  if (cache.get(eventId)) return true;
  cache.put(eventId, "1", 60); // 存 60 秒
  return false;
}