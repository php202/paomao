/**
 * Core 報表產出：供「員工打卡 Line@」等專案跨專案取得昨日／明日／本月／員工樣態報告。
 * 各店訊息一覽表（客人 LINE）維持讀客人、回客人；Staff 在員工打卡打關鍵字取報表。
 */

var REPORT_HELPERS_TZ = "Asia/Taipei";
var REPORT_AI_ROW_HEADER = "姓名\t手機\t預約時間\t潔顏師\t課程／服務\t備註";

/**
 * 從 SayDou 備註文字解析出經手人（員工代碼）。
 * 備註沒有專屬員工編號欄，需從文字中比對：先比對員工代碼、再比對員工姓名，取最長符合者。
 * @param {string} remarkText - 備註全文
 * @param {Object} empMap - 員工代碼→姓名 { "nk001": "王小明", ... }
 * @returns {string|null} 員工代碼，無法解析時回傳 null
 */
function parseEmployeeFromRemark(remarkText, empMap) {
  if (!remarkText || String(remarkText).trim() === "") return null;
  var text = String(remarkText).trim();
  if (!empMap || typeof empMap !== "object") return null;
  var bestCode = null;
  var bestLen = 0;
  var codes = Object.keys(empMap);
  for (var i = 0; i < codes.length; i++) {
    var code = codes[i];
    if (!code || code.length <= bestLen) continue;
    if (text.indexOf(code) !== -1) {
      bestCode = code;
      bestLen = code.length;
    }
  }
  var names = Object.keys(empMap).map(function (c) { return { code: c, name: empMap[c] }; }).filter(function (x) { return x.name && String(x.name).trim(); });
  names.sort(function (a, b) { return (b.name.length - a.name.length); });
  for (var j = 0; j < names.length; j++) {
    var name = String(names[j].name).trim();
    if (name.length <= bestLen) continue;
    if (text.indexOf(name) !== -1) {
      bestCode = names[j].code;
      bestLen = name.length;
    }
  }
  return bestCode;
}

function sumTransactionsByRemark(transactions) {
  var total = 0;
  var byRemark = {};
  if (!transactions || transactions.length === 0) return { total: 0, byRemark: {} };
  var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    var amt = t.price_ != null ? Number(t.price_) : (t.rprice != null ? Number(t.rprice) : 0);
    total += amt;
    var rawRemark = (t.remark != null && String(t.remark).trim() !== "") ? String(t.remark).trim() : "";
    var key = parseEmployeeFromRemark(rawRemark, empMap);
    if (key == null) key = rawRemark || "（未填）";
    if (!byRemark[key]) byRemark[key] = 0;
    byRemark[key] += amt;
  }
  return { total: total, byRemark: byRemark };
}

function countTransactionsByRemark(transactions) {
  var byRemark = {};
  if (!transactions || transactions.length === 0) return {};
  var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
  for (var i = 0; i < transactions.length; i++) {
    var rawRemark = (transactions[i].remark != null && String(transactions[i].remark).trim() !== "") ? String(transactions[i].remark).trim() : "";
    var key = parseEmployeeFromRemark(rawRemark, empMap);
    if (key == null) key = rawRemark || "（未填）";
    byRemark[key] = (byRemark[key] || 0) + 1;
  }
  return byRemark;
}

function formatStoreYesterdaySales(storeName, dateStr, summed) {
  var lines = ["【" + storeName + "】昨日消費 " + dateStr, "總額: $" + (summed.total || 0), "--- 依經手人 ---"];
  var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
  var remarks = Object.keys(summed.byRemark || {}).sort();
  for (var i = 0; i < remarks.length; i++) {
    var code = remarks[i];
    var amt = summed.byRemark[code];
    var name = empMap[code] || "";
    var label = name ? code + " (" + name + ")" : code;
    lines.push(label + ": $" + amt);
  }
  if (remarks.length === 0) lines.push("（無交易或無備註）");
  return lines.join("\n");
}

/**
 * 依「日報表 產出」同一來源：fetchDailyIncome 的 totalRow 格式化成昨日營收文字
 */
