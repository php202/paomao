// 建議放在全域變數區或 Core 裡
const coreConfig = Core.getCoreConfig();
const LINE_TOKEN_PAOSTAFF = coreConfig.LINE_TOKEN_PAOSTAFF;
const LINE_STAFF_SS_ID = coreConfig.LINE_STAFF_SS_ID;
const LINE_HQ_SS_ID = coreConfig.LINE_HQ_SS_ID;
const CHECK_IN_LINK = 'https://www.paopaomao.tw/checkin'
const FOLDER_ID = "1jrJSmi_alPOwK7cCkJUOLRAPtBl9acC3"; // 請確認 ID 正確

/** 明日預約 API 網址：優先讀指令碼屬性 TOMORROW_BRIEFING_WEB_APP_URL，沒有再讀 Core Config */
function getTomorrowBriefingWebAppUrl() {
  try {
    var url = PropertiesService.getScriptProperties().getProperty("TOMORROW_BRIEFING_WEB_APP_URL");
    if (url && String(url).trim() !== "") return String(url).trim();
  } catch (e) {}
  return (coreConfig.TOMORROW_BRIEFING_WEB_APP_URL && String(coreConfig.TOMORROW_BRIEFING_WEB_APP_URL).trim() !== "") ? String(coreConfig.TOMORROW_BRIEFING_WEB_APP_URL).trim() : "";
}

// 2. 建立一個簡單的縮寫函式，不用每次都打 Core.sendLineReply(..., ..., LINE_TOKEN)
function reply(replyToken, content) {
  // (A) 如果傳入的是純文字 (String) -> 呼叫 sendLineReply
  if (typeof content === 'string') {
    Core.sendLineReply(replyToken, content, LINE_TOKEN_PAOSTAFF);
  } 
  // (B) 如果傳入的是物件或陣列 -> 呼叫 sendLineReplyObj
  else {
    // 防呆：LINE API 的 messages 必須是陣列 (Array)
    // 如果使用者只傳入單一物件 (Object)，我們自動幫他包成陣列 [Object]
    const messages = Array.isArray(content) ? content : [content];
    Core.sendLineReplyObj(replyToken, messages, LINE_TOKEN_PAOSTAFF);
  }
}
// 與 Core 對齊：使用 Core.jsonResponse
function outputJSON(data) {
  return Core.jsonResponse(data);
}

/**
 * 從「我要了解客人0925810424」或「我要了解客人925810424」擷取手機，正規化為 09xxxxxxxx（10 碼）回傳。
 * 925810424（9 碼）會補 0 成 0925810424，與試算表 0925810424 可正確對應。
 */
function extractPhoneFromCustomerKeyword(text) {
  if (!text || typeof text !== "string") return null;
  var s = text.replace(/我要了解客人\s*/i, "").trim();
  var digits = s.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 9 && digits.charAt(0) === "9") {
    return "0" + digits;
  }
  if (digits.length >= 10 && digits.charAt(0) === "9") {
    return digits.slice(0, 10);
  }
  var m = text.match(/09[\d\s\-]{8,}/);
  if (m) {
    var d = m[0].replace(/\D/g, "");
    if (d.length >= 10) return d.slice(0, 10);
    if (d.length === 9 && d.charAt(0) === "9") return "0" + d;
  }
  return null;
}

/**
 * 明日預約清單：點手機可開啟該客人的 AI 分析 HTML 頁（customerCard）。
 * 將 API 回傳的 JSON 轉成「單則」Flex 訊息，減少頁面拉動。
 * @param {Object} listData - { dateStr, byStore: [ { storeId, storeName, items: [ { name, phone, rsvtim } ] } ] }
 * @param {string} customerCardBaseUrl - 各店訊息一覽表 Web App 網址（用於 action=customerCard&phone=）
 * @returns {Object|null} 單一 Flex 訊息物件，無資料時回傳 null
 */
