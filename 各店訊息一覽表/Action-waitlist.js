/**
 * 候補清單：新工作表「候補清單」、店家 ID = 店家基本資料 F 欄。
 * API: getWaitlist, addWaitlist, markWaitlistPushed, markWaitlistDone, markWaitlistHandled.
 * 排程: runWaitlistAutoPush（每日 22:00）、結算寫入店家基本資料 M 欄（候補追蹤率）。
 */

var WAITLIST_HEADERS = ["店家ID", "日期", "userId", "狀態", "建立時間", "時段"];
var WAITLIST_STATUS_PENDING = "pending";
var WAITLIST_STATUS_PUSHED = "pushed";
var WAITLIST_STATUS_AUTO_PUSHED = "auto_pushed";
var WAITLIST_STATUS_DONE = "done";
var WAITLIST_STATUS_HANDLED = "handled";

var WAITLIST_PUSH_PREFIX = "真是抱歉今天的候補沒有補位上，提供近三天，還有下 1–2 週同一時間的可預約時段：\n\n";

/** 取得試算表（Web App 時用 CONFIG.INTEGRATED_SHEET_SS_ID） */
function getWaitlistSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && typeof CONFIG !== "undefined" && CONFIG.INTEGRATED_SHEET_SS_ID) {
    ss = SpreadsheetApp.openById(CONFIG.INTEGRATED_SHEET_SS_ID);
  }
  return ss;
}

/** 取得或建立「候補清單」工作表；第 1 列為表頭 */
function getWaitlistSheet() {
  var ss = getWaitlistSpreadsheet();
  if (!ss) return null;
  var sheet = ss.getSheetByName("候補清單");
  if (!sheet) {
    sheet = ss.insertSheet("候補清單");
    sheet.appendRow(WAITLIST_HEADERS);
  } else if (sheet.getLastRow() < 1) {
    sheet.appendRow(WAITLIST_HEADERS);
  }
  return sheet;
}

/** 依 botId 從店家基本資料取得店家 ID（F 欄） */
function getStoreIdByBotId(botId) {
  var config = getStoreConfig(botId);
  return config ? String(config.sayId || "").trim() : null;
}

/** 依店家 ID 從店家基本資料取得該列 channelId, channelSecret, botId（供 getSlots / token） */
function getStoreRowBySayId(ss, sayId) {
  if (!ss || !sayId) return null;
  var configSheet = ss.getSheetByName("店家基本資料");
  if (!configSheet) return null;
  var data = configSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var fVal = row[5];
    if (fVal != null && String(fVal).trim() === String(sayId).trim()) {
      return {
        channelId: row[2],
        channelSecret: row[3],
        botId: row[6],
        storeName: row[1]
      };
    }
  }
  return null;
}

