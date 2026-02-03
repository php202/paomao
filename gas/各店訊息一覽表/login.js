// ==========================================
// 1. 主要入口 (POST): 負責處理 LINE Webhook
// ==========================================
function doPost(e) {
  try {
    // 1. 安全檢查
    if (!e || !e.postData || !e.postData.contents) {
      return Core.jsonResponse({ status: "error", message: "No post data received" });
    }
    // 2. 解析 JSON (增加 try-catch 避免 JSON 格式錯誤導致崩潰)
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return Core.jsonResponse({ status: "error", message: "JSON 解析失敗" });
    }
    // 3. 路由分流
    if (data.events) {
      // === 來自 LINE 的 Webhook ===
      // 建議將 handleLineWebhook 放在 Services.gs
      handleLineWebhook(data); 
      // LINE 平台只需要收到 200 OK
      return ContentService.createTextOutput("OK");
    } else {
      // === 未知請求 ===
      return Core.jsonResponse({ status: "error", message: "未知的請求格式" });
    }
  } catch (error) {
    var msg = (error && error.message) ? error.message : String(error);
    try { appendErrorLog(msg, "doPost"); } catch (logErr) {}
    return Core.jsonResponse({ status: "error", message: "系統錯誤: " + msg });
  }
}

// ==========================================
// 2. 主要入口 (GET): 負責處理 Chrome 外掛 API
// ==========================================
function doGet(e) {
  // 1. 統一捕捉錯誤，確保回傳 JSON
  try {
    // 檢查是否有參數
    if (!e || !e.parameter) {
      return Core.jsonResponse({status: 'error', message: 'No parameters provided'});
    }
    const action = e.parameter.action;
    // 2. 使用 Switch 清楚分流 (這裡只負責導向，不寫邏輯)
    switch (action) {
      case 'getList':
        return getList(e); // 呼叫 Services.gs 裡的函式
      case 'delete':
        return handleDelete(e); // 呼叫 Services.gs 裡的函式
      case 'getSlots':
        return getSlots(e);
      case 'checkMember':
        return checkMember(e);
      case 'createBooking':
        return createBooking(e);
      case 'searchAvailability':
        return searchAvailability(e);
      case 'getTomorrowBriefing':
        return getTomorrowBriefingAction(e);
      case 'getTomorrowReservationList':
        return getTomorrowReservationListAction(e);
      case 'customerCard':
        return getCustomerCardAction(e);
      default:
        return Core.jsonResponse({status: 'error', message: 'Invalid Action: ' + action});
    }

  } catch (error) {
    var msg = (error && error.message) ? error.message : String(error);
    try { appendErrorLog(msg, "doGet " + (e && e.parameter && e.parameter.action || "")); } catch (logErr) {}
    return Core.jsonResponse({ status: "error", message: "API 執行錯誤", details: msg });
  }
}

// ==========================================
// customerCard：依手機回傳該客人在「客人消費狀態」的 AI分析結果（簡易 HTML，供 LINE 點手機連結開啟）
// ==========================================
function getCustomerCardAction(e) {
  var phone = (e && e.parameter && e.parameter.phone) ? String(e.parameter.phone).trim() : "";
  if (!phone) {
    return ContentService.createTextOutput("<html><head><meta charset='utf-8'></head><body>請提供 phone 參數</body></html>").setMimeType(ContentService.MimeType.HTML);
  }
  var normalized = (typeof Core !== "undefined" && typeof Core.normalizePhone === "function") ? Core.normalizePhone(phone) : "";
  if (!normalized) {
    return ContentService.createTextOutput("<html><head><meta charset='utf-8'></head><body>手機格式錯誤</body></html>").setMimeType(ContentService.MimeType.HTML);
  }
  try {
    var ss = SpreadsheetApp.openById(CONFIG.INTEGRATED_SHEET_SS_ID);
    var sheet = ss.getSheetByName(CONFIG.INTEGRATED_SHEET_NAME);
    var rowIndex = findRowIndexByPhone(sheet, normalized, CONFIG.INTEGRATED_PHONE_COL);
    if (!rowIndex) {
      return ContentService.createTextOutput("<html><head><meta charset='utf-8'></head><body>查無此客人（" + normalized + "）</body></html>").setMimeType(ContentService.MimeType.HTML);
    }
    var aiCol = CONFIG.INTEGRATED_HEADERS.indexOf("AI分析結果") + 1;
    if (aiCol < 1) aiCol = 11;
    var content = sheet.getRange(rowIndex, aiCol).getValue();
    content = content != null ? String(content).trim() : "";
    if (!content) content = "該客人尚無 AI 分析結果。";
    var escaped = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    var html = "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>客人 " + normalized + "</title><style>body{font-family:sans-serif;padding:1em;white-space:pre-wrap;word-break:break-word;}</style></head><body>" + escaped + "</body></html>";
    return ContentService.createTextOutput(html).setMimeType(ContentService.MimeType.HTML);
  } catch (err) {
    return ContentService.createTextOutput("<html><head><meta charset='utf-8'></head><body>錯誤：" + (err && err.message ? err.message : "") + "</body></html>").setMimeType(ContentService.MimeType.HTML);
  }
}