function buildTomorrowListMessages(listData, customerCardBaseUrl) {
  if (!listData || !listData.byStore || !listData.byStore.length) return null;
  var baseUrl = (customerCardBaseUrl && String(customerCardBaseUrl).trim()) ? String(customerCardBaseUrl).trim() : "";
  var sep = baseUrl.indexOf("?") >= 0 ? "&" : "?";
  function customerCardUri(phone) {
    if (!phone || !baseUrl) return baseUrl || "";
    var p = String(phone).replace(/\D/g, "");
    if (p.length === 9 && p.charAt(0) === "9") p = "0" + p;
    if (p.length < 10) return baseUrl;
    return baseUrl + sep + "action=customerCard&phone=" + encodeURIComponent(p.length > 10 ? p.slice(-10) : p);
  }
  function normalizePhone(phone) {
    if (!phone) return "—";
    var digits = String(phone).replace(/\D/g, "");
    if (digits.length === 9 && digits.charAt(0) === "9") return "0" + digits;
    if (digits.length >= 10) return digits.slice(-10);
    return digits;
  }
  var totalStores = 0;
  var totalGuests = 0;
  for (var s = 0; s < listData.byStore.length; s++) {
    var block = listData.byStore[s];
    var items = block.items || [];
    if (items.length > 0) {
      totalStores++;
      totalGuests += items.length;
    }
  }
  var dateStr = listData.dateStr || "";
  var bodyContents = [];
  var storeLimit = 8;
  var guestLimit = 10; // 每店最多顯示客數（LINE box 單一 box 最多 10 元件）
  for (var s = 0; s < listData.byStore.length && bodyContents.length < storeLimit; s++) {
    var block = listData.byStore[s];
    var storeName = block.storeName || ("店" + (block.storeId || ""));
    var items = block.items || [];
    var slotsText = (block.availableSlotsText != null && String(block.availableSlotsText).trim() !== "") ? String(block.availableSlotsText).trim() : "—";
    var headerBox = {
      type: "box",
      layout: "vertical",
      spacing: "xs",
      contents: [
        { type: "text", text: "【" + storeName + "】", weight: "bold", size: "md" },
        { type: "text", text: "明日可預約空位：" + slotsText, size: "sm", color: "#666666", wrap: true },
        { type: "text", text: "明天預約人數：" + (items.length), size: "sm" }
      ]
    };
    var guestListContents = [];
    for (var i = 0; i < items.length && guestListContents.length < guestLimit; i++) {
      var o = items[i];
      var name = (o.name || "—").toString().trim();
      var phone = (o.phone || "").toString().trim();
      var displayPhone = normalizePhone(phone);
      var uri = customerCardUri(phone);
      if (uri) {
        guestListContents.push({
          type: "box",
          layout: "horizontal",
          margin: "sm",
          contents: [
            { type: "text", text: name, size: "sm", flex: 1, wrap: true },
            { type: "button", action: { type: "uri", label: displayPhone, uri: uri }, style: "link" }
          ]
        });
      } else {
        guestListContents.push({ type: "text", text: name + " " + displayPhone, size: "sm", wrap: true });
      }
    }
    if (items.length > guestLimit) {
      guestListContents.push({ type: "text", text: "…共 " + items.length + " 人", size: "xs", color: "#999999" });
    }
    var guestListBox = {
      type: "box",
      layout: "vertical",
      margin: "sm",
      spacing: "xs",
      contents: guestListContents.length ? guestListContents : [{ type: "text", text: "（無預約）", size: "sm", color: "#999999" }]
    };
    bodyContents.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "xs",
      contents: [headerBox, guestListBox]
    });
  }
  if (totalStores > storeLimit) {
    bodyContents.push({ type: "text", text: "（僅顯示前 " + storeLimit + " 店，共 " + totalStores + " 店）", size: "xs", color: "#999999", margin: "md" });
  }
  var bubble = {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: "📅 明日預約 " + dateStr + " 共 " + totalStores + " 店、" + totalGuests + " 人", weight: "bold", size: "md", wrap: true }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      contents: bodyContents.length ? bodyContents : [{ type: "text", text: "無預約資料", size: "sm", color: "#999999" }]
    }
  };
  return {
    type: "flex",
    altText: "明日預約 " + dateStr + " 共 " + totalStores + " 店、" + totalGuests + " 人",
    contents: bubble
  };
}

/**
 * 「我要了解客人」：透過 Core API（action=getCustomerAIResult）取得該手機的 AI分析結果並回覆。
 * 需設定指令碼屬性：PAO_CAT_CORE_API_URL、PAO_CAT_SECRET_KEY。
 */
