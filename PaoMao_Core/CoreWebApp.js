/**
 * Core 中央 API：以 doGet / doPost 對外提供 Core 資料與函式，呼叫端以 PAO_CAT_CORE_API_URL（此專案「網路應用程式」部署網址）呼叫即可。
 *
 * 【部署】⚠️ 更新程式時請「更新既有部署」、不要「新增部署」，否則網址會變、所有 Core API 連結都要重換。
 * - 網頁：部署 → 管理部署作業 → 現有 Web App 右側「編輯」→ 版本選「新版本」→ 部署。
 * - 指令：在 gas/PaoMao_Core 執行 npm run deploy（會用 package.json 的 deploymentId 更新同一個網址）。
 * 首次才需：部署 → 新增部署 → 類型：網路應用程式，執行身分：我、誰可存取：任何人 → 部署，複製網址與 Deployment ID 到 package.json。
 *
 * 【PaoMao_Core 本專案】指令碼屬性：
 * - PAO_CAT_SECRET_KEY：密鑰（與呼叫端一致）。
 *
 * 【呼叫端】指令碼屬性：
 * - PAO_CAT_CORE_API_URL：此專案「網路應用程式」部署網址（結尾 /exec，從 部署→管理部署 複製）
 * - PAO_CAT_SECRET_KEY：與 Core 相同的密鑰
 *
 * 【doGet】查詢參數：key, action[, startDate, endDate, storeId, start, end, date]
 * - key=密鑰（必填）
 * - action=token | getStoresInfo | fetchReservationData | oldNewA | fetchTodayReservationData | lastMonthTipsReport | fetchDailyIncome
 * - fetchReservationData / oldNewA：startDate, endDate, storeId
 * - fetchTodayReservationData：start, end, storeId
 * - getOdooInvoice：id（Odoo 發票/單據 ID），回傳明細陣列
 *
 * 【doPost】body JSON：{ key, action[, ...] }
 * - action=lineReply：replyToken, text, token（必填），代為呼叫 LINE Reply API
 * - action=getCustomerAIResult：phone（必填），從「客人消費狀態」試算表依手機回傳 AI分析結果（K 欄）
 * - action=issueInvoice：storeInfo, odooNumber, buyType, items（必填），代為開立 B2B 發票，回傳 Giveme 結果
 *
 * ⚠️ 若呼叫端出現「未知 action」→ 請在「PaoMao_Core」專案重新部署 Web App（部署 → 管理部署 → 編輯 → 版本：新版本 → 部署）。
 */

function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  return handleRequest(params, "GET");
}

function doPost(e) {
  var params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonOut({ status: "error", message: "JSON 解析失敗" });
    }
  }
  return handleRequest(params, "POST");
}

function handleRequest(params, method) {
  var key = (params.key != null) ? String(params.key).trim() : "";
  var expected = "";
  try {
    expected = PropertiesService.getScriptProperties().getProperty("PAO_CAT_SECRET_KEY") || "";
    expected = expected.trim();
  } catch (err) {
    return jsonOut({ status: "error", message: "config" });
  }
  if (!expected || key !== expected) {
    return jsonOut({ status: "error", message: "unauthorized" });
  }

  var action = (params.action != null) ? String(params.action).trim() : "";
  if (!action) {
    action = "token";
  }

  try {
    switch (action) {
      case "token":
        return tokenResponse();
      case "getStoresInfo":
        return actionGetStoresInfo();
      case "fetchReservationData":
        return actionFetchReservationData(params);
      case "oldNewA":
        return actionOldNewA(params);
      case "fetchTodayReservationData":
        return actionFetchTodayReservationData(params);
      case "fetchDailyIncome":
        return actionFetchDailyIncome(params);
      case "lineReply":
        return actionLineReply(params);
      case "getCustomerAIResult":
        return actionGetCustomerAIResult(params);
      case "lastMonthTipsReport":
        return actionLastMonthTipsReport(params);
      case "syncLastMonthTipsConsolidated":
        return actionSyncLastMonthTipsConsolidated();
      case "getOdooInvoice":
        return actionGetOdooInvoice(params);
      case "issueInvoice":
        return actionIssueInvoice(params);
      default:
        return jsonOut({ status: "error", message: "未知 action: " + action });
    }
  } catch (err) {
    return jsonOut({ status: "error", message: (err && err.message) ? err.message : String(err) });
  }
}

function tokenResponse() {
  var token = "";
  try {
    token = getBearerTokenFromSheet();
  } catch (err) {
    return ContentService.createTextOutput("Error: " + (err && err.message ? err.message : "token")).setMimeType(ContentService.MimeType.TEXT);
  }
  return ContentService.createTextOutput(token || "").setMimeType(ContentService.MimeType.TEXT);
}

