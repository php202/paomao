
/**
 * 在試算表開啟時建立自訂選單
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠 帳務工具')
      .addItem('🚀 產出銀行傳輸 TXT 檔', 'main')
      .addItem('🚀 開發票', 'issueInvoice')
      .addItem('🚀 產出勞報單', 'createLaborReceipts')
      .addSeparator()
      .addItem('🗑️ 刪除暫存工作表', 'cleanupTempSheets')
      .addToUi();
}

/** 費用種類	說明
 * case1 貨款	ach p01文件、666_>686 的excel
 * case2 儲值金	若 C > 0, ach p01文件, 若 C < 0, 666 轉給加盟主
 * case3 票卷	686 轉給加盟主
 * case4 免費/自行匯款	不用做事
*/
function main() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('2026/ACH紀錄'); // 2026/ACH紀錄
  const rows = sheet.getDataRange().getValues(); // 取得所有資料 (二維陣列)
  // 1. 取得店家銀行帳號對應表
  let bankInfoMap;
  try {
    bankInfoMap = Core.getBankInfoMap();
  } catch (e) {
    SpreadsheetApp.getUi().alert('設定錯誤：' + e.toString());
    return;
  }

  // 準備儲存不同分類的資料
  let achP01List = [];      // 存放需要產出 ACH P01 文字檔的資料
  let excel666To686 = [];   // 存放 666 -> 686 Excel 轉換的資料
  let pay666ToFranchisee = []; // 存放公司須轉帳給加盟主的資料 (666轉出 或 686轉出)
  let pay686ToFranchisee = []; // 存放公司須轉帳給加盟主的資料 (666轉出 或 686轉出)
  

  // 整理付款種類 E=4
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const amount = row[2];          // Column C: 金額
    const type = String(row[4]);    // Column E: 費用種類
    const customerConfirm = String(row[6]).toLowerCase().trim(); // Column G
    const achRegister = String(row[7]).trim();                   // Column H

    // 篩選條件：客人確認 = 'true' 且 登陸ach 為空
    if (!customerConfirm || achRegister !== '') {
      continue;
    }
    // --- 分 Case 處理邏輯 ---
    switch (type) {
      case '貨款':
      case '服務費':
      case '廣告費':
      case '儀器運費':
      case '維修費':
      case '顧問':
        // case1: ach p01文件、666_>686 的excel
        achP01List.push(row);
        excel666To686.push(row);
        break;

      case 'ACH餘額不足':
        // ach p01文件，不做 666_>686
        achP01List.push(row);
        break;

      case '儲值金':
        // case2: 若 C > 0, ach p01文件; 若 C < 0, 666 轉給加盟主
        if (amount > 0) {
          achP01List.push(row);
        } else if (amount < 0) {
          pay666ToFranchisee.push(row);
        }
        break;

      case '票卷':
        // case3: 686 轉給加盟主
        pay686ToFranchisee.push(row);
        break;

      case '免費/自行匯款':
        // case4: 不用做事
        console.log(`跳過自行匯款項目: ${row[1]}`);
        break;

      case '666轉686':
        pay666ToFranchisee.push(['', row[1], row[2], '94256530686', '內帳',])
        break;
        
      case '686轉666':
        pay686ToFranchisee.push(['', row[1], row[2], '94256530666', '內帳',])
        break;

      default:
        // console.warn(`未知的費用種類: ${type} (行號: ${i + 1})`);
    }
  }
  const { achFileName, achDownloadUrl } = achP01(achP01List)
  const { etewfTempSheetName, etewfDownloadUrl } = exportToExcelWithFilter(excel666To686, pay666ToFranchisee, pay686ToFranchisee)

  const htmlTemplate = `
    <div style="font-family: sans-serif; text-align: center; padding: 10px;">
      <p style="font-size: 14px;">✅ 檔案 <b>${achFileName}</b> 已產生</p>
      <br>
      <a href="${achDownloadUrl}" target="_blank" 
          style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          🚀 點我立即下載 TXT
      </a>
      <p style="font-size: 14px;">✅ 檔案 <b>${etewfTempSheetName}</b> 已產生</p>
      <br>
      <a href="${etewfDownloadUrl}" target="_blank" 
          style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
          🚀 點我立即下載 TXT
      </a>
      <p style="font-size: 11px; color: #666; margin-top: 15px;">下載完成後可手動關閉此視窗</p>
    </div>
  `;

  const htmlOutput = HtmlService
      .createHtmlOutput(htmlTemplate)
      .setWidth(350)
      .setHeight(180);
      
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '檔案產出成功');

}

function cleanupTempSheets() {
  Core.cleanupTempSheets('17hX7CjeDj2xdKBIt9TKG6iJF5lB38uXwj2kdhb4oIQE', '銀行匯款格式_')
}