/**
 * PaoMao_Core - Debug / Test 入口
 * 執行方式：在專案目錄下 clasp run runDebugTest
 * 或在 Apps Script 編輯器選 runDebugTest 執行
 */
function runDebugTest() {
  const projectName = 'PaoMao_Core';
  const results = { project: projectName, checks: [], ok: true };

  try {
    // 檢查 getCoreConfig 是否存在並回傳設定鍵名（不輸出敏感值）
    if (typeof getCoreConfig === 'function') {
      const config = getCoreConfig();
      const keys = config ? Object.keys(config) : [];
      results.checks.push({ name: 'getCoreConfig', keys: keys, ok: keys.length > 0 });
    } else {
      results.checks.push({ name: 'getCoreConfig', error: 'function not found', ok: false });
      results.ok = false;
    }

    if (typeof getBankInfoMap === 'function') {
      results.checks.push({ name: 'getBankInfoMap', ok: true });
    }
    if (typeof getLineSayDouInfoMap === 'function') {
      results.checks.push({ name: 'getLineSayDouInfoMap', ok: true });
    }
    if (typeof getStoresInfo === 'function') {
      results.checks.push({ name: 'getStoresInfo', ok: true });
    }
    if (typeof clearMyCache === 'function') {
      results.checks.push({ name: 'clearMyCache', ok: true });
    }
  } catch (e) {
    results.checks.push({ name: 'runDebugTest', error: e.message, ok: false });
    results.ok = false;
  }

  Logger.log(JSON.stringify(results, null, 2));
  return results;
}
