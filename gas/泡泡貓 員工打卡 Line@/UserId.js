// ==========================================
// [Register.gs] 智慧註冊流程
// ==========================================
function getUserId(replyToken, userId, message) {
  // 1. 基本檢查：防止老員工重複按
  const auth = isUserAuthorized(userId);
  if (auth.isAuthorized) {
    return reply(replyToken, "您已是正式員工/管理員，無須再次註冊。");
  }

  // 2. 檢查是否已經在「審核中」 (避免重複送單)
  const applySheet = SpreadsheetApp.openById(LINE_STAFF_SS_ID).getSheetByName("請求員工ID");
  const lastRow = applySheet.getLastRow();
  
  if (lastRow >= 2) {
    // 檢查 F 欄 (User ID) 是否已存在
    const pendingIds = applySheet.getRange(2, 6, lastRow - 1, 1).getValues().flat();
    if (pendingIds.includes(userId)) {
      return reply(replyToken, "您的申請正在審核中，請勿重複傳送。");
    }
  }

  // ==========================================
  // ★★★ 3. 自動化核心：解析名字與驗證 ★★★
  // ==========================================
  
  // (A) 嘗試從訊息中「撈」出名字
  const extractedName = extractNameFromMessage(message);

  if (!extractedName) {
    return reply(replyToken, "⚠️ 系統無法辨識您的名字。\n\n請依照格式輸入，例如：\n姓名：王小明\n電話：0912345678");
  }

  // (B) 比對「員工清單」(白名單驗證)
  const employeeListSheet = SpreadsheetApp.openById(LINE_STAFF_SS_ID).getSheetByName("員工清單"); // 確認工作表名稱
  // 假設 C 欄是姓名
  const validNames = employeeListSheet.getRange("C2:C").getValues().flat().filter(n => n !== "");
  
  // 模糊比對 (移除空白後比對)
  const cleanInputName = extractedName.replace(/\s/g, "");
  const matchName = validNames.find(dbName => String(dbName).replace(/\s/g, "") === cleanInputName);

  // (C) 驗證失敗：名字不在清單中
  if (!matchName) {
    console.log(`註冊失敗: 輸入[${cleanInputName}] 不在員工清單內`);
    return reply(replyToken, `❌ 註冊失敗\n\n系統在「員工清單」中找不到「${extractedName}」這個名字。\n\n請確認：\n1. 是否輸入「中文全名」\n2. 是否有錯別字\n3. 若是新進員工，請先請主管將您加入清單。`);
  }

  // ==========================================
  // 4. 驗證成功：寫入資料 (自動填寫 E, F 欄)
  // ==========================================
  
  // 為了讓 E 欄整齊，我們寫入「比對成功」的那格標準名字 (matchName)，而不是使用者亂打的
  const timestamp = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  
  // 欄位對應：
  // A: 時間, B: UserId, C: LINE暱稱(自動抓), D: 原始訊息, E: 解析姓名(matchName), F: UserId
  const lineProfileName = Core.getUserDisplayName(userId, '', '', LINE_TOKEN_PAOSTAFF);

  applySheet.appendRow([
    timestamp,       // A
    userId,          // B
    lineProfileName, // C
    message,         // D
    matchName,       // E (自動填入標準姓名)
    userId           // F (自動填入 ID)
  ]);

  // 回覆成功訊息
  reply(replyToken, `✅ 申請已送出！\n\n系統已確認您的身分：${matchName}\n請等待管理員開通權限。`);
}

// ==========================================
// 🛠️ 輔助工具：從亂七八糟的訊息抓名字
// ==========================================
function extractNameFromMessage(msg) {
  if (!msg) return null;
  let text = String(msg).trim();

  // 1. 如果訊息包含 "姓名" 關鍵字 (例如: "📝姓名：王小明")
  // 邏輯：抓取 "姓名" 或 "Name" 後面的文字，直到換行
  const namePattern = /(?:姓名|Name)[:：\s]*([^\n\r]+)/i;
  const match = text.match(namePattern);
  
  if (match && match[1]) {
    // 去除一些常見的干擾字 (如 emoji)
    return cleanString(match[1]);
  }

  // 2. 如果沒有關鍵字，嘗試分析行數 (例如: "我要註冊\n王小明\n09xx")
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");
  
  // 過濾掉 "我要註冊"、"===" 這種無效行
  const potentialNames = lines.filter(line => {
    return !line.includes("我要註冊") && 
           !line.includes("===") && 
           !line.includes("訊息留下") &&
           !/^\d+$/.test(line); // 不是純數字(電話)
  });

  // 通常剩下行的第一行就是名字
  if (potentialNames.length > 0) {
    // 假設名字長度通常在 2~4 字 (中文) 或 英文，太長可能是句子
    if (potentialNames[0].length < 10) {
      return cleanString(potentialNames[0]);
    }
  }

  return null; // 真的抓不到
}

// 清理字串 (移除 emoji 和多餘符號)
function cleanString(str) {
  return str.replace(/[^\u4e00-\u9fa5a-zA-Z\s]/g, "").trim(); 
}