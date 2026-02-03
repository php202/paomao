function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠 帳務工具')
      .addItem('🚀 預約表單（每天早上都有跑）', 'runReservationReport')
      .addItem('🚀 儲值金', 'storeData')
      .addItem('🚀 通知未繳錢的', 'dailyCheckAndPush')
      .addToUi();
}
// ==========================================
// [Client] Main.gs - 主要入口
// ==========================================

function doPost(e) {
  try {
    // 1. 安全檢查
    if (!e || !e.postData || !e.postData.contents) {
      return Core.jsonResponse({ status: "error", message: "No post data" });
    }
    const postData = e.postData.contents;
    const data = JSON.parse(postData);
    // 2. 路由分流
    if (data.events) {
      // === 情況 A: LINE Webhook ===
      const events = data.events;
      for (const event of events) {
        if (event.type === 'postback') {
          // 呼叫您原本定義的 handleConfirmPostback (需確保此函式存在)
          handleConfirmPostback(event);
        }
      }
      
      // 處理訊息紀錄
      handleLineWebhook(data);
      
      // 回傳標準 LINE 成功訊號
      return Core.jsonResponse({ status: "ok" });

    } else if (data.cookie) {
      // === 情況 B: Update Cookie ===
      return handleUpdateCookie(data);

    } else if (data.token) {
      // === 情況 C: Update Token ===
      return handleUpdateToken(data);

    } else {
      return Core.jsonResponse({ status: "error", message: "Unknown Request" });
    }

  } catch (error) {
    var msg = (error && error.message) ? error.message : String(error);
    console.error("System Error: " + msg);
    try { appendErrorLog(msg, "doPost"); } catch (logErr) {}
    // 發生錯誤仍回傳 OK 給 LINE，避免無限重試
    return Core.jsonResponse({ status: "error", message: "System Error" });
  }
}

// ==========================================
// 子函式 1: 處理 Gogoshop Cookie 更新
// ==========================================
function handleUpdateCookie(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('安全庫存');
  if (!sheet) return Core.jsonResponse({ error: "Sheet '安全庫存' not found" });
  
  sheet.getRange('P1:Q1').setValues([[data.cookie, new Date()]]);
  
  try {
    gogoshopStocksReport(); 
  } catch(e) {
    console.error("Report Error: " + e.toString());
  }
  
  return Core.jsonResponse({ status: "success", message: "Cookie Updated" });
}

// ==========================================
// 功能 1: 處理 LINE 訊息 (批次寫入)
// ==========================================
function handleLineWebhook(data) {
  const events = data.events;
  const logData = []; 

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    
    // 只記錄文字訊息
    if (event.type === 'message' && event.message.type === 'text') {
      const msg = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source.userId;
      const timestamp = new Date();

      // --- 處理來源 ---
      let sourceName = "個人私訊";
      let groupId = null;
      let roomId = null;
      
      if (event.source.type === 'group') {
        groupId = event.source.groupId;
        
        // ★★★ 修改重點：改用 Core 的函式 ★★★
        // 假設 Core 裡已經有了 getGroupName (含快取)
        const groupName = Core.getGroupName(groupId, LINE_TOKEN_PAOPAO);
        sourceName = `[群] ${groupName}`; 

      } else if (event.source.type === 'room') {
        roomId = event.source.roomId;
        sourceName = `[聊天室] ${roomId}`;
      }

      // --- 取得發言者姓名 (Core) ---
      const userName = Core.getUserDisplayName(userId, groupId, roomId, LINE_TOKEN_PAOPAO);

      logData.push([timestamp, replyToken, sourceName, userName, msg, groupId, roomId]);
    }
  }

  // --- 批次寫入 ---
  if (logData.length > 0) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();  
    let logSheet = ss.getSheetByName('訊息一覽');
    if (!logSheet) {
      logSheet = ss.insertSheet('訊息一覽');
      logSheet.appendRow(['時間', 'ReplyToken', '來源', '姓名', '訊息內容', 'GID', 'RID']);
    }

    const lastRow = logSheet.getLastRow();
    logSheet.getRange(lastRow + 1, 1, logData.length, logData[0].length).setValues(logData);
  }
}

// ==========================================
// 功能 2: 更新 Token
// ==========================================
function handleUpdateToken(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('預約表單');
  if (!sheet) return Core.jsonResponse({ error: "Sheet '預約表單' not found" });
  sheet.getRange('C2:D2').setValues([[data.token, new Date()]]);
  return Core.jsonResponse({ status: "success", message: "Token Updated" });
}