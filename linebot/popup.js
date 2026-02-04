// ▼▼▼ 請將這裡換成您剛剛部署 GAS 產生的網址 (exec 結尾) ▼▼▼
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbzY1xtm_Y6JKDTgf_qDXHJHDCs5ucrLk0qqX0J4Do2_y8A4JO7VJ_aBiL_HbzLk_ZkN/exec";

let currentBotId = null; 

async function refreshData() {
  const storeNameDiv = document.getElementById('store-name');
  const listDiv = document.getElementById('msg-list');
  const loadingDiv = document.getElementById('loading');
  
  // 1. 自動填入名字
  const inputOp = document.getElementById('operator_name');
  if (inputOp) {
    chrome.storage.local.get('operator_name', (result) => {
      if (result.operator_name) inputOp.value = result.operator_name;
    });
    inputOp.addEventListener('change', () => {
      chrome.storage.local.set({ 'operator_name': inputOp.value.trim() });
    });
  }

  // 2. 自動填入預約表單的日期為今天 (預設)
  const inputDate = document.getElementById('bk-date');
  if (inputDate && !inputDate.value) {
    const today = new Date();
    const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split('T')[0];
    inputDate.value = localDate;
  }

  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab || !tab.url || !tab.url.includes("chat.line.biz")) {
    loadingDiv.style.display = 'none';
    storeNameDiv.textContent = "非 LINE 後台";
    listDiv.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">請切換到 LINE OA 後台</div>';
    document.querySelector('.availability-section').style.display = 'none';
    document.querySelector('.booking-section').style.display = 'none';
    document.querySelector('.search-box').style.display = 'none';
    return;
  }

  document.querySelector('.availability-section').style.display = 'block';
  document.querySelector('.booking-section').style.display = 'block';
  document.querySelector('.search-box').style.display = 'block';

  const match = tab.url.match(/chat\.line\.biz\/(U[a-f0-9]{32})/);
  const newBotId = match ? match[1] : null;

  if (!newBotId) {
    storeNameDiv.textContent = "無法讀取 Bot ID";
    return;
  }

  currentBotId = newBotId; 
  storeNameDiv.textContent = `Bot ID: ${newBotId} (讀取中...)`;
  listDiv.innerHTML = '';
  loadingDiv.style.display = 'block';

  fetchMsgList(newBotId);
}

