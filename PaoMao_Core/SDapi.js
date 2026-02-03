/**
 * [核心功能] 搜尋指定條件下的 SayDou 空位
 * @param {string} sayId - 店家 SayDou ID
 * @param {string} startDate - 開始日期 (yyyy-MM-dd)
 * @param {string} endDate - 結束日期 (yyyy-MM-dd)
 * @param {number} needPeople - 需要人數 (通常為 1)
 * @param {number} durationMin - 服務時長 (分鐘)
 * @param {Object} options - 選填 { weekDays: [0-6], timeStart: "11:00", timeEnd: "21:00", token: "..." }
 * @return {Object} { status: boolean, data: Array, totalStaff: number, error: string }
 */
const token = getBearerTokenFromSheet();

function findAvailableSlots(sayId, startDate, endDate, needPeople, durationMin, options) {
  options = options || {};
  
  // 1. 參數與時區設定
  const TZ = Session.getScriptTimeZone() || 'Asia/Taipei';
  const weekDays = options.weekDays || [0, 1, 2, 3, 4, 5, 6];
  const timeStartStr = options.timeStart || "11:00";
  const timeEndStr = options.timeEnd || "21:00";

  if (!token) return { status: false, error: "Missing Token", data: [] };

  try {
    // 2. 取得有效員工 (計算總產能)
    const validStaffSet = getStoreCapacityIds(sayId, token);
    const totalStaff = (validStaffSet && validStaffSet.size > 0) ? validStaffSet.size : 4; // 預設產能

    // 3. 取得預約與排休資料
    const { reservations, dutyoffs } = fetchReservationsAndOffs(sayId, startDate, endDate, token);

    // 4. 準備計算
    const availableSlots = [];
    let currentDate = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // 設定最晚可預約時間 (例如 21:00 關門，90分鐘課程，最晚只能約 19:30)
    const storeCloseMin = hhmmToMinutes(timeEndStr);
    const lastBookingMin = storeCloseMin - durationMin; 

    // 5. 逐日計算
    while (currentDate <= endDateObj) {
      const dayOfWeek = currentDate.getDay(); // 0=週日

      if (weekDays.includes(dayOfWeek)) {
        const dateString = Utilities.formatDate(currentDate, TZ, "yyyy-MM-dd");
        
        // 取得當日需檢查的所有時段 (11:00, 11:30, ...)
        const dayTimeSlots = generateTimeSlots(timeStartStr, timeEndStr); 
        const validTimesForDay = [];

        // 預先過濾出「當天」相關的預約與排休，避免內層迴圈跑無關資料
        const dailyReservations = filterEventsByDate(reservations, dateString);
        const dailyDutyoffs = filterEventsByDate(dutyoffs, dateString);

        const timesWithCount = []; // { time, count } 供明日預約清單顯示「14:00×1、17:00×2」
        dayTimeSlots.forEach(timeStr => {
          const checkStartMin = hhmmToMinutes(timeStr);
          const checkEndMin = checkStartMin + durationMin; 
          
          // (A) 基本過濾: 超過最晚可預約時間 或 跨日
          if (checkStartMin > lastBookingMin) return;
          if (checkEndMin > 1440) return; // 24:00

          // (B) 過濾過去時間 (若是今天)
          if (dateString === startDate) { 
             const now = new Date();
             const nowMin = now.getHours() * 60 + now.getMinutes();
             // 緩衝: 現在時間 + 30分鐘後的時段才開放
             if (checkStartMin < (nowMin + 30)) return;
          }

          // (C) 計算忙碌人數 (Busy Count)
          let busyCount = 0;

          // C-1. 檢查預約占用（含待確認皆算佔用，與後台「已滿」一致）
          for (const r of dailyReservations) {
            if (validStaffSet.size > 0 && r.usrsid && !validStaffSet.has(r.usrsid)) continue;
            if (!r.rsvtim || !r.endtim) continue;
            const rStart = isoToMinutes(r.rsvtim);
            const rEnd = isoToMinutes(r.endtim);
            
            // 重疊判定: !(End <= Start || Start >= End)
            if (rEnd > checkStartMin && rStart < checkEndMin) {
              busyCount++;
            }
          }

          // C-2. 檢查排休占用
          for (const d of dailyDutyoffs) {
            if (validStaffSet.size > 0 && d.usrsid && !validStaffSet.has(d.usrsid)) continue;
            
            const dStart = isoToMinutes(d.startm);
            const dEnd = isoToMinutes(d.endtim);
            
            if (dEnd > checkStartMin && dStart < checkEndMin) {
              busyCount++;
            }
          }

          // (D) 判定: 總人數 - 忙碌人數 >= 需要人數，並記錄空位數
          const availableCount = totalStaff - busyCount;
          if (availableCount >= needPeople) {
            validTimesForDay.push(timeStr);
            timesWithCount.push({ time: timeStr, count: availableCount });
          }
        });

        // 6. 收集結果
        // 這裡不需要 filterSlotsByDuration，因為我們要顯示「所有」可預約的起始點
        if (validTimesForDay.length > 0) {
          // durationMin: 服務時長
          // 5: 限制一天最多顯示 5 個精選時段 (可自行調整)
          const smartTimes = getSmartSlots(validTimesForDay, durationMin, 5);
          const smartWithCount = smartTimes.map(t => {
            const found = timesWithCount.find(x => x.time === t);
            return found ? { time: t, count: found.count } : { time: t, count: 1 };
          });
          availableSlots.push({
            date: dateString,
            week: ["日","一","二","三","四","五","六"][dayOfWeek],
            times: smartTimes,
            timesWithCount: smartWithCount
          });
        }
      }
      
      // 下一天
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      status: true,
      data: availableSlots,
      totalStaff: totalStaff
    };

  } catch (err) {
    console.error(`[Core] findAvailableSlots Error: ${err.toString()}`);
    return { status: false, error: err.toString(), data: [] };
  }
}
/**
 * 取得指定店家的有效員工 ID (含快取機制)
 * @param {string} sayId - 店家 SayDou ID
 * @param {string} token - API Token
 * @return {Set<string>} 有效員工 ID 集合
 */