function formatStoreYesterdayFromDailyIncome(storeName, dateStr, runData) {
  if (!runData) return "【" + storeName + "】昨日 " + dateStr + "\n（無營收資料）";
  var cashTotal = runData.sum_paymentMethod && runData.sum_paymentMethod[0] ? (runData.sum_paymentMethod[0].total || 0) : 0;
  var cashBusiness = runData.cashpay && runData.cashpay.business != null ? runData.cashpay.business : 0;
  var cashUnearn = runData.cashpay && runData.cashpay.unearn != null ? runData.cashpay.unearn : 0;
  var lineTotal = runData.sum_paymentMethod && runData.sum_paymentMethod[2] ? (runData.sum_paymentMethod[2].total || 0) : 0;
  var transferTotal = runData.sum_paymentMethod && runData.sum_paymentMethod[9] ? (runData.sum_paymentMethod[9].total || 0) : 0;
  var lineRecord = runData.paymentMethod && runData.paymentMethod[2] ? (runData.paymentMethod[2].total || 0) : 0;
  var transferRecord = runData.paymentMethod && runData.paymentMethod[9] ? (runData.paymentMethod[9].total || 0) : 0;
  var transferUnearn = transferTotal - transferRecord;
  var lineUnearn = lineTotal - lineRecord;
  var total = cashTotal + lineTotal + transferTotal;
  var out = [
    "【" + storeName + "】昨日營收 " + dateStr,
    "總額: $" + total,
    "--- 昨日營收（與日報表產出同源）---",
    "現金總額: $" + cashTotal + "（營收: $" + cashBusiness + "、未入帳: $" + cashUnearn + "）",
    "LINE: $" + lineTotal + (lineUnearn !== 0 ? "（未入帳: $" + lineUnearn + "）" : ""),
    "轉帳: $" + transferTotal + (transferUnearn !== 0 ? "（未入帳: $" + transferUnearn + "）" : "")
  ];
  return out.join("\n");
}

function getMonthDateRange(year, month) {
  var start = new Date(year, month - 1, 1);
  var end = new Date(year, month, 0);
  return {
    startDate: Utilities.formatDate(start, REPORT_HELPERS_TZ, "yyyy-MM-dd"),
    endDate: Utilities.formatDate(end, REPORT_HELPERS_TZ, "yyyy-MM-dd"),
    yearMonth: year + "-" + (month < 10 ? "0" + month : String(month))
  };
}

function formatStoreMonthlySales(storeName, startDate, endDate, yearMonth, summed) {
  var lines = ["【" + storeName + "】本月消費 " + yearMonth + " (" + startDate + " ~ " + endDate + ")", "總額: $" + (summed.total || 0), "--- 依經手人（當月總額）---"];
  var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
  var remarks = Object.keys(summed.byRemark || {}).sort();
  for (var i = 0; i < remarks.length; i++) {
    var code = remarks[i];
    var amt = summed.byRemark[code];
    var name = empMap[code] || "";
    var label = name ? code + " (" + name + ")" : code;
    lines.push(label + ": $" + amt);
  }
  if (remarks.length === 0) lines.push("（無交易或無備註）");
  return lines.join("\n");
}

/**
 * 產出昨日消費報告（Core 跨專案用）
 * 優先使用「日報表 產出」同源：fetchDailyIncome 取得今日營收；無資料時改以交易明細依經手人彙總
 */
function buildYesterdaySalesReport(dateStr) {
  if (!dateStr) {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    dateStr = Utilities.formatDate(yesterday, REPORT_HELPERS_TZ, "yyyy-MM-dd");
  }
  if (typeof getStoresInfo !== "function") {
    return { dateStr: dateStr, byStore: [] };
  }
  var stores = getStoresInfo();
  var byStore = [];
  var hasFetchDailyIncome = typeof fetchDailyIncome === "function";
  for (var i = 0; i < stores.length; i++) {
    var store = stores[i];
    var reportText = "";
    var total = 0;
    var byRemark = {};
    if (hasFetchDailyIncome) {
      try {
        var apiResponse = fetchDailyIncome(dateStr, store.id);
        if (apiResponse && apiResponse.data && apiResponse.data.totalRow) {
          var runData = apiResponse.data.totalRow;
          reportText = formatStoreYesterdayFromDailyIncome(store.name || ("店" + store.id), dateStr, runData);
          var cashTotal = (runData.sum_paymentMethod && runData.sum_paymentMethod[0] ? runData.sum_paymentMethod[0].total : 0) || 0;
          var lineTotal = (runData.sum_paymentMethod && runData.sum_paymentMethod[2] ? runData.sum_paymentMethod[2].total : 0) || 0;
          var transferTotal = (runData.sum_paymentMethod && runData.sum_paymentMethod[9] ? runData.sum_paymentMethod[9].total : 0) || 0;
          total = cashTotal + lineTotal + transferTotal;
        }
      } catch (e) {}
    }
    if (!reportText && typeof getTransactionsForStoreByDate === "function") {
      var transactions = getTransactionsForStoreByDate(store.id, dateStr);
      var summed = sumTransactionsByRemark(transactions);
      total = summed.total;
      byRemark = summed.byRemark;
      reportText = formatStoreYesterdaySales(store.name || ("店" + store.id), dateStr, summed);
    }
    if (!reportText) {
      reportText = "【" + (store.name || ("店" + store.id)) + "】昨日 " + dateStr + "\n（無營收資料）";
    }
    byStore.push({ storeId: store.id, storeName: store.name || ("店" + store.id), total: total, byRemark: byRemark, reportText: reportText });
  }
  return { dateStr: dateStr, byStore: byStore };
}