function actionGetStoresInfo() {
  var stores = getStoresInfo();
  var out = (stores || []).map(function (s) {
    return {
      id: s.id,
      name: s.name,
      totalStaff: s.totalStaff,
      isDirect: s.isDirect,
      validStaffSet: (s.validStaffSet && typeof s.validStaffSet.forEach !== "undefined") ? Array.from(s.validStaffSet) : []
    };
  });
  return jsonOut({ status: "ok", data: out });
}

function actionFetchReservationData(params) {
  var startDate = params.startDate;
  var endDate = params.endDate;
  var storeId = params.storeId;
  if (startDate == null || endDate == null || storeId == null) {
    return jsonOut({ status: "error", message: "缺少 startDate, endDate 或 storeId" });
  }
  var data = fetchReservationData(startDate, endDate, String(storeId));
  return jsonOut({ status: "ok", data: data });
}

function actionOldNewA(params) {
  var startDate = params.startDate;
  var endDate = params.endDate;
  var storeId = params.storeId;
  if (startDate == null || endDate == null || storeId == null) {
    return jsonOut({ status: "error", message: "缺少 startDate, endDate 或 storeId" });
  }
  var data = oldNewA(startDate, endDate, String(storeId));
  return jsonOut({ status: "ok", data: data });
}

function actionFetchTodayReservationData(params) {
  var start = params.start;
  var end = params.end;
  var storeId = params.storeId;
  if (start == null || end == null || storeId == null) {
    return jsonOut({ status: "error", message: "缺少 start, end 或 storeId" });
  }
  var data = fetchTodayReservationData(start, end, String(storeId));
  return jsonOut({ status: "ok", data: data });
}

/**
 * 透過 Core Web App 對外提供「單店單日營收」查詢，供「日報表 產出」等專案呼叫。
 * 參數：date（yyyy-MM-dd）、storeId
 */
function actionFetchDailyIncome(params) {
  var date = params.date;
  var storeId = params.storeId;
  if (date == null || storeId == null) {
    return jsonOut({ status: "error", message: "缺少 date 或 storeId" });
  }
  var data = fetchDailyIncome(String(date), String(storeId));
  return jsonOut({ status: "ok", data: data });
}

/**
 * 將任意手機字串正規成「後 9 碼」供比對（支援全形數字、試算表頭前去 0）
 */
