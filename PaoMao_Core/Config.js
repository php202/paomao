/**
 * 泡泡貓相關 GAS 專案（gas/ 資料夾）：PaoMao_Core、各店訊息一覽表、日報表 產出、請款表單內容、
 * 每週三：顧客退費、泡泡貓 門市 預約表單 PAOPAO、泡泡貓拉廣告資料、泡泡貓 員工打卡 Line@、最近的泡泡貓
 */
const LINE_TOKEN_PAOPAO = 'cpJinkc6qjthP9/685wxeI114mz/TPYieKdtabf0KIkuzpf1mGLFIRKSbVoCD7QAtIf7pBSJrI8I3x7Pk2Z5khTFbCgsaos749+4MjrIFoW5+90ppxSguaWlvYGGoLHGgMHzmJejEHWIlggnfMBqKQdB04t89/1O/w1cDnyilFU='; 
const LINE_TOKEN_PAOSTAFF = 'KoX6cmTb5LECmrNptXRMQuR4jD57UxL5PujbE1tSPeJriyLvsTG5gLEW+2qx8e6NfexsBWIYqzOrUDYBznVNo2SGtm6Qu3ahAT9qERAUwViRY0ZI8okZlRiqUVVqe3OjB0bKl3+qhF5ZeUkxnBJRoQdB04t89/1O/w1cDnyilFU='

const EXTERNAL_SS_ID = '17hX7CjeDj2xdKBIt9TKG6iJF5lB38uXwj2kdhb4oIQE'; // 請款單＿店家基本資訊表 ID
const DAILY_ACCOUNT_REPORT_SS_ID = '1ZMutegYTLZ51XQHCbfFZ7-iAj1qTZGgSo5VTThXPQ5U' // 泡泡貓日報表 ID
const DAILY_ACCOUNT_SHEET_NAME = '營收報表' // 泡泡貓日報表 ID
const LINE_STORE_SS_ID = '1ZV_0vjtQylyEWrrB5n05fBvvQiDoexYvFuztje1Fgm0' // 訊息一覽表＿店家基本資料 ID
const LINE_STAFF_SS_ID = '1GH2XbihFIY0AX8SMF9Tk6igrVKPpA_vMJVlkDkJjpe4' // 泡泡貓 員工打卡 line@
const LINE_HQ_SS_ID = '1-t4KPVK-uzJ2xUoy_NR3d4XcUohLHVETEFXTlvj4baE' // 泡泡貓 門市資料
/** 明日預約＋AI 簡略的 Web App URL（各店訊息一覽表部署後填寫，例：https://script.google.com/.../exec）；留空則用 Core 原明日報告 */
const TOMORROW_BRIEFING_WEB_APP_URL = ''

/**
 * SayDou Bearer Token（getToken）：
 * - 本專案 TokenWebApp.js 的 doGet(e) 以 ?key=密鑰 提供 token；本專案指令碼屬性需設 PAO_CAT_SECRET_KEY。
 * - 使用 Core 的其他專案（各店訊息一覽表、泡泡貓 員工打卡 Line@ 等）：指令碼屬性設 PAO_CAT_TOKEN_API_URL（PaoMao_Core 部署的 Token 網址）、PAO_CAT_SECRET_KEY（與 Core 相同密鑰），則 getBearerTokenFromSheet() 會改由 API 取得 token，無需讀取試算表。
 */
// 以上為指令碼屬性鍵名，勿在程式碼寫入密鑰或網址。

const ODOO_CONFIG = {
  url: "https://paomao.odoo.com",
  db: "paomao",
  username: "php202@gmail.com",
  password: "be15f5792053a7b899afd9b6a854784ef3f3bee0"
};

const GIVEME_CONFIG = {
  UNCODE: "94256530", 
  IDNO: "94256530",   
  PASSWORD: "Pao123", 
  VM_PROXY_URL: "http://136.115.207.151:8080/invoice",
  API_URL_B2B: "https://www.giveme.com.tw/invoice.do?action=addB2B",
};

// === 新增這個函式，讓外部可以取得設定 ===
function getCoreConfig() {
  return {
    LINE_TOKEN_PAOPAO: LINE_TOKEN_PAOPAO,
    EXTERNAL_SS_ID: EXTERNAL_SS_ID,
    ODOO_CONFIG: ODOO_CONFIG,
    DAILY_ACCOUNT_REPORT_SS_ID: DAILY_ACCOUNT_REPORT_SS_ID,
    LINE_STORE_SS_ID: LINE_STORE_SS_ID,
    LINE_TOKEN_PAOSTAFF: LINE_TOKEN_PAOSTAFF,
    LINE_STAFF_SS_ID: LINE_STAFF_SS_ID,
    LINE_HQ_SS_ID: LINE_HQ_SS_ID,
    TOMORROW_BRIEFING_WEB_APP_URL: typeof TOMORROW_BRIEFING_WEB_APP_URL !== "undefined" ? TOMORROW_BRIEFING_WEB_APP_URL : "",
  };
}

function clearMyCache() {
  const cache = CacheService.getScriptCache();
  // 移除指定的 Key
  cache.remove("MAP_SAYDOU_INFO"); 
  console.log("✅ 快取已清除，下次執行會重新抓取資料表");
}
