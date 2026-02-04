// ==========================================
// 1. 主流程控制 (Controller)
// ==========================================
function sendLocationRequest(replyToken, userId) {
  // A. 權限驗證
  const auth = isUserAuthorized(userId); // 假設這會回傳完整物件
  if (!auth.isAuthorized) { 
    return noAuthorized(replyToken); 
  }

  // B. 準備資料 (UUID & Link)
  const uuid = Utilities.getUuid();
  const uri = `${CHECK_IN_LINK}?userId=${encodeURIComponent(userId)}&uuid=${encodeURIComponent(uuid)}`;

  // C. 每月 1–7 號顯示「上月小費」按鈕，點擊後會送出「上月小費」取得小費報表
  const actions = [{ "type": "uri", "label": "📍 點擊開啟打卡", "uri": uri }];
  const dayOfMonth = new Date().getDate();
  if (dayOfMonth >= 1 && dayOfMonth <= 7) {
    actions.push({ "type": "message", "label": "上月小費", "text": "上月小費" });
  }

  // D. 建構訊息 (UI)
  const message = {
    "type": "template",
    "altText": "請進行打卡驗證",
    "template": {
      "type": "buttons",
      "title": "打卡驗證",
      "text": "請點擊下方按鈕開啟打卡頁面。",
      "actions": actions
    }
  };

  // E. 發送訊息
  reply(replyToken, [message]);
  // F. 寫入資料庫 (將存檔邏輯抽離)
  logCheckInAttempt(userId, uuid);
}


function logCheckInAttempt(userId, uuid) {
  try {
    const sheet = SpreadsheetApp.openById(LINE_STAFF_SS_ID).getSheetByName("員工打卡紀錄"); // 確保 ID 正確
    if (sheet) {
      // 建議：將 new Date() 格式化，或直接存物件
      sheet.appendRow([userId, new Date(), '', '', uuid]);
    }
  } catch (e) {
    console.error(`寫入 UUID 失敗: ${e.toString()}`);
    // 寫入失敗不應影響使用者打卡，所以用 try-catch 包起來
  }
}