function toPhoneNorm9(str) {
  if (str == null || str === "") return "";
  var s = String(str);
  s = s.replace(/[\uFF10-\uFF19]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  return s.replace(/\D/g, "").slice(-9);
}

/**
 * 上月小費：產出試算表連結（同月同人重用）。有紀錄則回傳既有 url，無則建新試算表並寫入請求紀錄表。
 * 管理者：傳 managedStoreIds（逗號分隔）、userId，篩選負責店家。
 * 員工：傳 employeeCode、userId，篩選消費備註 lowercase 含該員工編號的列。
 * 參數：managedStoreIds（選填）、employeeCode（選填）、userId（必填）
 */
function actionLastMonthTipsReport(params) {
  if (typeof getOrCreateLastMonthTipsSheet !== "function") {
    return jsonOut({ status: "error", message: "getOrCreateLastMonthTipsSheet 未定義（請確認 TipsReport.js 已加入專案）" });
  }
  var idsParam = (params && params.managedStoreIds != null) ? String(params.managedStoreIds).trim() : "";
  var managedStoreIds = idsParam ? idsParam.split(",").map(function (s) { return s.trim(); }).filter(Boolean) : [];
  var employeeCode = (params && params.employeeCode != null) ? String(params.employeeCode).trim() : "";
  var userId = (params && params.userId != null) ? String(params.userId).trim() : "";
  if (!userId) {
    return jsonOut({ ok: false, message: "請提供 userId（LINE 使用者 ID）" });
  }
  var result = getOrCreateLastMonthTipsSheet({ managedStoreIds: managedStoreIds, employeeCode: employeeCode, userId: userId });
  if (result.ok) {
    return jsonOut({ ok: true, url: result.url, cached: result.cached === true, rowCount: result.rowCount });
  }
  return jsonOut({ ok: false, message: result.message || "未知錯誤" });
}

/**
 * 每月 2 號觸發：把上個月問卷 A:M + 消費／儲值金同步到小費統整表。
 */
function actionSyncLastMonthTipsConsolidated() {
  if (typeof syncLastMonthQuestionnaireToConsolidated !== "function") {
    return jsonOut({ status: "error", message: "syncLastMonthQuestionnaireToConsolidated 未定義（請確認 TipsReport.js 已加入專案）" });
  }
  var result = syncLastMonthQuestionnaireToConsolidated();
  return jsonOut(result);
}

function actionGetCustomerAIResult(params) {
  var phone = (params.phone != null) ? String(params.phone).trim() : "";
  if (!phone) {
    return jsonOut({ status: "error", message: "請提供 phone 參數" });
  }
  var config = getCoreConfig();
  var ssId = (config && config.LINE_STORE_SS_ID) ? config.LINE_STORE_SS_ID : "";
  if (!ssId) {
    return jsonOut({ status: "error", message: "Core 未設定 LINE_STORE_SS_ID" });
  }
  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("客人消費狀態");
    if (!sheet) {
      return jsonOut({ status: "error", message: "找不到「客人消費狀態」工作表" });
    }
    var data = sheet.getDataRange().getValues();
    if (data.length < 1) {
      return jsonOut({ status: "error", message: "查無此客人（" + phone + "）。" });
    }
    var header = data[0];
    var phoneCol = 1;
    var aiResultCol = 10;
    for (var c = 0; c < header.length; c++) {
      var h = String(header[c] || "").trim();
      if (h === "手機") phoneCol = c;
      if (h === "AI分析結果") aiResultCol = c;
    }
    var phoneNorm9 = toPhoneNorm9(phone);
    for (var i = 0; i < data.length; i++) {
      var rowPhone = data[i][phoneCol];
      if (rowPhone == null) continue;
      var rowStr = String(rowPhone).trim();
      if (rowStr === "手機" || rowStr === "時間") continue;
      var rowPhoneNorm9 = toPhoneNorm9(rowPhone);
      if (rowPhoneNorm9.length >= 9 && rowPhoneNorm9 === phoneNorm9) {
        var aiResult = data[i][aiResultCol];
        var content = (aiResult != null && String(aiResult).trim() !== "") ? String(aiResult).trim() : "該客人尚無 AI 分析結果。";
        return jsonOut({ status: "ok", phone: phone, content: content });
      }
    }
    return jsonOut({ status: "error", message: "查無此客人（" + phone + "）。請確認該手機是否已在「客人消費狀態」試算表 B 欄。" });
  } catch (err) {
    return jsonOut({ status: "error", message: (err && err.message) ? err.message : String(err) });
  }
}

/**
 * 代為呼叫 LINE Reply API（供各店訊息一覽表等透過 Core API 發送挽留回覆）
 * 參數：replyToken, text, token（皆必填）
 */
function actionLineReply(params) {
  var replyToken = (params.replyToken != null) ? String(params.replyToken).trim() : "";
  var text = (params.text != null) ? String(params.text) : "";
  var token = (params.token != null) ? String(params.token).trim() : "";
  if (!replyToken || !token) {
    return jsonOut({ status: "error", message: "缺少 replyToken 或 token" });
  }
  try {
    sendLineReply(replyToken, text, token);
    return jsonOut({ status: "ok" });
  } catch (err) {
    return jsonOut({ status: "error", message: (err && err.message) ? err.message : String(err) });
  }
}

/**
 * Core API：取得 Odoo 發票/單據明細。
 * GET: ?key=密鑰&action=getOdooInvoice&id=12345
 */
function actionGetOdooInvoice(params) {
  var id = (params.id != null) ? String(params.id).trim() : "";
  if (!id) {
    return jsonOut({ status: "error", message: "請提供 id 參數（Odoo 發票/單據 ID）" });
  }
  try {
    var lines = getOdooInvoiceJSON(id);
    return jsonOut({ status: "ok", data: lines || [] });
  } catch (err) {
    return jsonOut({ status: "error", message: (err && err.message) ? err.message : String(err) });
  }
}

/**
 * Core API：開立 B2B 發票。
 * POST body: { key, action: "issueInvoice", storeInfo, odooNumber, buyType, items }
 */
function actionIssueInvoice(params) {
  var storeInfo = params.storeInfo;
  var odooNumber = (params.odooNumber != null) ? String(params.odooNumber) : "";
  var buyType = (params.buyType != null) ? String(params.buyType) : "請款";
  var items = params.items;
  if (!storeInfo || !Array.isArray(items)) {
    return jsonOut({ status: "error", message: "請提供 storeInfo 與 items 陣列" });
  }
  try {
    var result = issueInvoice(storeInfo, odooNumber, buyType, items);
    return jsonOut(result || { success: "false", msg: "無回傳" });
  } catch (err) {
    return jsonOut({ success: "false", msg: (err && err.message) ? err.message : String(err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
