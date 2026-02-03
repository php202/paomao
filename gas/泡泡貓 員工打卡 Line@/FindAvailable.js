const COURSE_MINUTES = 90; // 服務時長
const SEARCH_DAYS = 7;     // 查詢天數

/**
 * 查詢管理店家的可預約時段 (使用 Core)
 * @param {string[]} managedStores - 店家名稱陣列
 */
function findAvailableList(managedStores) {
if (!managedStores || !Array.isArray(managedStores) || managedStores.length === 0) {
    console.log("無指定店家，結束查詢");
    return "無指定店家";
  }

  // 2. 取得店家對照表 (如果是在同一個檔案，直接呼叫即可；若在 Library 才加 Core)
  const storeMap = Core.getLineSayDouInfoMap(); 

  // 3. 準備日期範圍
  const today = new Date();
  const startDate = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
  
  const endObj = new Date(today);
  // 注意：需確保 SEARCH_DAYS 變數已定義
  endObj.setDate(today.getDate() + (typeof SEARCH_DAYS !== 'undefined' ? SEARCH_DAYS : 14)); 
  const endDate = Utilities.formatDate(endObj, Session.getScriptTimeZone(), "yyyy-MM-dd");

  const lines = [];

  // 4. 逐店查詢
  managedStores.forEach((rawId) => {
    if (!rawId) return; // 略過空值
    
    const id = String(rawId).trim(); // 轉字串並去空白，避免對應不到 key
    if (id === '0001') return;
    const store = storeMap[id];

    // ★ 修正點：這裡要檢查 store.saydouId，因為你的 Map 裡沒有 id 這個屬性
    if (!store || !store.saydouId) {
      console.log(`找不到店家 ID: ${id}`);
      return;
    }

    console.log(`正在查詢: ${store.name}`);
    lines.push(`【${store.name}】`);
    // ★ 呼叫 Core 取得結果 (確保 Core 存在且有此函式)
    // 注意：需確保 COURSE_MINUTES 變數已定義
    const result = Core.findAvailableSlots(
      store.id, // 傳入正確的 ID
      startDate, 
      endDate, 
      1, 
      (typeof COURSE_MINUTES !== 'undefined' ? COURSE_MINUTES : 60), 
      {},
    );

    if (!result.status) {
      lines.push(`(查詢失敗: ${result.error || '未知錯誤'})`);
    } else if (!result.data || result.data.length === 0) {
      lines.push(`(無可預約時段)`);
    } else {
      // 顯示結果
      result.data.forEach(day => {
        const slotsStr = day.times.join("、");
        lines.push(`${day.date.substring(5)} (${day.week})：${slotsStr}`);
      });
    }
    lines.push(""); // 空行
  });

  const output = lines.join("\n");
  return output;
}