// 【後端】只負責傳送資料，不負責顯示畫面。與 Core 對齊：使用 Core.jsonResponse
function doGet(e) {
  var data = getStoreData();
  return Core.jsonResponse(data);
}

function getStoreData() {
  try {
    const ss = SpreadsheetApp.openById('1-t4KPVK-uzJ2xUoy_NR3d4XcUohLHVETEFXTlvj4baE');
    const sheet = ss.getSheetByName("門市列表");
    
    if (!sheet) return errorData("找不到工作表");

    const data = sheet.getDataRange().getValues();
    if (data.length < 2) return errorData("試算表無資料");

    const headers = data[0].map(String);
    
    let nameIdx = headers.findIndex(h => h.includes("店名"));
    let addrIdx = headers.findIndex(h => h.includes("地址"));
    let lineIdx = headers.findIndex(h => h.includes("line官方") || h.includes("LINE官方"));
    let locIdx  = headers.findIndex(h => h.includes("經度") || h.includes("緯度"));

    if (nameIdx === -1) nameIdx = 0;
    if (addrIdx === -1) addrIdx = 1;
    if (locIdx === -1)  locIdx = 39;

    var cleanStores = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rawCoords = row[locIdx];

      // 1. 檢查座標
      var lat = 0, lng = 0;
      var hasValidCoord = false;
      if (rawCoords && typeof rawCoords === 'string' && rawCoords.includes(',')) {
        var parts = rawCoords.split(',');
        lat = parseFloat(parts[0]);
        lng = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0) {
          hasValidCoord = true;
        }
      }

      // 2. 檢查 LINE 連結 (這是您的新需求)
      var hasValidLine = false;
      var safeLine = "";
      
      if (lineIdx !== -1 && row[lineIdx]) {
        var rawLine = String(row[lineIdx]).trim();
        // 嚴格篩選：長度夠長，且不是無效字元
        if (rawLine.length > 5 && 
            rawLine !== "無" && 
            rawLine !== "-" && 
            rawLine.toLowerCase() !== "null" && 
            rawLine.toLowerCase() !== "none") {
          hasValidLine = true;
          safeLine = rawLine;
        }
      }

      // ★★★ 篩選條件：必須「有座標」且「有 LINE」才加入清單 ★★★
      // 如果該店沒有 LINE，程式會直接跳過，不會 push 進 cleanStores
      if (hasValidCoord && hasValidLine) {
        
        // 修改：使用 replace(/\s/g, '') 來去除所有空白
        var safeName = (row[nameIdx]) ? String(row[nameIdx]).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') : "店名讀取中";
        var safeAddr = (row[addrIdx]) ? String(row[addrIdx]).replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') : "地址讀取中";

        cleanStores.push({
          name: safeName,
          address: safeAddr,
          lineUrl: safeLine,
          lat: lat,
          lng: lng
        });
      }
    }
    
    return cleanStores;

  } catch (e) {
    return errorData("後端錯誤: " + e.toString());
  }
}

function errorData(msg) {
  return [{name: msg, address: "請檢查後端", lineUrl: "", lat: 0, lng: 0}];
}