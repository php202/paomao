/** doGet action=searchAvailability 與 getSlots 行為相同（查空位），委派給 getSlots */
function searchAvailability(e) {
  return getSlots(e);
}

function getSlots(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty('GETSLOTS_SS_ID') || props.getProperty('ERROR_LOG_SS_ID');
    if (id) ss = SpreadsheetApp.openById(id);
    if (!ss && typeof CONFIG !== 'undefined' && CONFIG.INTEGRATED_SHEET_SS_ID) ss = SpreadsheetApp.openById(CONFIG.INTEGRATED_SHEET_SS_ID);
  }
  if (!ss) return Core.jsonResponse({ error: '查詢失敗', details: '無法取得試算表（Web App 請設定指令碼屬性 GETSLOTS_SS_ID 或 ERROR_LOG_SS_ID）' });

  const botId = e.parameter.botId;
  if (!botId) return Core.jsonResponse({ error: 'No botId', details: '請提供 botId' });

  var configSheet = ss.getSheetByName('店家基本資料');
  if (!configSheet) return Core.jsonResponse({ error: '查詢失敗', details: '試算表內找不到工作表「店家基本資料」' });

  const configData = configSheet.getDataRange().getValues();
  let targetSayId = null;

  for (let i = 1; i < configData.length; i++) {
    if (configData[i][6] && configData[i][6].toString().trim() === botId) {
      targetSayId = configData[i][5];
      break;
    }
  }

  if (!targetSayId) {
    return Core.jsonResponse({error: '找不到此 Bot ID 對應的「神美ID」', botId: botId});
  }

  // 讀取前端傳入的搜尋條件（與查詢結果一致）
  var startDate = (e.parameter.startDate != null) ? String(e.parameter.startDate).trim().replace(/\//g, "-") : "";
  var endDate = (e.parameter.endDate != null) ? String(e.parameter.endDate).trim().replace(/\//g, "-") : "";
  var people = (e.parameter.people != null) ? parseInt(String(e.parameter.people), 10) : 1;
  var duration = (e.parameter.duration != null) ? parseFloat(String(e.parameter.duration).replace(",", ".")) : 1.5;
  var weekDays = (e.parameter.weekDays != null) ? String(e.parameter.weekDays).trim() : "";
  var timeStart = (e.parameter.timeStart != null) ? String(e.parameter.timeStart).trim() : "";
  var timeEnd = (e.parameter.timeEnd != null) ? String(e.parameter.timeEnd).trim() : "";
  var options = { startDate: startDate, endDate: endDate, people: people, duration: duration, weekDays: weekDays, timeStart: timeStart, timeEnd: timeEnd };

  try {
    const slotsText = cleanData(targetSayId, options);
    return Core.jsonResponse({status: 'success', text: slotsText});
  } catch (err) {
    return Core.jsonResponse({error: '查詢失敗', details: err.toString()});
  }
}

const SLOT_TIMES = ["11:00", "12:30", "14:00", "15:30", "17:00", "18:00", "19:30"];
const TZ = Session.getScriptTimeZone() || 'Asia/Taipei';

/**
 * 依搜尋條件產出空位文字。options 可含 startDate, endDate, people, duration, weekDays, timeStart, timeEnd。
 * 若未傳 startDate/endDate 則預設為今天起 8 天。
 */
function cleanData(sayId, options) {
  options = options || {};
  const token = CoreApi.getBearerToken();
  if (!token) throw new Error('未取得 Bearer Token');

  var startDateStr = options.startDate || "";
  var endDateStr = options.endDate || "";
  var durationVal = (options.duration != null && !isNaN(options.duration)) ? Number(options.duration) : 1.5;
  var courseMinutes = Math.round(durationVal * 60);
  if (courseMinutes <= 0) courseMinutes = 90;
  var weekDaysStr = options.weekDays || "";
  var timeStartStr = options.timeStart || "";
  var timeEndStr = options.timeEnd || "";

  var slotTimes = SLOT_TIMES;
  if (timeStartStr && timeEndStr) {
    var startMin = hhmmToMinutes_(timeStartStr);
    var endMin = hhmmToMinutes_(timeEndStr);
    slotTimes = SLOT_TIMES.filter(function (hhmm) {
      var m = hhmmToMinutes_(hhmm);
      return m >= startMin && m + courseMinutes <= endMin;
    });
  }
  if (!slotTimes.length) slotTimes = SLOT_TIMES;

  var weekDaySet = {};
  if (weekDaysStr) {
    weekDaysStr.split(",").forEach(function (s) {
      var n = parseInt(s.trim(), 10);
      if (!isNaN(n) && n >= 0 && n <= 6) weekDaySet[n] = true;
    });
  }

  var datesToQuery = [];
  var now = new Date();
  if (startDateStr && endDateStr) {
    var startD = parseDateOnly_(startDateStr);
    var endD = parseDateOnly_(endDateStr);
    if (startD && endD && startD.getTime() <= endD.getTime()) {
      var cur = new Date(startD.getTime());
      while (cur.getTime() <= endD.getTime()) {
        if (Object.keys(weekDaySet).length === 0 || weekDaySet[cur.getDay()]) {
          datesToQuery.push(Utilities.formatDate(cur, TZ, "yyyy-MM-dd"));
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  if (datesToQuery.length === 0) {
    for (var d = 0; d <= 7; d++) {
      var dayDate = addDays_(now, d);
      if (Object.keys(weekDaySet).length === 0 || weekDaySet[dayDate.getDay()]) {
        datesToQuery.push(Utilities.formatDate(dayDate, TZ, "yyyy-MM-dd"));
      }
    }
  }

  var lines = [];
  for (var i = 0; i < datesToQuery.length; i++) {
    var dayStr = datesToQuery[i];
    var dayDate = parseDateOnly_(dayStr);
    var weekdayZh = dayDate ? ("星期" + "日一二三四五六".charAt(dayDate.getDay())) : "";

    var resp = runEmptyApi_(dayStr, sayId, token);
    var reservations = normalizeReservations_(resp);

    var result = listAvailableSlotsOneDay_(
      reservations,
      String(sayId),
      slotTimes,
      courseMinutes,
      dayStr
    );

    var prettySlots = (result.availableSlots && result.availableSlots.length)
      ? result.availableSlots.join("、")
      : "（無）";
    if (!reservations.length) {
      prettySlots = slotTimes.join("、");
    }

    // 顯示日期不帶年份（MM-DD），LINE bot / 查詢空位產出一致
    var dateDisplay = (dayStr && dayStr.length >= 10 && dayStr.charAt(4) === "-") ? dayStr.substring(5) : dayStr;
    lines.push(dateDisplay + "（" + weekdayZh + "）：" + prettySlots);
  }

  var output = lines.join("\n");
  Logger.log(output);
  return output;
}

function parseDateOnly_(str) {
  if (!str || typeof str !== "string") return null;
  str = str.trim().replace(/\//g, "-");
  var parts = str.split("-");
  if (parts.length < 3) return null;
  var y = parseInt(parts[0], 10);
  var m = parseInt(parts[1], 10) - 1;
  var d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  var date = new Date(y, m, d);
  if (date.getFullYear() !== y || date.getMonth() !== m || date.getDate() !== d) return null;
  return date;
}

// ==========================================
// 下方輔助函式維持不變
// ==========================================

function runEmptyApi_(dateStr, storId, token) {
  var apiUrl =
    "https://saywebdatafeed.saydou.com/api/management/calendar/events/full"
    + "?startDate=" + encodeURIComponent(dateStr)
    + "&endDate=" + encodeURIComponent(dateStr)
    + "&storid=" + encodeURIComponent(storId)
    + "&status%5B%5D=reservation"
    + "&status%5B%5D=hasshow"
    + "&status%5B%5D=confirm"
    + "&status%5B%5D=checkout"
    + "&holiday=1";

  var options = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  try {
    var res = UrlFetchApp.fetch(apiUrl, options);
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      return JSON.parse(res.getContentText());
    } else {
      Logger.log("API Error " + code + " " + res.getContentText());
      return null;
    }
  } catch (e) {
    Logger.log("Fetch Error: " + e);
    return null;
  }
}

/** 把各種回傳樣式統一成 reservation 陣列 */
function normalizeReservations_(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp.data)) return resp.data;
  if (Array.isArray(resp.reservation)) return resp.reservation;
  if (resp.data && Array.isArray(resp.data.reservation)) return resp.data.reservation;
  return [];
}

// ===== 時間/區間工具與主邏輯 =====

function dateKeyFromISODateTime_(s) {
  if (!s) return "";
  var parts = s.indexOf("T") >= 0 ? s.split("T") : s.split(" ");
  return parts[0].trim();
}

function parseHM_(str) {
  var arr = str.split(":");
  return { H: parseInt(arr[0], 10), M: parseInt(arr[1], 10) };
}
function hhmmToMinutes_(hhmm) {
  var t = parseHM_(hhmm);
  return t.H * 60 + t.M;
}
function minutesFromMidnight_(iso) {
  var t = (iso.indexOf("T") >= 0 ? iso.split("T")[1] : iso.split(" ")[1]);
  var HM = t.split(":");
  var H = parseInt(HM[0], 10);
  var M = parseInt(HM[1], 10);
  return H * 60 + M;
}
function mergeIntervals_(intervals) {
  var arr = intervals.slice().sort(function(a, b) { return a[0] - b[0]; });
  var merged = [];
  for (var i = 0; i < arr.length; i++) {
    var it = arr[i];
    if (!merged.length || it[0] > merged[merged.length - 1][1]) {
      merged.push([it[0], it[1]]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], it[1]);
    }
  }
  return merged;
}
function overlapsAny_(busyMerged, start, end) {
  for (var i = 0; i < busyMerged.length; i++) {
    var b0 = busyMerged[i][0], b1 = busyMerged[i][1];
    if (end <= b0) return false;
    if (start >= b1) continue;
    return true;
  }
  return false;
}
function isAnyResourceFree_(busyByResourceMerged, startMin, endMin) {
  if (busyByResourceMerged.length === 0) return true; 

  for (var i = 0; i < busyByResourceMerged.length; i++) {
    if (!overlapsAny_(busyByResourceMerged[i], startMin, endMin)) return true;
  }
  return false;
}

function listAvailableSlotsOneDay_(reservations, storeId, slotTimes, courseMinutes, defaultDateStr) {
  var filtered = reservations.filter(function(r) {
    if (r.aprove !== "Y") return false;
    if (String(r.storid) !== String(storeId)) return false; 
    if (!r.rsvtim || !r.endtim) return false;
    var isRest = (r.rsname && String(r.rsname).trim() === "休息")
              || (r.rsphon && String(r.rsphon).trim() === "0000000000");
    if (isRest) return false;
    return true;
  });

  if (!filtered.length) {
    return { date: defaultDateStr, availableSlots: [] };
  }

  var dateKey = dateKeyFromISODateTime_(filtered[0].rsvtim);
  var byResource = {};
  for (var i = 0; i < filtered.length; i++) {
    var r = filtered[i];
    var rid = String(r.usrsid || "__unknown__");
    var startMin = minutesFromMidnight_(r.rsvtim);
    var endMin = minutesFromMidnight_(String(r.endtim).replace(" ", "T"));
    if (!byResource[rid]) byResource[rid] = [];
    byResource[rid].push([startMin, endMin]);
  }

  var busyByResourceMerged = [];
  var keys = Object.keys(byResource);
  for (var k = 0; k < keys.length; k++) {
    busyByResourceMerged.push(mergeIntervals_(byResource[keys[k]]));
  }

  var available = [];
  for (var j = 0; j < slotTimes.length; j++) {
    var hhmm = slotTimes[j];
    var start = hhmmToMinutes_(hhmm);
    var ok = isAnyResourceFree_(busyByResourceMerged, start, start + courseMinutes);
    if (ok) available.push(hhmm);
  }

  return { date: dateKey, availableSlots: available };
}

function addDays_(dateObj, days) {
  var d = new Date(dateObj.getTime());
  d.setDate(d.getDate() + days);
  return d;
}