/**
 * 產出本月消費報告（Core 跨專案用）
 */
function buildMonthlySalesReport(year, month) {
  var now = new Date();
  var y = year != null ? year : now.getFullYear();
  var m = month != null ? month : (now.getMonth() + 1);
  var range = getMonthDateRange(y, m);
  if (typeof getStoresInfo !== "function" || typeof getTransactionsForStoreByDateRange !== "function") {
    return { yearMonth: range.yearMonth, startDate: range.startDate, endDate: range.endDate, byStore: [] };
  }
  var stores = getStoresInfo();
  var byStore = [];
  for (var i = 0; i < stores.length; i++) {
    var store = stores[i];
    var transactions = getTransactionsForStoreByDateRange(store.id, range.startDate, range.endDate);
    var summed = sumTransactionsByRemark(transactions);
    var byRemarkCount = countTransactionsByRemark(transactions);
    var reportText = formatStoreMonthlySales(store.name || ("店" + store.id), range.startDate, range.endDate, range.yearMonth, summed);
    byStore.push({
      storeId: store.id,
      storeName: store.name || ("店" + store.id),
      total: summed.total,
      byRemark: summed.byRemark,
      byRemarkCount: byRemarkCount,
      reportText: reportText
    });
  }
  return { yearMonth: range.yearMonth, startDate: range.startDate, endDate: range.endDate, byStore: byStore };
}

function normalizeReservationRow(r) {
  if (!r) return null;
  var phone = (r.rsphon != null && r.rsphon !== "") ? String(r.rsphon).trim() : (r.memb && r.memb.phone_) ? String(r.memb.phone_).trim() : "";
  var name = (r.rsname != null && r.rsname !== "") ? String(r.rsname).trim() : (r.memb && r.memb.memnam) ? String(r.memb.memnam).trim() : "";
  var rsvtim = r.rsvtim ? String(r.rsvtim).replace("T", " ").slice(0, 16) : "";
  var timeText = "";
  if (rsvtim) {
    var tPart = rsvtim.split(/[T\s]/)[1] || "";
    timeText = tPart.slice(0, 5); // HH:mm
  }
  var staffName = (r.usrs && r.usrs.usrnam) ? String(r.usrs.usrnam) : "";
  var services = (r.services != null) ? String(r.services) : "";
  var remark = (r.remark != null) ? String(r.remark) : "";
  return { phone: phone, name: name, rsvtim: rsvtim, timeText: timeText, staffName: staffName, services: services, remark: remark };
}

function formatStoreReportForAI(storeName, items) {
  var lines = ["【" + storeName + "】明日預約客人（給 AI 過水用）", REPORT_AI_ROW_HEADER];
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    lines.push([o.name || "—", o.phone || "—", o.rsvtim || "—", o.staffName || "—", (o.services || "—").replace(/\t/g, " "), (o.remark || "—").replace(/\n/g, " ")].join("\t"));
  }
  if (items.length === 0) lines.push("（無預約）");
  return lines.join("\n");
}

function getTomorrowReservationsByStore(dateStr) {
  if (typeof getStoresInfo !== "function" || typeof fetchReservationsAndOffs !== "function") return [];
  var stores = getStoresInfo();
  var out = [];
  for (var i = 0; i < stores.length; i++) {
    var store = stores[i];
    var res = fetchReservationsAndOffs(store.id, dateStr, dateStr);
    var reservations = res.reservations || [];
    var items = [];
    for (var j = 0; j < reservations.length; j++) {
      var row = normalizeReservationRow(reservations[j]);
      if (row) items.push(row);
    }
    items.sort(function (a, b) { return (a.rsvtim || "").localeCompare(b.rsvtim || ""); });
    out.push({ storeId: store.id, storeName: store.name || ("店" + store.id), items: items });
  }
  return out;
}

