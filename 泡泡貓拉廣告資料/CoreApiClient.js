/**
 * Core API 客戶端：透過 PaoMao_Core 中央 API 取得資料，不需加入 Core 程式庫。
 *
 * 【泡泡貓拉廣告資料 專案】指令碼屬性：
 * - PAO_CAT_CORE_API_URL = Core 部署的網址（例如 https://script.google.com/macros/s/xxx/exec）
 * - PAO_CAT_SECRET_KEY = 與 PaoMao_Core 相同的密鑰
 */

var CoreApi = (function () {
  function getConfig() {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty("PAO_CAT_CORE_API_URL") || props.getProperty("PAO_CAT_TOKEN_API_URL") || "";
    var key = props.getProperty("PAO_CAT_SECRET_KEY") || "";
    return { url: url.trim(), key: key.trim() };
  }

  function callGet(action, params) {
    var c = getConfig();
    if (!c.url || !c.key) {
      throw new Error("請在指令碼屬性設定 PAO_CAT_CORE_API_URL 與 PAO_CAT_SECRET_KEY");
    }
    var query = ["key=" + encodeURIComponent(c.key), "action=" + encodeURIComponent(action)];
    if (params) {
      Object.keys(params).forEach(function (k) {
        if (params[k] != null && params[k] !== "") query.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(params[k])));
      });
    }
    var fullUrl = c.url + (c.url.indexOf("?") >= 0 ? "&" : "?") + query.join("&");
    var res = UrlFetchApp.fetch(fullUrl, { muteHttpExceptions: true, timeout: 90 });
    var text = res.getContentText();
    if (res.getResponseCode() !== 200) {
      throw new Error("Core API 錯誤: " + res.getResponseCode() + " " + text);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      if (typeof text === "string" && (text.indexOf("<!doctype") >= 0 || text.indexOf("<html") >= 0 || text.indexOf("accounts.google.com") >= 0)) {
        throw new Error("Core API 回傳登入頁（非 JSON）。請檢查：1) PAO_CAT_CORE_API_URL 是否為「部署」後的網址（含 /exec），不是 /edit 或 /dev；2) PaoMao_Core 部署時「誰可存取」是否選「任何人」");
      }
      throw new Error("Core API 回傳非 JSON: " + text.slice(0, 200));
    }
  }

  function callPost(action, params) {
    var c = getConfig();
    if (!c.url || !c.key) {
      throw new Error("請在指令碼屬性設定 PAO_CAT_CORE_API_URL 與 PAO_CAT_SECRET_KEY");
    }
    var body = { key: c.key, action: action };
    if (params) Object.keys(params).forEach(function (k) { body[k] = params[k]; });
    var res = UrlFetchApp.fetch(c.url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
      timeout: 90
    });
    var text = res.getContentText();
    if (res.getResponseCode() !== 200) {
      throw new Error("Core API 錯誤: " + res.getResponseCode() + " " + text);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      if (typeof text === "string" && (text.indexOf("<!doctype") >= 0 || text.indexOf("<html") >= 0 || text.indexOf("accounts.google.com") >= 0)) {
        throw new Error("Core API 回傳登入頁（非 JSON）。請檢查：1) PAO_CAT_CORE_API_URL 是否為「部署」後的網址（含 /exec），不是 /edit 或 /dev；2) PaoMao_Core 部署時「誰可存取」是否選「任何人」");
      }
      throw new Error("Core API 回傳非 JSON: " + text.slice(0, 200));
    }
  }

  return {
    getStoresInfo: function () {
      var r = callGet("getStoresInfo", {});
      if (r.status !== "ok" || !Array.isArray(r.data)) throw new Error(r.message || "getStoresInfo 失敗");
      return r.data;
    },
    fetchReservationData: function (startDate, endDate, storeId) {
      var r = callGet("fetchReservationData", { startDate: startDate, endDate: endDate, storeId: storeId });
      if (r.status !== "ok") throw new Error(r.message || "fetchReservationData 失敗");
      return r.data;
    },
    oldNewA: function (startDate, endDate, storeId) {
      var r = callGet("oldNewA", { startDate: startDate, endDate: endDate, storeId: storeId });
      if (r.status !== "ok") throw new Error(r.message || "oldNewA 失敗");
      return r.data;
    },
    fetchTodayReservationData: function (start, end, storeId) {
      var r = callGet("fetchTodayReservationData", { start: start, end: end, storeId: storeId });
      if (r.status !== "ok") throw new Error(r.message || "fetchTodayReservationData 失敗");
      return r.data;
    }
  };
})();