/** 驗證日期為 yyyy-MM-dd */
function isValidDateStr(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return false;
  dateStr = dateStr.trim().replace(/\//g, "-");
  var m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  var y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
  var date = new Date(y, mo, d);
  return date.getFullYear() === y && date.getMonth() === mo && date.getDate() === d;
}

/** 取得今日 yyyy-MM-dd */
function getTodayStr() {
  var tz = Session.getScriptTimeZone() || "Asia/Taipei";
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
}

// ---------------------------------------------------------------------------
// doGet actions
// ---------------------------------------------------------------------------

/** 將候補一筆的日期＋時段格式為 Asia/Taipei 的 MM-dd HH:mm（不顯示 yyyy） */
function formatWaitlistDisplayDate(dateVal, timeVal) {
  var tz = "Asia/Taipei";
  var datePart = "";
  if (dateVal instanceof Date) {
    datePart = Utilities.formatDate(dateVal, tz, "MM-dd");
  } else if (dateVal != null && String(dateVal).trim() !== "") {
    var s = String(dateVal).trim().replace(/\//g, "-");
    if (s.length >= 10) datePart = s.substring(5, 10);
    else datePart = s;
  }
  var timePart = "";
  if (timeVal != null && String(timeVal).trim() !== "") {
    var t = String(timeVal).trim();
    if (t.length >= 5) timePart = t.substring(0, 5);
    else timePart = t;
  }
  return timePart ? datePart + " " + timePart : datePart;
}

/** 取得候補一筆的排序用字串 yyyy-MM-dd HH:mm */
function getWaitlistSortKey(dateVal, timeVal) {
  var dateStr = "";
  if (dateVal instanceof Date) {
    dateStr = Utilities.formatDate(dateVal, "Asia/Taipei", "yyyy-MM-dd");
  } else if (dateVal != null && String(dateVal).trim() !== "") {
    dateStr = String(dateVal).trim().replace(/\//g, "-");
    if (dateStr.length > 10) dateStr = dateStr.substring(0, 10);
  }
  var timeStr = "00:00";
  if (timeVal != null && String(timeVal).trim() !== "") {
    var t = String(timeVal).trim();
    timeStr = t.length >= 5 ? t.substring(0, 5) : t;
  }
  return dateStr + " " + timeStr;
}

/** getWaitlist：以 botId 取得店家 ID，篩選該店家且狀態為 pending / pushed，回傳陣列含 rowIndex、displayName、displayDate，依時間由早到晚排序 */
function getWaitlist(e) {
  var botId = (e && e.parameter && e.parameter.botId) ? String(e.parameter.botId).trim() : "";
  if (!botId) return Core.jsonResponse({ status: "error", message: "請提供 botId" });

  var storeId = getStoreIdByBotId(botId);
  if (!storeId) return Core.jsonResponse({ status: "error", message: "找不到此 Bot ID 對應的店家" });

  var sheet = getWaitlistSheet();
  if (!sheet) return Core.jsonResponse({ status: "error", message: "無法取得候補清單工作表" });

  var ss = getWaitlistSpreadsheet();
  var configSheet = ss ? ss.getSheetByName("店家基本資料") : null;
  var configData = configSheet ? configSheet.getDataRange().getValues() : [];
  var channelId = null, channelSecret = null;
  for (var c = 1; c < configData.length; c++) {
    if (configData[c][6] && String(configData[c][6]).trim() === botId) {
      channelId = configData[c][2];
      channelSecret = configData[c][3];
      break;
    }
  }
  var token = (channelId && channelSecret) ? getLineAccessToken(channelId, channelSecret) : null;

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return Core.jsonResponse({ status: "success", data: [] });

  var storeIdCol = 0, dateCol = 1, userIdCol = 2, statusCol = 3, createdAtCol = 4, timeCol = 5;
  var list = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowStoreId = row[storeIdCol] != null ? String(row[storeIdCol]).trim() : "";
    var status = row[statusCol] != null ? String(row[statusCol]).trim() : "";
    if (rowStoreId !== storeId) continue;
    if (status !== WAITLIST_STATUS_PENDING && status !== WAITLIST_STATUS_PUSHED) continue;

    var userId = row[userIdCol] != null ? String(row[userIdCol]).trim() : "";
    var displayName = userId;
    if (token && userId && typeof Core.getUserDisplayName === "function") {
      try {
        var name = Core.getUserDisplayName(userId, "", "", token);
        if (name && String(name).trim() !== "") displayName = String(name).trim();
      } catch (err) {}
    }

    var dateVal = row[dateCol];
    var timeVal = row[timeCol];
    list.push({
      rowIndex: i + 1,
      date: row[dateCol],
      userId: userId,
      displayName: displayName,
      displayDate: formatWaitlistDisplayDate(dateVal, timeVal),
      sortKey: getWaitlistSortKey(dateVal, timeVal),
      status: status,
      createdAt: row[createdAtCol],
      time: row[timeCol]
    });
  }

  list.sort(function (a, b) {
    var ka = a.sortKey || "";
    var kb = b.sortKey || "";
    return ka.localeCompare(kb);
  });

  return Core.jsonResponse({ status: "success", data: list });
}

/** addWaitlist：新增一筆候補（店家ID, 日期, userId, pending, 建立時間, 時段） */
function addWaitlist(e) {
  var botId = (e && e.parameter && e.parameter.botId) ? String(e.parameter.botId).trim() : "";
  var dateStr = (e && e.parameter && e.parameter.date) ? String(e.parameter.date).trim().replace(/\//g, "-") : "";
  var userId = (e && e.parameter && e.parameter.userId) ? String(e.parameter.userId).trim() : "";
  var timeStr = (e && e.parameter && e.parameter.time) ? String(e.parameter.time).trim() : "";

  if (!botId) return Core.jsonResponse({ status: "error", message: "請提供 botId" });
  if (!dateStr || !isValidDateStr(dateStr)) return Core.jsonResponse({ status: "error", message: "請提供有效日期（yyyy-MM-dd）" });
  if (!userId) return Core.jsonResponse({ status: "error", message: "請提供 userId" });

  var storeId = getStoreIdByBotId(botId);
  if (!storeId) return Core.jsonResponse({ status: "error", message: "找不到此 Bot ID 對應的店家" });

  var sheet = getWaitlistSheet();
  if (!sheet) return Core.jsonResponse({ status: "error", message: "無法取得候補清單工作表" });

  var tz = Session.getScriptTimeZone() || "Asia/Taipei";
  var createdAt = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm");
  sheet.appendRow([storeId, dateStr, userId, WAITLIST_STATUS_PENDING, createdAt, timeStr]);

  return Core.jsonResponse({ status: "success", message: "已加入候補清單" });
}

/** markWaitlistDone：依 rowIndex 將該列狀態改為 done */
function markWaitlistDone(e) {
  var rowIndex = (e && e.parameter && e.parameter.rowIndex) ? parseInt(String(e.parameter.rowIndex), 10) : 0;
  if (!rowIndex || rowIndex < 2) return Core.jsonResponse({ status: "error", message: "請提供有效的 rowIndex" });

  var sheet = getWaitlistSheet();
  if (!sheet) return Core.jsonResponse({ status: "error", message: "無法取得候補清單工作表" });
  if (sheet.getLastRow() < rowIndex) return Core.jsonResponse({ status: "error", message: "找不到該筆資料" });

  sheet.getRange(rowIndex, 4).setValue(WAITLIST_STATUS_DONE);
  return Core.jsonResponse({ status: "success", message: "已標記為已完成預約" });
}

/** markWaitlistHandled：依 rowIndex 將該列狀態改為 handled */
function markWaitlistHandled(e) {
  var rowIndex = (e && e.parameter && e.parameter.rowIndex) ? parseInt(String(e.parameter.rowIndex), 10) : 0;
  if (!rowIndex || rowIndex < 2) return Core.jsonResponse({ status: "error", message: "請提供有效的 rowIndex" });

  var sheet = getWaitlistSheet();
  if (!sheet) return Core.jsonResponse({ status: "error", message: "無法取得候補清單工作表" });
  if (sheet.getLastRow() < rowIndex) return Core.jsonResponse({ status: "error", message: "找不到該筆資料" });

  sheet.getRange(rowIndex, 4).setValue(WAITLIST_STATUS_HANDLED);
  return Core.jsonResponse({ status: "success", message: "已標記為已處理" });
}

/** 產出候補 Push 用的空位文字：近三天 + 下 1–2 週（可帶入時段） */
function getSlotsTextForWaitlist(botId, timeStr) {
  var today = new Date();
  var tz = Session.getScriptTimeZone() || "Asia/Taipei";
  var startDateStr = Utilities.formatDate(today, tz, "yyyy-MM-dd");
  var endDate = new Date(today.getTime());
  endDate.setDate(endDate.getDate() + 14);
  var endDateStr = Utilities.formatDate(endDate, tz, "yyyy-MM-dd");

  var options = {
    startDate: startDateStr,
    endDate: endDateStr,
    people: 1,
    duration: 1.5,
    weekDays: "",
    timeStart: timeStr && String(timeStr).trim() ? String(timeStr).trim() : "",
    timeEnd: timeStr && String(timeStr).trim() ? String(timeStr).trim() : ""
  };

  var config = getStoreConfig(botId);
  if (!config || !config.sayId) return "（無法取得空位，請直接聯繫店家）";
  try {
    return cleanData(String(config.sayId), options);
  } catch (err) {
    Logger.log("getSlotsTextForWaitlist error: " + (err && err.message ? err.message : err));
    return "（查詢空位失敗，請直接聯繫店家）";
  }
}

/** markWaitlistPushed：發送 LINE Push（文案＋近三天＋下 1–2 週時段），並將該列狀態改為 pushed */
function markWaitlistPushed(e) {
  var botId = (e && e.parameter && e.parameter.botId) ? String(e.parameter.botId).trim() : "";
  var rowIndex = (e && e.parameter && e.parameter.rowIndex) ? parseInt(String(e.parameter.rowIndex), 10) : 0;

  if (!botId) return Core.jsonResponse({ status: "error", message: "請提供 botId" });
  if (!rowIndex || rowIndex < 2) return Core.jsonResponse({ status: "error", message: "請提供有效的 rowIndex" });

  var sheet = getWaitlistSheet();
  if (!sheet) return Core.jsonResponse({ status: "error", message: "無法取得候補清單工作表" });
  if (sheet.getLastRow() < rowIndex) return Core.jsonResponse({ status: "error", message: "找不到該筆資料" });

  var row = sheet.getRange(rowIndex, 1, rowIndex, 6).getValues()[0];
  var userId = row[2] ? String(row[2]).trim() : "";
  var timeStr = row[5] ? String(row[5]).trim() : "";
  if (!userId) return Core.jsonResponse({ status: "error", message: "該筆缺少 userId" });

  var ss = getWaitlistSpreadsheet();
  var configSheet = ss.getSheetByName("店家基本資料");
  var configData = configSheet.getDataRange().getValues();
  var channelId = null, channelSecret = null;
  for (var i = 1; i < configData.length; i++) {
    if (configData[i][6] && String(configData[i][6]).trim() === botId) {
      channelId = configData[i][2];
      channelSecret = configData[i][3];
      break;
    }
  }
  if (!channelId || !channelSecret) return Core.jsonResponse({ status: "error", message: "無法取得該店 LINE 憑證" });

  var slotsText = getSlotsTextForWaitlist(botId, timeStr);
  var message = WAITLIST_PUSH_PREFIX + slotsText;
  var token = getLineAccessToken(channelId, channelSecret);
  if (!token) return Core.jsonResponse({ status: "error", message: "無法取得 LINE 存取權杖" });

  try {
    if (typeof Core.sendLinePushText === "function") {
      Core.sendLinePushText(userId, message, token);
    } else {
      return Core.jsonResponse({ status: "error", message: "Core.sendLinePushText 未就緒" });
    }
  } catch (pushErr) {
    Logger.log("markWaitlistPushed sendLinePushText error: " + (pushErr && pushErr.message ? pushErr.message : pushErr));
    return Core.jsonResponse({ status: "error", message: "發送 Push 失敗：" + (pushErr && pushErr.message ? pushErr.message : String(pushErr)) });
  }

  sheet.getRange(rowIndex, 4).setValue(WAITLIST_STATUS_PUSHED);
  return Core.jsonResponse({ status: "success", message: "已傳送提醒" });
}

// ---------------------------------------------------------------------------
// 每日 22:00 排程：今日候補仍 pending 則自動 Push，狀態改為 auto_pushed
// ---------------------------------------------------------------------------

function runWaitlistAutoPush() {
  var ss = getWaitlistSpreadsheet();
  if (!ss) {
    Logger.log("runWaitlistAutoPush: 無法取得試算表");
    return;
  }

  var sheet = getWaitlistSheet();
  if (!sheet) return;

  var todayStr = getTodayStr();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    runWaitlistDailySettlement();
    return;
  }

  var storeIdCol = 0, dateCol = 1, userIdCol = 2, statusCol = 3, timeCol = 5;
  var configSheet = ss.getSheetByName("店家基本資料");
  if (!configSheet) {
    runWaitlistDailySettlement();
    return;
  }
  var configData = configSheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateVal = row[dateCol];
    var status = row[statusCol] != null ? String(row[statusCol]).trim() : "";
    if (status !== WAITLIST_STATUS_PENDING) continue;
    var rowDateStr = dateVal != null ? String(dateVal).trim().replace(/\//g, "-") : "";
    if (rowDateStr.indexOf("20") !== 0) continue;
    if (rowDateStr.substring(0, 10) !== todayStr) continue;

    var storeId = row[storeIdCol] != null ? String(row[storeIdCol]).trim() : "";
    var userId = row[userIdCol] ? String(row[userIdCol]).trim() : "";
    var timeStr = row[timeCol] ? String(row[timeCol]).trim() : "";
    if (!userId) continue;

    var botId = null;
    var channelId = null, channelSecret = null;
    for (var c = 1; c < configData.length; c++) {
      if (configData[c][5] != null && String(configData[c][5]).trim() === storeId) {
        botId = configData[c][6];
        channelId = configData[c][2];
        channelSecret = configData[c][3];
        break;
      }
    }
    if (!botId || !channelId || !channelSecret) continue;

    var token = getLineAccessToken(channelId, channelSecret);
    if (!token) continue;

    var slotsText = getSlotsTextForWaitlist(botId, timeStr);
    var message = WAITLIST_PUSH_PREFIX + slotsText;
    try {
      if (typeof Core.sendLinePushText === "function") {
        Core.sendLinePushText(userId, message, token);
        sheet.getRange(i + 1, 4).setValue(WAITLIST_STATUS_AUTO_PUSHED);
      }
    } catch (err) {
      Logger.log("runWaitlistAutoPush row " + (i + 1) + " error: " + (err && err.message ? err.message : err));
    }
  }

  runWaitlistDailySettlement();
}

/** 結算各店「候補追蹤率」寫入店家基本資料 M 欄（pushed / (pushed + auto_pushed)） */
function runWaitlistDailySettlement() {
  var ss = getWaitlistSpreadsheet();
  if (!ss) return;

  var waitSheet = getWaitlistSheet();
  var storeSheet = ss.getSheetByName("店家基本資料");
  if (!waitSheet || !storeSheet) return;

  var todayStr = getTodayStr();
  var data = waitSheet.getDataRange().getValues();
  var storeIdCol = 0, dateCol = 1, statusCol = 3;

  var byStore = {};
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dateVal = row[dateCol];
    var rowDateStr = dateVal != null ? String(dateVal).trim().replace(/\//g, "-") : "";
    if (rowDateStr.substring(0, 10) !== todayStr) continue;
    var status = row[statusCol] != null ? String(row[statusCol]).trim() : "";
    if (status !== WAITLIST_STATUS_PUSHED && status !== WAITLIST_STATUS_AUTO_PUSHED) continue;

    var storeId = row[storeIdCol] != null ? String(row[storeIdCol]).trim() : "";
    if (!storeId) continue;
    if (!byStore[storeId]) byStore[storeId] = { pushed: 0, total: 0 };
    byStore[storeId].total += 1;
    if (status === WAITLIST_STATUS_PUSHED) byStore[storeId].pushed += 1;
  }

  var storeData = storeSheet.getDataRange().getValues();
  var M_COL_1BASED = 13;
  if (storeData.length >= 1) {
    var headerM = storeSheet.getRange(1, M_COL_1BASED).getValue();
    if (headerM == null || String(headerM).trim() === "") {
      storeSheet.getRange(1, M_COL_1BASED).setValue("候補追蹤率");
    }
  }

  for (var r = 2; r <= storeData.length; r++) {
    var storeIdVal = storeData[r - 1][5];
    var storeId = storeIdVal != null ? String(storeIdVal).trim() : "";
    var rate = "";
    if (storeId && byStore[storeId] && byStore[storeId].total > 0) {
      var pushed = byStore[storeId].pushed || 0;
      var total = byStore[storeId].total;
      rate = pushed / total;
    }
    storeSheet.getRange(r, M_COL_1BASED).setValue(rate);
  }
}
