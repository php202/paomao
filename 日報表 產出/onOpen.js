function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠 帳務工具')
      .addItem('🚀 產出各店日報', 'runAccNeed')
      // .addSeparator()
      // .addItem('🗑️ 刪除暫存工作表', 'cleanupTempSheets')
      .addToUi();
}