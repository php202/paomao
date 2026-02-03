/**
 * 日報表 產出 - Debug / Test 入口
 * 執行方式：在專案目錄下 clasp run runDebugTest 或在編輯器選 runDebugTest 執行
 */
function runDebugTest() {
  const projectName = '日報表 產出';
  const results = { project: projectName, checks: [], ok: true };

  try {
    // === Core 程式庫：驗證是否有拉到 ===
    const coreFns = ['getCoreConfig', 'getLineSayDouInfoMap', 'getStoresInfo', 'jsonResponse', 'getBankInfoMap', 'getBearerTokenFromSheet', 'sendLineReply', 'sendLineReplyObj'];
    if (typeof Core !== 'undefined') {
      coreFns.forEach(function (fn) {
        const ok = typeof Core[fn] === 'function';
        results.checks.push({ name: 'Core.' + fn, ok: ok });
        if (!ok) results.ok = false;
      });
      if (typeof Core.getCoreConfig === 'function') {
        const config = Core.getCoreConfig();
        const keys = config ? Object.keys(config) : [];
        results.checks.push({ name: 'Core.getCoreConfig 回傳鍵', keys: keys, ok: keys.length > 0 });
      }
    } else {
      results.checks.push({ name: 'Core', note: 'Core 程式庫未載入', ok: false });
      results.ok = false;
    }

    if (typeof outputJSON === 'function') {
      results.checks.push({ name: 'outputJSON', ok: true });
    }
    // 不測試 reply / sendLineReply，避免實際發送訊息影響客戶
    if (typeof doPost === 'function') {
      results.checks.push({ name: 'doPost', ok: true });
    }
    if (typeof handleCheckInAPI === 'function') {
      results.checks.push({ name: 'handleCheckInAPI', ok: true });
    }
    if (typeof handleBindSession === 'function') {
      results.checks.push({ name: 'handleBindSession', ok: true });
    }
  } catch (e) {
    results.checks.push({ name: 'runDebugTest', error: e.message, ok: false });
    results.ok = false;
  }

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