async function fetchMsgList(botId) {
  const storeNameDiv = document.getElementById('store-name');
  const listDiv = document.getElementById('msg-list');
  const loadingDiv = document.getElementById('loading');

  try {
    const timestamp = new Date().getTime();
    const response = await fetch(`${GAS_API_URL}?action=getList&botId=${botId}&_t=${timestamp}`);
    const data = await response.json();

    loadingDiv.style.display = 'none';

    if (data.error) {
      storeNameDiv.textContent = `無法識別店家`;
      listDiv.innerHTML = `<div style="text-align:center;color:red;">${data.error}</div>`;
      return;
    }

    storeNameDiv.textContent = `店家: ${data.storeName || ''}`;
    storeNameDiv.style.color = "#00B900";
    storeNameDiv.style.fontWeight = "bold";

    const list = (data && Array.isArray(data.data)) ? data.data : [];
    if (list.length === 0) {
      listDiv.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">🎉 目前沒有未處理訊息</div>';
      return;
    }

    const seen = new Set();
    const uniqueData = list.filter(item => {
      const key = `${item.time}_${item.name}_${item.msg}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    uniqueData.forEach(item => {
      const div = document.createElement('div');
      div.className = 'msg-item';
      div.setAttribute('data-search', (item.name + item.msg).toLowerCase());
      
      div.innerHTML = `
        <div class="msg-header">
          <span>${item.time}</span>
          <span style="margin:0 5px; color:#ddd;">|</span>
          <span class="msg-name" title="點擊複製">${item.name}</span>
          <button class="btn-copy-name" title="用此名字篩選訊息">🔍</button>
        </div>
        <div class="msg-content">${item.msg}</div>
        <button class="btn-done" data-row="${item.row}">✔ 完成</button>
      `;
      listDiv.appendChild(div);

      const nameSpan = div.querySelector('.msg-name');
      nameSpan.addEventListener('click', () => {
        navigator.clipboard.writeText(item.name).then(() => {
          nameSpan.textContent = "已複製，請搜尋";
          nameSpan.style.color = "#00B900";
          setTimeout(() => { nameSpan.textContent = item.name; nameSpan.style.color = "#0066cc"; }, 1500);
        });
      });

      // 放大鏡：將名字填入搜尋框並觸發過濾
      div.querySelector('.btn-copy-name').addEventListener('click', (e) => {
        e.stopPropagation();
        const searchInput = document.getElementById('input-search');
        if (searchInput) {
          searchInput.value = item.name;
          // 觸發 input 事件，沿用既有的過濾邏輯
          const ev = new Event('input', { bubbles: true });
          searchInput.dispatchEvent(ev);
          searchInput.focus();
        }
      });

      div.querySelector('.btn-done').addEventListener('click', async (e) => {
        const operatorName = document.getElementById('operator_name').value.trim();
        if (!operatorName) {
          alert("⚠️ 請先在上方輸入您的名字！");
          document.getElementById('operator_name').focus();
          return;
        }
        
        const row = e.target.getAttribute('data-row');
        const card = e.target.parentElement;
        card.style.opacity = '0.4';
        e.target.textContent = '處理中...';

        try {
          await fetch(`${GAS_API_URL}?action=delete&row=${row}&operator_name=${encodeURIComponent(operatorName)}`);
          card.remove();
          if (listDiv.children.length === 0) listDiv.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;">全部處理完畢！</div>';
        } catch (err) {
          alert('連線失敗');
          card.style.opacity = '1';
          e.target.textContent = '✔ 完成';
        }
      });
    });

  } catch (err) { loadingDiv.style.display = 'none'; }
}

// 輔助：HH:MM轉分鐘
function hhmmToMinutes(str) {
  const p = str.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

document.addEventListener('DOMContentLoaded', () => {
  refreshData();
  document.getElementById('btn-reload-page').addEventListener('click', () => refreshData());

  // ----------------------------------------------------
  // [功能] 進階搜尋 (智慧過濾 + 純文字)
  // ----------------------------------------------------
  const btnToggleAdv = document.getElementById('btn-toggle-advanced');
  const panelAdv = document.getElementById('advanced-search-panel');
  const btnRunSearch = document.getElementById('btn-run-search');
  const boxResultContainer = document.getElementById('adv-result-container');
  const txtResult = document.getElementById('adv-result-text');
  const btnCopyTxt = document.getElementById('btn-copy-txt');

  if (btnToggleAdv) {
    btnToggleAdv.addEventListener('click', () => {
      panelAdv.style.display = (panelAdv.style.display === 'none') ? 'block' : 'none';
      if (panelAdv.style.display === 'block') {
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        document.getElementById('adv-start').value = today.toISOString().split('T')[0];
        document.getElementById('adv-end').value = nextWeek.toISOString().split('T')[0];
      }
    });
  }

  if (btnRunSearch) {
    btnRunSearch.addEventListener('click', async () => {
      const sDate = document.getElementById('adv-start').value;
      const eDate = document.getElementById('adv-end').value;
      const people = document.getElementById('adv-people').value;
      const duration = document.getElementById('adv-duration').value;
      const timeRange = document.getElementById('adv-time-range').value.split('-'); 
      const checkboxes = document.querySelectorAll('input[name="adv-week"]:checked');
      const weekDays = Array.from(checkboxes).map(cb => cb.value).join(',');

      if (!sDate || !eDate) { alert("請選擇日期範圍"); return; }

      btnRunSearch.disabled = true;
      btnRunSearch.textContent = "搜尋中...";
      boxResultContainer.style.display = 'block';
      txtResult.value = '正在分析大數據...';

      try {
        const timestamp = new Date().getTime();
        const url = `${GAS_API_URL}?action=searchAvailability&botId=${currentBotId}&startDate=${sDate}&endDate=${eDate}&people=${people}&duration=${duration}&weekDays=${weekDays}&timeStart=${timeRange[0]}&timeEnd=${timeRange[1]}&_t=${timestamp}`;
        const resp = await fetch(url);
        const json = await resp.json();

        if (json.status === 'success') {
          // GAS getSlots/searchAvailability 回傳 { status, text }（多行字串），非 { status, data }
          if (json.text !== undefined && json.text !== null) {
            txtResult.value = json.text;
          } else if (json.data && Array.isArray(json.data)) {
            if (json.data.length === 0) {
              txtResult.value = '⚠️ 搜尋完成，但沒有符合條件的時段。';
            } else {
              let resultStr = "";
              json.data.forEach(day => {
                const dateStr = (day && day.date) ? String(day.date).slice(5).replace('-', '/') : '';
                const weekStr = (day && day.week) ? day.week : '';
                const times = Array.isArray(day && day.times) ? day.times : [];
                const smartTimes = [];
                let lastTimeMinutes = -999;
                times.forEach(t => {
                  if (t == null) return;
                  const currentMinutes = hhmmToMinutes(t);
                  if (currentMinutes !== lastTimeMinutes + 30) smartTimes.push(t);
                  lastTimeMinutes = currentMinutes;
                });
                resultStr += `${dateStr} (${weekStr}) ${smartTimes.join(", ")}\n`;
              });
              txtResult.value = resultStr;
            }
          } else {
            txtResult.value = '⚠️ 回傳格式異常，請稍後再試。';
          }
        } else {
          var errMsg = "錯誤: " + (json.error || "未知錯誤");
          if (json.details) errMsg += "\n" + json.details;
          txtResult.value = errMsg;
        }
      } catch (err) {
        txtResult.value = "連線失敗: " + err;
      } finally {
        btnRunSearch.disabled = false;
        btnRunSearch.textContent = "開始搜尋";
      }
    });
  }

  if(btnCopyTxt) {
    btnCopyTxt.addEventListener('click', () => {
      txtResult.select();
      navigator.clipboard.writeText(txtResult.value).then(() => {
        const originalText = btnCopyTxt.textContent;
        btnCopyTxt.textContent = "已複製！";
        btnCopyTxt.style.backgroundColor = "#28a745"; 
        setTimeout(() => {
          btnCopyTxt.textContent = originalText;
          btnCopyTxt.style.backgroundColor = "#17a2b8"; 
        }, 1500);
      });
    });
  }

  // ----------------------------------------------------
  // 會員查詢
  // ----------------------------------------------------
  const btnCheckMember = document.getElementById('btn-check-member');
  const divMemberInfo = document.getElementById('member-info');
  const divBookingDetails = document.getElementById('booking-details');

  btnCheckMember.addEventListener('click', async () => {
    const phone = document.getElementById('bk-phone').value.trim();
    if (!phone) { alert("請輸入手機"); return; }
    
    btnCheckMember.disabled = true;
    btnCheckMember.textContent = "...";
    divBookingDetails.style.display = 'none'; 

    try {
      const resp = await fetch(`${GAS_API_URL}?action=checkMember&botId=${currentBotId}&phone=${phone}`);
      const data = await resp.json();

      if (data.status === 'success') {
        divMemberInfo.textContent = `👋 哈囉，${data.name}`;
        divBookingDetails.style.display = 'block'; 
        
        // 如果預設日期沒值，填入今天
        const currentPicked = document.getElementById('bk-date').value;
        if (!currentPicked) {
           const today = new Date().toISOString().split('T')[0];
           document.getElementById('bk-date').value = today;
        }
      } else {
        divMemberInfo.textContent = "❌ 查無會員";
        divMemberInfo.style.color = "red";
      }
    } catch (err) {
      alert("查詢失敗");
    } finally {
      btnCheckMember.disabled = false;
      btnCheckMember.textContent = "查詢";
    }
  });

  // ----------------------------------------------------
  // 預約送出 (支援多人)
  // ----------------------------------------------------
  document.getElementById('btn-submit-booking').addEventListener('click', async () => {
    const phone = document.getElementById('bk-phone').value.trim();
    const date = document.getElementById('bk-date').value; 
    const time = document.getElementById('bk-time').value;
    const duration = document.getElementById('bk-duration').value;
    const people = document.getElementById('bk-people').value; // [新增]
    const remark = document.getElementById('bk-remark').value;

    if (!date || !time || !duration || !people) { alert("請完整填寫日期、時間、人數"); return; }
    
    // 確認視窗加入人數資訊
    if(!confirm(`確認預約？\n\n手機: ${phone}\n時間: ${date} ${time}\n人數: ${people} 位\n時長: ${duration}hr`)) return;

    const btn = document.getElementById('btn-submit-booking');
    btn.disabled = true;
    btn.textContent = "處理中...";

    try {
      // 傳送 people 參數
      const url = `${GAS_API_URL}?action=createBooking&botId=${currentBotId}&phone=${phone}&date=${date}&time=${time}&duration=${duration}&people=${people}&remark=${encodeURIComponent(remark)}`;
      const resp = await fetch(url);
      const data = await resp.json();

      if (data.status === 'success') {
        alert("✅ 預約成功！");
        divMemberInfo.textContent = '';
        divBookingDetails.style.display = 'none';
        document.getElementById('bk-phone').value = '';
      } else {
        alert("❌ 預約失敗: " + (data.details || data.error));
      }
    } catch (err) { alert("連線失敗"); } 
    finally { btn.disabled = false; btn.textContent = "🚀 確認預約"; }
  });

  // 搜尋過濾
  const searchInputEl = document.getElementById('input-search');
  if (searchInputEl) {
    searchInputEl.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      document.querySelectorAll('.msg-item').forEach(item => {
        const text = item.getAttribute('data-search');
        item.style.display = text.includes(keyword) ? '' : 'none';
      });
    });
  }

  // 搜尋欄右側「刪除」按鈕：清空並恢復全部訊息
  const clearBtn = document.getElementById('btn-clear-search');
  if (clearBtn && searchInputEl) {
    clearBtn.addEventListener('click', () => {
      searchInputEl.value = '';
      const ev = new Event('input', { bubbles: true });
      searchInputEl.dispatchEvent(ev);
      searchInputEl.focus();
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) refreshData();
});
chrome.tabs.onActivated.addListener(() => refreshData());