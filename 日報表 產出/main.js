/**
 * 日報表 產出 - 本專案不依賴 Core 程式庫，一律透過 Core API URL 取得資料。
 * 若出現 "ReferenceError: Core is not defined"：請在專案「專案設定」→「程式庫」移除 Core；
 * 確認試算表綁定的附加專案為本專案；並執行 clasp push 部署最新版。
 *
 * 指令碼屬性：
 * - PAO_CAT_CORE_API_URL：PaoMao_Core「網路應用程式」部署網址（結尾 /exec）
 * - PAO_CAT_SECRET_KEY：與 Core 相同的密鑰
 */
function getCoreApiParams() {
  const p = PropertiesService.getScriptProperties();
  const url = (p.getProperty('PAO_CAT_CORE_API_URL') || '').trim();
  const key = (p.getProperty('PAO_CAT_SECRET_KEY') || '').trim();
  return { url, key, useApi: url.length > 0 && key.length > 0 };
}

/**
 * 呼叫 Core API（GET）。回傳 { status, data } 或 null（連線/解析失敗）。
 */
function callCoreApi(coreApiUrl, coreApiKey, action, extraParams) {
  if (!coreApiUrl || !coreApiKey) return null;
  const sep = coreApiUrl.indexOf('?') >= 0 ? '&' : '?';
  let q = sep + 'key=' + encodeURIComponent(coreApiKey) + '&action=' + encodeURIComponent(action);
  if (extraParams && typeof extraParams === 'object') {
    Object.keys(extraParams).forEach(function (k) {
      if (extraParams[k] != null && extraParams[k] !== '') {
        q += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(String(extraParams[k]));
      }
    });
  }
  try {
    const res = UrlFetchApp.fetch(coreApiUrl + q, { muteHttpExceptions: true, followRedirects: true });
    const text = res.getContentText();
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

/**
 * 日報表 產出 - Web App API（URL 化）
 * 部署為「網路應用程式」後，可用 GET/POST 觸發日報產出。
 *
 * 【呼叫方式】
 * GET:  PAO_CAT_REPORT_API_URL?key=密鑰&action=runDailyReport
 * POST: body JSON: { "key": "密鑰", "action": "runDailyReport" }
 *
 * 密鑰：與本專案指令碼屬性 PAO_CAT_SECRET_KEY 相同（可與 Core API 共用）。
 * action 支援：runDailyReport（執行產出各店日報，等同選單「產出各店日報」）
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  return handleReportApiRequest(params);
}

function doPost(e) {
  let params = {};
  if (e && e.postData && e.postData.contents) {
    try {
      params = JSON.parse(e.postData.contents);
    } catch (err) {
      return jsonReportOut({ status: 'error', message: 'JSON 解析失敗' });
    }
  }
  return handleReportApiRequest(params);
}

function jsonReportOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleReportApiRequest(params) {
  const key = (params.key != null) ? String(params.key).trim() : '';
  const expected = getCoreApiParams().key;
  if (!expected || key !== expected) {
    return jsonReportOut({ status: 'error', message: 'unauthorized' });
  }
  const action = (params.action != null) ? String(params.action).trim() : '';
  if (action === 'runDailyReport' || action === 'runAccNeed') {
    try {
      runAccNeed();
      return jsonReportOut({ status: 'ok', message: '日報產出已執行' });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      if (msg.indexOf('Core is not defined') !== -1) {
        return jsonReportOut({
          status: 'error',
          message: 'ReferenceError: Core is not defined。本專案已改為使用 Core API，不應依賴 Core 程式庫。請依序檢查：1) 專案「擴充功能→Apps Script 專案」確認此試算表綁定的是「日報表 產出」專案；2) 在該專案「專案設定」中移除 Core 程式庫（程式庫應為空）；3) 指令碼屬性已設定 PAO_CAT_CORE_API_URL、PAO_CAT_SECRET_KEY；4) 本機已執行 clasp push 部署最新版。'
        });
      }
      return jsonReportOut({ status: 'error', message: msg });
    }
  }
  if (action === 'runYangmeiJinshanDailyReport') {
    try {
      runYangmeiJinshanDailyReport();
      return jsonReportOut({ status: 'ok', message: '楊梅金山店日帳已產出' });
    } catch (err) {
      const msg = (err && err.message) ? err.message : String(err);
      return jsonReportOut({ status: 'error', message: msg });
    }
  }
  return jsonReportOut({ status: 'error', message: '未知 action: ' + (action || '(未提供)') });
}

function runAccNeed() {
  const { url: coreApiUrl, key: coreApiKey, useApi } = getCoreApiParams();
  if (!useApi) {
    throw new Error('請在指令碼屬性設定 PAO_CAT_CORE_API_URL 與 PAO_CAT_SECRET_KEY，本專案改由 Core API 取得資料（不再使用 Core 程式庫）。');
  }

  // --- 從 Core API 取得日報試算表 ID ---
  const configRes = callCoreApi(coreApiUrl, coreApiKey, 'getCoreConfig', {});
  const ssId = (configRes && configRes.status === 'ok' && configRes.data && configRes.data.DAILY_ACCOUNT_REPORT_SS_ID)
    ? String(configRes.data.DAILY_ACCOUNT_REPORT_SS_ID).trim()
    : '';
  if (!ssId) {
    throw new Error('Core API getCoreConfig 未回傳 DAILY_ACCOUNT_REPORT_SS_ID，請確認 PaoMao_Core 專案設定。');
  }

  const externalSs = SpreadsheetApp.openById(ssId);
  const sheetAll = externalSs.getSheetByName('營收報表');       // 全門市
  const sheetDirect = externalSs.getSheetByName('營收報表_直營'); // 直營店

  const timeZone = externalSs.getSpreadsheetTimeZone();
  const getFormattedDate = (date) => Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');

  // --- 1. 計算日期範圍 (每次執行都會重新檢查 Excel 進度) ---
  const lastRowCheck = sheetAll.getLastRow();
  let startDate = new Date('2026-01-01');

  if (lastRowCheck > 1) {
    const dates = sheetAll.getRange('B2:B' + lastRowCheck).getValues().flat().filter(String);
    if (dates.length > 0) {
      const lastDate = new Date(dates[dates.length - 1]);
      startDate = new Date(lastDate);
      startDate.setDate(startDate.getDate() + 1); // 從最後一筆的"明天"開始
    }
  }

  const today = new Date();
  const endDate = new Date(today); // 抓到今天（含今日業績）

  if (startDate > endDate) {
    console.log("資料已是最新，無需更新。");
    return;
  }

  console.log(`本次預計處理區間: ${getFormattedDate(startDate)} ~ ${getFormattedDate(endDate)}`);

  // --- 2. 從 Core API 取得門店列表 ---
  const storeRes = callCoreApi(coreApiUrl, coreApiKey, 'getLineSayDouInfoMap', {});
  const storeMap = (storeRes && storeRes.status === 'ok' && storeRes.data && typeof storeRes.data === 'object') ? storeRes.data : {};
  let stores = [];
  for (const info of Object.values(storeMap)) {
    if (info && info.saydouId) {
      stores.push({
        storid: info.saydouId,
        alias: info.name || '',
        isDirect: info.isDirect === true
      });
    }
  }
  console.log(`取得店家數: ${stores.length}`);

  /**
   * 建立「日期|店家」-> 列號(1-based) 對照表，用於重複時更新
   * B 欄：日期、C 欄：店家
   */
  function buildDateStoreRowMap(sheet) {
    const map = {};
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return map;
    const data = sheet.getRange(2, 2, lastRow, 3).getValues(); // B 欄=日期, C 欄=店家
    for (let r = 0; r < data.length; r++) {
      const dateVal = data[r][0];   // B 欄：日期
      const storeVal = data[r][1];  // C 欄：店家
      const dateStr = dateVal != null ? (typeof dateVal === 'object' && dateVal.getTime ? Utilities.formatDate(dateVal, timeZone, 'yyyy-MM-dd') : String(dateVal).trim()) : '';
      const storeStr = storeVal != null ? String(storeVal).trim() : '';
      if (dateStr && storeStr) map[dateStr + '|' + storeStr] = r + 2; // 列號 1-based，資料從第 2 列起
    }
    return map;
  }

  let rowMapAll = buildDateStoreRowMap(sheetAll);
  let rowMapDirect = buildDateStoreRowMap(sheetDirect);

  // --- 3. 逐日執行並寫入 (關鍵修改區) ---
  
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = getFormattedDate(currentDate);
    console.log(`🔄 [${dateStr}] 開始抓取...`);

    // 每一天都重新建立暫存陣列，跑完一天就清空
    let dailyAllRows = [];    
    let dailyDirectRows = []; 

    for (const store of stores) {
      // console.log(dateStr, store.storid); // 減少 log 避免執行過慢，除非除錯

      // 一律透過 Core API 取得單店單日營收（本專案不再使用 Core 程式庫）
      const dailyRes = callCoreApi(coreApiUrl, coreApiKey, 'fetchDailyIncome', { date: dateStr, storeId: String(store.storid) });
      const apiResponse = (dailyRes && dailyRes.status === 'ok') ? dailyRes.data : null;
      if (!apiResponse && dailyRes && dailyRes.message) {
        console.error(`Core API fetchDailyIncome 失敗 (${dateStr}, ${store.storid}): ` + dailyRes.message);
      }

      if (apiResponse && apiResponse.data && apiResponse.data.totalRow) {
        const runData = apiResponse.data.totalRow;

        // 計算邏輯
        const cashTotal = runData.sum_paymentMethod?.[0]?.total || 0;
        const cashBusiness = runData.cashpay?.business || 0;
        const cashUnearn = runData.cashpay?.unearn || 0;
        const lineTotal = runData.sum_paymentMethod?.[2]?.total || 0;
        const transferTotal = runData.sum_paymentMethod?.[9]?.total || 0;
        const thirdPayTotal = lineTotal + transferTotal;
        const lineRecord = runData.paymentMethod?.[2]?.total || 0;
        const transferRecord = runData.paymentMethod?.[9]?.total || 0;
        const transferUnearn = transferTotal - transferRecord;
        const lineUnearn = lineTotal - lineRecord;
        const todayService = runData.businessIncome?.service ?? 0; // 今日業績 (L 欄)

        const rowData = [
          dateStr,        // B 欄：日期
          store.alias,    // C 欄：店家
          cashTotal,
          cashBusiness,
          cashUnearn,
          thirdPayTotal,
          transferRecord,
          lineRecord,
          transferUnearn,
          lineUnearn,
          todayService   // L 欄：今日業績 (fetchDailyIncome > data > totalRow > businessIncome > service)
        ];

        dailyAllRows.push(rowData);
        if (store.isDirect === true) {
          dailyDirectRows.push(rowData);
        }
      }
    }

    // --- 4. 寫入當天資料：日期+店家重複則更新，否則新增 ---
    
    const numCols = 11; // B~L：日期、店家、9 個數值欄

    // (A) 全門市：拆成「要更新」與「要新增」
    if (dailyAllRows.length > 0) {
      const toUpdateAll = [];
      const toAppendAll = [];
      for (const row of dailyAllRows) {
        const key = row[0] + '|' + (row[1] != null ? String(row[1]).trim() : '');
        const existingRow = rowMapAll[key];
        if (existingRow) {
          toUpdateAll.push({ rowIndex: existingRow, row: row });
        } else {
          toAppendAll.push(row);
        }
      }
      for (const { rowIndex, row } of toUpdateAll) {
        sheetAll.getRange(rowIndex, 2, 1, numCols).setValues([row]);
      }
      if (toAppendAll.length > 0) {
        const lastRowAll = sheetAll.getLastRow();
        const startRow = lastRowAll + 1;
        sheetAll.getRange(startRow, 2, toAppendAll.length, numCols).setValues(toAppendAll);
        for (let i = 0; i < toAppendAll.length; i++) {
          rowMapAll[toAppendAll[i][0] + '|' + (toAppendAll[i][1] != null ? String(toAppendAll[i][1]).trim() : '')] = startRow + i;
        }
      }
    }

    // (B) 直營店：同上
    if (dailyDirectRows.length > 0) {
      const toUpdateDirect = [];
      const toAppendDirect = [];
      for (const row of dailyDirectRows) {
        const key = row[0] + '|' + (row[1] != null ? String(row[1]).trim() : '');
        const existingRow = rowMapDirect[key];
        if (existingRow) {
          toUpdateDirect.push({ rowIndex: existingRow, row: row });
        } else {
          toAppendDirect.push(row);
        }
      }
      for (const { rowIndex, row } of toUpdateDirect) {
        sheetDirect.getRange(rowIndex, 2, 1, numCols).setValues([row]);
      }
      if (toAppendDirect.length > 0) {
        const lastRowDirect = sheetDirect.getLastRow();
        const startRow = lastRowDirect + 1;
        sheetDirect.getRange(startRow, 2, toAppendDirect.length, numCols).setValues(toAppendDirect);
        for (let i = 0; i < toAppendDirect.length; i++) {
          rowMapDirect[toAppendDirect[i][0] + '|' + (toAppendDirect[i][1] != null ? String(toAppendDirect[i][1]).trim() : '')] = startRow + i;
        }
      }
    }

    // (C) 強制儲存 (關鍵！)
    SpreadsheetApp.flush(); 
    
    console.log(`✅ [${dateStr}] 寫入完成 (全門市:${dailyAllRows.length}筆 / 直營:${dailyDirectRows.length}筆)`);

    // --- 5. 進入下一天 ---
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log("所有作業完成！");
}

/**
 * 楊梅金山店 日帳報表（一次性使用，跑完可刪）
 * 每跑一天就 append 進「營收報表_楊梅金山」，持續跑到今天。若逾時當機，下次執行會從最後一天續跑。
 */
function runYangmeiJinshanDailyReport() {
  const STORE_NAME = '楊梅金山';
  const START_DATE_STR = '2025-03-01';

  const { url: coreApiUrl, key: coreApiKey, useApi } = getCoreApiParams();
  if (!useApi) {
    throw new Error('請在指令碼屬性設定 PAO_CAT_CORE_API_URL 與 PAO_CAT_SECRET_KEY。');
  }

  const configRes = callCoreApi(coreApiUrl, coreApiKey, 'getCoreConfig', {});
  const ssId = (configRes && configRes.status === 'ok' && configRes.data && configRes.data.DAILY_ACCOUNT_REPORT_SS_ID)
    ? String(configRes.data.DAILY_ACCOUNT_REPORT_SS_ID).trim()
    : '';
  if (!ssId) {
    throw new Error('Core API getCoreConfig 未回傳 DAILY_ACCOUNT_REPORT_SS_ID。');
  }

  const storeRes = callCoreApi(coreApiUrl, coreApiKey, 'getLineSayDouInfoMap', {});
  const storeMap = (storeRes && storeRes.status === 'ok' && storeRes.data && typeof storeRes.data === 'object') ? storeRes.data : {};
  let targetStore = null;
  for (const info of Object.values(storeMap)) {
    if (info && info.saydouId && (info.name || '').indexOf(STORE_NAME) >= 0) {
      targetStore = { storid: info.saydouId, alias: info.name || STORE_NAME };
      break;
    }
  }
  if (!targetStore) {
    throw new Error('找不到店家「' + STORE_NAME + '」。');
  }

  const externalSs = SpreadsheetApp.openById(ssId);
  const timeZone = externalSs.getSpreadsheetTimeZone();
  const getFormattedDate = (date) => Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');

  const SHEET_NAME = '營收報表_楊梅金山';
  let sheet = externalSs.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = externalSs.insertSheet(SHEET_NAME);

  const HEADERS = ['日期', '店家', '現金總額', '消費紀錄(現金)', '儲值(現金)', '第三方總額', '轉帳入帳', 'LINE入帳', '轉帳未收', 'LINE未收', '今日業績'];
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  }

  // --- 抓金山店表最後一天：從「營收報表_楊梅金山」最後一列取得日期，下次從該日+1 繼續跑；起點不早於 2025-03-01，終點為今天 ---
  const minStartDate = new Date(START_DATE_STR);
  let nextDate;
  if (sheet.getLastRow() >= 2) {
    const lastDateVal = sheet.getRange(sheet.getLastRow(), 1).getValue();
    const lastDateStr = lastDateVal != null ? (typeof lastDateVal === 'object' && lastDateVal.getTime ? getFormattedDate(lastDateVal) : String(lastDateVal).trim()) : '';
    if (lastDateStr) {
      const lastDate = new Date(lastDateStr);
      nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 1);
    }
  }
  if (!nextDate || nextDate < minStartDate) {
    nextDate = new Date(minStartDate);
  }

  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (nextDate > today) {
    const excelUrl = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx&gid=' + sheet.getSheetId();
    try {
      const ui = SpreadsheetApp.getUi();
      if (ui) ui.alert('楊梅金山店日帳已全部完成。\n\n下載 Excel：\n' + excelUrl);
    } catch (e) {}
    return;
  }

  // --- 持續跑：每跑一天就 append 進 sheet，直到今天為止（若逾時當機，下次執行會從最後一天續跑）---
  let currentDate = new Date(nextDate);
  let processed = 0;
  while (currentDate <= today) {
    const dateStr = getFormattedDate(currentDate);
    const dailyRes = callCoreApi(coreApiUrl, coreApiKey, 'fetchDailyIncome', { date: dateStr, storeId: String(targetStore.storid) });
    const apiResponse = (dailyRes && dailyRes.status === 'ok') ? dailyRes.data : null;

    const runData = (apiResponse && apiResponse.data && apiResponse.data.totalRow) ? apiResponse.data.totalRow : null;
    const rowData = runData ? [
      dateStr, targetStore.alias,
      runData.sum_paymentMethod?.[0]?.total || 0,
      runData.cashpay?.business || 0,
      runData.cashpay?.unearn || 0,
      (runData.sum_paymentMethod?.[2]?.total || 0) + (runData.sum_paymentMethod?.[9]?.total || 0),
      runData.paymentMethod?.[9]?.total || 0,
      runData.paymentMethod?.[2]?.total || 0,
      (runData.sum_paymentMethod?.[9]?.total || 0) - (runData.paymentMethod?.[9]?.total || 0),
      (runData.sum_paymentMethod?.[2]?.total || 0) - (runData.paymentMethod?.[2]?.total || 0),
      runData.businessIncome?.service ?? 0
    ] : [dateStr, targetStore.alias, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    sheet.appendRow(rowData);
    SpreadsheetApp.flush();
    processed++;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const excelUrl = 'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx&gid=' + sheet.getSheetId();
  try {
    const ui = SpreadsheetApp.getUi();
    if (ui) ui.alert('楊梅金山店日帳已完成，共寫入 ' + processed + ' 天。\n\n下載 Excel：\n' + excelUrl);
  } catch (e) {}
}