/**
 * 產出明日預約報告（Core 跨專案用）
 */
function buildTomorrowReservationReport(dateStr) {
  if (!dateStr) {
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateStr = Utilities.formatDate(tomorrow, REPORT_HELPERS_TZ, "yyyy-MM-dd");
  }
  var byStore = getTomorrowReservationsByStore(dateStr);
  for (var i = 0; i < byStore.length; i++) {
    byStore[i].reportText = formatStoreReportForAI(byStore[i].storeName, byStore[i].items);
  }
  return { dateStr: dateStr, byStore: byStore };
}

/**
 * 寫入員工每月樣態到試算表並回傳連結
 */
function writeEmployeeMonthlySummaryToSheet(ssId, result) {
  if (!result || !result.byStore || !ssId) return null;
  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("員工每月樣態");
    if (!sheet) {
      sheet = ss.insertSheet("員工每月樣態");
      sheet.appendRow(["年月", "店名", "員工代碼", "員工姓名", "當月總額", "筆數"]);
    }
    var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
    for (var i = 0; i < result.byStore.length; i++) {
      var b = result.byStore[i];
      var codes = Object.keys(b.byRemark || {}).sort();
      for (var j = 0; j < codes.length; j++) {
        var code = codes[j];
        var amt = b.byRemark[code] || 0;
        var cnt = (b.byRemarkCount && b.byRemarkCount[code]) ? b.byRemarkCount[code] : 0;
        var name = empMap[code] || "";
        sheet.appendRow([result.yearMonth, b.storeName, code, name, amt, cnt]);
      }
    }
    return ss.getUrl() + "#gid=" + sheet.getSheetId();
  } catch (e) {
    console.warn("[Core] writeEmployeeMonthlySummaryToSheet:", e);
    return null;
  }
}

/**
 * 僅寫入篩選後的門市到員工每月樣態（依管理者清單）
 * 資料來源：SayDou 消費交易 API，依每筆交易的「備註／經手人」欄彙總；無交易或未填經手人時仍寫一列說明，避免試算表全空。
 */
function writeEmployeeMonthlySummaryToSheetFromFiltered(ssId, result, filteredByStore) {
  if (!result || !filteredByStore || filteredByStore.length === 0 || !ssId) return null;
  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName("員工每月樣態");
    if (!sheet) {
      sheet = ss.insertSheet("員工每月樣態");
      sheet.appendRow(["年月", "店名", "員工代碼", "員工姓名", "當月總額", "筆數"]);
    }
    var empMap = (typeof getEmployeeCodeToNameMap === "function") ? getEmployeeCodeToNameMap() : {};
    for (var i = 0; i < filteredByStore.length; i++) {
      var b = filteredByStore[i];
      var codes = Object.keys(b.byRemark || {}).sort();
      if (codes.length > 0) {
        for (var j = 0; j < codes.length; j++) {
          var code = codes[j];
          var amt = b.byRemark[code] || 0;
          var cnt = (b.byRemarkCount && b.byRemarkCount[code]) ? b.byRemarkCount[code] : 0;
          var name = empMap[code] || "";
          sheet.appendRow([result.yearMonth, b.storeName, code, name, amt, cnt]);
        }
      } else {
        sheet.appendRow([result.yearMonth, b.storeName, "—", "（當月無交易或無經手人備註）", 0, 0]);
      }
    }
    return ss.getUrl() + "#gid=" + sheet.getSheetId();
  } catch (e) {
    console.warn("[Core] writeEmployeeMonthlySummaryToSheetFromFiltered:", e);
    return null;
  }
}

var REPORT_MAX_REPLY_LEN = 4500;
var REPORT_TEMP_SHEET_NAME = "關鍵字報告暫存";

/** 關鍵字對應報告類型（與各店訊息一覽表 KEYWORD_LIST 對齊，供員工打卡等專案用） */
var REPORT_KEYWORD_RULES = [
  { keywords: ["昨日報告", "昨日消費", "昨日"], handler: "yesterday", label: "昨日消費報告" },
  { keywords: ["明日預約", "明日預約報告", "明日"], handler: "tomorrow", label: "明日預約報告" },
  { keywords: ["本月報告", "本月消費", "月報"], handler: "monthly", label: "本月消費報告" },
  { keywords: ["員工樣態", "員工月報", "員工每月"], handler: "employee", label: "員工每月樣態" },
  { keywords: ["上月小費"], handler: "lastMonthTips", label: "上月小費" }
];