function getStoreCapacityIds(sayId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `STORE_STAFF_${sayId}`;
  const cachedData = cache.get(cacheKey);

  if (cachedData) return new Set(JSON.parse(cachedData));

  const apiUrl = "https://saywebdatafeed.saydou.com/api/management/baseData?kind%5B%5D=stores&kind%5B%5D=positions&kind%5B%5D=staffs";
  try {
    const response = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    const json = JSON.parse(response.getContentText());
    const validIds = [];
    
    if (json.staffs && json.staffs[0]) {
       const categories = json.staffs[0];
       Object.keys(categories).forEach(role => {
         categories[role].forEach(s => {
           // status === 'on' 代表在職且啟用
           if (String(s.msstor) === String(sayId) && s.status === 'on' && s.usrsid) {
             validIds.push(s.usrsid);
           }
         });
       });
    }
    
    if (validIds.length > 0) {
      cache.put(cacheKey, JSON.stringify(validIds), 21600); // 6hr
    }
    return new Set(validIds); 
  } catch (e) {
    console.error(`[Core] getStoreCapacityIds Error: ${e}`);
    return new Set();
  }
}
/**
 * 取得指定範圍內的預約與排休資料 (SayDou API)
 * @param {string} sayId 
 * @param {string} startDate (yyyy-MM-dd)
 * @param {string} endDate (yyyy-MM-dd)
 * @param {string} token 
 */
