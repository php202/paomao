// Invoice.gs
function issueInvoice(storeInfo, odooNumber, buyType, items) {
  // 這裡我們把「開票邏輯」封裝成一個純函式，回傳結果物件
  // 不直接操作試算表，保持 Core 的純淨
  
  const totalAmount = items.reduce((sum, item) => sum + (item.money * item.number), 0);
  const sales = Math.round(totalAmount / 1.05);
  const taxAmount = totalAmount - sales;
  const timeStamp = new Date().getTime().toString();
  const finalContent = odooNumber ? `${buyType} (單號:${odooNumber})` : buyType;
  
  const invoiceData = {
    timeStamp: timeStamp,
    uncode: GIVEME_CONFIG.UNCODE,
    idno: GIVEME_CONFIG.IDNO,
    sign: generateMD5Sign(timeStamp + GIVEME_CONFIG.IDNO + GIVEME_CONFIG.PASSWORD),
    customerName: storeInfo.companyName,
    phone: String(storeInfo.pinCode).trim(), // B2B 統編
    datetime: Utilities.formatDate(new Date(), "GMT+8", "yyyy-MM-dd"),
    email: storeInfo.email || "",
    taxState: "0", totalFee: totalAmount.toString(), amount: taxAmount.toString(), sales: sales.toString(),
    content: finalContent,
  };

  try {
    const options = { method: "post", contentType: "application/json", payload: JSON.stringify(invoiceData), muteHttpExceptions: true };
    const response = UrlFetchApp.fetch(GIVEME_CONFIG.VM_PROXY_URL, options);
    return JSON.parse(response.getContentText());
  } catch (e) {
    return { success: "false", msg: "API 連線異常: " + e.message };
  }
}

function generateMD5Sign(input) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input, Utilities.Charset.UTF_8);
  return digest.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('').toUpperCase();
}