/**
 * 依使用者輸入取得報告 handler（供員工打卡等專案呼叫）
 * @param {string} msg - 使用者輸入（會 trim）
 * @returns {string|null} "yesterday" | "tomorrow" | "monthly" | "employee" 或 null
 */
function getReportHandlerFromKeyword(msg) {
  if (!msg || typeof msg !== "string") return null;
  var text = String(msg).trim();
  if (!text) return null;
  for (var i = 0; i < REPORT_KEYWORD_RULES.length; i++) {
    var rule = REPORT_KEYWORD_RULES[i];
    for (var j = 0; j < rule.keywords.length; j++) {
      if (text.indexOf(rule.keywords[j]) !== -1) return rule.handler;
    }
  }
  return null;
}

function writeReportToSheetAndGetLink(ssId, keywordLabel, reportText) {
  if (!ssId) return null;
  try {
    var ss = SpreadsheetApp.openById(ssId);
    var sheet = ss.getSheetByName(REPORT_TEMP_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(REPORT_TEMP_SHEET_NAME);
      sheet.appendRow(["時間", "關鍵字", "報告內容"]);
    }
    var timeStr = Utilities.formatDate(new Date(), REPORT_HELPERS_TZ, "yyyy-MM-dd HH:mm:ss");
    sheet.appendRow([timeStr, keywordLabel, reportText]);
    return ss.getUrl() + "#gid=" + sheet.getSheetId();
  } catch (e) {
    console.warn("[Core] writeReportToSheetAndGetLink:", e);
    return null;
  }
}

/**
 * 依關鍵字類型產出報告文字或試算表連結（供員工打卡等專案呼叫）
 * 報告過長（> REPORT_MAX_REPLY_LEN）時會寫入試算表並回傳連結
 * @param {string} handler - "yesterday" | "tomorrow" | "monthly" | "employee"
 * @param {Object} [options] - { reportSsId: "試算表ID" } 不傳則用 getCoreConfig().LINE_STORE_SS_ID
 * @returns {{ text: string, sheetLink?: string }}
 */
function filterByStoreIds(byStore, managedStoreIds) {
  if (!managedStoreIds || managedStoreIds.length === 0) return [];
  var ids = managedStoreIds.map(function (id) { return String(id).trim(); });
  return byStore.filter(function (b) {
    var sid = String(b.storeId || "").trim();
    var sname = (b.storeName || "").trim();
    for (var j = 0; j < ids.length; j++) {
      if (ids[j] === sid || ids[j] === sname) return true;
    }
    return false;
  });
}