function fetchReservationsAndOffs(sayId, startDate, endDate) {
  const apiUrl = `https://saywebdatafeed.saydou.com/api/management/calendar/events/full?startDate=${startDate}&endDate=${endDate}&storid=${sayId}&status[]=reservation&status[]=hasshow&status[]=confirm&status[]=checkout&status[]=noshow&holiday=1`;
  try {
    const response = UrlFetchApp.fetch(apiUrl, {
      method: "get",
      headers: { "Authorization": "Bearer " + token },
      muteHttpExceptions: true
    });
    const json = JSON.parse(response.getContentText());
    if (!json.status) throw new Error("API status false");
    
    // 只回傳需要的
    return {
      reservations: json.data.reservation || [],
      dutyoffs: json.data.dutyoffs || []
    };
  } catch (e) {
    console.error(`[Core] fetchReservationsAndOffs Error: ${e}`);
    return { reservations: [], dutyoffs: [] };
  }
}
/** 篩選特定日期的事件 (優化效能用) */
function filterEventsByDate(events, dateString) {
  if (!events || events.length === 0) return [];
  return events.filter(e => {
    // 預約用 rsvtim, 排休用 startm
    const start = e.rsvtim || e.startm;
    return start && start.startsWith(dateString);
  });
}

/**
 * 產生時間空檔 (例如 11:00, 11:30, 12:00...)
 * @param {string} startStr (HH:mm)
 * @param {string} endStr (HH:mm)
 * @return {string[]} 時間字串陣列
 */
function generateTimeSlots(startStr, endStr) {
  const slots = [];
  let current = hhmmToMinutes(startStr);
  const end = hhmmToMinutes(endStr);
  while (current <= end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0');
    const m = (current % 60).toString().padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += 30; 
  }
  return slots;
}

/**
 * 根據服務時長過濾連續空檔 (避免推薦 13:00, 13:30, 14:00 重複佔用)
 * @param {string[]} rawSlots 原始可用時段
 * @param {number} durationMin 服務時長(分鐘)
 */
function filterSlotsByDuration(rawSlots, durationMin) {
  if (!rawSlots || rawSlots.length === 0) return [];
  
  const result = [];
  let nextAvailableMin = -1;

  rawSlots.forEach(timeStr => {
    const currentMin = hhmmToMinutes(timeStr);
    
    // 如果是第一個時段，或者目前時間已經超過「上一個時段 + 施作時間」
    if (nextAvailableMin === -1 || currentMin >= nextAvailableMin) {
      result.push(timeStr);
      nextAvailableMin = currentMin + durationMin;
    }
  });

  return result;
}

// --- 時間轉換小工具 (不導出也可，視需求) ---

function hhmmToMinutes(timeStr) {
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function isoToMinutes(isoStr) {
  if (!isoStr) return -1;
  const parts = isoStr.split(/[\sT]/);
  if (parts.length < 2) return -1;
  const timePart = parts[1];
  if (!timePart) return -1;
  const timeParts = timePart.split(":");
  return parseInt(timeParts[0]) * 60 + parseInt(timeParts[1]);
}

// 導出函式供外部使用
// 注意：如果您的 Core 是用 Library 方式引用，上面的 function 直接寫就好，不一定要 global
// 但為了方便識別，可以把這些工具函式掛在一個物件下回傳
function getSmartSlots(slots, durationMin, limit = 5) {
  if (!slots || slots.length === 0) return [];
  
  const result = [];
  let nextAvailableMin = -1;

  for (const timeStr of slots) {
    // 如果已經收集夠了，就停止 (避免單日顯示太多讓版面太長)
    if (result.length >= limit) break;

    const currentMin = hhmmToMinutes(timeStr);
    
    // 邏輯：如果是第一個，或者目前時間已經 >= 上一個推薦時段 + 服務時長
    // 這樣可以確保推薦的時間是「做完一個客人後，馬上接下一個」的完美節奏
    if (nextAvailableMin === -1 || currentMin >= nextAvailableMin) {
      result.push(timeStr);
      // 下一個推薦時間 = 當前時間 + 服務時長
      // 如果你想讓選項多一點，可以把這裡改成 + 60 (固定一小時一跳)
      nextAvailableMin = currentMin + durationMin; 
    }
  }

  return result;
}