function replyCustomerAIResult(replyToken, text) {
  var phone = extractPhoneFromCustomerKeyword(text);
  if (!phone) {
    reply(replyToken, "請輸入「我要了解客人」後面接手機號碼，例如：我要了解客人0925810424");
    return;
  }
  var url = PropertiesService.getScriptProperties().getProperty("PAO_CAT_CORE_API_URL");
  var key = PropertiesService.getScriptProperties().getProperty("PAO_CAT_SECRET_KEY");
  if (!url || !key) {
    reply(replyToken, "查詢失敗：未設定 Core API（請設定 PAO_CAT_CORE_API_URL、PAO_CAT_SECRET_KEY）。");
    return;
  }
  url = url.trim();
  key = key.trim();
  try {
    var res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ key: key, action: "getCustomerAIResult", phone: phone }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code !== 200) {
      console.warn("[我要了解客人] Core API HTTP " + code + " 請求網址:", url);
      if (code === 404) {
        reply(replyToken, "查詢失敗（404）。請依序檢查：\n1) PAO_CAT_CORE_API_URL 是設在「泡泡貓 員工打卡 Line@」的指令碼屬性（不是 PaoMao_Core）。\n2) 網址從 PaoMao_Core 的「部署→管理部署」複製「網路應用程式」那筆，結尾為 /exec（勿用「測試部署」網址）。\n3) 瀏覽器開啟「該網址?key=您的密鑰&action=token」若也 404，表示網址錯或未選類型「網路應用程式」。\n（實際請求網址已記在員工打卡專案的執行紀錄）");
      } else {
        reply(replyToken, "查詢失敗（Core API 回傳 " + code + "）。請確認 PaoMao_Core 已部署新版本且 PAO_CAT_CORE_API_URL 正確。");
      }
      return;
    }
    var data = void 0;
    try {
      data = JSON.parse(body);
    } catch (e) {
      console.warn("[我要了解客人] Core API 回傳非 JSON:", body ? body.slice(0, 200) : "");
      reply(replyToken, "查詢失敗（Core API 回傳格式異常）。請確認 PaoMao_Core 已部署新版本且含 getCustomerAIResult。");
      return;
    }
    if (data.status === "ok") {
      var content = (data.content != null && String(data.content).trim() !== "") ? String(data.content).trim() : "該客人尚無 AI 分析結果。";
      reply(replyToken, "【客人 " + phone + " AI分析結果】\n\n" + content);
      return;
    }
    reply(replyToken, data.message || "查無此客人（" + phone + "）。");
  } catch (e) {
    console.warn("[我要了解客人] Core API 呼叫失敗:", e && e.message ? e.message : e);
    reply(replyToken, "查詢時發生錯誤。請確認：1) 已設定 PAO_CAT_CORE_API_URL、PAO_CAT_SECRET_KEY；2) PaoMao_Core 已部署新版本；3) 網路正常。");
  }
}

// 定義一個全域的 OK 回應，供 doPost 最後使用
const LINE_OK_OUTPUT = outputJSON({ status: 'ok' });

