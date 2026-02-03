function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠 帳務工具')
      .addItem('📖匯出篩選後的 Excel', 'exportToExcelWithFilter')
      .addItem('🚀 退還儲值金', 'refund')
      .addSeparator()
      .addItem('🗑️ 刪除暫存工作表', 'cleanupTempSheets')
      .addToUi();
}

function refund() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('表單回應 2');
  // 1. 取得符合條件的資料 (包含手機與行號)
  const refundList = getPhonesFromSheet();
  
  if (!refundList.length) {
    SpreadsheetApp.getUi().alert('沒有需要退費的資料 (需勾選「登錄退費」且未勾選「已歸還」)');
    return;
  }
  
  Logger.log('準備處理筆數：' + refundList.length);
  
  let successCount = 0;
  let failCount = 0;
  let logs = [];
  
  // 用來避免重複退費 (如果同一個人填了兩次單)
  let refundedPhones = new Set();

  refundList.forEach(function(item) {
    const phone = item.phone;
    const rowIndex = item.rowIndex;

    // --- 防呆：如果這一輪已經退過這個號碼，直接勾選就好，不用再呼叫 API ---
    if (refundedPhones.has(phone)) {
      logs.push(`⚠️ ${phone}: 重複資料，標記為已完成`);
      sheet.getRange(rowIndex, 17).setValue(true); // Q 欄打勾
      return;
    }

    // --- 呼叫 Core 執行退費 ---
    const result = Core.executeRefundByPhone(phone);
    
    if (result.success) {
      successCount++;
      logs.push(`✅ ${phone}: 成功退費 $${result.amount}`);
      
      // ★★★ 關鍵修改：成功後將 Q 欄 (第 17 欄) 設為 true ★★★
      sheet.getRange(rowIndex, 17).setValue(true); 
      
      // 記錄到已退費清單
      refundedPhones.add(phone);
      
      // 強制刷新試算表，讓使用者能即時看到勾選效果
      SpreadsheetApp.flush(); 

    } else {
      failCount++;
      logs.push(`❌ ${phone}: 失敗 - ${result.msg}`);
    }
  });

  // 顯示結果
  const summary = `退費作業結束。\n成功: ${successCount} 筆\n失敗: ${failCount} 筆\n\n詳細紀錄已寫入日誌。`;
  Logger.log(logs.join('\n'));
  SpreadsheetApp.getUi().alert(summary);
}

function getPhonesFromSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('表單回應 2');
  if (!sheet) {
    Logger.log('找不到工作表：表單回應 2');
    return [];
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 抓取 A 到 Q 欄 (Q 是第 17 欄)
  const range = sheet.getRange(2, 1, lastRow - 1, 17); 
  const rows = range.getValues();

  const refundList = rows
    .map(function(row, index) {
      const phone = row[2];    // C 欄
      const nCol  = row[13];   // N 欄: 確認匯款
      const pCol  = row[15];   // P 欄: 登錄退費
      const qCol  = row[16];   // Q 欄: 已歸還 (Index 16 = 第 17 欄)
      
      const isAccount = (nCol || nCol === true || String(nCol).trim() !== '' || String(nCol).toUpperCase() === 'TRUE');
      const isLogged = (String(pCol).trim() !== '');
      // 檢查 Q 欄是否為 false 或空值
      const isNotReturned = (!qCol || qCol === false || String(qCol).trim() === '' || String(qCol).toUpperCase() === 'FALSE');
      
      if (isLogged && isNotReturned && isAccount) {
        // ★★★ 關鍵修改：同時回傳 手機號碼 與 行號 (index + 2 因為從第2行開始抓) ★★★
        return {
          phone: Core.normalizePhone(phone),
          rowIndex: index + 2 
        };
      }
      return null; 
    })
    .filter(function(item) { 
      return item !== null && item.phone !== ''; 
    });

  // 這裡我們不使用 unique 過濾，因為我們要確保每一行都有被處理到 (並打勾)
  // 重複的 API 呼叫會在 refund() 裡面透過 Set 過濾掉
  return refundList;
}

function cleanupTempSheets() {
  Core.cleanupTempSheets('1b2-ZFkyKabVeQxpNSgFdrsAkPzDb35vNXDNQYR75XKA', '退費匯款資料_Export_')
}
