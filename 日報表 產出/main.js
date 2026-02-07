const coreConfig = Core.getCoreConfig();

/**
 * 讀取 Core API 相關設定。
 * 需在本專案指令碼屬性設定：
 * - PAO_CAT_CORE_API_URL：PaoMao_Core「網路應用程式」部署網址（結尾 /exec）
 * - PAO_CAT_SECRET_KEY：與 Core 相同的密鑰
 */
function getCoreApiParams() {
  const p = PropertiesService.getScriptProperties();
  const url = (p.getProperty('PAO_CAT_CORE_API_URL') || '').trim();
  const key = (p.getProperty('PAO_CAT_SECRET_KEY') || '').trim();
  return { url, key, useApi: url.length > 0 && key.length > 0 };
}

function runAccNeed() {
  const externalSs = SpreadsheetApp.openById(coreConfig.DAILY_ACCOUNT_REPORT_SS_ID);
  
  // 取得兩張工作表
  const sheetAll = externalSs.getSheetByName('營收報表');       // 全門市
  const sheetDirect = externalSs.getSheetByName('營收報表_直營'); // 直營店

  const timeZone = externalSs.getSpreadsheetTimeZone();
  const getFormattedDate = (date) => Utilities.formatDate(date, timeZone, 'yyyy-MM-dd');

  // --- 1. 計算日期範圍 (每次執行都會重新檢查 Excel 進度) ---
  // 因為我們會逐日寫入，所以這個檢查邏輯變得非常重要，它是「自動接關」的關鍵
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

  // --- 2. 取得 Core API 設定與門店列表 ---
  const { url: coreApiUrl, key: coreApiKey, useApi } = getCoreApiParams();

  const storeMap = Core.getLineSayDouInfoMap() || {};
  let stores = [];
  for (const info of Object.values(storeMap)) {
    if (info.saydouId) {
      stores.push({
        storid: info.saydouId,
        alias: info.name,
        isDirect: info.isDirect
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

      // 優先透過 Core Web App 取得營收資料；若未設定 Core API 則退回直接呼叫 Core 程式庫
      let apiResponse = null;
      if (useApi) {
        const sep = coreApiUrl.indexOf('?') >= 0 ? '&' : '?';
        const q =
          sep +
          'key=' + encodeURIComponent(coreApiKey) +
          '&action=fetchDailyIncome' +
          '&date=' + encodeURIComponent(dateStr) +
          '&storeId=' + encodeURIComponent(String(store.storid));
        try {
          const res = UrlFetchApp.fetch(coreApiUrl + q, { muteHttpExceptions: true, followRedirects: true });
          const text = res.getContentText();
          const json = JSON.parse(text);
          if (json && json.status === 'ok') {
            apiResponse = json.data || null;
          } else {
            console.error(`Core API dailyIncome 失敗 (${dateStr}, ${store.storid}): ` + (json && json.message ? json.message : '未知錯誤'));
          }
        } catch (e) {
          console.error(`Core API dailyIncome 連線錯誤 (${dateStr}, ${store.storid}): ${e.message || e}`);
        }
      }

      // 若 Core API 未設定或失敗，改用 Core 程式庫直接打 SayDou
      if (!apiResponse) {
        apiResponse = Core.fetchDailyIncome(dateStr, store.storid);
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