function doPost(e) {
  // ★ 1. 最外層保護：發生任何無法預期的錯誤，最後一定要回傳 OK
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return outputJSON({ status: "failed", message: "No postData" });
    }
    const payload = JSON.parse(e.postData.contents);
    // (A) 來自網頁的請求 (Action 分流)
    // 網頁請求需要等待結果，所以不能用快取鎖直接擋掉
    if (payload.action === "bind") {
       return handleBindSession(payload); 
    }
    if (payload.action === "check_in") {
      return handleCheckInAPI(payload);  
    }
    // (B) 來自 LINE Webhook 的請求 (無限迴圈發生地)
    const events = Array.isArray(payload.events) ? payload.events : [];
    if (events.length === 0) return LINE_OK_OUTPUT;

    // ★ 2. 快取：同一 eventId 只處理一次，其餘立刻跳過（LINE 重試時就不會再跑一次，避免「LINE 一直打」）
    const cache = CacheService.getScriptCache();
    for (const event of events) {
      const replyToken = event.replyToken;
      const eventId = event.webhookEventId;
      if (eventId) {
        if (cache.get(eventId)) {
          console.log(`♻️ [重複請求] 已攔截 EventID: ${eventId}，直接回傳 OK。`);
          continue;
        }
        cache.put(eventId, 'processed', 600);
      }
      try {
        if (event.type === "message") {
          routeMessageEvent(event);
        }
      } catch (innerErr) {
        console.error(`❌ 處理單一事件失敗: ${innerErr.toString()}`);
      }
    }
    // ★ 3. 處理完畢 (或已攔截重複)，回傳 200 OK
    return LINE_OK_OUTPUT;
  } catch (fatalError) {
    console.error(`☠️ doPost 嚴重崩潰: ${fatalError.toString()}`);
    // 發生嚴重錯誤 (例如 JSON 解析失敗)，還是要回傳 OK，不然 LINE 會一直打
    return LINE_OK_OUTPUT; 
  }
}
function routeMessageEvent(event) {
  // 定義變數在 try 外面，確保 catch 區塊也能讀取到 (用於記錄是誰出錯)
  let userId = "Unknown"; 
  let inputContent = "Unknown"; // 用來記錄使用者傳了什麼 (文字或位置)

  try {
    const msg = event.message;
    const replyToken = event.replyToken;
    
    // 1. 取得 UserId
    if (event.source && event.source.userId) {
      userId = event.source.userId;
    }

    // 2. 取得輸入內容 (用於 Log)
    if (msg.type === "text") {
      inputContent = `[文字] ${msg.text}`;
    } else if (msg.type === "location") {
      inputContent = `[位置] ${msg.address || "無地址資訊"}`;
    } else {
      inputContent = `[其他類型] ${msg.type}`;
    }

    // ==========================================
    // 邏輯開始
    // ==========================================

    // 先提取文字 (避免 ReferenceError)
    let text = "";
    if (msg.type === "text") {
      text = String(msg.text || "").trim();
    }

    // ★ 特權通道：先判斷註冊，不需要驗證權限
    if (text.includes("我要註冊")) {
      return getUserId(replyToken, userId, text);
    }

    // ★ 權限檢查 (Gatekeeper)
    // 把它移到這裡，確保連「位置訊息」也會被擋下
    const auth = isUserAuthorized(userId);
    if (!auth.isAuthorized) {
      return noAuthorized(replyToken);
    }

    // --- (A) 位置訊息 (打卡) ---
    if (msg.type === "location") {
      // 這裡不需要內部的 try-catch 了，因為最外面已經包了一層
      return getStoreDistance(event); 
    }

    // --- (B) 文字訊息 (指令) ---
    if (text) {
      // 0. 我要了解客人 + 手機：回傳該客人在「客人消費狀態」的 AI分析結果 (K 欄)
      if (text.indexOf("我要了解客人") === 0 || text.includes("我要了解客人")) {
        return replyCustomerAIResult(replyToken, text);
      }

      // 1. 完全匹配
      switch (text) {
        case "我要打卡":      return sendLocationRequest(replyToken, userId);
        case "查詢打卡記錄":  return getAtt(replyToken, userId);
        case "最新活動":      return getNews(replyToken, userId);
        case "我要開店":      return sendStoreLocationRequest(replyToken);
        case "特約商店":      return getOnlineCourse(replyToken, userId);
      }

      // 2. 集合匹配
      const attKeywords = ['店家今天出勤', '店家本月出勤', '店家上月出勤', '本月出勤', '上月出勤', '店家可預約時間'];
      if (attKeywords.includes(text)) {
        return sendAtt(replyToken, userId, text);
      }

      // 3. 部分匹配
      if (text.includes("補打卡"))      return makeUpTime(replyToken, userId, text);
      if (text.includes("Line問題集"))  return sendStoreLineQuestionRequest(replyToken, userId);

      // 3.4 明天預約清單：列出負責店家的明日預約，姓名＋手機（點擊手機可自動送出「我要了解客人09xxx」）
      if (text.trim() === "明天預約清單" || text.trim() === "明日預約清單") {
        if (!auth.isAuthorized || !auth.identity || auth.identity.indexOf("manager") === -1) {
          reply(replyToken, "此功能僅限管理者使用。請確認已於「管理者清單」設定管理門市。");
          return;
        }
        var managedStoreIds = [];
        (auth.managedStores || []).forEach(function (s) {
          String(s).split(/[,、，]/).forEach(function (id) {
            var t = id.trim();
            if (t) managedStoreIds.push(t);
          });
        });
        if (managedStoreIds.length === 0) {
          reply(replyToken, "請於「管理者清單」設定您管理的門市（第 3 欄）。");
          return;
        }
        var tomorrowUrl = getTomorrowBriefingWebAppUrl();
        if (!tomorrowUrl) {
          reply(replyToken, "未設定明日預約 API。請在「泡泡貓 員工打卡 Line@」專案：專案設定 → 指令碼屬性 → 新增 TOMORROW_BRIEFING_WEB_APP_URL，值為「各店訊息一覽表」部署的 Web App 網址（例：https://script.google.com/macros/s/xxx/exec）。");
          return;
        }
        try {
          var listUrl = tomorrowUrl + (tomorrowUrl.indexOf("?") >= 0 ? "&" : "?") + "action=getTomorrowReservationList&storeIds=" + encodeURIComponent(managedStoreIds.join(","));
          var listResp = UrlFetchApp.fetch(listUrl, { muteHttpExceptions: true });
          if (listResp.getResponseCode() !== 200) {
            reply(replyToken, "取得明日預約清單失敗，請稍後再試。");
            return;
          }
          var listData = JSON.parse(listResp.getContentText());
          var flexMsg = buildTomorrowListMessages(listData, tomorrowUrl);
          if (!flexMsg) {
            reply(replyToken, "📅 明日（" + (listData.dateStr || "") + "）您負責的店家目前無預約。");
            return;
          }
          reply(replyToken, flexMsg);
          return;
        } catch (e) {
          console.warn("[明天預約清單] 失敗:", e);
          reply(replyToken, "取得明日預約清單時發生錯誤，請稍後再試或聯繫管理員。");
          return;
        }
      }

      // 3.5 報告關鍵字（僅限「管理者清單」內的使用者；只回傳該 user 管理的門市）
      const reportHandler = typeof Core !== "undefined" && typeof Core.getReportHandlerFromKeyword === "function"
        ? Core.getReportHandlerFromKeyword(text)
        : null;
      if (reportHandler && typeof Core !== "undefined" && typeof Core.getReportTextForKeyword === "function") {
        if (!auth.identity || auth.identity.indexOf("manager") === -1) {
          reply(replyToken, "此報告僅限管理者使用。請確認您已於「管理者清單」中設定。");
          return;
        }
        try {
          const managedStoreIds = (auth.managedStores && auth.managedStores.length) ? auth.managedStores.map(function (id) { return String(id).trim(); }) : [];
          var reportText = null;
          var tomorrowBriefingUrl = getTomorrowBriefingWebAppUrl();
          if (reportHandler === "tomorrow" && tomorrowBriefingUrl) {
            try {
              var url = tomorrowBriefingUrl + (tomorrowBriefingUrl.indexOf("?") >= 0 ? "&" : "?") + "action=getTomorrowBriefing&storeIds=" + encodeURIComponent(managedStoreIds.join(","));
              var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
              if (resp.getResponseCode() === 200) reportText = resp.getContentText();
            } catch (webErr) {
              console.warn("[明日預約 AI] Web App 呼叫失敗:", webErr);
            }
          }
          if (!reportText) {
            const result = Core.getReportTextForKeyword(reportHandler, { managedStoreIds: managedStoreIds });
            if (result && result.text) reportText = result.text;
          }
          if (reportText) {
            return reply(replyToken, reportText);
          }
          reply(replyToken, "報告無內容或產出失敗，請稍後再試或聯繫管理員。");
          return;
        } catch (e) {
          console.warn("[報告關鍵字] 產出失敗:", e);
          reply(replyToken, "產出報告時發生錯誤，請稍後再試或聯繫管理員。");
          return;
        }
      }

      // 4. 公司流程 (最後一關)
      const workflowLink = typeof Core !== "undefined" && typeof Core.getWorkflowLink === "function" ? Core.getWorkflowLink(text) : null;
      if (workflowLink) {
        return reply(replyToken, `請點擊:\n${workflowLink}`);
      }

      reply(replyToken, "找不到對應的指令。可試試：查詢打卡記錄、本月出勤、昨日報告、員工樣態。");
    }

  } catch (error) {
    // ==========================================
    // 🚨 發生錯誤時的處理區
    // ==========================================
    console.error(`[系統錯誤] User: ${userId}, Input: ${inputContent}`, error);
    
    // 1. 寫入 Google Sheet 除錯清單
    logErrorToSheet(userId, inputContent, error);

    // 2. (選用) 回覆使用者，讓他知道系統出錯了，而不是已讀不回
    // 只有在還拿到 replyToken 的情況下才能回覆
    if (event.replyToken) {
        reply(event.replyToken, "🚧 系統發生未預期的錯誤，已自動回報給管理員進行修復。");
    }
  }
}