function getReportTextForKeyword(handler, options) {
  // 暫時關閉：報告關鍵字功能（昨日報告、本月報告、上月小費文字版等）不產出內容
  return { text: "此報告功能暫時關閉，請稍後再試或聯繫管理員。" };

  options = options || {};
  var config = (typeof getCoreConfig === "function") ? getCoreConfig() : {};
  var reportSsId = options.reportSsId || config.LINE_STORE_SS_ID || null;
  var maxLen = options.maxReplyLen != null ? options.maxReplyLen : REPORT_MAX_REPLY_LEN;
  var managedStoreIds = options.managedStoreIds || [];
  var label = "";
  var text = "";

  if (managedStoreIds.length === 0) {
    return { text: "您無管理門市，無法顯示此報告。請於「管理者清單」設定您的管理門市，或聯繫管理員。" };
  }

  try {
  if (handler === "yesterday") {
    label = "昨日消費報告";
    var res = buildYesterdaySalesReport();
    var byStore = filterByStoreIds(res.byStore || [], managedStoreIds);
    var lines = ["📊 昨日消費報告 " + res.dateStr];
    if (byStore.length > 0) {
      for (var i = 0; i < byStore.length; i++) {
        lines.push("\n" + (byStore[i].reportText || ""));
      }
    } else {
      lines.push("\n（您管理的門市無資料）");
    }
    text = lines.join("\n");
  } else if (handler === "tomorrow") {
    label = "明日預約報告";
    var tmr = buildTomorrowReservationReport();
    var tmrByStore = filterByStoreIds(tmr.byStore || [], managedStoreIds);
    var tmrLines = ["📅 明日預約報告 " + tmr.dateStr];
    if (tmrByStore.length > 0) {
      for (var k = 0; k < tmrByStore.length; k++) {
        tmrLines.push("\n" + (tmrByStore[k].reportText || ""));
      }
    } else {
      tmrLines.push("\n（您管理的門市無資料）");
    }
    text = tmrLines.join("\n");
  } else if (handler === "monthly") {
    label = "本月消費報告";
    var mon = buildMonthlySalesReport();
    var monByStore = filterByStoreIds(mon.byStore || [], managedStoreIds);
    var monLines = ["📊 本月消費報告 " + mon.yearMonth + " (" + mon.startDate + " ~ " + mon.endDate + ")"];
    if (monByStore.length > 0) {
      for (var m = 0; m < monByStore.length; m++) {
        monLines.push("\n" + (monByStore[m].reportText || ""));
      }
    } else {
      monLines.push("\n（您管理的門市無資料）");
    }
    text = monLines.join("\n");
  } else if (handler === "employee") {
    label = "員工每月樣態";
    var empRes = buildMonthlySalesReport();
    var empByStore = filterByStoreIds(empRes.byStore || [], managedStoreIds);
    var link = writeEmployeeMonthlySummaryToSheetFromFiltered(reportSsId, empRes, empByStore);
    var empNote = "\n\n※ 資料來源：SayDou 消費交易「備註／經手人」欄。若某店顯示「當月無交易或無經手人備註」，表示當月無消費或消費單未填經手人。";
    if (link) {
      return { text: "📊 員工每月樣態已產出（僅您管理的門市）。\n請至試算表查看：\n" + link + empNote, sheetLink: link };
    }
    return { text: "📊 員工每月樣態已寫入試算表「員工每月樣態」，請開啟試算表查看。" + empNote };
  } else if (handler === "lastMonthTips") {
    label = "上月小費";
    if (typeof buildLastMonthTipsReport !== "function") {
      text = "上月小費報告功能未就緒（請確認 TipsReport.js 已加入專案）。";
    } else {
      var tipsReport = buildLastMonthTipsReport();
      var tipsRows = tipsReport.rows || [];
      var ids = managedStoreIds.map(function (id) { return String(id).trim(); });
      var filtered = tipsRows.filter(function (r) {
        var sid = (r.門店SayDouId != null && r.門店SayDouId !== "") ? String(r.門店SayDouId).trim() : "";
        if (!sid) return false;
        for (var ki = 0; ki < ids.length; ki++) {
          if (ids[ki] === sid) return true;
        }
        return false;
      });
      var tipLines = ["📋 上月小費 " + (tipsReport.startDate || "") + " ~ " + (tipsReport.endDate || "") + "（您管理的門市）"];
      if (filtered.length > 0) {
        var byStoreName = {};
        for (var fi = 0; fi < filtered.length; fi++) {
          var r = filtered[fi];
          var sn = (r.門店 && String(r.門店).trim()) ? r.門店 : "其他";
          if (!byStoreName[sn]) byStoreName[sn] = [];
          byStoreName[sn].push(r);
        }
        for (var storeKey in byStoreName) {
          tipLines.push("\n【" + storeKey + "】");
          var list = byStoreName[storeKey];
          for (var li = 0; li < list.length; li++) {
            var x = list[li];
            tipLines.push("  " + (x.建立時間 || "") + " " + (x.會員 || "") + " " + (x.手機 || "") + " 小費:" + (x.小費 || "") + " 星數:" + (x.星數 || "") + (x.意見 ? " " + (x.意見.length > 20 ? x.意見.slice(0, 20) + "…" : x.意見) : ""));
          }
        }
      } else {
        tipLines.push("\n（您管理的門市當月無小費／五星好評紀錄）");
      }
      text = tipLines.join("\n");
    }
  } else {
    return { text: "（未知報告類型）" };
  }

  if (text.length > maxLen && reportSsId) {
    var url = writeReportToSheetAndGetLink(reportSsId, label, text);
    if (url) {
      return { text: "📊 " + label + " 資料較多，已寫入試算表：\n" + url, sheetLink: url };
    }
  }
  return { text: text };
  } catch (e) {
    console.warn("[Core] getReportTextForKeyword:", e);
    return { text: "報告產出時發生錯誤（" + (e && e.message ? e.message : String(e)) + "），請稍後再試或聯繫管理員。" };
  }
}
