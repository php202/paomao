const coreConfig = Core.getCoreConfig();

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
  const endDate = new Date(today);
  endDate.setDate(today.getDate() - 1); // 抓到昨天

  if (startDate > endDate) {
    console.log("資料已是最新，無需更新。");
    return;
  }
  
  console.log(`本次預計處理區間: ${getFormattedDate(startDate)} ~ ${getFormattedDate(endDate)}`);

  // --- 2. 取得門店列表 ---
  const storeMap = Core.getLineSayDouInfoMap();  
  let stores = [];
  for (const info of storeMap.values()) {
    if (info.saydouId) {
      stores.push({
        storid: info.saydouId,
        alias: info.name,
        isDirect: info.isDirect
      });
    }
  }
  console.log(`取得店家數: ${stores.length}`);

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
      
      const apiResponse = Core.fetchDailyIncome(dateStr, store.storid);
      
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

        const rowData = [
          dateStr,        
          store.alias,    
          cashTotal,
          cashBusiness,
          cashUnearn,
          thirdPayTotal,
          transferRecord,
          lineRecord,
          transferUnearn,
          lineUnearn
        ];

        dailyAllRows.push(rowData);
        if (store.isDirect === true) {
          dailyDirectRows.push(rowData);
        }
      }
    }

    // --- 4. 寫入當天資料 (一天寫一次) ---
    
    // (A) 寫入全門市
    if (dailyAllRows.length > 0) {
      const currentLastRowAll = sheetAll.getLastRow(); // 每次都要重新抓最後一行
      sheetAll.getRange(currentLastRowAll + 1, 2, dailyAllRows.length, dailyAllRows[0].length).setValues(dailyAllRows);
    }

    // (B) 寫入直營店
    if (dailyDirectRows.length > 0) {
      const currentLastRowDirect = sheetDirect.getLastRow(); // 每次都要重新抓最後一行
      sheetDirect.getRange(currentLastRowDirect + 1, 2, dailyDirectRows.length, dailyDirectRows[0].length).setValues(dailyDirectRows);
    }

    // (C) 強制儲存 (關鍵！)
    // 這行指令會強制 Google 立刻把資料寫進硬碟，而不是留在記憶體中
    SpreadsheetApp.flush(); 
    
    console.log(`✅ [${dateStr}] 寫入完成 (全門市:${dailyAllRows.length}筆 / 直營:${dailyDirectRows.length}筆)`);

    // --- 5. 進入下一天 ---
    currentDate.setDate(currentDate.getDate() + 1);
  }

  console.log("所有作業完成！");
}