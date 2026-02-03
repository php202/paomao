/**
 * Core API 客戶端：取得 Bearer Token 等，供 Action-getSlots 等使用。
 * 指令碼屬性：PAO_CAT_CORE_API_URL（或 PAO_CAT_TOKEN_API_URL）、PAO_CAT_SECRET_KEY
 */
var CoreApi = (function () {
  function getConfig() {
    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty("PAO_CAT_CORE_API_URL") || props.getProperty("PAO_CAT_TOKEN_API_URL") || "";
    var key = props.getProperty("PAO_CAT_SECRET_KEY") || "";
    return { url: url.trim(), key: key.trim() };
  }

  function callGetToken() {
    var c = getConfig();
    if (!c.url || !c.key) throw new Error("請在指令碼屬性設定 PAO_CAT_CORE_API_URL 與 PAO_CAT_SECRET_KEY");
    var fullUrl = c.url + (c.url.indexOf("?") >= 0 ? "&" : "?") + "key=" + encodeURIComponent(c.key) + "&action=token";
    var res = UrlFetchApp.fetch(fullUrl, { muteHttpExceptions: true, timeout: 90 });
    var text = res.getContentText();
    if (res.getResponseCode() !== 200) throw new Error("Core API 錯誤: " + res.getResponseCode() + " " + text.slice(0, 150));
    return text.trim();
  }

  return {
    getBearerToken: function () {
      return callGetToken();
    }
  };
})();
