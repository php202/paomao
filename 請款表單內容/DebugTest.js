/**
 * 請款表單內容 - Debug / Test 入口
 * 執行方式：clasp run runDebugTest 或在編輯器選 runDebugTest 執行
 */
function runDebugTest() {
  const projectName = '請款表單內容';
  const results = { project: projectName, checks: [], ok: true };

  try {
    // === Core 程式庫：驗證是否有拉到 ===
    const coreFns = ['getCoreConfig', 'getLineSayDouInfoMap', 'getStoresInfo', 'jsonResponse', 'getBankInfoMap', 'getBearerTokenFromSheet', 'sendLineReply', 'sendLineReplyObj', 'findAvailableSlots'];
    if (typeof Core !== 'undefined') {
      coreFns.forEach(function (fn) {
        const ok = typeof Core[fn] === 'function';
        results.checks.push({ name: 'Core.' + fn, ok: ok });
        if (!ok) results.ok = false;
      });
      if (typeof Core.getCoreConfig === 'function') {
        const config = Core.getCoreConfig();
        results.checks.push({ name: 'Core.getCoreConfig 回傳鍵', keys: config ? Object.keys(config) : [], ok: config ? Object.keys(config).length > 0 : false });
      }
    } else {
      results.checks.push({ name: 'Core', note: 'Core 程式庫未載入', ok: false });
      results.ok = false;
    }

    if (typeof doPost === 'function') {
      results.checks.push({ name: 'doPost', ok: true });
    }
    if (typeof doGet === 'function') {
      results.checks.push({ name: 'doGet', ok: true });
    }
    // 不測試 handleLineWebhook / createBooking，避免實際發送 LINE 或建立 SayDou 預約影響客戶
    if (typeof getSlots === 'function') {
      results.checks.push({ name: 'getSlots', ok: true });
    }
    if (typeof totalMoney === 'function') {
      results.checks.push({ name: 'totalMoney', ok: true });
    }
    if (typeof getList === 'function') {
      results.checks.push({ name: 'getList', ok: true });
    }
    if (typeof checkMember === 'function') {
      results.checks.push({ name: 'checkMember', ok: true });
    }
    if (typeof handleDelete === 'function') {
      results.checks.push({ name: 'handleDelete', ok: true });
    }
    if (typeof getStoreConfig === 'function') {
      results.checks.push({ name: 'getStoreConfig', ok: true });
    }
    if (typeof findStoreConfig === 'function') {
      results.checks.push({ name: 'findStoreConfig', ok: true });
    }
  } catch (e) {
    results.checks.push({ name: 'runDebugTest', error: e.message, ok: false });
    results.ok = false;
  }

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
